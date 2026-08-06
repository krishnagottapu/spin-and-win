'use client';

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import RegistrationForm from '@/components/play/RegistrationForm';
import QueuePosition from '@/components/play/QueuePosition';
import SpinButton from '@/components/play/SpinButton';
import ResultDisplay from '@/components/play/ResultDisplay';
import SpinCountdownTimer from '@/components/tv/SpinCountdownTimer';
import { useSessionChannel } from '@/lib/supabase/realtime';
import type { QueueJoinResponse, QueueStatusResponse, SpinResponse } from '@/lib/types';

// ─── Mobile Shell: header + footer matching TV party theme ────────────────────

function MobileShell({ children, eventName }: { children: ReactNode; eventName: string }) {
  return (
    <div className="flex min-h-screen flex-col bg-gray-950 text-white">
      {/* Header — party style matching TV */}
      <div className="shrink-0 bg-gradient-to-r from-purple-900/50 via-pink-900/50 to-yellow-900/50 px-3 py-3 text-center">
        <h1 className="animate-pulse bg-gradient-to-r from-yellow-300 via-pink-400 to-purple-400 bg-clip-text text-base font-extrabold tracking-wide text-transparent sm:text-lg">
          🎉 {eventName} 🎉
        </h1>
      </div>

      {/* Main content */}
      {children}

      {/* Footer — infinite scrolling ticker matching TV */}
      <div className="relative shrink-0 overflow-hidden border-t border-gray-800 bg-gray-900 py-2">
        <div className="flex items-center">
          <div className="z-10 shrink-0 bg-gray-900 pl-3 pr-3">
            <img
              src="/logo/utsav_logo.png"
              alt="Logo"
              className="h-6 w-auto"
            />
          </div>
          <div className="flex-1 overflow-hidden">
            <div className="animate-ticker flex whitespace-nowrap">
              <span className="mx-6 text-sm font-semibold text-yellow-400">🎉 {eventName}</span>
              <span className="mx-6 text-sm text-gray-300">Join the game and win amazing prizes!</span>
              <span className="mx-6 text-sm font-semibold text-yellow-400">🏆 Spin to Win!</span>
              <span className="mx-6 text-sm text-gray-300">Good luck to all participants!</span>
              <span className="mx-6 text-sm font-semibold text-yellow-400">🎉 {eventName}</span>
              <span className="mx-6 text-sm text-gray-300">Join the game and win amazing prizes!</span>
              <span className="mx-6 text-sm font-semibold text-yellow-400">🏆 Spin to Win!</span>
              <span className="mx-6 text-sm text-gray-300">Good luck to all participants!</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type PlayState =
  | { phase: 'loading' }
  | { phase: 'closed' }
  | { phase: 'holding'; slotJustOpened?: boolean }
  | { phase: 'register' }
  | { phase: 'queue'; position: number; estimatedWait: number; participantId: string }
  | { phase: 'spin'; participantId: string; playerName: string; error?: string }
  | { phase: 'result'; prizeName: string; isNoPrize: boolean; resultToken: string | null; isFulfilled?: boolean; fulfilledAt?: string | null }
  | { phase: 'ended' };

interface PlayClientProps {
  sessionId: string;
  slug: string;
  status: string;
  endTime: string;
  eventName: string;
  otpEnabled: boolean;
  spinTimeoutSeconds: number;
  queueEnabled: boolean;
}

export default function PlayClient({
  sessionId,
  slug,
  status,
  endTime,
  eventName,
  otpEnabled,
  spinTimeoutSeconds,
  queueEnabled,
}: PlayClientProps) {
  const [state, setState] = useState<PlayState>({ phase: 'loading' });
  const [participantId, setParticipantId] = useState<string | null>(null);
  const spinStartTimeRef = useRef<number>(0);
  const activatedAtRef = useRef<number>(0);
  const isHoldingRef = useRef<boolean>(false);

  // Keep isHoldingRef in sync with state phase
  useEffect(() => {
    isHoldingRef.current = state.phase === 'holding';
  }, [state.phase]);

  // Walk-up mode: check slot availability
  const checkSlot = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/queue/slot?sessionId=${encodeURIComponent(sessionId)}`
      );
      if (res.ok) {
        const data = await res.json();
        if (!data.slot_occupied) {
          setState({ phase: 'holding', slotJustOpened: true });
        }
      }
    } catch {
      // Leave state unchanged on error
    }
  }, [sessionId]);

  // Initial mount: check sessionStorage and recover state
  useEffect(() => {
    // If session not active, show closed
    if (status === 'draft' || status === 'ended') {
      setState({ phase: 'closed' });
      return;
    }

    // Check if session has expired client-side
    if (new Date() > new Date(endTime)) {
      setState({ phase: 'ended' });
      return;
    }

    const storedPhone = sessionStorage.getItem(`spin_phone_${slug}`);
    if (!storedPhone) {
      if (!queueEnabled) {
        // Walk-up mode: check if slot is occupied before showing registration
        (async () => {
          try {
            const slotRes = await fetch(
              `/api/queue/slot?sessionId=${encodeURIComponent(sessionId)}`
            );
            if (slotRes.ok) {
              const slotData = await slotRes.json();
              if (slotData.slot_occupied) {
                setState({ phase: 'holding' });
                return;
              }
            }
          } catch {
            // On error, fall through to registration (fail open)
          }
          setState({ phase: 'register' });
        })();
      } else {
        setState({ phase: 'register' });
      }
      return;
    }

    // Attempt session recovery
    async function recoverSession(phone: string) {
      try {
        const res = await fetch(
          `/api/queue/status?sessionId=${encodeURIComponent(sessionId)}&phone=${encodeURIComponent(phone)}`
        );
        if (!res.ok) {
          setState({ phase: 'register' });
          return;
        }
        const data = (await res.json()) as QueueStatusResponse;
        setParticipantId(data.participant_id);
        mapStatusToPhase(data);
      } catch {
        setState({ phase: 'register' });
      }
    }

    recoverSession(storedPhone);
  }, [sessionId, slug, status, endTime, queueEnabled]);

  function mapStatusToPhase(data: QueueStatusResponse) {
    switch (data.status) {
      case 'queued':
        setState({
          phase: 'queue',
          position: data.queue_position ?? 1,
          estimatedWait: data.estimated_wait_seconds ?? 0,
          participantId: data.participant_id,
        });
        break;
      case 'active':
        setState({
          phase: 'spin',
          participantId: data.participant_id,
          playerName: data.name ?? sessionStorage.getItem(`spin_name_${slug}`) ?? '',
        });
        break;
      case 'spinning':
        // User already tapped spin but result hasn't arrived yet.
        // Show result-pending state — Realtime spin:result will transition to result.
        setState({
          phase: 'spin',
          participantId: data.participant_id,
          playerName: data.name ?? sessionStorage.getItem(`spin_name_${slug}`) ?? '',
        });
        break;
      case 'completed':
        setState({
          phase: 'result',
          prizeName: data.prize_name ?? '',
          isNoPrize: !data.prize_name || (data.is_no_prize ?? false),
          resultToken: data.result_token,
          isFulfilled: data.is_fulfilled ?? false,
          fulfilledAt: data.fulfilled_at ?? null,
        });
        break;
      default:
        setState({ phase: 'register' });
    }
  }

  // Handle successful registration
  const handleRegistrationSuccess = useCallback((response: QueueJoinResponse) => {
    setParticipantId(response.participant_id);
    if (response.status === 'active') {
      setState({
        phase: 'spin',
        participantId: response.participant_id,
        playerName: sessionStorage.getItem(`spin_name_${slug}`) ?? '',
      });
    } else {
      setState({
        phase: 'queue',
        position: response.queue_position,
        estimatedWait: response.estimated_wait_seconds,
        participantId: response.participant_id,
      });
    }
  }, [slug]);

  // Handle existing user — restore their session state
  const handleExistingUser = useCallback((data: QueueStatusResponse) => {
    setParticipantId(data.participant_id);
    mapStatusToPhase(data);
  }, []);

  // Handle spin result from the API response (has result_token)
  const handleSpinResult = useCallback((result: SpinResponse) => {
    // Record spin start time so realtime events also respect the delay
    spinStartTimeRef.current = Date.now();
    setState({
      phase: 'result',
      prizeName: result.prize_name,
      isNoPrize: result.is_no_prize,
      resultToken: result.result_token,
    });
  }, []);

  // Handle spin error: 403 means already spun, network error means show retry message
  const handleSpinError = useCallback(async (statusCode: number | null) => {
    if (statusCode === 403) {
      // Already spun — recover result from status endpoint
      const storedPhone = sessionStorage.getItem(`spin_phone_${slug}`);
      if (storedPhone) {
        try {
          const statusRes = await fetch(
            `/api/queue/status?sessionId=${encodeURIComponent(sessionId)}&phone=${encodeURIComponent(storedPhone)}`
          );
          if (statusRes.ok) {
            const data = (await statusRes.json()) as QueueStatusResponse;
            if (data.status === 'completed') {
              setState({
                phase: 'result',
                prizeName: data.prize_name ?? '',
                isNoPrize: !data.prize_name || (data.is_no_prize ?? false),
                resultToken: data.result_token,
              });
              return;
            }
          }
        } catch {
          // Fall through to generic error
        }
      }
    }

    // Network error or other failure: show error without losing spin state
    setState((prev) => {
      if (prev.phase === 'spin') {
        return { ...prev, error: 'Something went wrong — please try again' };
      }
      return prev;
    });
  }, [sessionId, slug]);

  // Clear spin error when user dismisses it
  const handleClearError = useCallback(() => {
    setState((prev) => {
      if (prev.phase === 'spin') {
        return { ...prev, error: undefined };
      }
      return prev;
    });
  }, []);

  // Subscribe to realtime events
  useSessionChannel(sessionId, {
    onQueueUpdated: (payload) => {
      if (!participantId) return;
      const myEntry = payload.positions.find((p) => p.id === participantId);
      if (myEntry) {
        setState((prev) => {
          if (prev.phase === 'queue') {
            return {
              ...prev,
              position: myEntry.position,
              estimatedWait: (myEntry.position - 1) * 60,
            };
          }
          return prev;
        });
      }
    },
    onPlayerActive: (payload) => {
      // Record when the active player's turn started.
      // Used by queued players to show the correct remaining time on their timer.
      activatedAtRef.current = Date.now();

      if (payload.participant_id === participantId) {
        setState({
          phase: 'spin',
          participantId: payload.participant_id,
          playerName: payload.name,
        });
      }
    },
    onPlayerSkipped: (payload) => {
      // Walk-up mode: if we're on the holding screen, the current player was skipped — check slot
      if (!queueEnabled && isHoldingRef.current) {
        checkSlot();
        return;
      }
      // If this player was skipped (timed out), transition back to queue.
      // The queue:updated event that follows will set the correct position.
      // Position 0 and estimatedWait 0 are placeholders — corrected immediately
      // by the onQueueUpdated handler which fires right after player:skipped.
      if (payload.participant_id !== participantId) return;
      activatedAtRef.current = 0;
      setState((prev) => {
        // Only transition out of spin phase — if already in queue or result, leave it
        if (prev.phase !== 'spin') return prev;
        return {
          phase: 'queue',
          position: 0,
          estimatedWait: 0,
          participantId: participantId!,
        };
      });
    },
    onSpinResult: (payload) => {
      // Walk-up mode: if we're on the holding screen, the current player just finished — check slot
      if (!queueEnabled && isHoldingRef.current) {
        checkSlot();
        return;
      }
      if (payload.participant_id === participantId) {
        // Delay result to match TV wheel animation (8 seconds from spin start)
        const SPIN_DURATION_MS = 8000;
        const elapsed = Date.now() - spinStartTimeRef.current;
        const remaining = Math.max(0, SPIN_DURATION_MS - elapsed);

        setTimeout(() => {
          setState((prev) => {
            // If already in result phase with a resultToken (API responded first), don't overwrite
            if (prev.phase === 'result' && prev.resultToken !== null) {
              return prev;
            }
            return {
              phase: 'result',
              prizeName: payload.prize_name,
              isNoPrize: payload.is_no_prize,
              resultToken: null,
            };
          });
        }, remaining);
      }
    },
    onSessionEnded: () => {
      setState((prev) => {
        // Don't interrupt result phase — user still needs their token
        if (prev.phase === 'result') return prev;
        return { phase: 'ended' };
      });
    },
  });

  // Render based on phase
  switch (state.phase) {
    case 'loading':
      return (
        <MobileShell eventName={eventName}>
          <div className="flex flex-1 items-center justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-white border-t-transparent" />
          </div>
        </MobileShell>
      );

    case 'closed':
      return (
        <MobileShell eventName={eventName}>
          <div className="flex flex-1 items-center justify-center px-4">
            <p className="text-center text-xl text-gray-400">
              This event is not currently active.
            </p>
          </div>
        </MobileShell>
      );

    case 'holding':
      return (
        <MobileShell eventName={eventName}>
          <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
            <div className="text-6xl">🎰</div>
            {state.slotJustOpened ? (
              <>
                <p className="text-xl font-bold text-green-400">
                  The slot just opened!
                </p>
                <p className="text-gray-300">
                  Tap below to register and play now.
                </p>
                <button
                  onClick={() => setState({ phase: 'register' })}
                  className="mt-2 w-full max-w-xs rounded-xl bg-green-600 px-6 py-4 text-lg font-bold text-white hover:bg-green-500 active:bg-green-700"
                >
                  Tap to Play Now!
                </button>
              </>
            ) : (
              <>
                <p className="text-xl font-bold text-white">
                  Someone is playing right now.
                </p>
                <p className="text-gray-400">
                  Please wait and scan again when the slot opens.
                </p>
                <button
                  onClick={checkSlot}
                  className="mt-2 w-full max-w-xs rounded-xl border border-gray-600 bg-gray-800 px-6 py-3 text-sm font-medium text-gray-300 hover:bg-gray-700"
                >
                  Check Again
                </button>
              </>
            )}
          </div>
        </MobileShell>
      );

    case 'register':
      return (
        <MobileShell eventName={eventName}>
          <div className="flex flex-1 flex-col items-center justify-center">
            <RegistrationForm
              sessionId={sessionId}
              slug={slug}
              onSuccess={handleRegistrationSuccess}
              onExistingUser={handleExistingUser}
              otpEnabled={otpEnabled}
              onSessionEnded={() => setState({ phase: 'ended' })}
            />
          </div>
        </MobileShell>
      );

    case 'queue': {
      // Compute remaining seconds for the queued timer.
      // If we have an activation timestamp (player:active was received), derive remaining time.
      // If not (session recovery path where activatedAtRef is 0), start from full duration.
      const queueTimerInitialSeconds =
        activatedAtRef.current > 0
          ? Math.max(
              0,
              spinTimeoutSeconds -
                Math.floor((Date.now() - activatedAtRef.current) / 1000)
            )
          : spinTimeoutSeconds;

      return (
        <MobileShell eventName={eventName}>
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <SpinCountdownTimer
              key={activatedAtRef.current}
              durationSeconds={spinTimeoutSeconds}
              initialSeconds={queueTimerInitialSeconds}
              size="sm"
            />
            <QueuePosition
              position={state.position}
              estimatedWait={state.estimatedWait}
            />
          </div>
        </MobileShell>
      );
    }

    case 'spin':
      return (
        <MobileShell eventName={eventName}>
          <div className="flex flex-1 flex-col items-center justify-center px-4 gap-4">
            {state.error && (
              <div className="mb-4 rounded-lg bg-red-900/50 px-4 py-3 text-center text-white">
                <p>{state.error}</p>
                <button
                  onClick={handleClearError}
                  className="mt-2 text-sm text-red-300 underline"
                >
                  Dismiss
                </button>
              </div>
            )}
            <SpinCountdownTimer
              key={state.participantId}
              durationSeconds={spinTimeoutSeconds}
              size="sm"
            />
            <SpinButton
              sessionId={sessionId}
              participantId={state.participantId}
              playerName={state.playerName}
              onResult={handleSpinResult}
              onError={handleSpinError}
              onSpinStart={() => { spinStartTimeRef.current = Date.now(); }}
            />
          </div>
        </MobileShell>
      );

    case 'result':
      return (
        <MobileShell eventName={eventName}>
          <div className="flex flex-1 flex-col items-center justify-center">
            <ResultDisplay
              prizeName={state.prizeName}
              isNoPrize={state.isNoPrize}
              resultToken={state.resultToken}
              isFulfilled={state.isFulfilled}
              fulfilledAt={state.fulfilledAt}
            />
          </div>
        </MobileShell>
      );

    case 'ended':
      return (
        <MobileShell eventName={eventName}>
          <div className="flex flex-1 items-center justify-center px-4">
            <p className="text-center text-xl text-gray-400">
              The event has ended — thank you for joining!
            </p>
          </div>
        </MobileShell>
      );
  }
}
