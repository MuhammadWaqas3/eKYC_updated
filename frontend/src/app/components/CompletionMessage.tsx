import { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { CheckCircle2, Download, RefreshCw, Sparkles } from 'lucide-react';

interface CompletionMessageProps {
  onReset: () => void;
}

const chatMessages = [
  { text: "🎉 Congratulations! Your eKYC verification is complete.", delay: 400 },
  { text: "✅ Your identity has been successfully verified.", delay: 1400 },
  { text: "🏦 Your Avanza Digital Banking account has been opened!", delay: 2400 },
  { text: "💳 You can now access all banking features and services.", delay: 3400 },
  {
    text: "📱 Download the Avanza app to start banking. Welcome aboard! 🚀",
    delay: 4400,
  },
];

export function CompletionMessage({ onReset }: CompletionMessageProps) {
  const verificationId = `AVZ-${Date.now().toString().slice(-8)}`;
  const [visible, setVisible] = useState<number[]>([]);
  const [showCard, setShowCard] = useState(false);

  useEffect(() => {
    chatMessages.forEach((_, i) => {
      setTimeout(() => setVisible(prev => [...prev, i]), chatMessages[i].delay);
    });
    setTimeout(() => setShowCard(true), 5600);
  }, []);

  const handleDownload = () => {
    const text =
      `AVANZA eKYC VERIFICATION CERTIFICATE\n\n` +
      `Verification ID : ${verificationId}\n` +
      `Date            : ${new Date().toLocaleDateString()}\n` +
      `Time            : ${new Date().toLocaleTimeString()}\n` +
      `Status          : VERIFIED & APPROVED\n\n` +
      `This certificate confirms that the eKYC verification has been completed successfully.\n` +
      `All biometric and identity checks have passed.\n\n` +
      `Avanza Digital Banking — Secure. Simple. Smart.`;

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `avanza-kyc-${verificationId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">

      {/* ── Success icon ── */}
      <div className="text-center">
        <div className="relative inline-block">
          <div className="w-24 h-24 bg-gradient-to-br from-green-400 to-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-2xl">
            <CheckCircle2 className="w-12 h-12 text-white" />
          </div>
          <div className="absolute inset-0 rounded-full border-4 border-green-300/40 animate-ping" />
          <Sparkles className="absolute -top-1 -right-1 w-7 h-7 text-yellow-400 animate-bounce" />
        </div>
        <h2 className="text-3xl font-bold text-gray-800 mt-5">Account Opened! 🎊</h2>
        <p className="text-gray-400 text-sm mt-1">Your eKYC is complete</p>
      </div>

      {/* ── Chat bubbles ── */}
      <div className="bg-gray-50 rounded-2xl p-5 space-y-4 border border-gray-100">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
          Avanza Assistant
        </p>

        {chatMessages.map((msg, i) => (
          <div
            key={i}
            className={`flex items-start gap-3 transition-all duration-500 ${visible.includes(i) ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
              }`}
          >
            {/* Avatar */}
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#aa2771] to-[#8a1f5c] flex items-center justify-center flex-shrink-0 mt-0.5 text-white text-xs font-bold shadow-sm">
              A
            </div>
            {/* Bubble */}
            <div className="bg-white rounded-2xl rounded-tl-sm shadow-sm border border-gray-100 px-4 py-3 max-w-[85%]">
              <p className="text-sm text-gray-800 leading-relaxed">{msg.text}</p>
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {visible.length < chatMessages.length && (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#aa2771] to-[#8a1f5c] flex items-center justify-center flex-shrink-0 text-white text-xs font-bold shadow-sm">
              A
            </div>
            <div className="bg-white rounded-2xl rounded-tl-sm shadow-sm border border-gray-100 px-4 py-3">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Verification ID + Actions (slide in after messages) ── */}
      <div
        className={`space-y-4 transition-all duration-700 ${showCard ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
      >
        {/* ID card */}
        <div className="bg-gradient-to-br from-[#FFF5F8] to-[#FFE5ED] border border-[#FFD6E5] rounded-2xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 mb-1">Verification ID</p>
            <p className="text-xl font-mono font-bold text-[#aa2771] tracking-wide">
              {verificationId}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {new Date().toLocaleDateString('en-PK', { dateStyle: 'long' })}
            </p>
          </div>
          <CheckCircle2 className="w-10 h-10 text-green-400" />
        </div>

        {/* What's next */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { n: '1', title: 'Account Active', sub: 'Within 24 hours' },
            { n: '2', title: 'Download App', sub: 'Avanza mobile app' },
            { n: '3', title: 'Start Banking', sub: 'All features unlocked' },
          ].map(i => (
            <div key={i.n} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 text-center">
              <div className="w-8 h-8 bg-[#aa2771] rounded-full flex items-center justify-center mx-auto mb-2">
                <span className="text-white text-sm font-bold">{i.n}</span>
              </div>
              <p className="text-xs font-semibold text-gray-800">{i.title}</p>
              <p className="text-xs text-gray-400 mt-0.5">{i.sub}</p>
            </div>
          ))}
        </div>

        {/* Buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={handleDownload}
            className="flex-1 h-13 bg-[#aa2771] hover:bg-[#8a1f5c] text-white rounded-xl shadow-md py-3"
          >
            <Download className="w-5 h-5 mr-2" />
            Download Certificate
          </Button>
          <Button
            onClick={onReset}
            variant="outline"
            className="flex-1 h-13 border-2 border-gray-200 rounded-xl hover:bg-gray-50 py-3"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Start New Application
          </Button>
        </div>

        <p className="text-center text-xs text-gray-400">
          🔒 A confirmation email will be sent to you shortly.
        </p>
      </div>
    </div>
  );
}