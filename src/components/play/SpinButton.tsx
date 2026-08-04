'use client';

import { useState, useRef, useCallback } from 'react';
import type { SpinResponse, QueueStatusResponse } from '@/lib/types';

const SPIN_DISPLAY_DURATION_MS = 8000;

interface SpinButtonProps {
  sessionId: string;
  participantId: string;
  onResult: (result: SpinResponse) => void;
  onError?: (statusCode: number | null) => void;
  onSpinStart?: () => void;
}

export default function SpinButton({
  sessionId,
  participantId,
  onResult,
  onError,
  onSpinStart,
}: SpinButtonProps) {
  const [spinning, setSpinning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const spinStartTimeRef = useRef<number>(0);

  const deliverResult = useCallback(
    (result: SpinResponse) => {
      const elapsed = Date.now() - spinStartTimeRef.current;
      const remaining = SPIN_DISPLAY_DURATION_MS - elapsed;

      if (remaining > 0) {
        setTimeout(() => onResult(result), remaining);
      } else {
        onResult(result);
      }
    },
    [onResult]
  );

  async function handleSpin() {
    setSpinning(true);
    setError(null);
    spinStartTimeRef.current = Date.now();
    onSpinStart?.();

    try {
      const res = await fetch('/api/spin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, participant_id: participantId }),
      });

      if (res.ok) {
        const data = (await res.json()) as SpinResponse;
        deliverResult(data);
        return;
      }

      if (res.status === 403) {
        onError?.(403);
        const statusRes = await fetch(
          `/api/queue/status?sessionId=${encodeURIComponent(sessionId)}&participantId=${encodeURIComponent(participantId)}`
        );
        if (statusRes.ok) {
          const statusData = (await statusRes.json()) as QueueStatusResponse;
          if (statusData.prize_name !== null) {
            onResult({
              prize_id: '',
              prize_name: statusData.prize_name,
              prize_index: 0,
              is_no_prize: statusData.is_no_prize ?? false,
              result_token: statusData.result_token ?? '',
            });
            return;
          }
        }
        setError('You have already spun.');
        setSpinning(false);
        return;
      }

      onError?.(res.status);
      const errBody = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(errBody?.error ?? 'Something went wrong. Please try again.');
      setSpinning(false);
    } catch {
      onError?.(null);
      setError('Network error. Please check your connection and try again.');
      setSpinning(false);
    }
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 px-6">
      {/* Title */}
      <div className="text-center">
        <p className="text-lg text-gray-400">
          {spinning ? 'Fingers crossed!' : "You're up!"}
        </p>
        <h2 className="mt-1 bg-gradient-to-r from-yellow-300 via-pink-400 to-purple-400 bg-clip-text text-3xl font-extrabold text-transparent">
          {spinning ? '🎰 Spinning...' : '🎯 Your Turn!'}
        </h2>
      </div>

      {/* Spin Button / Spinning State */}
      {spinning ? (
        <div className="flex flex-col items-center gap-4">
          {/* Animated spinner ring */}
          <div className="relative flex h-44 w-44 items-center justify-center">
            <div className="absolute inset-0 animate-spin rounded-full border-[6px] border-transparent border-t-yellow-400 border-r-pink-500" />
            <div className="absolute inset-3 animate-spin rounded-full border-[4px] border-transparent border-b-purple-400 border-l-yellow-300" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
            <div className="flex flex-col items-center">
              <img src="/logo/utsav_logo.png" alt="Utsav Events" className="h-16 w-16 animate-pulse rounded-full object-contain" />
              <span className="mt-1 text-sm font-medium text-gray-400">Spinning</span>
            </div>
          </div>
          <p className="animate-pulse text-center text-lg font-semibold text-yellow-400">
            Watch the big screen!
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleSpin}
          disabled={spinning}
          className="group relative h-48 w-48 overflow-hidden rounded-full shadow-2xl transition-all duration-200 active:scale-90"
          aria-busy={spinning}
        >
          {/* Animated gradient background */}
          <div className="absolute inset-0 animate-spin-slow rounded-full" style={{ background: 'conic-gradient(from 0deg, #facc15, #ec4899, #9333ea, #facc15)' }} />
          {/* Inner circle */}
          <div className="absolute inset-2 flex flex-col items-center justify-center rounded-full bg-gray-950 transition-all group-hover:inset-3">
            <img src="/logo/utsav_logo.png" alt="Logo" className="h-16 w-16 rounded-full object-contain" />
            <span className="mt-2 text-xl font-extrabold text-white">TAP TO</span>
            <span className="text-2xl font-extrabold text-yellow-400">SPIN!</span>
          </div>
          {/* Outer glow */}
          <div className="absolute -inset-1 -z-10 animate-pulse rounded-full bg-gradient-to-r from-yellow-400/30 via-pink-500/30 to-purple-600/30 blur-lg" />
        </button>
      )}

      {error && (
        <p className="text-center text-sm font-medium text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
