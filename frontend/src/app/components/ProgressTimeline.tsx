import { Check } from 'lucide-react';

interface Step {
  id: number;
  title: string;
  status: 'completed' | 'active' | 'upcoming';
}

interface ProgressTimelineProps {
  currentStep: number;
}

const steps = [
  { id: 1, title: 'Personal Details' },
  { id: 2, title: 'CNIC Upload' },
  { id: 3, title: 'Face Verify' },
  { id: 4, title: 'Fingerprint' },
  { id: 5, title: 'Confirmation' },
];

export function ProgressTimeline({ currentStep }: ProgressTimelineProps) {
  const getStepStatus = (stepId: number): 'completed' | 'active' | 'upcoming' => {
    if (stepId < currentStep) return 'completed';
    if (stepId === currentStep) return 'active';
    return 'upcoming';
  };

  const progressPercentage = ((currentStep - 1) / (steps.length - 1)) * 100;

  return (
    <div className="bg-white border-b border-gray-100 py-8">
      <div className="max-w-5xl mx-auto px-6">
        {/* Steps Timeline */}
        <div className="relative">
          {/* Progress Line Background */}
          <div className="absolute top-5 left-0 right-0 h-0.5 bg-gray-200" style={{ zIndex: 0 }} />

          {/* Progress Line Foreground */}
          <div
            className="absolute top-5 left-0 h-0.5 bg-[#aa2771] transition-all duration-500 ease-out"
            style={{ width: `${progressPercentage}%`, zIndex: 1 }}
          />

          {/* Steps */}
          <div className="relative flex justify-between" style={{ zIndex: 2 }}>
            {steps.map((step) => {
              const status = getStepStatus(step.id);
              return (
                <div key={step.id} className="flex flex-col items-center">
                  {/* Circle */}
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${status === 'completed'
                      ? 'bg-[#aa2771] text-white shadow-md'
                      : status === 'active'
                        ? 'bg-[#aa2771] text-white shadow-lg ring-4 ring-[#aa2771]/30'
                        : 'bg-white border-2 border-gray-300 text-gray-400'
                      }`}
                  >
                    {status === 'completed' ? (
                      <Check className="w-5 h-5" />
                    ) : (
                      <span className="text-sm font-medium">{step.id}</span>
                    )}
                  </div>

                  {/* Label */}
                  <div className="mt-3 text-center max-w-[120px]">
                    <p
                      className={`text-sm font-medium transition-colors ${status === 'active'
                        ? 'text-[#aa2771]'
                        : status === 'completed'
                          ? 'text-gray-700'
                          : 'text-gray-400'
                        }`}
                    >
                      {step.title}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Progress Indicator */}
        <div className="mt-8 flex items-center justify-center gap-4">
          <div className="relative w-16 h-16">
            {/* Background Circle */}
            <svg className="w-16 h-16 transform -rotate-90">
              <circle
                cx="32"
                cy="32"
                r="28"
                stroke="#F0F0F0"
                strokeWidth="4"
                fill="none"
              />
              {/* Progress Circle */}
              <circle
                cx="32"
                cy="32"
                r="28"
                stroke="#aa2771"
                strokeWidth="4"
                fill="none"
                strokeDasharray={`${2 * Math.PI * 28}`}
                strokeDashoffset={`${2 * Math.PI * 28 * (1 - progressPercentage / 100)}`}
                className="transition-all duration-500 ease-out"
                strokeLinecap="round"
              />
            </svg>
            {/* Percentage Text */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-semibold text-[#aa2771]">
                {Math.round(progressPercentage)}%
              </span>
            </div>
          </div>
          <div>
            <p className="text-sm text-[#626262]">Your verification progress</p>
          </div>
        </div>
      </div>
    </div>
  );
}