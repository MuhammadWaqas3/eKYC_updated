import { useState, useRef, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Send, Bot, User, Lock, HelpCircle, CheckCircle2, ChevronDown, ChevronUp, AlertCircle, RefreshCw } from 'lucide-react';
import { fetchWithAuth } from '../../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  type: 'bot' | 'user' | 'error';
  content: string;
  timestamp: Date;
  requiresSelect?: boolean;
}

interface PersonalDetailsData {
  fullName: string;
  phoneNumber: string;
  email: string;
  accountType: string;
}

interface PersonalDetailsChatProps {
  onComplete: (data: PersonalDetailsData) => void;
}

type KYCState =
  | 'CONSENT'
  | 'COLLECT_NAME'
  | 'COLLECT_EMAIL'
  | 'COLLECT_PHONE'
  | 'COLLECT_ACCOUNT_TYPE'
  | 'READY_FOR_OCR';

const API_BASE = '/kyc';

// ─── Minimal bold markdown renderer ──────────────────────────────────────────
function renderContent(text: string): React.ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : <span key={i} style={{ whiteSpace: 'pre-line' }}>{part}</span>
  );
}

// ─── Tooltip per state ────────────────────────────────────────────────────────
function tooltipFor(state: KYCState): string {
  switch (state) {
    case 'CONSENT': return 'We require your explicit consent before collecting personal information, in accordance with SBP data protection regulations.';
    case 'COLLECT_NAME': return 'Your full name must match your CNIC document exactly for identity verification.';
    case 'COLLECT_EMAIL': return 'Used for account notifications, statements, and important security updates.';
    case 'COLLECT_PHONE': return 'Used for secure OTP-based authentication and real-time account alerts.';
    case 'COLLECT_ACCOUNT_TYPE': return 'Select the account type that best suits your financial needs.';
    default: return 'Your information is encrypted and securely transmitted.';
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
export function PersonalDetailsChat({ onComplete }: PersonalDetailsChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [kycState, setKycState] = useState<KYCState>('CONSENT');
  const [isCompleting, setIsCompleting] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  // Track whether the current state expects a dropdown
  const [awaitingSelect, setAwaitingSelect] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => { initSession(); }, []);

  // ── Session init ─────────────────────────────────────────────────────────
  async function initSession() {
    setIsInitializing(true);
    setInitError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/start`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail ?? `Server returned ${res.status}`);
      }
      const data = await res.json();
      setSessionId(data.session_id);
      setKycState(data.state as KYCState);
      pushMessage({ type: 'bot', content: data.message });
    } catch (err: any) {
      setInitError(
        err?.message ?? 'Unable to connect to the verification service. Please check your connection.'
      );
    } finally {
      setIsInitializing(false);
    }
  }

  // ── Message helpers ───────────────────────────────────────────────────────
  function pushMessage(partial: Pick<Message, 'type' | 'content'> & { requiresSelect?: boolean }) {
    setMessages(prev => [...prev, {
      id: Date.now().toString() + Math.random(),
      timestamp: new Date(),
      requiresSelect: false,
      ...partial,
    }]);
  }

  // ── Send to backend ───────────────────────────────────────────────────────
  async function sendMessage(text: string) {
    if (!text.trim() || isTyping || !sessionId || isCompleting) return;

    pushMessage({ type: 'user', content: text });
    setInputValue('');
    setAwaitingSelect(false);
    setIsTyping(true);

    try {
      const res = await fetchWithAuth(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, message: text }),
      });

      if (!res.ok) {
        let detail = `Request failed (HTTP ${res.status}).`;
        try { const b = await res.json(); if (b?.detail) detail = b.detail; } catch (_) { }
        setIsTyping(false);
        if (res.status === 404 || res.status === 410) {
          pushMessage({ type: 'error', content: detail + ' Please refresh the page.' });
          return;
        }
        throw new Error(detail);
      }

      const data = await res.json();
      setIsTyping(false);

      const newState = data.state as KYCState;
      setKycState(newState);

      // Show dropdown flag
      if (data.requires_select) {
        setAwaitingSelect(true);
      }

      pushMessage({ type: 'bot', content: data.reply, requiresSelect: !!data.requires_select });

      // Advance to OCR stage
      if (newState === 'READY_FOR_OCR' && data.data) {
        setIsCompleting(true);
        const payload: PersonalDetailsData = {
          fullName: data.data.full_name ?? '',
          email: data.data.email ?? '',
          phoneNumber: data.data.phone_number ?? '',
          accountType: data.data.account_type ?? '',
        };
        setTimeout(() => onComplete(payload), 2200);
      }

    } catch (err: any) {
      setIsTyping(false);
      pushMessage({
        type: 'error',
        content: err?.message?.includes('fetch')
          ? 'Unable to reach the verification service. Please check your connection and try again.'
          : (err?.message ?? 'An unexpected error occurred. Please try again.'),
      });
    }
  }

  function handleSendClick() { sendMessage(inputValue); }
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendClick(); }
  }
  function handleSelectChange(value: string) {
    setAwaitingSelect(false);
    sendMessage(value);
  }

  // ── UI flags ──────────────────────────────────────────────────────────────
  const showDropdown = awaitingSelect && kycState === 'COLLECT_ACCOUNT_TYPE' && !isCompleting;
  const showInput = !showDropdown && !isCompleting && kycState !== 'READY_FOR_OCR';
  const showLockIcon = kycState === 'COLLECT_EMAIL' || kycState === 'COLLECT_PHONE';
  const inputDisabled = isTyping || isInitializing || !!initError;

  const placeholder =
    kycState === 'CONSENT' ? 'Type Yes to accept or No to decline...' :
      kycState === 'COLLECT_NAME' ? 'Enter your full name as per CNIC...' :
        kycState === 'COLLECT_EMAIL' ? 'Enter your email address...' :
          kycState === 'COLLECT_PHONE' ? 'Enter your mobile number (03XXXXXXXXX)...' :
            'Type your response...';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Card className="max-w-3xl mx-auto bg-white shadow-lg rounded-3xl overflow-hidden border-0">

      {/* Header */}
      <div className="bg-gradient-to-r from-[#aa2771] to-[#8a1f5c] p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-md">
              <Bot className="w-6 h-6 text-[#aa2771]" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Avanza Assistant</h3>
              <p className="text-xs text-white/80">
                {isCompleting ? 'Verification Complete' : 'Online • Secure Verification'}
              </p>
            </div>
          </div>

          {kycState !== 'READY_FOR_OCR' && !isCompleting && (
            <div className="relative">
              <Button
                onClick={() => setShowTooltip(v => !v)}
                variant="ghost" size="sm"
                className="text-white hover:bg-white/20 rounded-lg"
              >
                <HelpCircle className="w-5 h-5 mr-1" />
                <span className="text-sm">Why we need this?</span>
                {showTooltip
                  ? <ChevronUp className="w-4 h-4 ml-1" />
                  : <ChevronDown className="w-4 h-4 ml-1" />}
              </Button>
              {showTooltip && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-xl p-4 z-10 border border-gray-200">
                  <p className="text-sm text-gray-700 leading-relaxed">{tooltipFor(kycState)}</p>
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    <p className="text-xs text-gray-500">🔒 Your information is encrypted and secure</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="h-[450px] overflow-y-auto p-6 space-y-4 bg-gradient-to-b from-white to-gray-50">

        {/* Loading spinner */}
        {isInitializing && (
          <div className="flex gap-3">
            <div className="w-9 h-9 rounded-full bg-[#aa2771] flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="bg-white shadow-sm border border-gray-100 p-4 rounded-2xl">
              <div className="flex gap-1.5">
                {[0, 150, 300].map(d => (
                  <div key={d} className="w-2 h-2 bg-[#aa2771] rounded-full animate-bounce"
                    style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Init error */}
        {initError && !isInitializing && (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-2xl px-5 py-4 w-full">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm leading-relaxed">{initError}</p>
            </div>
            <Button
              onClick={initSession}
              className="flex items-center gap-2 bg-[#aa2771] hover:bg-[#8a1f5c] text-white rounded-xl px-5 py-2.5 text-sm"
            >
              <RefreshCw className="w-4 h-4" />
              Retry Connection
            </Button>
          </div>
        )}

        {/* Message list */}
        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-3 ${msg.type === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>

            {msg.type !== 'error' && (
              <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${msg.type === 'bot' ? 'bg-[#aa2771]' : 'bg-gray-200'
                }`}>
                {msg.type === 'bot'
                  ? <Bot className="w-5 h-5 text-white" />
                  : <User className="w-5 h-5 text-gray-700" />}
              </div>
            )}

            <div className={`max-w-[80%] ${msg.type === 'error' ? 'w-full max-w-full' : ''}`}>
              {msg.type === 'error' ? (
                <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 w-full">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-700">Connection Error</p>
                    <p className="text-xs text-red-600 mt-0.5 leading-relaxed">{msg.content}</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className={`p-4 rounded-2xl ${msg.type === 'bot'
                    ? 'bg-white shadow-sm border border-gray-100'
                    : 'bg-gradient-to-br from-[#aa2771] to-[#8a1f5c] text-white'
                    }`}>
                    <p className="text-sm leading-relaxed">{renderContent(msg.content)}</p>
                  </div>
                  <p className={`text-xs mt-1.5 px-1 ${msg.type === 'bot' ? 'text-gray-400' : 'text-gray-500 text-right'}`}>
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </>
              )}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isTyping && (
          <div className="flex gap-3">
            <div className="w-9 h-9 rounded-full bg-[#aa2771] flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="bg-white shadow-sm border border-gray-100 p-4 rounded-2xl">
              <div className="flex gap-1.5">
                {[0, 150, 300].map(d => (
                  <div key={d} className="w-2 h-2 bg-[#aa2771] rounded-full animate-bounce"
                    style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Completion banner */}
        {isCompleting && (
          <div className="flex justify-center">
            <div className="bg-gradient-to-r from-[#aa2771]/10 to-[#8a1f5c]/10 border-2 border-[#aa2771] rounded-2xl p-4 flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-[#aa2771]" />
              <p className="text-sm font-medium text-gray-800">
                Personal details verified — loading CNIC upload...
              </p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-5 bg-white border-t border-gray-100">

        {/* Account type dropdown */}
        {showDropdown && (
          <Select onValueChange={handleSelectChange} disabled={isTyping}>
            <SelectTrigger className="w-full h-12 rounded-xl border-gray-200 focus:ring-[#aa2771]">
              <SelectValue placeholder="Select your account type..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Personal Savings">Personal Savings</SelectItem>
              <SelectItem value="Current Account">Current Account</SelectItem>
              <SelectItem value="Business Account">Business Account</SelectItem>
              <SelectItem value="Investment Account">Investment Account</SelectItem>
            </SelectContent>
          </Select>
        )}

        {/* Text input */}
        {showInput && (
          <div className="space-y-2">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Input
                  ref={inputRef}
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholder}
                  disabled={inputDisabled}
                  className="h-12 rounded-xl border-gray-200 focus:ring-[#aa2771] bg-gray-50 pr-10"
                />
                {showLockIcon && (
                  <Lock className="w-4 h-4 text-[#aa2771] absolute right-3 top-1/2 -translate-y-1/2" />
                )}
              </div>
              <Button
                onClick={handleSendClick}
                disabled={!inputValue.trim() || inputDisabled}
                className="h-12 w-12 rounded-xl bg-[#aa2771] hover:bg-[#8a1f5c] text-white shadow-md"
              >
                <Send className="w-5 h-5" />
              </Button>
            </div>
            {showLockIcon && (
              <div className="flex items-center gap-1 text-xs text-[#626262]">
                <Lock className="w-3 h-3" />
                <span>Your {kycState === 'COLLECT_EMAIL' ? 'email' : 'phone number'} is encrypted</span>
              </div>
            )}
          </div>
        )}

        {/* Done */}
        {(isCompleting || kycState === 'READY_FOR_OCR') && (
          <p className="text-center text-xs text-gray-400">
            Onboarding complete — advancing to document verification.
          </p>
        )}
      </div>
    </Card>
  );
}