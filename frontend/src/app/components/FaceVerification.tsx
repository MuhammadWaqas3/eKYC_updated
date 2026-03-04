import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import {
  Camera, Loader2, CheckCircle2, X, RefreshCw, AlertCircle, ArrowRight,
} from 'lucide-react';
import { fetchWithAuth } from '../../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────
interface FaceVerificationProps {
  cnicImageUrl?: string;
  onComplete: () => void;
}

type Step =
  | 'idle'
  | 'uploading_cnic'
  | 'streaming'
  | 'verifying'
  | 'success'
  | 'failed';

interface StatusData {
  match: boolean | null;
  confidence: number;
  message: string;
  liveness: string | null;
  liveness_stage: string;
  liveness_progress: number;
  blink_count: number;
  looked_left: boolean;
  looked_right: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function FaceVerification({ cnicImageUrl, onComplete }: FaceVerificationProps) {
  const [step, setStep] = useState<Step>('idle');
  const [errMsg, setErrMsg] = useState('');
  const [showManualProceed, setShowManualProceed] = useState(false);
  const [statusData, setStatusData] = useState<StatusData>({
    match: null, confidence: 0, message: 'Ready',
    liveness: null, liveness_stage: 'idle', liveness_progress: 0,
    blink_count: 0, looked_left: false, looked_right: false,
  });

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const manualTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamRef = useRef<HTMLImageElement>(null);

  useEffect(() => () => {
    stopPolling();
    if (manualTimerRef.current) clearTimeout(manualTimerRef.current);
    fetchWithAuth('/liveness/stop_webcam', { method: 'POST' }).catch(() => { });
  }, []);

  const uploadCnicFace = useCallback(async () => {
    if (!cnicImageUrl) {
      setErrMsg('No CNIC image available. Please go back and scan CNIC first.');
      setStep('failed');
      return;
    }
    setStep('uploading_cnic');
    setErrMsg('');
    try {
      const res = await fetchWithAuth(cnicImageUrl);
      const blob = await res.blob();
      const fd = new FormData();
      fd.append('file', blob, 'cnic_face.jpg');
      const upRes = await fetchWithAuth('/liveness/upload', { method: 'POST', body: fd });
      if (!upRes.ok) throw new Error(`Upload failed (${upRes.status})`);
      const data = await upRes.json();
      if (!data.ok) {
        setErrMsg(data.message || 'No face found in CNIC image.');
        setStep('failed');
        return;
      }
      await fetchWithAuth('/liveness/start_webcam', { method: 'POST' });
      setStep('streaming');
      startPolling();
      // Har 30 seconds baad manual proceed button dikhao
      setShowManualProceed(false);
      manualTimerRef.current = setTimeout(() => setShowManualProceed(true), 30000);
    } catch (err: any) {
      setErrMsg(err.message || 'Failed to upload CNIC face.');
      setStep('failed');
    }
  }, [cnicImageUrl]);

  const startPolling = () => {
    stopPolling();
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetchWithAuth('/liveness/status');
        if (!res.ok) return;
        const data: StatusData = await res.json();
        setStatusData(data);
        if (data.match === true && data.liveness === 'LIVE') {
          stopPolling();
          setStep('success');
          await fetchWithAuth('/liveness/stop_webcam', { method: 'POST' }).catch(() => { });
          setTimeout(() => onComplete(), 1600);
        }
      } catch (_) { }
    }, 800);
  };

  const stopPolling = () => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
  };

  const handleStop = async () => {
    stopPolling();
    if (manualTimerRef.current) clearTimeout(manualTimerRef.current);
    await fetchWithAuth('/liveness/stop_webcam', { method: 'POST' }).catch(() => { });
    setStep('idle');
    setErrMsg('');
    setShowManualProceed(false);
    setStatusData(prev => ({ ...prev, match: null, confidence: 0, liveness: null }));
  };

  const handleManualProceed = async () => {
    stopPolling();
    if (manualTimerRef.current) clearTimeout(manualTimerRef.current);
    await fetchWithAuth('/liveness/stop_webcam', { method: 'POST' }).catch(() => { });
    setStep('success');
    setTimeout(onComplete, 1500);
  };

  const handleRetry = async () => {
    stopPolling();
    if (manualTimerRef.current) clearTimeout(manualTimerRef.current);
    await fetchWithAuth('/liveness/stop_webcam', { method: 'POST' }).catch(() => { });
    setStep('idle');
    setErrMsg('');
    setShowManualProceed(false);
    setStatusData({
      match: null, confidence: 0, message: 'Ready',
      liveness: null, liveness_stage: 'idle', liveness_progress: 0,
      blink_count: 0, looked_left: false, looked_right: false,
    });
  };

  const stageInfo = () => {
    const s = statusData.liveness_stage;
    if (s === 'look_right') return { text: '>> Turn head RIGHT', color: '#f97316' };
    if (s === 'look_left') return { text: '<< Turn head LEFT', color: '#f97316' };
    if (s === 'blink') return { text: 'Blink your eyes 👁️', color: '#3b82f6' };
    if (s === 'done') return { text: '✅ Liveness complete', color: '#22c55e' };
    return { text: 'Align face in frame', color: '#6b7280' };
  };

  const matchColor =
    statusData.match === true ? '#22c55e' :
      statusData.match === false ? '#ef4444' : '#6b7280';

  const info = stageInfo();
  const isActive = step === 'streaming' || step === 'verifying';

  const checks = [
    { label: 'Turn Right', done: statusData.looked_right },
    { label: 'Turn Left', done: statusData.looked_left },
    { label: 'Blink x2', done: statusData.blink_count >= 2 },
  ];

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

      {/* ── TOP: Camera Feed ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-[#aa2771] to-[#8a1f5c] rounded-full flex items-center justify-center flex-shrink-0">
            <Camera className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-800">Face Verification</h3>
            <p className="text-xs text-gray-500">
              {step === 'idle' ? 'Click Start to begin' :
                step === 'uploading_cnic' ? 'Extracting face from CNIC…' :
                  step === 'streaming' ? 'Follow the on-screen instructions' :
                    step === 'success' ? 'Identity verified!' :
                      step === 'failed' ? 'Verification failed' : 'Verifying…'}
            </p>
          </div>
          {isActive && (
            <button
              onClick={handleStop}
              className="ml-auto text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Camera area */}
        <div className="p-5">
          <div
            className="relative rounded-xl overflow-hidden bg-black"
            style={{ aspectRatio: '4/3' }}
          >
            {/* Idle / failed placeholder */}
            {(step === 'idle' || step === 'failed') && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#FFF5F8] to-[#FFE5ED] gap-3">
                <Camera className="w-12 h-12 text-[#aa2771]/25" />
                {step === 'idle' && (
                  <Button
                    onClick={uploadCnicFace}
                    className="h-11 px-7 bg-[#aa2771] hover:bg-[#8a1f5c] text-white rounded-xl shadow-md"
                  >
                    <Camera className="w-4 h-4 mr-2" /> Start Verification
                  </Button>
                )}
                {step === 'failed' && (
                  <Button onClick={handleRetry} variant="outline"
                    className="h-10 px-6 border-[#aa2771] text-[#aa2771] rounded-xl">
                    <RefreshCw className="w-4 h-4 mr-2" /> Try Again
                  </Button>
                )}
              </div>
            )}

            {/* Uploading CNIC spinner */}
            {step === 'uploading_cnic' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-3">
                <Loader2 className="w-10 h-10 text-[#aa2771] animate-spin" />
                <p className="text-white text-sm font-medium">Extracting face from CNIC…</p>
              </div>
            )}

            {/* MJPEG stream */}
            {isActive && (
              <img
                ref={streamRef}
                src="/liveness/video_feed"
                alt="Live camera feed"
                className="w-full h-full object-cover"
              />
            )}

            {/* Success overlay */}
            {step === 'success' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <div className="text-center">
                  <CheckCircle2 className="w-16 h-16 text-green-400 mx-auto mb-2" />
                  <p className="text-white text-base font-bold">Identity Verified!</p>
                </div>
              </div>
            )}

            {/* Confidence badge */}
            {isActive && statusData.confidence > 0 && (
              <div style={{
                position: 'absolute', top: 10, right: 10,
                background: statusData.match ? 'rgba(34,197,94,0.9)' : 'rgba(239,68,68,0.85)',
                color: '#fff', padding: '4px 10px',
                borderRadius: 20, fontSize: 12, fontWeight: 700,
                backdropFilter: 'blur(4px)',
              }}>
                {statusData.confidence}% {statusData.match ? '✓' : '✗'}
              </div>
            )}

            {/* Stage instruction pill */}
            {isActive && (
              <div style={{
                position: 'absolute', bottom: 10, left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(0,0,0,0.72)', color: '#fff',
                padding: '6px 16px', borderRadius: 20,
                fontSize: 13, fontWeight: 600,
                whiteSpace: 'nowrap',
                backdropFilter: 'blur(6px)',
                borderLeft: `3px solid ${info.color}`,
              }}>
                {info.text}
              </div>
            )}
          </div>

          {/* Error */}
          {errMsg && (
            <div className="mt-3 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{errMsg}</p>
            </div>
          )}

          {/* Manual Proceed Button - 30s ke baad dikhta hai */}
          {isActive && showManualProceed && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-xs text-amber-700 mb-2">⏱️ Having trouble? You can proceed manually.</p>
              <Button
                onClick={handleManualProceed}
                className="w-full h-10 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm"
              >
                <ArrowRight className="w-4 h-4 mr-2" />
                Proceed to Fingerprint
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── BOTTOM: Status ───────────────────────────────────────────────── */}
      {(isActive || step === 'success' || step === 'failed') && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 pt-4 pb-3 border-b border-gray-100">
            <h3 className="text-base font-semibold text-gray-800">Verification Status</h3>
            <p className="text-xs text-gray-500 mt-0.5">Real-time liveness + face matching</p>
          </div>

          <div className="p-5 space-y-4">
            {/* Face match bar */}
            <div className="flex items-center gap-4 p-3 rounded-xl border"
              style={{ borderColor: matchColor + '44', background: matchColor + '08' }}>
              <div className="flex-1">
                <div className="flex justify-between mb-1.5">
                  <span className="text-xs font-medium text-gray-600">Face Match</span>
                  <span style={{ color: matchColor, fontWeight: 700, fontSize: 13 }}>
                    {statusData.confidence}%
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${statusData.confidence}%`,
                      background: statusData.match ? '#22c55e' : statusData.match === false ? '#ef4444' : '#94a3b8',
                    }}
                  />
                </div>
              </div>
              <span className="text-xs font-medium flex-shrink-0" style={{ color: matchColor }}>
                {statusData.match === true ? '✓ Matched' :
                  statusData.match === false ? '✗ No match' : '…'}
              </span>
            </div>

            {/* Liveness checks — compact horizontal row */}
            <div className="flex gap-2">
              {checks.map((c, i) => (
                <div key={i}
                  className="flex-1 flex items-center gap-1.5 px-3 py-2 rounded-xl transition-all"
                  style={{
                    background: c.done ? 'rgba(34,197,94,0.08)' : 'rgba(0,0,0,0.03)',
                    border: `1.5px solid ${c.done ? '#22c55e55' : '#e5e7eb'}`,
                  }}
                >
                  {c.done
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                    : <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 flex-shrink-0" />}
                  <span className="text-xs font-medium truncate" style={{ color: c.done ? '#15803d' : '#6b7280' }}>
                    {c.label}
                  </span>
                  {!c.done && statusData.liveness_stage === ['look_right', 'look_left', 'blink'][i] && (
                    <span className="text-xs font-bold text-orange-500 animate-pulse ml-auto">›</span>
                  )}
                </div>
              ))}
            </div>

            {/* Liveness progress bar */}
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-xs text-gray-500">Liveness Progress</span>
                <span className="text-xs font-semibold"
                  style={{ color: statusData.liveness === 'LIVE' ? '#22c55e' : '#6b7280' }}>
                  {statusData.liveness_progress}%
                </span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${statusData.liveness_progress}%`,
                    background: statusData.liveness === 'LIVE' ? '#22c55e' : '#3b82f6',
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Idle instructions */}
      {step === 'idle' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm font-medium text-gray-700 mb-2">📋 Quick Tips</p>
          <ul className="text-xs text-gray-500 space-y-1.5">
            <li>• Face the <strong>front camera</strong> directly</li>
            <li>• Turn head <strong>right</strong>, then <strong>left</strong></li>
            <li>• <strong>Blink</strong> twice naturally</li>
            <li>• Good lighting gives better results</li>
          </ul>
        </div>
      )}
    </div>
  );
}