'use client';

import { useState, useRef, useEffect, type FormEvent, type ChangeEvent } from 'react';
import type { QueueJoinResponse, QueueStatusResponse } from '@/lib/types';

interface RegistrationFormProps {
  sessionId: string;
  slug: string;
  onSuccess: (response: QueueJoinResponse) => void;
  onExistingUser?: (data: QueueStatusResponse) => void;
}

type FormStep = 'info' | 'otp';

interface FormErrors {
  name?: string;
  phone?: string;
  otp?: string;
  general?: string;
}

function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));
}

export default function RegistrationForm({
  sessionId,
  slug,
  onSuccess,
  onExistingUser,
}: RegistrationFormProps) {
  const [step, setStep] = useState<FormStep>('info');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resendTimer, setResendTimer] = useState(0);

  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Resend countdown timer
  useEffect(() => {
    if (resendTimer <= 0) return;
    const interval = setInterval(() => {
      setResendTimer((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  // Auto-send OTP when phone reaches 10 digits
  const handlePhoneChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPhone(value);

    const digits = value.replace(/\D/g, '');
    if (digits.length === 10 || (digits.length === 11 && digits.startsWith('1'))) {
      // Auto-trigger send after a tiny delay for UX
      if (name.trim() && !isSending) {
        setTimeout(() => {
          sendOtp(value);
        }, 300);
      }
    }
  };

  async function sendOtp(phoneValue?: string) {
    const phoneToSend = phoneValue || phone;

    // Validate before sending
    const newErrors: FormErrors = {};
    if (!name.trim()) newErrors.name = 'Name is required';
    if (!phoneToSend.trim()) {
      newErrors.phone = 'Phone number is required';
    } else if (!isValidPhone(phoneToSend)) {
      newErrors.phone = 'Enter a valid 10-digit US phone number';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setIsSending(true);

    try {
      // Send OTP (duplicate check happens after verification)
      const res = await fetch('/api/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneToSend.trim(), action: 'send' }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrors({ general: data.error || 'Failed to send code' });
        setIsSending(false);
        return;
      }

      // In dev mode, show the code
      if (data.dev_code) {
        setDevCode(data.dev_code);
      }

      setStep('otp');
      setResendTimer(30);
      setOtp(['', '', '', '', '', '']);
      // Focus first OTP input after render
      setTimeout(() => otpInputRefs.current[0]?.focus(), 100);
    } catch {
      setErrors({ general: 'Failed to send code. Please try again.' });
    } finally {
      setIsSending(false);
    }
  }

  function handleOtpChange(index: number, value: string) {
    // Only allow digits
    const digit = value.replace(/\D/g, '').slice(-1);
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);
    setErrors((prev) => ({ ...prev, otp: undefined }));

    // Auto-advance to next input
    if (digit && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }

    // Auto-verify when all 6 digits entered
    const fullCode = newOtp.join('');
    if (fullCode.length === 6) {
      verifyAndJoin(fullCode);
    }
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  }

  function handleOtpPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 0) return;

    const newOtp = [...otp];
    for (let i = 0; i < 6; i++) {
      newOtp[i] = pasted[i] || '';
    }
    setOtp(newOtp);

    // Focus the next empty or last input
    const nextEmpty = newOtp.findIndex((d) => !d);
    const focusIdx = nextEmpty === -1 ? 5 : nextEmpty;
    otpInputRefs.current[focusIdx]?.focus();

    // Auto-verify if all 6
    if (pasted.length === 6) {
      verifyAndJoin(pasted);
    }
  }

  async function verifyAndJoin(code: string) {
    setErrors({});
    setIsVerifying(true);

    try {
      // Step 1: Verify OTP
      const verifyRes = await fetch('/api/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), code, action: 'verify' }),
      });

      const verifyData = await verifyRes.json();

      if (!verifyRes.ok) {
        setErrors({ otp: verifyData.error || 'Verification failed' });
        setIsVerifying(false);
        setOtp(['', '', '', '', '', '']);
        setTimeout(() => otpInputRefs.current[0]?.focus(), 100);
        return;
      }

      // Step 2: Check if phone already registered (existing user)
      const checkRes = await fetch(
        `/api/queue/status?sessionId=${encodeURIComponent(sessionId)}&phone=${encodeURIComponent(phone.trim())}`
      );
      if (checkRes.ok) {
        // Existing user — restore their session
        const statusData = (await checkRes.json()) as QueueStatusResponse;
        sessionStorage.setItem(`spin_phone_${slug}`, phone.trim());
        if (onExistingUser) {
          onExistingUser(statusData);
        }
        return;
      }

      // Step 3: New user — join queue
      const joinRes = await fetch('/api/queue/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          name: name.trim(),
          phone: phone.trim(),
        }),
      });

      if (!joinRes.ok) {
        const errorData = await joinRes.json();
        setErrors({ general: errorData.error || 'Failed to join queue' });
        setIsVerifying(false);
        return;
      }

      const joinData = (await joinRes.json()) as QueueJoinResponse;
      sessionStorage.setItem(`spin_phone_${slug}`, phone.trim());
      onSuccess(joinData);
    } catch {
      setErrors({ general: 'Something went wrong. Please try again.' });
      setIsVerifying(false);
    }
  }

  function handleResend() {
    setDevCode(null);
    sendOtp();
  }

  function handleBack() {
    setStep('info');
    setOtp(['', '', '', '', '', '']);
    setErrors({});
    setDevCode(null);
  }

  // ─── Step 1: Name + Phone ─────────────────────────────────────────────────────
  if (step === 'info') {
    return (
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          sendOtp();
        }}
        className="flex w-full flex-col gap-4 px-6"
      >
        <h2 className="text-center text-2xl font-bold text-white">Join the Game</h2>
        <p className="text-center text-sm text-gray-400">
          Enter your details to get started
        </p>

        <div className="flex flex-col gap-1">
          <label htmlFor="name" className="text-sm font-medium text-gray-300">
            Name
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name"
            className="min-h-[56px] w-full rounded-lg border border-gray-700 bg-gray-800 px-4 text-lg text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
            aria-invalid={!!errors.name}
          />
          {errors.name && (
            <p className="text-sm text-red-400" role="alert">{errors.name}</p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="phone" className="text-sm font-medium text-gray-300">
            Phone Number
          </label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={handlePhoneChange}
            placeholder="(303) 555-1234"
            className="min-h-[56px] w-full rounded-lg border border-gray-700 bg-gray-800 px-4 text-lg text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
            aria-invalid={!!errors.phone}
          />
          {errors.phone && (
            <p className="text-sm text-red-400" role="alert">{errors.phone}</p>
          )}
        </div>

        {errors.general && (
          <p className="text-center text-sm text-red-400" role="alert">{errors.general}</p>
        )}

        <button
          type="submit"
          disabled={isSending}
          className="min-h-[56px] w-full rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 text-lg font-bold text-white transition-all hover:from-purple-700 hover:to-pink-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSending ? 'Sending Code...' : 'Send Verification Code'}
        </button>
      </form>
    );
  }

  // ─── Step 2: OTP Verification ─────────────────────────────────────────────────
  return (
    <div className="flex w-full flex-col items-center gap-4 px-6">
      <h2 className="text-center text-2xl font-bold text-white">Verify Phone</h2>
      <p className="text-center text-sm text-gray-400">
        Enter the 6-digit code sent to <span className="font-medium text-white">{phone}</span>
      </p>

      {/* Dev mode code display */}
      {devCode && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-900/20 px-4 py-2 text-center">
          <p className="text-xs text-yellow-400">DEV MODE — Code:</p>
          <p className="text-2xl font-mono font-bold tracking-widest text-yellow-300">{devCode}</p>
        </div>
      )}

      {/* OTP Input */}
      <div className="flex gap-2">
        {otp.map((digit, index) => (
          <input
            key={index}
            ref={(el) => { otpInputRefs.current[index] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleOtpChange(index, e.target.value)}
            onKeyDown={(e) => handleOtpKeyDown(index, e)}
            onPaste={index === 0 ? handleOtpPaste : undefined}
            className="h-14 w-12 rounded-lg border border-gray-700 bg-gray-800 text-center text-2xl font-bold text-white focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
            disabled={isVerifying}
          />
        ))}
      </div>

      {errors.otp && (
        <p className="text-center text-sm text-red-400" role="alert">{errors.otp}</p>
      )}
      {errors.general && (
        <p className="text-center text-sm text-red-400" role="alert">{errors.general}</p>
      )}

      {isVerifying && (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          Verifying & joining...
        </div>
      )}

      {/* Resend + Back */}
      <div className="flex flex-col items-center gap-2 pt-2">
        <button
          onClick={handleResend}
          disabled={resendTimer > 0 || isSending}
          className="text-sm text-purple-400 underline disabled:text-gray-600 disabled:no-underline"
        >
          {resendTimer > 0 ? `Resend code in ${resendTimer}s` : 'Resend code'}
        </button>
        <button
          onClick={handleBack}
          className="text-sm text-gray-500 underline"
        >
          Change phone number
        </button>
      </div>
    </div>
  );
}
