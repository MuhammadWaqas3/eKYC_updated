import { useState, useRef, useEffect } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import {
  Fingerprint, Loader2, CheckCircle2, Camera, AlertCircle, RefreshCw, ArrowRight,
} from 'lucide-react';

interface FingerprintVerificationProps {
  onComplete: () => void;
}

type FPStep = 'ready' | 'camera' | 'captured' | 'processing' | 'done';

export function FingerprintVerification({ onComplete }: FingerprintVerificationProps) {
  const [step, setStep] = useState<FPStep>('ready');
  const [capturedImage, setCapturedImage] = useState('');
  const [errMsg, setErrMsg] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Whenever step becomes 'camera', attach the stream to the video element and play it.
  // This handles the race condition where the video element may not be mounted yet
  // when openCamera() first assigns srcObject.
  useEffect(() => {
    if (step === 'camera' && streamRef.current && videoRef.current) {
      const video = videoRef.current;
      if (!video.srcObject) {
        video.srcObject = streamRef.current;
      }
      video.play().catch(() => {
        // autoPlay policy may block; user interaction already happened (button click)
      });
    }
  }, [step]);

  // ---------- Open Camera ----------
  const openCamera = async () => {
    setErrMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;

      // Set step first; the useEffect above will attach the stream after the
      // video element renders into the DOM.
      setStep('camera');
    } catch (err) {
      console.error('Camera error:', err);
      setErrMsg(
        'Could not access camera. Please allow camera permission in your browser and try again.'
      );
    }
  };

  // ---------- Capture photo ----------
  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    setCapturedImage(dataUrl);

    // Stop camera stream
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;

    setStep('captured');
  };

  // ---------- Retake ----------
  const retake = () => {
    // Stop any lingering stream before going back
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCapturedImage('');
    setStep('ready');
  };

  // ---------- Proceed to Confirmation ----------
  const handleDone = () => {
    setStep('processing');
    setTimeout(() => {
      setStep('done');
      setTimeout(onComplete, 1200);
    }, 1800);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Card className="p-8 bg-white shadow-lg rounded-3xl border-0">

        {/* ── Header ── */}
        <div className="text-center mb-8">
          <div
            className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 transition-all duration-500 ${step === 'done'
              ? 'bg-gradient-to-br from-green-400 to-green-600'
              : 'bg-gradient-to-br from-[#aa2771] to-[#8a1f5c]'
              }`}
          >
            {step === 'done' ? (
              <CheckCircle2 className="w-10 h-10 text-white" />
            ) : (
              <Fingerprint className="w-10 h-10 text-white" />
            )}
          </div>

          <h3 className="text-2xl font-semibold text-gray-800 mb-1">
            {step === 'done' ? 'Fingerprint Verified ✅' : 'Fingerprint Verification'}
          </h3>
          <p className="text-sm text-gray-500">
            {step === 'ready' && 'Click "Open Camera" to take a photo of your fingers'}
            {step === 'camera' && 'Place your 4 fingers (no thumb) clearly in view, then click Capture'}
            {step === 'captured' && 'Photo captured! Click "Done – Move to Next Step" to continue'}
            {step === 'processing' && 'Processing fingerprint image…'}
            {step === 'done' && 'Moving to confirmation…'}
          </p>
        </div>

        {/* ── Error ── */}
        {errMsg && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex gap-3 items-start">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-red-700">{errMsg}</p>
            </div>
          </div>
        )}

        <div className="max-w-xl mx-auto space-y-5">

          {/* ════════ STEP: READY ════════ */}
          {step === 'ready' && (
            <div className="space-y-6">
              {/* Instructions */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { n: '1', t: 'Clean & dry fingers' },
                  { n: '2', t: 'White background' },
                  { n: '3', t: 'Good lighting' },
                  { n: '4', t: 'Hold steady' },
                ].map(i => (
                  <div key={i.n} className="p-3 bg-[#FFF5F8] rounded-xl border border-[#FFD6E5] text-center">
                    <div className="w-7 h-7 bg-[#aa2771] rounded-full flex items-center justify-center mx-auto mb-2">
                      <span className="text-white text-xs font-bold">{i.n}</span>
                    </div>
                    <p className="text-xs text-gray-700 font-medium">{i.t}</p>
                  </div>
                ))}
              </div>

              <Button
                onClick={openCamera}
                className="w-full h-14 bg-[#aa2771] hover:bg-[#8a1f5c] text-white rounded-2xl text-base font-semibold shadow-md"
              >
                <Camera className="w-5 h-5 mr-2" />
                Open Camera
              </Button>
            </div>
          )}

          {/* ════════ STEP: CAMERA ════════ */}
          {step === 'camera' && (
            <div className="space-y-4">
              {/* Live preview */}
              <div
                className="relative rounded-2xl overflow-hidden border-2 border-[#aa2771]/40 bg-black"
                style={{ aspectRatio: '16/9' }}
              >
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  onLoadedMetadata={() => {
                    videoRef.current?.play().catch(() => { });
                  }}
                />
                {/* Guide overlay */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="border-4 border-dashed border-white/70 rounded-2xl px-14 py-8 bg-black/20 text-center">
                    <Fingerprint className="w-7 h-7 text-white/80 mx-auto mb-1" />
                    <p className="text-white text-sm font-semibold drop-shadow">
                      4 fingers here (no thumb)
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={capturePhoto}
                  className="flex-1 h-12 bg-[#aa2771] hover:bg-[#8a1f5c] text-white rounded-xl font-semibold"
                >
                  <Camera className="w-4 h-4 mr-2" />
                  Capture Photo
                </Button>
                <Button
                  onClick={retake}
                  variant="outline"
                  className="h-12 px-5 border-gray-300 rounded-xl"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* ════════ STEP: CAPTURED ════════ */}
          {step === 'captured' && capturedImage && (
            <div className="space-y-4">
              {/* Preview */}
              <div className="relative rounded-2xl overflow-hidden border-2 border-[#aa2771]/30">
                <img
                  src={capturedImage}
                  alt="Captured fingerprint"
                  className="w-full object-cover"
                  style={{ maxHeight: 280 }}
                />
                <div className="absolute top-3 right-3 bg-[#aa2771] text-white text-xs font-semibold px-3 py-1.5 rounded-full">
                  📸 Photo Captured
                </div>
              </div>

              <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                <p className="text-sm text-green-800 font-medium">
                  Fingerprint photo captured successfully!
                </p>
              </div>

              <div className="flex gap-3">
                {/* PRIMARY: Done & move to next */}
                <Button
                  onClick={handleDone}
                  className="flex-1 h-13 bg-[#aa2771] hover:bg-[#8a1f5c] text-white rounded-xl font-semibold py-3 text-base"
                >
                  <ArrowRight className="w-5 h-5 mr-2" />
                  Done – Move to Next Step
                </Button>

                {/* SECONDARY: Retake */}
                <Button
                  onClick={retake}
                  variant="outline"
                  className="h-13 px-5 border-gray-300 rounded-xl py-3"
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Retake
                </Button>
              </div>
            </div>
          )}

          {/* ════════ STEP: PROCESSING ════════ */}
          {step === 'processing' && (
            <div className="py-10 flex flex-col items-center gap-5">
              <Loader2 className="w-14 h-14 text-[#aa2771] animate-spin" />
              <div className="text-center">
                <p className="text-base font-semibold text-gray-800">Processing Fingerprint…</p>
                <p className="text-sm text-gray-500 mt-1">Please wait a moment</p>
              </div>
            </div>
          )}

          {/* ════════ STEP: DONE ════════ */}
          {step === 'done' && (
            <div className="py-8 flex flex-col items-center gap-4">
              <CheckCircle2 className="w-16 h-16 text-green-500" />
              <div className="text-center">
                <p className="text-lg font-semibold text-gray-800">Fingerprint Verified!</p>
                <p className="text-sm text-gray-500 mt-1">Moving to confirmation form…</p>
              </div>
            </div>
          )}

        </div>

        <canvas ref={canvasRef} className="hidden" />
      </Card>
    </div>
  );
}