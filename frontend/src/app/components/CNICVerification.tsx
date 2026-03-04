import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Upload, Camera, Loader2, CheckCircle2, FileText,
  AlertCircle, RefreshCw, X,
} from 'lucide-react';
import { Progress } from './ui/progress';
import { fetchWithAuth } from '../../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────
interface CNICData {
  cnicNumber: string; fullName: string; fatherName: string;
  dateOfBirth: string; dateOfIssuance: string; dateOfExpiry: string;
  imageUrl?: string;
}
interface CNICVerificationProps { onComplete: (data: CNICData) => void; }
interface FieldConfidence { field: keyof CNICData; confidence: number; }
type CameraStatus = 'idle' | 'starting' | 'scanning' | 'detected' | 'ready' | 'processing' | 'done';
interface DetectResult {
  detected: boolean; side: string | null; confidence: number;
  bbox: { x: number; y: number; w: number; h: number; img_w: number; img_h: number; coverage: number } | null;
  guidance: string; ready_to_capture: boolean;
}

const DETECT_INTERVAL_MS = 500;
const confidenceColor = (c: number) => c >= 85 ? 'text-green-600' : c >= 70 ? 'text-yellow-600' : 'text-red-600';
const isLow = (c: number) => c < 75;

function getColor(det: DetectResult) {
  if (det.ready_to_capture) return { stroke: '#00ff88', fill: (a: number) => `rgba(0,255,136,${a})` };
  if (det.detected) return { stroke: '#ffaa00', fill: (a: number) => `rgba(255,170,0,${a})` };
  return { stroke: '#ff4444', fill: (a: number) => `rgba(255,68,68,${a})` };
}

function drawCorners(ctx: CanvasRenderingContext2D, x: number, y: number,
  w: number, h: number, color: string, size = 22, lw = 5) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  const corners: [number, number, number, number, number, number][] = [
    [x, y, size, 0, 0, size],
    [x + w, y, -size, 0, 0, size],
    [x, y + h, size, 0, 0, -size],
    [x + w, y + h, -size, 0, 0, -size],
  ];
  corners.forEach(([cx, cy, dx1, dy1, dx2, dy2]) => {
    ctx.beginPath();
    ctx.moveTo(cx + dx1, cy + dy1);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + dx2, cy + dy2);
    ctx.stroke();
  });
}

