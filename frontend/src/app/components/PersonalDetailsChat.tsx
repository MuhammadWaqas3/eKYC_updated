import { useState, useRef, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Send, Bot, User, Lock, HelpCircle, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';

interface Message {
  id: string;
  type: 'bot' | 'user';
  content: string;
  timestamp: Date;
  field?: 'name' | 'phone' | 'email' | 'accountType';
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

export function PersonalDetailsChat({ onComplete }: PersonalDetailsChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'bot',
      content: "Welcome to Avanza! 👋 I'm here to help you complete your eKYC verification. Let's start with your personal details. What's your full name? ✨",
      timestamp: new Date(),
      field: 'name',
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [formData, setFormData] = useState<Partial<PersonalDetailsData>>({});
  const [currentField, setCurrentField] = useState<'name' | 'phone' | 'email' | 'accountType' | 'complete'>('name');
  const [showTooltip, setShowTooltip] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const addMessage = (type: 'bot' | 'user', content: string, field?: string, requiresSelect?: boolean) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      type,
      content,
      timestamp: new Date(),
      field: field as any,
      requiresSelect,
    };
    setMessages((prev) => [...prev, newMessage]);
  };

  const addBotMessageWithDelay = (content: string, delay: number = 800, field?: string, requiresSelect?: boolean) => {
    setIsTyping(true);
    setTimeout(() => {
      addMessage('bot', content, field, requiresSelect);
      setIsTyping(false);
    }, delay);
  };

  const handleResponse = (response: string) => {
    switch (currentField) {
      case 'name':
        setFormData((prev) => ({ ...prev, fullName: response }));
        addBotMessageWithDelay(`Great, ${response}! 😊 What's your phone number? 📱`, 800, 'phone');
        setCurrentField('phone');
        break;
      case 'phone':
        setFormData((prev) => ({ ...prev, phoneNumber: response }));
        addBotMessageWithDelay("Perfect! 👍 Now, what's your email address? 📧", 800, 'email');
        setCurrentField('email');
        break;
      case 'email':
        setFormData((prev) => ({ ...prev, email: response }));
        addBotMessageWithDelay('Almost done! 🎯 Please select your account type:', 800, 'accountType', true);
        setCurrentField('accountType');
        break;
      case 'accountType':
        const updatedData = { ...formData, accountType: response } as PersonalDetailsData;
        setFormData(updatedData);
        setIsCompleting(true);
        addBotMessageWithDelay('✅ Excellent! All personal details collected successfully. 🎉', 800);
        setCurrentField('complete');
        setTimeout(() => {
          onComplete(updatedData);
        }, 2200);
        break;
    }
  };

  const handleSendMessage = () => {
    if (!inputValue.trim() || isTyping) return;
    addMessage('user', inputValue);
    handleResponse(inputValue);
    setInputValue('');
  };

  const handleSelectChange = (value: string) => {
    addMessage('user', value);
    handleResponse(value);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const getTooltipContent = () => {
    switch (currentField) {
      case 'name':
        return 'Your full name is required for identity verification and must match your CNIC document.';
      case 'phone':
        return 'We need your phone number for secure authentication and important account notifications.';
      case 'email':
        return 'Your email is used for account recovery, statements, and important security updates.';
      case 'accountType':
        return 'Select the account type that best suits your financial needs. You can change this later.';
      default:
        return '';
    }
  };

  const showLockIcon = currentField === 'phone' || currentField === 'email';

  return (
    <Card className="max-w-3xl mx-auto bg-white shadow-lg rounded-3xl overflow-hidden border-0">
      {/* Chat Header */}
      <div className="bg-gradient-to-r from-[#aa2771] to-[#8a1f5c] p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-md">
              <Bot className="w-6 h-6 text-[#aa2771]" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Avanza Assistant</h3>
              <p className="text-xs text-white/80">Online • Ready to help</p>
            </div>
          </div>
          
          {/* Why we need this tooltip */}
          {currentField !== 'complete' && (
            <div className="relative">
              <Button
                onClick={() => setShowTooltip(!showTooltip)}
                variant="ghost"
                size="sm"
                className="text-white hover:bg-white/20 rounded-lg"
              >
                <HelpCircle className="w-5 h-5 mr-1" />
                <span className="text-sm">Why we need this?</span>
                {showTooltip ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
              </Button>
              
              {showTooltip && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-xl p-4 z-10 border border-gray-200">
                  <p className="text-sm text-gray-700 leading-relaxed">{getTooltipContent()}</p>
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
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.type === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
          >
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                message.type === 'bot'
                  ? 'bg-[#aa2771]'
                  : 'bg-gray-200'
              }`}
            >
              {message.type === 'bot' ? (
                <Bot className="w-5 h-5 text-white" />
              ) : (
                <User className="w-5 h-5 text-gray-700" />
              )}
            </div>
            <div className="max-w-[75%]">
              <div
                className={`p-4 rounded-2xl ${
                  message.type === 'bot'
                    ? 'bg-white shadow-sm border border-gray-100'
                    : 'bg-gradient-to-br from-[#aa2771] to-[#8a1f5c] text-white'
                }`}
              >
                <p className="text-sm leading-relaxed">{message.content}</p>
              </div>
              <p className={`text-xs mt-1.5 px-1 ${message.type === 'bot' ? 'text-gray-400' : 'text-gray-500 text-right'}`}>
                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex gap-3">
            <div className="w-9 h-9 rounded-full bg-[#aa2771] flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="bg-white shadow-sm border border-gray-100 p-4 rounded-2xl">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 bg-[#aa2771] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-[#aa2771] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-[#aa2771] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        {/* Completion Confirmation */}
        {isCompleting && (
          <div className="flex justify-center">
            <div className="bg-gradient-to-r from-[#aa2771]/10 to-[#8a1f5c]/10 border-2 border-[#aa2771] rounded-2xl p-4 flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-[#aa2771]" />
              <p className="text-sm font-medium text-gray-800">Personal details collected successfully!</p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-5 bg-white border-t border-gray-100">
        {currentField === 'accountType' && !formData.accountType ? (
          <div className="space-y-3">
            <Select onValueChange={handleSelectChange}>
              <SelectTrigger className="w-full h-12 rounded-xl border-gray-200 focus:ring-[#aa2771]">
                <SelectValue placeholder="Select account type..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Personal Savings">Personal Savings</SelectItem>
                <SelectItem value="Current Account">Current Account</SelectItem>
                <SelectItem value="Business Account">Business Account</SelectItem>
                <SelectItem value="Investment Account">Investment Account</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : currentField !== 'complete' ? (
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={
                    currentField === 'name' ? 'Enter your full name...' :
                    currentField === 'phone' ? 'Enter your phone number...' :
                    currentField === 'email' ? 'Enter your email address...' :
                    'Type your message...'
                  }
                  disabled={isTyping}
                  className="h-12 rounded-xl border-gray-200 focus:ring-[#aa2771] bg-gray-50 pr-10"
                />
                {showLockIcon && (
                  <Lock className="w-4 h-4 text-[#aa2771] absolute right-3 top-1/2 -translate-y-1/2" />
                )}
              </div>
              <Button
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || isTyping}
                className="h-12 w-12 rounded-xl bg-[#aa2771] hover:bg-[#8a1f5c] text-white shadow-md"
              >
                <Send className="w-5 h-5" />
              </Button>
            </div>
            
            {/* Helper text with security indicator */}
            <div className="flex items-center justify-between text-xs">
              {showLockIcon && (
                <div className="flex items-center gap-1 text-[#626262]">
                  <Lock className="w-3 h-3" />
                  <span>Your {currentField} is encrypted</span>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}