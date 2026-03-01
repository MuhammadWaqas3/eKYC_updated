import { useState, useRef, useEffect } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Camera, Loader2, CheckCircle2, X, RefreshCw } from 'lucide-react';

interface FaceVerificationProps {
  cnicImageUrl?: string;
  onComplete: () => void;
}

export function FaceVerification({ cnicImageUrl, onComplete }: FaceVerificationProps) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'detecting' | 'liveness' | 'matching' | 'success' | 'failed'>('idle');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user' } 
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

  const capturePhoto = () => {
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
    setVerificationStatus('detecting');

    // upload captured image to backend and poll status
    (async () => {
      try {
        // Convert dataURL to blob
        const resp = await fetch(capturedImage);
        const blob = await resp.blob();

        const form = new FormData();
        form.append('file', blob, 'capture.png');

        const upload = await fetch('http://localhost:8000/liveness/upload', {
          method: 'POST',
          body: form,
        });
        const uploadJson = await upload.json();
        if (!upload.ok || !uploadJson.ok) {
          setVerificationStatus('failed');
          setIsVerifying(false);
          return;
        }

        setVerificationStatus('liveness');

        // poll status
        const start = Date.now();
        const timeoutMs = 30000; // 30s
        while (Date.now() - start < timeoutMs) {
          const s = await fetch('http://localhost:8000/liveness/status');
          if (!s.ok) break;
          const js = await s.json();
          // update UI based on server status
          if (js.message) {
            if (js.match === true && js.liveness === 'LIVE') {
              setVerificationStatus('success');
              setIsVerifying(false);
              setTimeout(() => onComplete(), 800);
              return;
            }
            if (js.match === false) {
              setVerificationStatus('matching');
            }
          }
          await new Promise(r => setTimeout(r, 1000));
        }

        // timed out
        setVerificationStatus('failed');
        setIsVerifying(false);
      } catch (err) {
        console.error(err);
        setVerificationStatus('failed');
        setIsVerifying(false);
      }
    })();
  };

  const retryCapture = () => {
    setCapturedImage('');
    setVerificationStatus('idle');
    setIsVerifying(false);
    startCamera();
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column - Camera/Captured Image */}
        <Card className="p-8 bg-white shadow-lg rounded-3xl border-0">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-[#aa2771] to-[#8a1f5c] rounded-full flex items-center justify-center mx-auto mb-4">
              <Camera className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">Face Verification 📸</h3>
            <p className="text-sm text-[#626262]">Position your face within the frame</p>
          </div>

          <div className="relative">
            {!isCapturing && !capturedImage ? (
              <div className="aspect-[3/4] bg-gradient-to-br from-[#FFF5F8] to-[#FFE5ED] rounded-2xl flex items-center justify-center">
                <div className="text-center">
                  <Camera className="w-16 h-16 text-[#A8D5BA] mx-auto mb-4" />
                  <p className="text-gray-600 mb-6">Ready to capture your photo</p>
                  <Button
                    onClick={startCamera}
                    className="h-12 px-8 bg-[#A8D5BA] hover:bg-[#7CB899] text-white rounded-xl shadow-md"
                  >
                    <Camera className="w-5 h-5 mr-2" />
                    Start Camera
                  </Button>
                </div>
              </div>
            ) : null}

            {isCapturing && (
              <div className="relative">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full aspect-[3/4] rounded-2xl object-cover"
                />
                {/* Oval Face Guide */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <svg className="w-full h-full" viewBox="0 0 100 100">
                    <defs>
                      <mask id="faceMask">
                        <rect width="100" height="100" fill="white" opacity="0.3" />
                        <ellipse cx="50" cy="45" rx="25" ry="35" fill="black" />
                      </mask>
                    </defs>
                    <rect width="100" height="100" fill="black" opacity="0.5" mask="url(#faceMask)" />
                    <ellipse 
                      cx="50" 
                      cy="45" 
                      rx="25" 
                      ry="35" 
                      fill="none" 
                      stroke="#A8D5BA" 
                      strokeWidth="0.5"
                      strokeDasharray="2 1"
                    />
                  </svg>
                </div>
              </div>
            )}

            {capturedImage && (
              <div className="relative">
                <img
                  src={capturedImage}
                  alt="Captured"
                  className="w-full aspect-[3/4] rounded-2xl object-cover"
                />
                {verificationStatus === 'success' && (
                  <div className="absolute top-4 right-4 bg-[#A8D5BA] text-white px-4 py-2 rounded-full flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="text-sm font-medium">Verified</span>
                  </div>
                )}
              </div>
            )}

            <canvas ref={canvasRef} className="hidden" />
          </div>

          {isCapturing && (
            <div className="mt-6 space-y-3">
              <Button
                onClick={capturePhoto}
                className="w-full h-14 bg-[#A8D5BA] hover:bg-[#7CB899] text-white rounded-xl shadow-md"
              >
                <Camera className="w-5 h-5 mr-2" />
                Capture Photo
              </Button>
              <Button
                onClick={stopCamera}
                variant="outline"
                className="w-full h-12 border-gray-300 rounded-xl"
              >
                <X className="w-5 h-5 mr-2" />
                Cancel
              </Button>
            </div>
          )}

          {capturedImage && !isVerifying && verificationStatus === 'idle' && (
            <div className="mt-6">
              <Button
                onClick={retryCapture}
                variant="outline"
                className="w-full h-12 border-gray-300 rounded-xl"
              >
                <RefreshCw className="w-5 h-5 mr-2" />
                Retake Photo
              </Button>
            </div>
          )}
        </Card>

        {/* Right Column - Verification Status */}
        <Card className="p-8 bg-white shadow-lg rounded-3xl border-0">
          <div className="mb-6">
            <h3 className="text-xl font-semibold text-gray-800 mb-2">Verification Status</h3>
            <p className="text-sm text-gray-600">Real-time face verification process</p>
          </div>

          <div className="space-y-4">
            {/* Face Detection */}
            <div className={`p-4 rounded-2xl border-2 transition-all ${
              verificationStatus === 'detecting' ? 'border-[#A8D5BA] bg-[#A8D5BA]/10' :
              ['liveness', 'matching', 'success'].includes(verificationStatus) ? 'border-[#A8D5BA] bg-[#A8D5BA]/5' :
              'border-gray-200 bg-gray-50'
            }`}>
              <div className="flex items-center gap-3">
                {verificationStatus === 'detecting' ? (
                  <Loader2 className="w-6 h-6 text-[#A8D5BA] animate-spin" />
                ) : ['liveness', 'matching', 'success'].includes(verificationStatus) ? (
                  <CheckCircle2 className="w-6 h-6 text-[#A8D5BA]" />
                ) : (
                  <div className="w-6 h-6 rounded-full border-2 border-gray-300" />
                )}
                <div className="flex-1">
                  <p className="font-medium text-gray-800">Face Detected</p>
                  <p className="text-xs text-gray-600 mt-0.5">Analyzing facial features</p>
                </div>
              </div>
            </div>

            {/* Liveness Check */}
            <div className={`p-4 rounded-2xl border-2 transition-all ${
              verificationStatus === 'liveness' ? 'border-[#A8D5BA] bg-[#A8D5BA]/10' :
              ['matching', 'success'].includes(verificationStatus) ? 'border-[#A8D5BA] bg-[#A8D5BA]/5' :
              'border-gray-200 bg-gray-50'
            }`}>
              <div className="flex items-center gap-3">
                {verificationStatus === 'liveness' ? (
                  <Loader2 className="w-6 h-6 text-[#A8D5BA] animate-spin" />
                ) : ['matching', 'success'].includes(verificationStatus) ? (
                  <CheckCircle2 className="w-6 h-6 text-[#A8D5BA]" />
                ) : (
                  <div className="w-6 h-6 rounded-full border-2 border-gray-300" />
                )}
                <div className="flex-1">
                  <p className="font-medium text-gray-800">Liveness Check</p>
                  <p className="text-xs text-gray-600 mt-0.5">Verifying real person</p>
                </div>
              </div>
            </div>

            {/* Matching with CNIC */}
            <div className={`p-4 rounded-2xl border-2 transition-all ${
              verificationStatus === 'matching' ? 'border-[#A8D5BA] bg-[#A8D5BA]/10' :
              verificationStatus === 'success' ? 'border-[#A8D5BA] bg-[#A8D5BA]/5' :
              'border-gray-200 bg-gray-50'
            }`}>
              <div className="flex items-center gap-3">
                {verificationStatus === 'matching' ? (
                  <Loader2 className="w-6 h-6 text-[#A8D5BA] animate-spin" />
                ) : verificationStatus === 'success' ? (
                  <CheckCircle2 className="w-6 h-6 text-[#A8D5BA]" />
                ) : (
                  <div className="w-6 h-6 rounded-full border-2 border-gray-300" />
                )}
                <div className="flex-1">
                  <p className="font-medium text-gray-800">Matching with CNIC Photo</p>
                  <p className="text-xs text-gray-600 mt-0.5">Comparing facial biometrics</p>
                </div>
              </div>
            </div>
          </div>

          {/* Comparison View */}
          {capturedImage && (
            <div className="mt-8">
              <h4 className="text-sm font-medium text-gray-700 mb-4">Side-by-Side Comparison</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 mb-2">CNIC Photo</p>
                  <div className="aspect-square bg-gradient-to-br from-[#FFE5ED] to-[#FFD6E5] rounded-xl flex items-center justify-center border border-gray-200">
                    <Camera className="w-12 h-12 text-gray-400" />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-2">Live Capture</p>
                  <img
                    src={capturedImage}
                    alt="Live capture"
                    className="aspect-square rounded-xl object-cover border border-gray-200"
                  />
                </div>
              </div>
            </div>
          )}

          {verificationStatus === 'success' && (
            <div className="mt-8 p-6 bg-gradient-to-br from-[#A8D5BA]/20 to-[#7CB899]/10 rounded-2xl border border-[#A8D5BA]/30">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-8 h-8 text-[#A8D5BA]" />
                <div>
                  <p className="font-semibold text-gray-800">Verification Successful!</p>
                  <p className="text-sm text-gray-600 mt-0.5">Face matches with CNIC photo</p>
                </div>
              </div>
            </div>
          )}

          {!capturedImage && (
            <div className="mt-8 p-6 bg-gradient-to-br from-[#FFF5F8] to-[#FFE5ED] rounded-2xl text-center">
              <p className="text-sm text-gray-700">
                Please position your face in the frame and capture a clear photo for verification
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}