import { useState } from "react";
import { ProgressTimeline } from "./components/ProgressTimeline";
import { PersonalDetailsChat } from "./components/PersonalDetailsChat";
import { CNICVerification } from "./components/CNICVerification";
import { FaceVerification } from "./components/FaceVerification";
import { FingerprintVerification } from "./components/FingerprintVerification";
import { ConfirmationStep } from "./components/ConfirmationStep";
import { CompletionMessage } from "./components/CompletionMessage";
import { GroqChatbot } from "./components/GroqChatbot";
import { Shield } from "lucide-react";

interface PersonalDetailsData {
  fullName: string;
  phoneNumber: string;
  email: string;
  accountType: string;
}

interface CNICData {
  cnicNumber: string;
  fullName: string;
  fatherName: string;
  dateOfBirth: string;
  dateOfIssuance: string;
  dateOfExpiry: string;
  imageUrl?: string;
}

// Steps: 1=Personal, 2=CNIC, 3=Face, 4=Fingerprint, 5=Confirmation, 6=Complete
type Step = 1 | 2 | 3 | 4 | 5 | 6;

export default function App() {
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [personalData, setPersonalData] = useState<PersonalDetailsData | null>(null);
  const [cnicData, setCnicData] = useState<CNICData | null>(null);

  const handlePersonalDetailsComplete = (data: PersonalDetailsData) => {
    setPersonalData(data);
    setCurrentStep(2);
  };

  const handleCNICComplete = (data: CNICData) => {
    setCnicData(data);
    setCurrentStep(3);
  };

  const handleFaceVerificationComplete = () => setCurrentStep(4);
  const handleFingerprintComplete = () => setCurrentStep(5);
  const handleConfirmation = () => setCurrentStep(6);

  const handleReset = () => {
    setCurrentStep(1);
    setPersonalData(null);
    setCnicData(null);
  };

  return (
    <div className="min-h-screen bg-[#e7e4e4]">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-gradient-to-br from-[#aa2771] to-[#8a1f5c] rounded-xl flex items-center justify-center shadow-md">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-800">Avanza</h1>
              <p className="text-xs text-[#626262]">Digital Banking eKYC</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-full border border-gray-200">
            <div className="w-2 h-2 bg-[#aa2771] rounded-full animate-pulse" />
            <span className="text-sm text-gray-700">Secure Connection</span>
          </div>
        </div>
      </header>

      {/* ── Progress Timeline ───────────────────────────────────────── */}
      {currentStep !== 6 && <ProgressTimeline currentStep={currentStep} />}

      {/* ── Main Content ────────────────────────────────────────────── */}
      <main className="py-6 md:py-8">
        {currentStep === 1 && (
          <PersonalDetailsChat onComplete={handlePersonalDetailsComplete} />
        )}
        {currentStep === 2 && (
          <CNICVerification onComplete={handleCNICComplete} />
        )}
        {currentStep === 3 && (
          <FaceVerification
            cnicImageUrl={cnicData?.imageUrl}
            onComplete={handleFaceVerificationComplete}
          />
        )}
        {currentStep === 4 && (
          <FingerprintVerification onComplete={handleFingerprintComplete} />
        )}
        {currentStep === 5 && personalData && cnicData && (
          <ConfirmationStep
            personalData={personalData}
            cnicData={cnicData}
            onConfirm={handleConfirmation}
          />
        )}
        {currentStep === 6 && (
          <CompletionMessage onReset={handleReset} />
        )}
      </main>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="mt-12 pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-[#aa2771]/10 rounded-lg flex items-center justify-center">
                  <Shield className="w-5 h-5 text-[#aa2771]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">Your data is secure 🔒</p>
                  <p className="text-xs text-[#626262]">256-bit encryption • GDPR compliant</p>
                </div>
              </div>
              <div className="flex items-center gap-5 text-xs text-[#626262]">
                <a href="#" className="hover:text-[#aa2771] transition-colors">Privacy Policy</a>
                <a href="#" className="hover:text-[#aa2771] transition-colors">Terms of Service</a>
                <a href="#" className="hover:text-[#aa2771] transition-colors">Support</a>
              </div>
            </div>
          </div>
          <p className="text-center text-xs text-gray-400 mt-4">
            © 2026 Avanza Digital Banking. All rights reserved.
          </p>
        </div>
      </footer>

      {/* ── Groq AI Chatbot (floating, always visible) ──────────────── */}
      <GroqChatbot />
    </div>
  );
}