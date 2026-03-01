import { Card } from './ui/card';
import { Button } from './ui/button';
import { CheckCircle2, Download, Home, Bot } from 'lucide-react';

interface CompletionMessageProps {
  onReset: () => void;
}

export function CompletionMessage({ onReset }: CompletionMessageProps) {
  const verificationId = `AVZ-${Date.now().toString().slice(-8)}`;

  const handleDownloadCertificate = () => {
    // Simulate certificate download
    const blob = new Blob(
      [
        `AVANZA eKYC VERIFICATION CERTIFICATE\n\n` +
        `Verification ID: ${verificationId}\n` +
        `Date: ${new Date().toLocaleDateString()}\n` +
        `Time: ${new Date().toLocaleTimeString()}\n` +
        `Status: VERIFIED & APPROVED\n\n` +
        `This certificate confirms that the eKYC verification has been completed successfully.\n` +
        `All biometric and identity checks have been passed.\n\n` +
        `Avanza Digital Banking\n` +
        `Secure. Simple. Smart.`
      ],
      { type: 'text/plain' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `avanza-kyc-certificate-${verificationId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      {/* Success Animation Card */}
      <Card className="p-12 bg-white shadow-2xl rounded-3xl border-0 text-center">
        {/* Success Icon */}
        <div className="relative inline-block mb-8">
          <div className="w-32 h-32 bg-gradient-to-br from-[#A8D5BA] to-[#7CB899] rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-16 h-16 text-white" />
          </div>
          {/* Animated rings */}
          <div className="absolute inset-0 rounded-full border-4 border-[#A8D5BA]/30 animate-ping" />
          <div className="absolute inset-0 rounded-full border-2 border-[#A8D5BA]/50" style={{ animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }} />
        </div>

        {/* Success Message */}
        <h2 className="text-3xl font-semibold text-gray-800 mb-3">
          Verification Successful! 🎉
        </h2>
        <p className="text-lg text-gray-600 mb-8">
          Your eKYC verification has been successfully completed. ✨
        </p>

        {/* Verification ID */}
        <div className="mb-10 p-6 bg-gradient-to-br from-[#FFF5F8] to-[#FFE5ED] rounded-2xl border border-[#FFD6E5]">
          <p className="text-sm text-gray-600 mb-1">Verification ID</p>
          <p className="text-2xl font-mono font-semibold text-[#A8D5BA]">{verificationId}</p>
        </div>

        {/* Chatbot Confirmation Message */}
        <Card className="p-6 bg-gradient-to-r from-[#A8D5BA]/10 to-[#7CB899]/5 rounded-2xl border border-[#A8D5BA]/30 mb-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-[#A8D5BA] rounded-full flex items-center justify-center flex-shrink-0">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div className="text-left flex-1">
              <p className="font-semibold text-gray-800 mb-2">Avanza Assistant</p>
              <p className="text-sm text-gray-700 leading-relaxed">
                Congratulations! Your eKYC verification has been successfully completed. 
                All your documents and biometric data have been verified. Your account is now fully activated 
                and you can start using all Avanza banking services. Welcome to the future of banking! 🚀
              </p>
            </div>
          </div>
        </Card>

        {/* What's Next Section */}
        <div className="mb-8 p-6 bg-white border-2 border-gray-100 rounded-2xl">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">What's Next?</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
            <div className="p-4 bg-[#FFF5F8] rounded-xl">
              <div className="w-10 h-10 bg-[#A8D5BA] rounded-lg flex items-center justify-center mb-3">
                <span className="text-white font-semibold">1</span>
              </div>
              <p className="text-sm font-medium text-gray-800 mb-1">Account Activation</p>
              <p className="text-xs text-gray-600">Your account will be activated within 24 hours</p>
            </div>
            <div className="p-4 bg-[#FFF5F8] rounded-xl">
              <div className="w-10 h-10 bg-[#A8D5BA] rounded-lg flex items-center justify-center mb-3">
                <span className="text-white font-semibold">2</span>
              </div>
              <p className="text-sm font-medium text-gray-800 mb-1">Download App</p>
              <p className="text-xs text-gray-600">Get the Avanza mobile app for easy access</p>
            </div>
            <div className="p-4 bg-[#FFF5F8] rounded-xl">
              <div className="w-10 h-10 bg-[#A8D5BA] rounded-lg flex items-center justify-center mb-3">
                <span className="text-white font-semibold">3</span>
              </div>
              <p className="text-sm font-medium text-gray-800 mb-1">Start Banking</p>
              <p className="text-xs text-gray-600">Access all features and services immediately</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4">
          <Button
            onClick={handleDownloadCertificate}
            className="flex-1 h-14 bg-[#A8D5BA] hover:bg-[#7CB899] text-white rounded-xl shadow-md"
          >
            <Download className="w-5 h-5 mr-2" />
            Download Certificate
          </Button>
          <Button
            onClick={onReset}
            variant="outline"
            className="flex-1 h-14 border-2 border-gray-300 rounded-xl hover:bg-gray-50"
          >
            <Home className="w-5 h-5 mr-2" />
            Return to Home
          </Button>
        </div>

        {/* Footer Note */}
        <p className="text-xs text-gray-500 mt-8">
          You will receive a confirmation email shortly with your verification details.
        </p>
      </Card>
    </div>
  );
}