// ─── Component ────────────────────────────────────────────────────────────────
export function CNICVerification({ onComplete }: CNICVerificationProps) {

  const [mode, setMode] = useState<'choose' | 'upload' | 'camera'>('choose');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAnalyzed, setIsAnalyzed] = useState(false);
  const [confidence, setConfidence] = useState(0);
  const [fieldConfs, setFieldConfs] = useState<FieldConfidence[]>([]);
  const [cnicData, setCnicData] = useState<CNICData>({
    cnicNumber: '', fullName: '', fatherName: '',
    dateOfBirth: '', dateOfIssuance: '', dateOfExpiry: '',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animFrameRef = useRef<number>(0);
  const detectionRef = useRef<DetectResult | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLineY = useRef(0);
  const scanDir = useRef(1);

  const [camStatus, setCamStatus] = useState<CameraStatus>('idle');
  const [guidance, setGuidance] = useState('Starting camera…');
  const [sideInfo, setSideInfo] = useState('');
  const [isCapturing, setIsCapturing] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);

  useEffect(() => () => { stopCamera(); cancelAnimationFrame(animFrameRef.current); }, []);

  const resizeOverlay = () => {
    const v = videoRef.current; const oc = overlayCanvasRef.current;
    if (!v || !oc) return;
    oc.width = v.videoWidth;
    oc.height = v.videoHeight;
  };

  const drawLoop = useCallback(() => {
    drawOverlay();
    animFrameRef.current = requestAnimationFrame(drawLoop);
  }, []); // eslint-disable-line

  const drawOverlay = () => {
    const oc = overlayCanvasRef.current;
    const vid = videoRef.current;
    if (!oc || !vid) return;
    const ctx = oc.getContext('2d')!;
    const W = oc.width; const H = oc.height;
    ctx.clearRect(0, 0, W, H);
    const det = detectionRef.current;
    if (!det || !det.bbox) {
      ctx.fillStyle = 'rgba(220,30,30,0.15)';
      ctx.fillRect(0, 0, W, H);
      const gx = W * 0.08, gy = H * 0.15, gw = W * 0.84, gh = H * 0.60;
      ctx.strokeStyle = 'rgba(255,80,80,0.75)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([14, 8]);
      ctx.strokeRect(gx, gy, gw, gh);
      ctx.setLineDash([]);
      drawCorners(ctx, gx, gy, gw, gh, 'rgba(255,100,100,0.85)', 20, 3);
      return;
    }
    const { x, y, w, h, img_w, img_h } = det.bbox;
    const sx = W / img_w, sy = H / img_h;
    const bx = x * sx, by = y * sy, bw = w * sx, bh = h * sy;
    const col = getColor(det);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.restore();
    ctx.fillStyle = col.fill(det.ready_to_capture ? 0.18 : 0.28);
    ctx.fillRect(bx, by, bw, bh);
    const lw = det.ready_to_capture ? 5 : 4;
    ctx.strokeStyle = col.stroke;
    ctx.lineWidth = lw;
    ctx.strokeRect(bx + lw / 2, by + lw / 2, bw - lw, bh - lw);
    drawCorners(ctx, bx, by, bw, bh, col.stroke, 22, 6);
    if (det.detected && !det.ready_to_capture) {
      scanLineY.current += 1.8 * scanDir.current;
      if (scanLineY.current >= bh - 5) scanDir.current = -1;
      if (scanLineY.current <= 5) scanDir.current = 1;
      const sy2 = by + scanLineY.current;
      const grad = ctx.createLinearGradient(bx, sy2, bx + bw, sy2);
      grad.addColorStop(0, 'transparent');
      grad.addColorStop(0.3, col.stroke + '99');
      grad.addColorStop(0.5, col.stroke);
      grad.addColorStop(0.7, col.stroke + '99');
      grad.addColorStop(1, 'transparent');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(bx, sy2); ctx.lineTo(bx + bw, sy2); ctx.stroke();
    }
  };

  const captureFrame = useCallback((): HTMLCanvasElement | null => {
    const v = videoRef.current; const c = captureCanvasRef.current;
    if (!v || !c || v.readyState < 2) return null;
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    return c;
  }, []);

  const startDetectionLoop = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(async () => {
      const canvas = captureFrame();
      if (!canvas) return;
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          const fd = new FormData();
          fd.append('file', blob, 'frame.jpg');
          const res = await fetchWithAuth('/cnic/process/detect-only', { method: 'POST', body: fd });
          if (!res.ok) return;
          const data: DetectResult = await res.json();
          detectionRef.current = data;
          if (data.ready_to_capture) { setCamStatus('ready'); setGuidance('✅ Perfect! Press Capture'); }
          else if (data.detected) { setCamStatus('detected'); setGuidance('📐 ' + data.guidance); }
          else { setCamStatus('scanning'); setGuidance('🔍 ' + data.guidance); }
          setSideInfo(data.detected && data.side ? `${data.side} • ${(data.confidence * 100).toFixed(0)}%` : '');
        } catch (_) { }
      }, 'image/jpeg', 0.75);
    }, DETECT_INTERVAL_MS);
  }, [captureFrame]);

  const startCamera = useCallback(async () => {
    setCamStatus('starting'); setCamError(null); setGuidance('Starting camera…');
    detectionRef.current = null; scanLineY.current = 0; scanDir.current = 1;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      const vid = videoRef.current!;
      vid.srcObject = stream;
      vid.onloadedmetadata = () => {
        resizeOverlay(); vid.play();
        setCamStatus('scanning'); setGuidance('Align your CNIC inside the frame');
        startDetectionLoop();
        animFrameRef.current = requestAnimationFrame(drawLoop);
      };
    } catch (err: any) {
      setCamError(err?.message ?? 'Camera access denied'); setCamStatus('idle');
    }
  }, [startDetectionLoop, drawLoop]);

  const stopCamera = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    cancelAnimationFrame(animFrameRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const handleCameraCapture = async () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    cancelAnimationFrame(animFrameRef.current);
    const canvas = captureFrame();
    if (!canvas) return;
    setCamStatus('processing'); setIsCapturing(true); setGuidance('Running OCR pipeline…');
    canvas.toBlob(async (blob) => {
      if (!blob) { setIsCapturing(false); startDetectionLoop(); animFrameRef.current = requestAnimationFrame(drawLoop); return; }
      try {
        const fd = new FormData();
        fd.append('file', blob, 'cnic.jpg');
        const res = await fetchWithAuth('/cnic/process/auto', { method: 'POST', body: fd });
        if (!res.ok) throw new Error(`OCR failed (${res.status})`);
        const data = await res.json();
        applyOcrResult(data, '');
        setCamStatus('done'); setGuidance('✅ Document processed successfully!'); stopCamera();
      } catch (err: any) {
        setCamError('OCR failed: ' + err.message);
        setCamStatus('ready'); setIsCapturing(false);
        startDetectionLoop(); animFrameRef.current = requestAnimationFrame(drawLoop);
      }
    }, 'image/jpeg', 0.95);
  };

  function applyOcrResult(data: any, imgUrl: string) {
    const ext = data?.extracted || {};
    const photo = data?.photo_base64 || data?.photo || null;
    const imageUrl = photo ? `data:image/png;base64,${photo}` : imgUrl;
    setCnicData({
      cnicNumber: ext.cnic_number || '', fullName: ext.name || '', fatherName: ext.father_name || '',
      dateOfBirth: ext.date_of_birth || '', dateOfIssuance: ext.date_of_issue || ext.date_of_issuance || '',
      dateOfExpiry: ext.date_of_expiry || '', imageUrl,
    });
    const c = Number(data?.confidence || 0);
    setConfidence(c);
    setFieldConfs([
      { field: 'cnicNumber', confidence: c },
      { field: 'fullName', confidence: Math.min(95, c) },
      { field: 'fatherName', confidence: Math.min(85, c) },
      { field: 'dateOfBirth', confidence: Math.min(80, c) },
      { field: 'dateOfIssuance', confidence: Math.min(75, c) },
      { field: 'dateOfExpiry', confidence: Math.min(75, c) },
    ]);
    setIsAnalyzed(true);
    if (imgUrl) setPreviewUrl(imgUrl);
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadedFile(file); setPreviewUrl(URL.createObjectURL(file));
    setIsAnalyzed(false); setConfidence(0);
  };
  const handleAnalyze = () => {
    if (!uploadedFile) return;
    setIsAnalyzing(true);
    const fd = new FormData(); fd.append('file', uploadedFile);
    fetchWithAuth('/cnic/process/auto', { method: 'POST', body: fd })
      .then(r => { if (!r.ok) throw new Error(`OCR failed (${r.status})`); return r.json(); })
      .then(data => applyOcrResult(data, previewUrl))
      .catch(err => alert('OCR failed: ' + err.message))
      .finally(() => setIsAnalyzing(false));
  };
  const handleRetake = () => {
    setUploadedFile(null); setPreviewUrl(''); setIsAnalyzed(false); setConfidence(0); setFieldConfs([]);
  };

  const fieldConf = (f: keyof CNICData) => fieldConfs.find(x => x.field === f)?.confidence || 0;

  const statusColor: Record<CameraStatus, string> = {
    idle: '#6b7280', starting: '#6b7280', scanning: '#ef4444', detected: '#f97316',
    ready: '#22c55e', processing: '#22c55e', done: '#22c55e',
  };

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

      {/* ── TOP: Scan / Upload Section ──────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-[#aa2771] to-[#8a1f5c] rounded-full flex items-center justify-center flex-shrink-0">
            <FileText className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-800">Scan CNIC</h3>
            <p className="text-xs text-gray-500">
              {mode === 'camera' ? 'Align your card in the frame' :
                mode === 'upload' ? 'Upload a clear photo of your CNIC' :
                  'Upload or use live camera'}
            </p>
          </div>
          {mode !== 'choose' && (
            <button
              onClick={() => { stopCamera(); setMode('choose'); setCamStatus('idle'); setSideInfo(''); setIsCapturing(false); }}
              className="ml-auto text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="p-5">
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" className="hidden" />

          {/* Mode: Choose */}
          {mode === 'choose' && (
            <div className="space-y-3">
              <Button
                onClick={() => { setMode('upload'); fileInputRef.current?.click(); }}
                className="w-full h-12 bg-[#aa2771] hover:bg-[#8a1f5c] text-white rounded-xl shadow-sm"
              >
                <Upload className="w-4 h-4 mr-2" /> Upload from Device
              </Button>
              <Button
                onClick={() => { setMode('camera'); startCamera(); }}
                variant="outline"
                className="w-full h-12 border-2 border-[#aa2771] text-[#aa2771] hover:bg-[#aa2771]/5 rounded-xl"
              >
                <Camera className="w-4 h-4 mr-2" /> Use Live Camera
              </Button>
            </div>
          )}

          {/* Mode: Upload */}
          {mode === 'upload' && (
            <div className="space-y-4">
              {!previewUrl ? (
                <div className="space-y-3">
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-12 bg-[#aa2771] hover:bg-[#8a1f5c] text-white rounded-xl shadow-sm"
                  >
                    <Upload className="w-4 h-4 mr-2" /> Select Image
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative rounded-xl overflow-hidden border border-gray-200">
                    <img src={previewUrl} alt="CNIC Preview" className="w-full h-auto" />
                    {isAnalyzed && (
                      <div className="absolute top-2 right-2 bg-[#aa2771] text-white px-2.5 py-1 rounded-full flex items-center gap-1 text-xs">
                        <CheckCircle2 className="w-3 h-3" /> Analyzed
                      </div>
                    )}
                  </div>
                  {!isAnalyzed ? (
                    <div className="flex gap-2">
                      <Button onClick={handleAnalyze} disabled={isAnalyzing}
                        className="flex-1 h-11 bg-[#aa2771] hover:bg-[#8a1f5c] text-white rounded-xl shadow-sm">
                        {isAnalyzing
                          ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analyzing…</>
                          : <><FileText className="w-4 h-4 mr-2" />Analyze</>}
                      </Button>
                      <Button onClick={handleRetake} variant="outline" className="h-11 px-4 border-gray-300 rounded-xl">
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button onClick={handleRetake} variant="outline" className="w-full h-10 border-gray-200 rounded-xl text-sm text-gray-500">
                      <RefreshCw className="w-3.5 h-3.5 mr-2" /> Use Different Image
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Mode: Camera */}
          {mode === 'camera' && (
            <div className="space-y-3">
              {camError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-xs text-red-700 flex-1">{camError}</p>
                  <Button onClick={startCamera} size="sm" className="bg-red-500 hover:bg-red-600 text-white rounded-lg px-2 py-1 text-xs h-auto">
                    Retry
                  </Button>
                </div>
              )}

              {/* Viewfinder */}
              <div style={{
                position: 'relative', width: '100%', borderRadius: 12,
                overflow: 'hidden', background: '#000',
                border: `2px solid ${statusColor[camStatus]}`,
                transition: 'border-color 0.35s',
              }}>
                <video ref={videoRef} style={{ width: '100%', display: 'block', maxHeight: 340, objectFit: 'cover' }}
                  playsInline muted />
                <canvas ref={overlayCanvasRef} style={{
                  position: 'absolute', top: 0, left: 0,
                  width: '100%', height: '100%', pointerEvents: 'none',
                }} />
                {camStatus === 'processing' && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)' }}>
                    <div style={{ textAlign: 'center', color: '#fff' }}>
                      <Loader2 className="w-9 h-9 animate-spin mx-auto mb-2" />
                      <p style={{ fontSize: 13, fontWeight: 600 }}>Running OCR…</p>
                    </div>
                  </div>
                )}
                {camStatus === 'done' && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)' }}>
                    <CheckCircle2 style={{ width: 56, height: 56, color: '#22c55e' }} />
                  </div>
                )}
                {/* Top status pill */}
                <div style={{
                  position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
                  background: 'rgba(0,0,0,0.65)', color: statusColor[camStatus],
                  padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                  border: `1px solid ${statusColor[camStatus]}55`, backdropFilter: 'blur(4px)',
                  whiteSpace: 'nowrap',
                }}>
                  {sideInfo || (camStatus === 'scanning' ? '🔴 Scanning' :
                    camStatus === 'detected' ? '🟠 Detected' :
                      camStatus === 'ready' ? '🟢 Ready!' :
                        camStatus === 'processing' ? '⏳ Processing' :
                          camStatus === 'done' ? '✅ Done' : '⚪ Starting')}
                </div>
                {/* Guidance pill */}
                <div style={{
                  position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)',
                  whiteSpace: 'nowrap', background: 'rgba(0,0,0,0.72)', color: '#fff',
                  padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  backdropFilter: 'blur(6px)',
                }}>
                  {guidance}
                </div>
              </div>

              {/* Capture button */}
              <button
                onClick={handleCameraCapture}
                disabled={isCapturing || camStatus === 'done' || camStatus === 'starting'}
                style={{
                  width: '100%', height: 44, borderRadius: 12,
                  border: `2px solid ${camStatus === 'ready' ? '#22c55e' : '#aa2771'}`,
                  background: camStatus === 'ready' ? 'rgba(34,197,94,0.9)' : 'rgba(170,39,113,0.9)',
                  color: '#fff', fontWeight: 700, fontSize: 14,
                  cursor: isCapturing ? 'not-allowed' : 'pointer',
                  opacity: (isCapturing || camStatus === 'done') ? 0.55 : 1,
                  transition: 'all 0.3s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                {isCapturing
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
                  : camStatus === 'done'
                    ? <><CheckCircle2 className="w-4 h-4" /> Captured!</>
                    : camStatus === 'ready'
                      ? <>📸 Capture Now!</>
                      : <>📸 Capture</>}
              </button>

              <canvas ref={captureCanvasRef} className="hidden" />
            </div>
          )}
        </div>
      </div>

      {/* ── BOTTOM: Extracted Details ────────────────────────────────────── */}
      {(isAnalyzed || !isAnalyzed) && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 pt-4 pb-3 border-b border-gray-100">
            <h3 className="text-base font-semibold text-gray-800">Extracted Information</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {isAnalyzed ? 'Review and confirm the details below' : 'Details will appear here after scanning'}
            </p>
          </div>

          <div className="p-5 space-y-4">
            {/* Confidence bar — only when analyzed */}
            {isAnalyzed && (
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                <div className="flex-1">
                  <div className="flex justify-between mb-1">
                    <span className="text-xs text-gray-500">OCR Confidence</span>
                    <span className={`text-xs font-semibold ${confidenceColor(confidence)}`}>{confidence}%</span>
                  </div>
                  <Progress value={confidence} className="h-1.5" />
                </div>
              </div>
            )}

            {/* Fields */}
            {!isAnalyzed ? (
              <div className="py-6 text-center">
                <FileText className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Scan or upload your CNIC to see extracted details</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Primary fields */}
                {(['cnicNumber', 'fullName', 'fatherName'] as const).map(field => (
                  <div key={field}>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs font-medium text-gray-600">
                        {field === 'cnicNumber' ? 'CNIC Number' : field === 'fullName' ? 'Full Name' : 'Father Name'}
                      </Label>
                      {isAnalyzed && (
                        <span className={`text-xs ${confidenceColor(fieldConf(field))}`}>{fieldConf(field)}%</span>
                      )}
                    </div>
                    <Input
                      value={cnicData[field]}
                      onChange={e => setCnicData({ ...cnicData, [field]: e.target.value })}
                      placeholder={field === 'cnicNumber' ? '00000-0000000-0' : field === 'fullName' ? 'Full name' : 'Father name'}
                      className={`h-10 rounded-xl border-gray-200 bg-gray-50 text-sm ${isAnalyzed && isLow(fieldConf(field)) ? 'border-red-300 bg-red-50' : ''}`}
                    />
                    {isAnalyzed && isLow(fieldConf(field)) && (
                      <p className="flex items-center gap-1 text-xs text-red-500 mt-1">
                        <AlertCircle className="w-3 h-3" /> Please verify this field
                      </p>
                    )}
                  </div>
                ))}

                {/* Date fields */}
                <div className="grid grid-cols-3 gap-2">
                  {([['dateOfBirth', 'Date of Birth'], ['dateOfIssuance', 'Issue Date'], ['dateOfExpiry', 'Expiry']] as const).map(([field, label]) => (
                    <div key={field}>
                      <Label className="text-xs font-medium text-gray-600 block mb-1">{label}</Label>
                      <Input
                        value={cnicData[field]}
                        onChange={e => setCnicData({ ...cnicData, [field]: e.target.value })}
                        placeholder="DD.MM.YYYY"
                        className={`h-10 rounded-xl border-gray-200 bg-gray-50 text-xs ${isAnalyzed && isLow(fieldConf(field)) ? 'border-red-300 bg-red-50' : ''}`}
                      />
                    </div>
                  ))}
                </div>

                {/* Continue button */}
                <div className="pt-1">
                  <Button
                    onClick={() => onComplete(cnicData)}
                    className="w-full h-12 bg-[#aa2771] hover:bg-[#8a1f5c] text-white rounded-xl shadow-sm font-medium"
                  >
                    Continue to Face Verification →
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}