import { Loader2 } from 'lucide-react';

interface LoadingOverlayProps {
  message?: string;
  emoji?: string;
}

export function LoadingOverlay({ message = 'Processing...', emoji = '⏳' }: LoadingOverlayProps) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-white rounded-3xl p-8 shadow-2xl max-w-md mx-4 text-center">
        <div className="mb-6">
          <div className="w-20 h-20 bg-gradient-to-br from-[#aa2771] to-[#8a1f5c] rounded-full flex items-center justify-center mx-auto mb-4 relative">
            <Loader2 className="w-10 h-10 text-white animate-spin" />
            <div className="absolute -bottom-2 -right-2 text-3xl">{emoji}</div>
          </div>
        </div>
        <h3 className="text-xl font-semibold text-gray-800 mb-2">{message}</h3>
        <p className="text-sm text-[#626262]">Please wait a moment...</p>
        
        {/* Animated dots */}
        <div className="flex justify-center gap-2 mt-6">
          <div className="w-2 h-2 bg-[#aa2771] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 bg-[#aa2771] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 bg-[#aa2771] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}
