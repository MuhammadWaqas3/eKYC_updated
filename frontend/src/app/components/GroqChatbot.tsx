import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Bot, User, Loader2, ChevronDown } from 'lucide-react';

const GROQ_API_KEY = 'REDACTED';
const GROQ_MODEL = 'llama3-8b-8192';

const SYSTEM_PROMPT = `You are Avanza Assistant, a helpful and friendly AI for Avanza Digital Banking's eKYC (Know Your Customer) verification process. Your role is to guide users through the verification steps and answer their questions.

The eKYC process has these steps:
1. Personal Details - Users provide name, phone, email, and account type via chatbot
2. CNIC Upload - Users upload their Pakistani CNIC (National ID) for OCR extraction
3. Face Verification - Users take a selfie via webcam for liveness and face matching
4. Fingerprint - Users provide biometric fingerprint via device sensor
5. Confirmation - Users review all extracted data and submit

You can help with:
- Explaining each step of the process
- Troubleshooting camera or upload issues
- Answering questions about CNIC requirements (Pakistani National ID)
- Clarifying what data is collected and why
- Privacy and security questions about Avanza Banking

Keep responses concise (2-4 sentences), friendly, and helpful. If asked about something unrelated to eKYC or Avanza Banking, politely redirect to your area of expertise.`;

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    time: string;
}

export function GroqChatbot() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            id: '0',
            role: 'assistant',
            content: "Hi! I'm Avanza Assistant 👋 I can help you with the eKYC verification process. What do you need help with?",
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [hasUnread, setHasUnread] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setHasUnread(false);
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const sendText = async (text: string) => {
        if (!text.trim() || isLoading) return;
        const userMsg: ChatMessage = {
            id: Date.now().toString(),
            role: 'user',
            content: text.trim(),
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);
        try {
            const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
                body: JSON.stringify({ model: GROQ_MODEL, messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...history], max_tokens: 300, temperature: 0.7 }),
            });
            if (!res.ok) throw new Error(`${res.status}`);
            const data = await res.json();
            const reply = data.choices?.[0]?.message?.content ?? 'Sorry, I could not generate a response.';
            setMessages((prev) => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: reply, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
        } catch {
            setMessages((prev) => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: "I'm having trouble connecting right now. Please try again in a moment.", time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
        } finally {
            setIsLoading(false);
        }
    };

    const sendMessage = () => sendText(input);

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    };

    const quickQuestions = [
        'What documents do I need?',
        'Is my data secure?',
        'How does face verification work?',
    ];

    return (
        <>
            {/* Chat Window */}
            {isOpen && (
                <div
                    className="fixed bottom-24 right-4 z-50 w-[90vw] max-w-sm flex flex-col shadow-2xl rounded-3xl overflow-hidden"
                    style={{ height: '70vh', maxHeight: 560, background: 'white' }}
                >
                    {/* Header */}
                    <div className="bg-gradient-to-r from-[#aa2771] to-[#8a1f5c] px-5 py-4 flex items-center justify-between flex-shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                                <Bot className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <p className="font-semibold text-white text-sm">Avanza Assistant</p>
                                <div className="flex items-center gap-1.5">
                                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                                    <p className="text-white/80 text-xs">Online • AI Powered</p>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="p-2 rounded-xl hover:bg-white/20 transition-colors"
                        >
                            <ChevronDown className="w-5 h-5 text-white" />
                        </button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
                        {messages.map((msg) => (
                            <div
                                key={msg.id}
                                className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                            >
                                <div
                                    className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'assistant' ? 'bg-[#aa2771]' : 'bg-gray-300'
                                        }`}
                                >
                                    {msg.role === 'assistant' ? (
                                        <Bot className="w-4 h-4 text-white" />
                                    ) : (
                                        <User className="w-4 h-4 text-gray-700" />
                                    )}
                                </div>
                                <div className={`max-w-[78%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
                                    <div
                                        className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${msg.role === 'user'
                                            ? 'bg-gradient-to-br from-[#aa2771] to-[#8a1f5c] text-white rounded-tr-sm'
                                            : 'bg-white shadow-sm border border-gray-100 text-gray-800 rounded-tl-sm'
                                            }`}
                                    >
                                        {msg.content}
                                    </div>
                                    <p className="text-xs text-gray-400 mt-1 px-1">{msg.time}</p>
                                </div>
                            </div>
                        ))}

                        {isLoading && (
                            <div className="flex gap-2">
                                <div className="w-7 h-7 rounded-full bg-[#aa2771] flex items-center justify-center flex-shrink-0">
                                    <Bot className="w-4 h-4 text-white" />
                                </div>
                                <div className="bg-white shadow-sm border border-gray-100 px-4 py-3 rounded-2xl rounded-tl-sm">
                                    <div className="flex gap-1">
                                        {[0, 1, 2].map((i) => (
                                            <div
                                                key={i}
                                                className="w-2 h-2 bg-[#aa2771] rounded-full animate-bounce"
                                                style={{ animationDelay: `${i * 120}ms` }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Quick questions — only show at start */}
                        {messages.length === 1 && !isLoading && (
                            <div className="space-y-2 pt-2">
                                <p className="text-xs text-gray-400 text-center">Quick questions</p>
                                {quickQuestions.map((q) => (
                                    <button
                                        key={q}
                                        onClick={() => sendText(q)}
                                        className="w-full text-left text-sm px-4 py-2.5 bg-white border border-gray-200 rounded-xl hover:border-[#aa2771] hover:text-[#aa2771] transition-colors"
                                    >
                                        {q}
                                    </button>
                                ))}
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="p-3 bg-white border-t border-gray-100 flex-shrink-0">
                        <div className="flex gap-2">
                            <input
                                ref={inputRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyPress={handleKeyPress}
                                placeholder="Ask about eKYC..."
                                disabled={isLoading}
                                className="flex-1 h-11 px-4 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#aa2771]/30 focus:border-[#aa2771] bg-gray-50 disabled:opacity-60"
                            />
                            <button
                                onClick={sendMessage}
                                disabled={!input.trim() || isLoading}
                                className="w-11 h-11 rounded-xl bg-[#aa2771] hover:bg-[#8a1f5c] text-white flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                            >
                                {isLoading ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Send className="w-4 h-4" />
                                )}
                            </button>
                        </div>
                        <p className="text-center text-xs text-gray-400 mt-2">Powered by Groq AI · Avanza Banking</p>
                    </div>
                </div>
            )}

            {/* Floating Button */}
            <button
                onClick={() => setIsOpen((v) => !v)}
                className="fixed bottom-5 right-4 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-[#aa2771] to-[#8a1f5c] text-white shadow-xl flex items-center justify-center hover:scale-110 transition-transform active:scale-95"
                aria-label="Open chat assistant"
            >
                {isOpen ? (
                    <X className="w-6 h-6" />
                ) : (
                    <>
                        <MessageCircle className="w-6 h-6" />
                        {hasUnread && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-xs flex items-center justify-center font-bold">
                                1
                            </span>
                        )}
                    </>
                )}
            </button>
        </>
    );
}
