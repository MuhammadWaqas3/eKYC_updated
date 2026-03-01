import { useState, useRef } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Fingerprint, Loader2, CheckCircle2, Camera } from 'lucide-react';

interface FingerprintVerificationProps {
  onComplete: () => void;
}

export function FingerprintVerification({ onComplete }: FingerprintVerificationProps) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsCapturing(true);
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCapturing(false);
  };

  const captureFingerprint = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        const imageData = canvasRef.current.toDataURL('image/png');
        setCapturedImage(imageData);
        stopCamera();
        performVerification();
      }
    }
  };

  const performVerification = () => {
    setIsVerifying(true);
    
    // Simulate fingerprint verification
    setTimeout(() => {
      setIsVerifying(false);
      setIsVerified(true);
      setTimeout(() => {
        onComplete();
      }, 2000);
    }, 3000);
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <Card className="p-8 bg-white shadow-lg rounded-3xl border-0">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-[#aa2771] to-[#8a1f5c] rounded-full flex items-center justify-center mx-auto mb-4">
            <Fingerprint className="w-10 h-10 text-white" />
          </div>
          <h3 className="text-2xl font-semibold text-gray-800 mb-2">Fingerprint Verification 👆</h3>
          <p className="text-sm text-[#626262]">Place your fingers on a white surface and capture</p>
        </div>

        <div className="max-w-2xl mx-auto">
          {!isCapturing && !capturedImage ? (
            <div className="space-y-6">
              {/* Instructions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-[#FFF5F8] rounded-2xl border border-[#FFD6E5]">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-[#A8D5BA] rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-sm font-semibold">1</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">Clean Your Fingers</p>
                      <p className="text-xs text-gray-600 mt-1">Ensure your fingers are clean and dry</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-[#FFF5F8] rounded-2xl border border-[#FFD6E5]">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-[#A8D5BA] rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-sm font-semibold">2</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">White Background</p>
                      <p className="text-xs text-gray-600 mt-1">Place fingers on a white surface</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-[#FFF5F8] rounded-2xl border border-[#FFD6E5]">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-[#A8D5BA] rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-sm font-semibold">3</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">Good Lighting</p>
                      <p className="text-xs text-gray-600 mt-1">Use adequate lighting for clarity</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-[#FFF5F8] rounded-2xl border border-[#FFD6E5]">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-[#A8D5BA] rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-sm font-semibold">4</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">Steady Position</p>
                      <p className="text-xs text-gray-600 mt-1">Keep your hand steady while capturing</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Hand Guide Illustration */}
              <div className="aspect-video bg-gradient-to-br from-[#FFF5F8] to-[#FFE5ED] rounded-2xl flex items-center justify-center relative overflow-hidden">
                <div className="text-center z-10">
                  <div className="mb-4">
                    <svg className="w-32 h-32 mx-auto text-[#A8D5BA]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
                      <circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.2" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-gray-700">Place all four fingers here</p>
                  <p className="text-xs text-gray-500 mt-1">(Excluding thumb)</p>
                </div>
              </div>

              <Button
                onClick={startCamera}
                className="w-full h-14 bg-[#A8D5BA] hover:bg-[#7CB899] text-white rounded-xl shadow-md"
              >
                <Camera className="w-5 h-5 mr-2" />
                Start Camera
              </Button>
            </div>
          ) : null}

          {isCapturing && (
            <div className="space-y-6">
              <div className="relative">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full aspect-video rounded-2xl object-cover"
                />
                {/* Hand Guide Overlay */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="border-4 border-[#A8D5BA] border-dashed rounded-2xl p-8 bg-black/20">
                    <p className="text-white text-sm font-medium">Place fingers here</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Button
                  onClick={captureFingerprint}
                  className="w-full h-14 bg-[#A8D5BA] hover:bg-[#7CB899] text-white rounded-xl shadow-md"
                >
                  <Fingerprint className="w-5 h-5 mr-2" />
                  Capture Fingerprint
                </Button>
                <Button
                  onClick={stopCamera}
                  variant="outline"
                  className="w-full h-12 border-gray-300 rounded-xl"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {capturedImage && (
            <div className="space-y-6">
              <div className="relative">
                <img
                  src={capturedImage}
                  alt="Captured fingerprint"
                  className="w-full aspect-video rounded-2xl object-cover"
                />
                {isVerified && (
                  <div className="absolute top-4 right-4 bg-[#A8D5BA] text-white px-4 py-2 rounded-full flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="text-sm font-medium">Verified</span>
                  </div>
                )}
              </div>

              {isVerifying && (
                <div className="p-6 bg-[#A8D5BA]/10 rounded-2xl border border-[#A8D5BA]/30">
                  <div className="flex items-center gap-4">
                    <Loader2 className="w-8 h-8 text-[#A8D5BA] animate-spin" />
                    <div className="flex-1">
                      <p className="font-medium text-gray-800">Verifying Fingerprints...</p>
                      <p className="text-sm text-gray-600 mt-1">Analyzing biometric data</p>
                    </div>
                  </div>
                </div>
              )}

              {isVerified && (
                <div className="p-6 bg-gradient-to-br from-[#A8D5BA]/20 to-[#7CB899]/10 rounded-2xl border border-[#A8D5BA]/30">
                  <div className="flex items-center gap-4">
                    <CheckCircle2 className="w-10 h-10 text-[#A8D5BA]" />
                    <div className="flex-1">
                      <p className="text-lg font-semibold text-gray-800">Fingerprint Verified!</p>
                      <p className="text-sm text-gray-600 mt-1">Proceeding to confirmation...</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <canvas ref={canvasRef} className="hidden" />
        </div>
      </Card>
    </div>
  );
}