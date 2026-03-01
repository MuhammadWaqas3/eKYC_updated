import { useState, useRef } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Upload, Camera, Loader2, CheckCircle2, FileText, AlertCircle, HelpCircle, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { Progress } from './ui/progress';

interface CNICData {
  cnicNumber: string;
  fullName: string;
  fatherName: string;
  dateOfBirth: string;
  dateOfIssuance: string;
  dateOfExpiry: string;
  imageUrl?: string;
}

interface CNICVerificationProps {
  onComplete: (data: CNICData) => void;
}

interface FieldConfidence {
  field: keyof CNICData;
  confidence: number;
}

export function CNICVerification({ onComplete }: CNICVerificationProps) {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAnalyzed, setIsAnalyzed] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);
  const [overallConfidence, setOverallConfidence] = useState(0);
  const [showTooltip, setShowTooltip] = useState(false);
  const [cnicData, setCnicData] = useState<CNICData>({
    cnicNumber: '',
    fullName: '',
    fatherName: '',
    dateOfBirth: '',
    dateOfIssuance: '',
    dateOfExpiry: '',
  });
  const [fieldConfidences, setFieldConfidences] = useState<FieldConfidence[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const webcamInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setIsAnalyzed(false);
      setOverallConfidence(0);
    }
  };

  const handleAnalyze = () => {
    if (attemptCount >= 3) return;

    if (!uploadedFile) {
      alert('Please upload a CNIC image first');
      return;
    }

    setIsAnalyzing(true);
    setAttemptCount(prev => prev + 1);

    const form = new FormData();
    form.append('file', uploadedFile);

    fetch('http://localhost:8000/cnic/process/auto', {
      method: 'POST',
      body: form,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`OCR failed (${res.status})`);
        return res.json();
      })
      .then((data) => {
        const ext = data?.extracted || {};
        const photo = data?.photo_base64 || data?.photo || null;
        const imageUrl = photo ? `data:image/png;base64,${photo}` : previewUrl;
        const transformed: CNICData = {
          cnicNumber: ext.cnic_number || '',
          fullName: ext.name || '',
          fatherName: ext.father_name || '',
          dateOfBirth: ext.date_of_birth || '',
          dateOfIssuance: ext.date_of_issue || '' || ext.date_of_issuance || '',
          dateOfExpiry: ext.date_of_expiry || '',
          imageUrl,
        };

        setCnicData(transformed);
        setOverallConfidence(Number(data?.confidence || 0));

        // Build simple field confidences if regions present
        const confidences: FieldConfidence[] = [];
        if (data?.validation) {
          // best-effort mapping
          confidences.push({ field: 'cnicNumber', confidence: data?.confidence || 0 });
          confidences.push({ field: 'fullName', confidence: Math.min(95, data?.confidence || 0) });
          confidences.push({ field: 'fatherName', confidence: Math.min(85, data?.confidence || 0) });
          confidences.push({ field: 'dateOfBirth', confidence: Math.min(80, data?.confidence || 0) });
          confidences.push({ field: 'dateOfIssuance', confidence: Math.min(75, data?.confidence || 0) });
          confidences.push({ field: 'dateOfExpiry', confidence: Math.min(75, data?.confidence || 0) });
        }
        setFieldConfidences(confidences);
        setIsAnalyzed(true);
      })
      .catch((err) => {
        console.error(err);
        alert('OCR request failed: ' + err.message);
      })
      .finally(() => setIsAnalyzing(false));
  };

  const handleRetake = () => {
    setUploadedFile(null);
    setPreviewUrl('');
    setIsAnalyzed(false);
    setOverallConfidence(0);
    setFieldConfidences([]);
  };

  const handleSubmit = () => {
    onComplete(cnicData);
  };

  const getFieldConfidence = (field: keyof CNICData): number => {
    const fieldConf = fieldConfidences.find(f => f.field === field);
    return fieldConf?.confidence || 0;
  };

  const isLowConfidence = (field: keyof CNICData): boolean => {
    return getFieldConfidence(field) < 75;
  };

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 85) return 'text-green-600';
    if (confidence >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getConfidenceBgColor = (confidence: number): string => {
    if (confidence >= 85) return 'bg-green-500';
    if (confidence >= 70) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column - Upload */}
        <Card className="p-8 bg-white shadow-lg rounded-3xl border-0">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-[#aa2771] to-[#8a1f5c] rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">Upload CNIC 📄</h3>
            <p className="text-sm text-[#626262]">Upload a clear photo of your CNIC card</p>
            
            {/* Attempt Counter */}
            {attemptCount > 0 && (
              <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-full">
                <span className="text-xs text-gray-600">Attempt {attemptCount} of 3</span>
              </div>
            )}
          </div>

          {!previewUrl ? (
            <div className="space-y-4">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="image/*"
                className="hidden"
              />
              <input
                type="file"
                ref={webcamInputRef}
                onChange={handleFileUpload}
                accept="image/*"
                capture="environment"
                className="hidden"
              />
              
              <Button
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-14 bg-[#aa2771] hover:bg-[#8a1f5c] text-white rounded-xl shadow-md"
              >
                <Upload className="w-5 h-5 mr-2" />
                Upload from Device
              </Button>
              
              <Button
                onClick={() => webcamInputRef.current?.click()}
                variant="outline"
                className="w-full h-14 border-2 border-[#aa2771] text-[#aa2771] hover:bg-[#aa2771]/10 rounded-xl"
              >
                <Camera className="w-5 h-5 mr-2" />
                Capture with Camera
              </Button>

              <div className="mt-8 p-4 bg-gray-50 rounded-xl border border-gray-200">
                <p className="text-sm text-gray-700 font-medium mb-2">📋 Guidelines:</p>
                <ul className="text-xs text-[#626262] space-y-1 list-disc list-inside">
                  <li>Ensure the card is fully visible</li>
                  <li>Use good lighting</li>
                  <li>Avoid glare and shadows</li>
                  <li>Keep the card flat</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative rounded-xl overflow-hidden border-2 border-gray-200">
                <img src={previewUrl} alt="CNIC Preview" className="w-full h-auto" />
                {isAnalyzed && (
                  <div className="absolute top-2 right-2 bg-[#aa2771] text-white px-3 py-1 rounded-full flex items-center gap-1 text-sm">
                    <CheckCircle2 className="w-4 h-4" />
                    Analyzed
                  </div>
                )}
              </div>

              {/* OCR Confidence Score */}
              {isAnalyzed && (
                <div className="p-4 bg-gradient-to-br from-gray-50 to-white rounded-xl border border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Document Match Confidence</span>
                    <span className={`text-lg font-semibold ${getConfidenceColor(overallConfidence)}`}>
                      {overallConfidence}%
                    </span>
                  </div>
                  <Progress value={overallConfidence} className="h-2" />
                  <p className="text-xs text-[#626262] mt-2">
                    {overallConfidence >= 85 ? '✓ High confidence - Document verified successfully' :
                     overallConfidence >= 70 ? '⚠ Moderate confidence - Please verify fields below' :
                     '⚠ Low confidence - Consider retaking the photo'}
                  </p>
                </div>
              )}

              {!isAnalyzed ? (
                <div className="space-y-3">
                  <Button
                    onClick={handleAnalyze}
                    disabled={isAnalyzing || attemptCount >= 3}
                    className="w-full h-14 bg-[#aa2771] hover:bg-[#8a1f5c] text-white rounded-xl shadow-md"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Analyzing Document...
                      </>
                    ) : attemptCount >= 3 ? (
                      'Maximum attempts reached'
                    ) : (
                      <>
                        <FileText className="w-5 h-5 mr-2" />
                        Analyze Document
                      </>
                    )}
                  </Button>
                  
                  <Button
                    onClick={handleRetake}
                    variant="outline"
                    className="w-full h-12 border-gray-300 rounded-xl"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Upload Different Image
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={handleRetake}
                  variant="outline"
                  className="w-full h-12 border-gray-300 rounded-xl"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Retake Photo
                </Button>
              )}

              {isAnalyzing && (
                <div className="p-4 bg-[#aa2771]/10 rounded-xl border border-[#aa2771]/30">
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-5 h-5 text-[#aa2771] animate-spin" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">AI Processing...</p>
                      <p className="text-xs text-[#626262] mt-0.5">Analyzing document securely with OCR technology</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Right Column - Extracted Data */}
        <Card className="p-8 bg-white shadow-lg rounded-3xl border-0">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-semibold text-gray-800 mb-2">Extracted Information</h3>
              <p className="text-sm text-[#626262]">
                {isAnalyzed ? 'Review and verify the extracted details' : 'Upload and analyze your CNIC to see details'}
              </p>
            </div>

            {/* Why we need this tooltip */}
            <div className="relative">
              <Button
                onClick={() => setShowTooltip(!showTooltip)}
                variant="ghost"
                size="sm"
                className="text-[#626262] hover:bg-gray-100 rounded-lg"
              >
                <HelpCircle className="w-5 h-5" />
                {showTooltip ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
              </Button>
              
              {showTooltip && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl p-4 z-10 border border-gray-200">
                  <h4 className="font-semibold text-gray-800 mb-2">Why we need this?</h4>
                  <p className="text-sm text-gray-700 leading-relaxed mb-3">
                    Your CNIC is required to verify your identity as per regulatory compliance. 
                    We use AI-powered OCR to extract information automatically for your convenience.
                  </p>
                  <div className="pt-2 border-t border-gray-100">
                    <p className="text-xs text-gray-500">🔒 Document is encrypted and securely stored</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium text-gray-700">CNIC Number</Label>
                {isAnalyzed && (
                  <span className={`text-xs ${getConfidenceColor(getFieldConfidence('cnicNumber'))}`}>
                    {getFieldConfidence('cnicNumber')}%
                  </span>
                )}
              </div>
              <Input
                value={cnicData.cnicNumber}
                onChange={(e) => setCnicData({ ...cnicData, cnicNumber: e.target.value })}
                disabled={!isAnalyzed}
                placeholder="00000-0000000-0"
                className={`h-12 rounded-xl border-gray-200 bg-gray-50 disabled:opacity-60 ${
                  isAnalyzed && isLowConfidence('cnicNumber') ? 'border-2 border-red-300 bg-red-50' : ''
                }`}
              />
              {isAnalyzed && isLowConfidence('cnicNumber') && (
                <div className="flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3 h-3 text-red-500" />
                  <p className="text-xs text-red-600">Please verify this field</p>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium text-gray-700">Full Name</Label>
                {isAnalyzed && (
                  <span className={`text-xs ${getConfidenceColor(getFieldConfidence('fullName'))}`}>
                    {getFieldConfidence('fullName')}%
                  </span>
                )}
              </div>
              <Input
                value={cnicData.fullName}
                onChange={(e) => setCnicData({ ...cnicData, fullName: e.target.value })}
                disabled={!isAnalyzed}
                placeholder="Enter full name"
                className={`h-12 rounded-xl border-gray-200 bg-gray-50 disabled:opacity-60 ${
                  isAnalyzed && isLowConfidence('fullName') ? 'border-2 border-red-300 bg-red-50' : ''
                }`}
              />
              {isAnalyzed && isLowConfidence('fullName') && (
                <div className="flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3 h-3 text-red-500" />
                  <p className="text-xs text-red-600">Please verify this field</p>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium text-gray-700">Father Name</Label>
                {isAnalyzed && (
                  <span className={`text-xs ${getConfidenceColor(getFieldConfidence('fatherName'))}`}>
                    {getFieldConfidence('fatherName')}%
                  </span>
                )}
              </div>
              <Input
                value={cnicData.fatherName}
                onChange={(e) => setCnicData({ ...cnicData, fatherName: e.target.value })}
                disabled={!isAnalyzed}
                placeholder="Enter father name"
                className={`h-12 rounded-xl border-gray-200 bg-gray-50 disabled:opacity-60 ${
                  isAnalyzed && isLowConfidence('fatherName') ? 'border-2 border-red-300 bg-red-50' : ''
                }`}
              />
              {isAnalyzed && isLowConfidence('fatherName') && (
                <div className="flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3 h-3 text-red-500" />
                  <p className="text-xs text-red-600">Please verify this field</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-medium text-gray-700">Date of Birth</Label>
                  {isAnalyzed && (
                    <span className={`text-xs ${getConfidenceColor(getFieldConfidence('dateOfBirth'))}`}>
                      {getFieldConfidence('dateOfBirth')}%
                    </span>
                  )}
                </div>
                <Input
                  value={cnicData.dateOfBirth}
                  onChange={(e) => setCnicData({ ...cnicData, dateOfBirth: e.target.value })}
                  disabled={!isAnalyzed}
                  placeholder="DD/MM/YYYY"
                  className={`h-12 rounded-xl border-gray-200 bg-gray-50 disabled:opacity-60 ${
                    isAnalyzed && isLowConfidence('dateOfBirth') ? 'border-2 border-red-300 bg-red-50' : ''
                  }`}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-medium text-gray-700">Issuance</Label>
                  {isAnalyzed && (
                    <span className={`text-xs ${getConfidenceColor(getFieldConfidence('dateOfIssuance'))}`}>
                      {getFieldConfidence('dateOfIssuance')}%
                    </span>
                  )}
                </div>
                <Input
                  value={cnicData.dateOfIssuance}
                  onChange={(e) => setCnicData({ ...cnicData, dateOfIssuance: e.target.value })}
                  disabled={!isAnalyzed}
                  placeholder="DD/MM/YYYY"
                  className={`h-12 rounded-xl border-gray-200 bg-gray-50 disabled:opacity-60 ${
                    isAnalyzed && isLowConfidence('dateOfIssuance') ? 'border-2 border-red-300 bg-red-50' : ''
                  }`}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-medium text-gray-700">Expiry</Label>
                  {isAnalyzed && (
                    <span className={`text-xs ${getConfidenceColor(getFieldConfidence('dateOfExpiry'))}`}>
                      {getFieldConfidence('dateOfExpiry')}%
                    </span>
                  )}
                </div>
                <Input
                  value={cnicData.dateOfExpiry}
                  onChange={(e) => setCnicData({ ...cnicData, dateOfExpiry: e.target.value })}
                  disabled={!isAnalyzed}
                  placeholder="DD/MM/YYYY"
                  className={`h-12 rounded-xl border-gray-200 bg-gray-50 disabled:opacity-60 ${
                    isAnalyzed && isLowConfidence('dateOfExpiry') ? 'border-2 border-red-300 bg-red-50' : ''
                  }`}
                />
              </div>
            </div>

            {isAnalyzed && (
              <div className="pt-4">
                <Button
                  onClick={handleSubmit}
                  className="w-full h-14 bg-[#aa2771] hover:bg-[#8a1f5c] text-white rounded-xl shadow-md"
                >
                  Continue to Face Verification
                </Button>
              </div>
            )}
          </div>

          {!isAnalyzed && (
            <div className="mt-8 p-6 bg-gradient-to-br from-gray-50 to-white rounded-2xl text-center border border-gray-200">
              <div className="w-12 h-12 bg-[#aa2771]/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <FileText className="w-6 h-6 text-[#aa2771]" />
              </div>
              <p className="text-sm text-gray-700">
                AI-powered OCR will automatically extract all information from your CNIC
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}