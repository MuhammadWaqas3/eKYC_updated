import { useState, useEffect, useRef, useCallback } from 'react';
import { Mail, ShieldCheck, RefreshCw, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';

// ─── Props ────────────────────────────────────────────────────────────────────
interface EmailOTPVerificationProps {
    email: string;
    onVerified: () => void; // called when OTP is successfully verified
}

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60; // seconds

// ─── Component ────────────────────────────────────────────────────────────────
export function EmailOTPVerification({ email, onVerified }: EmailOTPVerificationProps) {
    const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
    const [isVerifying, setIsVerifying] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [verified, setVerified] = useState(false);
    const [cooldown, setCooldown] = useState(0);
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── Send OTP on mount ──────────────────────────────────────────────────────
    useEffect(() => {
        sendOtp(true);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Cooldown timer ─────────────────────────────────────────────────────────
    function startCooldown() {
        setCooldown(RESEND_COOLDOWN);
        timerRef.current = setInterval(() => {
            setCooldown(prev => {
                if (prev <= 1) { clearInterval(timerRef.current!); return 0; }
                return prev - 1;
            });
        }, 1000);
    }

    // ── Send / Resend OTP ──────────────────────────────────────────────────────
    const sendOtp = useCallback(async (initial = false) => {
        setIsSending(true);
        try {
            const { error } = await supabase.auth.signInWithOtp({
                email,
                options: { shouldCreateUser: true },
            });
            if (error) throw error;

            if (!initial) {
                toast.success('OTP resent!', {
                    description: `A new code has been sent to ${email}`,
                    duration: 4000,
                });
            }
            startCooldown();
            // Focus first box
            setTimeout(() => inputRefs.current[0]?.focus(), 100);
        } catch (err: any) {
            toast.error('Failed to send OTP', {
                description: err?.message ?? 'Please check your email and try again.',
                duration: 5000,
            });
        } finally {
            setIsSending(false);
        }
    }, [email]);

    // ── Digit input handlers ───────────────────────────────────────────────────
    function handleChange(index: number, value: string) {
        // Accept only single digit
        const char = value.replace(/\D/g, '').slice(-1);
        const next = [...digits];
        next[index] = char;
        setDigits(next);

        // Auto-advance
        if (char && index < OTP_LENGTH - 1) {
            inputRefs.current[index + 1]?.focus();
        }

        // Auto-submit when all filled
        if (char && next.every(d => d !== '') && next.join('').length === OTP_LENGTH) {
            verify(next.join(''));
        }
    }

    function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Backspace') {
            e.preventDefault();
            const next = [...digits];
            if (next[index]) {
                next[index] = '';
                setDigits(next);
            } else if (index > 0) {
                next[index - 1] = '';
                setDigits(next);
                inputRefs.current[index - 1]?.focus();
            }
        } else if (e.key === 'ArrowLeft' && index > 0) {
            inputRefs.current[index - 1]?.focus();
        } else if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
            inputRefs.current[index + 1]?.focus();
        }
    }

    function handlePaste(e: React.ClipboardEvent) {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
        if (!pasted) return;
        const next = Array(OTP_LENGTH).fill('');
        pasted.split('').forEach((ch, i) => { next[i] = ch; });
        setDigits(next);
        const focusIdx = Math.min(pasted.length, OTP_LENGTH - 1);
        inputRefs.current[focusIdx]?.focus();
        if (pasted.length === OTP_LENGTH) verify(pasted);
    }

    // ── Verify OTP ─────────────────────────────────────────────────────────────
    async function verify(code: string) {
        if (isVerifying || verified) return;
        setIsVerifying(true);
        try {
            const { error } = await supabase.auth.verifyOtp({
                email,
                token: code,
                type: 'email',
            });
            if (error) throw error;

            setVerified(true);
            toast.success('Email Verified!', {
                description: 'Your identity has been confirmed.',
                duration: 3000,
            });
            setTimeout(() => onVerified(), 1500);
        } catch (err: any) {
            setDigits(Array(OTP_LENGTH).fill(''));
            inputRefs.current[0]?.focus();
            toast.error('Invalid or expired code', {
                description: err?.message?.includes('expired')
                    ? 'The OTP has expired. Please request a new one.'
                    : 'The code you entered is incorrect. Please try again.',
                duration: 5000,
            });
        } finally {
            setIsVerifying(false);
        }
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const code = digits.join('');
        if (code.length < OTP_LENGTH) {
            toast.warning('Incomplete code', { description: 'Please enter all 6 digits.' });
            return;
        }
        verify(code);
    }

    const filled = digits.filter(d => d !== '').length;
    const isComplete = filled === OTP_LENGTH;

    // ── Render ─────────────────────────────────────────────────────────────────
    return (
        <div className="min-h-[60vh] flex items-center justify-center px-4 py-8">
            <div className="w-full max-w-md">

                {/* Card */}
                <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">

                    {/* Header gradient */}
                    <div className="bg-gradient-to-br from-[#aa2771] to-[#6d1748] p-8 text-center relative overflow-hidden">
                        {/* Background decoration */}
                        <div className="absolute inset-0 opacity-10">
                            <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-white translate-x-16 -translate-y-16" />
                            <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full bg-white -translate-x-12 translate-y-12" />
                        </div>
                        <div className="relative z-10">
                            {/* Icon */}
                            <div className="mx-auto w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mb-4 border border-white/30 backdrop-blur-sm">
                                {verified
                                    ? <CheckCircle2 className="w-8 h-8 text-white" />
                                    : <Mail className="w-8 h-8 text-white" />
                                }
                            </div>
                            <h2 className="text-xl font-bold text-white mb-1">
                                {verified ? 'Email Verified!' : 'Verify Your Email'}
                            </h2>
                            <p className="text-white/75 text-sm">
                                {verified
                                    ? 'Proceeding to document verification...'
                                    : 'We sent a 6-digit code to'
                                }
                            </p>
                            {!verified && (
                                <p className="text-white font-semibold text-sm mt-1 bg-white/15 inline-block px-4 py-1.5 rounded-full border border-white/20 mt-2">
                                    {email}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Body */}
                    {!verified && (
                        <div className="p-8">
                            <form onSubmit={handleSubmit} className="space-y-6">

                                {/* OTP input boxes */}
                                <div>
                                    <p className="text-center text-sm text-gray-500 mb-5">
                                        Enter the 6-digit verification code
                                    </p>
                                    <div className="flex gap-3 justify-center" onPaste={handlePaste}>
                                        {digits.map((digit, i) => (
                                            <input
                                                key={i}
                                                ref={el => { inputRefs.current[i] = el; }}
                                                type="text"
                                                inputMode="numeric"
                                                maxLength={1}
                                                value={digit}
                                                onChange={e => handleChange(i, e.target.value)}
                                                onKeyDown={e => handleKeyDown(i, e)}
                                                disabled={isVerifying || verified || isSending}
                                                className={`
                          w-11 h-14 text-center text-xl font-bold rounded-xl border-2 outline-none
                          transition-all duration-150 bg-gray-50
                          ${digit
                                                        ? 'border-[#aa2771] bg-[#aa2771]/5 text-[#aa2771]'
                                                        : 'border-gray-200 text-gray-800'
                                                    }
                          focus:border-[#aa2771] focus:bg-[#aa2771]/5 focus:shadow-[0_0_0_3px_rgba(170,39,113,0.12)]
                          disabled:opacity-50 disabled:cursor-not-allowed
                        `}
                                            />
                                        ))}
                                    </div>

                                    {/* Progress dots */}
                                    <div className="flex justify-center gap-1.5 mt-4">
                                        {digits.map((d, i) => (
                                            <div
                                                key={i}
                                                className={`h-1 rounded-full transition-all duration-200 ${d ? 'w-5 bg-[#aa2771]' : 'w-3 bg-gray-200'
                                                    }`}
                                            />
                                        ))}
                                    </div>
                                </div>

                                {/* Submit button */}
                                <button
                                    type="submit"
                                    disabled={!isComplete || isVerifying || isSending}
                                    className="
                    w-full h-12 rounded-xl font-semibold text-sm flex items-center justify-center gap-2
                    bg-gradient-to-r from-[#aa2771] to-[#8a1f5c] text-white shadow-md
                    hover:from-[#8a1f5c] hover:to-[#6d1748] transition-all duration-200
                    disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none
                    active:scale-[0.98]
                  "
                                >
                                    {isVerifying ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Verifying...
                                        </>
                                    ) : (
                                        <>
                                            <ShieldCheck className="w-4 h-4" />
                                            Verify Email
                                            <ArrowRight className="w-4 h-4" />
                                        </>
                                    )}
                                </button>

                                {/* Resend */}
                                <div className="text-center">
                                    <p className="text-sm text-gray-500 mb-2">Didn't receive the code?</p>
                                    {cooldown > 0 ? (
                                        <p className="text-sm text-gray-400">
                                            Resend available in{' '}
                                            <span className="font-semibold text-[#aa2771]">{cooldown}s</span>
                                        </p>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => sendOtp(false)}
                                            disabled={isSending || isVerifying}
                                            className="
                        inline-flex items-center gap-1.5 text-sm font-medium text-[#aa2771]
                        hover:text-[#8a1f5c] disabled:opacity-50 disabled:cursor-not-allowed
                        transition-colors underline-offset-2 hover:underline
                      "
                                        >
                                            {isSending
                                                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending...</>
                                                : <><RefreshCw className="w-3.5 h-3.5" /> Resend OTP</>
                                            }
                                        </button>
                                    )}
                                </div>

                                {/* Security note */}
                                <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl border border-gray-100">
                                    <ShieldCheck className="w-4 h-4 text-[#aa2771] flex-shrink-0" />
                                    <p className="text-xs text-gray-500 leading-relaxed">
                                        This code expires in <strong>10 minutes</strong>. Never share it with anyone. Avanza will never ask for your OTP.
                                    </p>
                                </div>

                            </form>
                        </div>
                    )}

                    {/* Verified state */}
                    {verified && (
                        <div className="p-8 flex flex-col items-center gap-4">
                            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center border-2 border-green-200">
                                <CheckCircle2 className="w-8 h-8 text-green-500" />
                            </div>
                            <p className="text-gray-600 text-sm text-center">
                                Loading document verification...
                            </p>
                            <div className="flex gap-1">
                                {[0, 150, 300].map(d => (
                                    <div
                                        key={d}
                                        className="w-2 h-2 bg-[#aa2771] rounded-full animate-bounce"
                                        style={{ animationDelay: `${d}ms` }}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                </div>

                {/* Info below card */}
                <p className="text-center text-xs text-gray-400 mt-4">
                    Check your spam/junk folder if you don't see the email within a minute.
                </p>
            </div>
        </div>
    );
}
