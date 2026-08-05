'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { QRCodeSVG } from 'qrcode.react';

import { WinnerLeaderboard } from '@/components/tv/WinnerLeaderboard';
import { QueueDisplay } from '@/components/tv/QueueDisplay';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import SimulationPanel from '@/components/tv/SimulationPanel';
import SpinCountdownTimer from '@/components/tv/SpinCountdownTimer';
import { useSessionChannel } from '@/lib/supabase/realtime';
import type {
  WheelTheme,
  SoundPreset,
  SpinStartPayload,
  SpinResultPayload,
  WinnerAnnouncedPayload,
  PlayerActivePayload,
  PlayerSkippedPayload,
  QueueUpdatedPayload,
  SessionEndedPayload,
} from '@/lib/types';

const SpinWheel = dynamic(() => import('@/components/tv/SpinWheel'), {
  ssr: false,
});
const ConfettiOverlay = dynamic(
  () => import('@/components/tv/ConfettiOverlay'),
  { ssr: false }
);

// ─── State Machine ────────────────────────────────────────────────────────────

type TvState =
  | { phase: 'idle' }
  | { phase: 'player_active'; playerName: string; participantId: string }
  | { phase: 'spinning'; playerName: string; prizeIndex: number; participantId: string }
  | { phase: 'winner'; playerName: string; prizeName: string; isNoPrize: boolean }
  | { phase: 'ended' };

// ─── Pending winner data stored between spin:result → onStopSpinning ─────────

interface PendingWinner {
  playerName: string;
  prizeName: string;
  isNoPrize: boolean;
}

// ─── Component Props ──────────────────────────────────────────────────────────

interface QueueEntry {
  id: string;
  name: string;
  position: number;
}

interface TvClientProps {
  session: {
    id: string;
    event_name: string;
    slug: string;
    theme: WheelTheme;
    sound_preset: SoundPreset;
    tv_token: string;
    spin_timeout_seconds: number;
  };
  prizes: Array<{ name: string }>;
  winners: Array<{ name: string; prize_name: string; spin_completed_at: string }>;
  activePlayerName: string | null;
  activeParticipantId: string | null;
  activePlayerActivatedAt: string | null;
  initialQueue: QueueEntry[];
}

export function TvClient({
  session,
  prizes: initialPrizes,
  winners: initialWinners,
  activePlayerName,
  activeParticipantId,
  activePlayerActivatedAt,
  initialQueue,
}: TvClientProps) {
  const joinUrl = `${process.env.NEXT_PUBLIC_APP_URL}/play/${session.slug}`;

  // ─── State ────────────────────────────────────────────────────────────────────
  const [tvState, setTvState] = useState<TvState>(
    activePlayerName
      ? { phase: 'player_active', playerName: activePlayerName, participantId: activeParticipantId ?? '' }
      : { phase: 'idle' }
  );
  const [prizes, setPrizes] = useState(initialPrizes);
  const [winners, setWinners] = useState(initialWinners);
  const [fireConfetti, setFireConfetti] = useState(false);
  const [targetIndex, setTargetIndex] = useState<number | null>(null);
  const [recovering, setRecovering] = useState(true);
  const [queue, setQueue] = useState<QueueEntry[]>(initialQueue);
  const [activationKey, setActivationKey] = useState(0);

  // ─── Refs ─────────────────────────────────────────────────────────────────────
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingWinnerRef = useRef<PendingWinner | null>(null);
  const winnerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confettiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSkipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipFlickerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Incremented every time a player becomes active — used as the timer key so a
  // returning player (same participantId) still gets a fresh countdown.
  const activationCountRef = useRef<number>(0);
  // timesUpVisible: ref+state pair — ref for synchronous reads inside async callbacks,
  // state for reactive rendering. Neither is in the auto-skip effect dependency array.
  const timesUpVisibleRef = useRef<boolean>(false);
  const [timesUpVisible, setTimesUpVisible] = useState<boolean>(false);

  // nextSkipDelayMsRef: corrected auto-skip delay accounting for already-elapsed time
  // on page-load recovery. Reset to full duration by handlePlayerActive for all
  // subsequent players.
  const nextSkipDelayMsRef = useRef<number>(
    activePlayerActivatedAt
      ? Math.max(
          0,
          session.spin_timeout_seconds * 1000 -
            (Date.now() - new Date(activePlayerActivatedAt).getTime())
        )
      : session.spin_timeout_seconds * 1000
  );

  // hasIncrementedForRecovery: prevents syncState from incrementing activationKey
  // more than once across multiple visibility-change recovery calls on the same player.
  const hasIncrementedForRecovery = useRef<boolean>(false);
  const recoveringRef = useRef(true);
  const pendingQueueUpdatesRef = useRef<QueueUpdatedPayload[]>([]);

  // ─── Auto-skip: skip inactive active players after configured timeout ──────
  //
  // Design: one single async setTimeout — no inner timer, no phase change mid-flight.
  // timesUpVisible/timesUpVisibleRef are NOT in the dependency array, so setting them
  // inside the callback does NOT re-trigger this effect and does NOT run cleanup.
  // This eliminates the race where the old two-step approach killed the fetch timer
  // during the times_up phase transition cleanup.
  useEffect(() => {
    if (tvState.phase !== 'player_active') return;

    const participantId = tvState.participantId;
    // Use the corrected remaining delay for the page-load recovery case.
    // nextSkipDelayMsRef is reset to full duration by handlePlayerActive for all
    // subsequent players, so this only applies once per page load.
    const delayMs = nextSkipDelayMsRef.current;

    autoSkipTimerRef.current = setTimeout(async () => {
      // Show the "Time's up!" overlay via boolean state — does NOT change tvState,
      // so this effect's cleanup is NOT triggered.
      timesUpVisibleRef.current = true;
      setTimesUpVisible(true);

      // Wait for the overlay to be visible before firing the skip
      await new Promise<void>((resolve) => setTimeout(resolve, 1500));

      // Hide the overlay
      timesUpVisibleRef.current = false;
      setTimesUpVisible(false);

      try {
        await fetch('/api/queue/skip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: session.id,
            tv_token: session.tv_token,
            participant_id: participantId,
            reason: 'timeout',
          }),
        });
      } catch (err) {
        console.error('[TvClient] auto-skip failed:', err);
      }

      // Only transition to idle if a Realtime event has not already advanced the phase
      // AND the same participant is still active (participantId guard prevents wiping
      // a legitimately promoted second player if this fetch resolved after player:active).
      setTvState((prev) =>
        prev.phase === 'player_active' && prev.participantId === participantId
          ? { phase: 'idle' }
          : prev
      );
    }, delayMs);

    return () => {
      if (autoSkipTimerRef.current) {
        clearTimeout(autoSkipTimerRef.current);
        autoSkipTimerRef.current = null;
      }
    };
  // timesUpVisible and timesUpVisibleRef are intentionally excluded from deps.
  // Including them would re-trigger the effect during the overlay display and
  // recreate the exact cleanup race this fix is designed to eliminate.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tvState.phase, activationKey, session.id, session.tv_token, session.spin_timeout_seconds]);

  // ─── Preload sound on mount + unlock audio on first user interaction ────────
  useEffect(() => {
    const audio = new Audio(`/sounds/${session.sound_preset}.mp3`);
    audio.preload = 'auto';
    audio.loop = false;
    audioRef.current = audio;

    // Browsers block audio until user interacts with the page.
    // Unlock by playing a silent snippet on first click/touch/keypress.
    function unlockAudio() {
      if (audioRef.current) {
        audioRef.current.volume = 0;
        audioRef.current.play().then(() => {
          audioRef.current!.pause();
          audioRef.current!.currentTime = 0;
          audioRef.current!.volume = 1;
        }).catch(() => {
          // Still locked, will try again on next interaction
        });
      }
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('touchstart', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
    }

    document.addEventListener('click', unlockAudio);
    document.addEventListener('touchstart', unlockAudio);
    document.addEventListener('keydown', unlockAudio);

    return () => {
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('touchstart', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [session.sound_preset]);

  // ─── Recovery: fetch current state on mount and on visibility change ──────────
  useEffect(() => {
    async function syncState() {
      try {
        const res = await fetch(
          `/api/sessions/${session.id}?include=active_participant,last_winner,winners,queue&tv_token=${encodeURIComponent(session.tv_token)}`
        );
        if (!res.ok) return;

        const data = await res.json() as {
          session: { status: string; prizes?: Array<{ name: string; is_no_prize: boolean }> };
          active_participant: { id: string; name: string; status: string; queue_position: number; activated_at: string | null } | null;
          last_winner: { id: string; name: string; prize_name: string; is_no_prize: boolean; spin_completed_at: string } | null;
          winners?: Array<{ name: string; prize_name: string; spin_completed_at: string }>;
          queue?: Array<{ id: string; name: string; position: number }>;
        };

        // If session ended, show ended state
        if (data.session.status === 'ended') {
          setTvState({ phase: 'ended' });
          return;
        }

        // If there's an active participant and we're not currently spinning, show player_active
        if (data.active_participant) {
          setTvState((prev) => {
            if (prev.phase === 'spinning') return prev; // Don't interrupt animation
            return { phase: 'player_active', playerName: data.active_participant!.name, participantId: data.active_participant!.id };
          });
          // Increment activationKey so the SpinCountdownTimer resets and the auto-skip
          // effect fires with the correct delayMs. Guard with hasIncrementedForRecovery
          // to prevent double-increment on repeated visibility-change recovery calls.
          if (!hasIncrementedForRecovery.current) {
            hasIncrementedForRecovery.current = true;
            activationCountRef.current += 1;
            setActivationKey(activationCountRef.current);
          }
        } else {
          setTvState((prev) => {
            if (prev.phase === 'spinning' || prev.phase === 'winner') return prev;
            return { phase: 'idle' };
          });
        }

        // Replace winners list with the full authoritative list from the server
        if (data.winners) {
          setWinners(data.winners);
        }

        // Refresh prize names — but NOT while a spin is in progress.
        // If the wheel is spinning, buffer the update; handleStopSpinning will apply it.
        if (data.session.prizes && data.session.prizes.length > 0) {
          const mapped = data.session.prizes.map((p) => ({ name: p.name }));
          setTvState((prev) => {
            if (prev.phase === 'spinning') {
              // Buffer — do not update prizes mid-spin
              pendingPrizesRef.current = mapped;
            } else {
              setPrizes(mapped);
            }
            return prev; // No state change — side effect only
          });
        }

        // Replace queue with the authoritative list from the server
        if (data.queue) {
          setQueue(data.queue);
        }
      } catch (err) {
        console.error('[TvClient] recovery fetch failed:', err);
      } finally {
        recoveringRef.current = false;
        setRecovering(false);

        // Drain any buffered queue:updated events that arrived during recovery
        const buffered = pendingQueueUpdatesRef.current;
        pendingQueueUpdatesRef.current = [];
        if (buffered.length > 0) {
          // Use the last buffered payload (most recent positions are authoritative)
          const latest = buffered[buffered.length - 1];
          setQueue((prev) => {
            const updatedMap = new Map(latest.positions.map((p) => [p.id, p.position]));
            const updated = prev
              .map((entry) => {
                const newPos = updatedMap.get(entry.id);
                return newPos !== undefined ? { ...entry, position: newPos } : entry;
              })
              .filter((entry) => updatedMap.has(entry.id));

            // Add any new entries not present in current state
            for (const [id, position] of updatedMap) {
              if (!updated.some((e) => e.id === id)) {
                updated.push({ id, name: 'Player', position });
              }
            }

            return updated.sort((a, b) => a.position - b.position);
          });
        }
      }
    }

    syncState();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncState();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [session.id]);

  // ─── Auto-dismiss winner overlay after 10 seconds ─────────────────────────────
  useEffect(() => {
    if (tvState.phase === 'winner') {
      winnerTimeoutRef.current = setTimeout(() => {
        setTvState({ phase: 'idle' });
        setTargetIndex(null);
      }, 10_000);
    }
    return () => {
      if (winnerTimeoutRef.current) {
        clearTimeout(winnerTimeoutRef.current);
        winnerTimeoutRef.current = null;
      }
    };
  }, [tvState.phase]);

  // ─── Reset confetti after 1 second ────────────────────────────────────────────
  useEffect(() => {
    if (fireConfetti) {
      confettiTimeoutRef.current = setTimeout(() => {
        setFireConfetti(false);
      }, 1_000);
    }
    return () => {
      if (confettiTimeoutRef.current) {
        clearTimeout(confettiTimeoutRef.current);
        confettiTimeoutRef.current = null;
      }
    };
  }, [fireConfetti]);

  // ─── Sound helper ─────────────────────────────────────────────────────────────
  const playSound = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(console.error);
    }
  }, []);

  // ─── Pending winner announcements queue (deferred until wheel stops) ─────────
  const pendingAnnouncementsRef = useRef<WinnerAnnouncedPayload[]>([]);

  // ─── Pending prize update — buffered while spinning to prevent mid-spin mismatch ──
  const pendingPrizesRef = useRef<Array<{ name: string }> | null>(null);

  // ─── Wheel stop callback ──────────────────────────────────────────────────────
  const handleStopSpinning = useCallback(() => {
    const pending = pendingWinnerRef.current;
    if (pending) {
      setTvState({
        phase: 'winner',
        playerName: pending.playerName,
        prizeName: pending.prizeName,
        isNoPrize: pending.isNoPrize,
      });
      if (!pending.isNoPrize) {
        setFireConfetti(true);
      }
      pendingWinnerRef.current = null;
    }

    // Apply any prize update that was buffered during the spin
    if (pendingPrizesRef.current !== null) {
      setPrizes(pendingPrizesRef.current);
      pendingPrizesRef.current = null;
    }

    // Add winner(s) to leaderboard AFTER wheel stops
    const announcements = pendingAnnouncementsRef.current;
    if (announcements.length > 0) {
      setWinners((prev) => {
        const newEntries = announcements.map((a) => ({
          name: a.name,
          prize_name: a.prize_name,
          spin_completed_at: a.timestamp,
        }));
        return [...newEntries, ...prev];
      });
      pendingAnnouncementsRef.current = [];
    }
  }, []);

  // ─── Realtime event handlers ──────────────────────────────────────────────────
  const handlePlayerActive = useCallback((payload: PlayerActivePayload) => {
    activationCountRef.current += 1;
    setActivationKey(activationCountRef.current);
    // Reset the skip delay to full duration — the corrected remaining-time value
    // from page-load recovery only applies once.
    nextSkipDelayMsRef.current = session.spin_timeout_seconds * 1000;
    // Allow syncState to increment activationKey again if this player is still
    // active during a future visibility-change recovery.
    hasIncrementedForRecovery.current = false;
    setTvState({ phase: 'player_active', playerName: payload.name, participantId: payload.participant_id });
    setTargetIndex(null);
    // Remove the promoted player from the queue display
    setQueue((prev) => prev.filter((q) => q.id !== payload.participant_id));
  }, [session.spin_timeout_seconds]);

  const handleQueueUpdated = useCallback((payload: QueueUpdatedPayload) => {
    // Buffer updates during recovery — syncState will set authoritative queue state
    if (recoveringRef.current) {
      pendingQueueUpdatesRef.current.push(payload);
      return;
    }

    setQueue((prev) => {
      // Update positions for existing entries, add new ones
      const updatedMap = new Map(payload.positions.map((p) => [p.id, p.position]));
      const updated = prev
        .map((entry) => {
          const newPos = updatedMap.get(entry.id);
          if (newPos !== undefined) {
            return { ...entry, position: newPos };
          }
          return entry;
        })
        .filter((entry) => updatedMap.has(entry.id));

      // Add any new entries we don't have yet (names will show as "Player" until next recovery)
      for (const [id, position] of updatedMap) {
        if (!updated.some((e) => e.id === id)) {
          updated.push({ id, name: 'Player', position });
        }
      }

      return updated.sort((a, b) => a.position - b.position);
    });
  }, []);

  const handlePlayerSkipped = useCallback((payload: PlayerSkippedPayload) => {
    // The skipped player will be re-added to queue via queue:updated broadcast.
    // Debounce: delay transition to idle so the next player:active has time to arrive.
    // times_up phase no longer exists — only player_active needs to be checked.
    if (skipFlickerTimerRef.current) clearTimeout(skipFlickerTimerRef.current);
    skipFlickerTimerRef.current = setTimeout(() => {
      setTvState((prev) => {
        if (prev.phase === 'player_active' && prev.playerName === payload.name) {
          return { phase: 'idle' };
        }
        return prev;
      });
      skipFlickerTimerRef.current = null;
    }, 1500);
  }, []);

  const handleSpinStart = useCallback(
    (_payload: SpinStartPayload) => {
      // The active player has tapped spin. Cancel the auto-skip timer —
      // the queue will advance naturally when the spin completes.
      if (autoSkipTimerRef.current) {
        clearTimeout(autoSkipTimerRef.current);
        autoSkipTimerRef.current = null;
      }
    },
    [] // autoSkipTimerRef is a ref, no dependency needed
  );

  const handleSpinResult = useCallback((payload: SpinResultPayload) => {
    playSound();
    pendingWinnerRef.current = {
      playerName: payload.name,
      prizeName: payload.prize_name,
      isNoPrize: payload.is_no_prize,
    };
    setTvState({
      phase: 'spinning',
      playerName: payload.name,
      prizeIndex: payload.prize_index,
      participantId: payload.participant_id,
    });
    setTargetIndex(payload.prize_index);
  }, [playSound]);

  const handleWinnerAnnounced = useCallback(
    (payload: WinnerAnnouncedPayload) => {
      // Defer leaderboard update until wheel stops spinning
      pendingAnnouncementsRef.current.push(payload);
    },
    []
  );

  const handleSessionEnded = useCallback((_payload: SessionEndedPayload) => {
    setTvState({ phase: 'ended' });
    setTargetIndex(null);
  }, []);

  // ─── Subscribe to session channel ─────────────────────────────────────────────
  useSessionChannel(session.id, {
    onPlayerActive: handlePlayerActive,
    onPlayerSkipped: handlePlayerSkipped,
    onQueueUpdated: handleQueueUpdated,
    onSpinStart: handleSpinStart,
    onSpinResult: handleSpinResult,
    onWinnerAnnounced: handleWinnerAnnounced,
    onSessionEnded: handleSessionEnded,
  });

  // ─── Fullscreen handler ───────────────────────────────────────────────────────
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const handleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(console.error);
    } else {
      document.documentElement.requestFullscreen().catch(console.error);
    }
  };

  // ─── Derive active player name for banner ─────────────────────────────────────
  const currentPlayerName: string | null =
    tvState.phase === 'player_active' || tvState.phase === 'spinning'
      ? tvState.playerName
      : null;

  // ─── Render: Loading skeleton while recovering ────────────────────────────────
  if (recovering) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-950">
        <div className="flex w-full max-w-6xl gap-8 px-8">
          {/* Wheel skeleton */}
          <div className="flex w-[60%] flex-col items-center gap-6">
            <div className="h-10 w-64 animate-pulse rounded bg-gray-800" />
            <div className="h-[400px] w-[400px] animate-pulse rounded-full bg-gray-800" />
            <div className="h-8 w-48 animate-pulse rounded bg-gray-800" />
          </div>
          {/* Right panel skeleton */}
          <div className="flex w-[40%] flex-col items-center gap-6">
            <div className="h-[320px] w-[320px] animate-pulse rounded bg-gray-800" />
            <div className="h-6 w-48 animate-pulse rounded bg-gray-800" />
            <div className="mt-4 h-40 w-full animate-pulse rounded bg-gray-800" />
          </div>
        </div>
      </div>
    );
  }

  // ─── Render: Session Ended ────────────────────────────────────────────────────
  if (tvState.phase === 'ended') {
    return (
      <ErrorBoundary>
        <div className="flex h-screen w-screen flex-col items-center justify-center bg-gray-950 text-white">
          <h1 className="mb-8 text-5xl font-bold">{session.event_name}</h1>
          <p className="mb-12 text-3xl text-gray-300">
            Event has ended — thank you for participating!
          </p>
          <div className="w-full max-w-2xl px-8">
            <WinnerLeaderboard winners={winners} />
          </div>
        </div>
      </ErrorBoundary>
    );
  }

  // ─── Render: Main TV Display ──────────────────────────────────────────────────
  return (
    <ErrorBoundary>
      <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-gray-950 text-white">
        {/* Fullscreen toggle — top right */}
        <button
          onClick={handleFullscreen}
          className="absolute right-4 top-2 z-50 rounded bg-gray-800 px-3 py-1 text-xs text-gray-400 opacity-60 transition-opacity hover:opacity-100"
          aria-label="Toggle Fullscreen"
        >
          {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen + Sound'}
        </button>

        {/* Simulation panel (dev only) */}
        {process.env.NODE_ENV !== 'production' && (
          <SimulationPanel sessionId={session.id} slug={session.slug} />
        )}

        {/* Confetti overlay */}
        <ConfettiOverlay fire={fireConfetti} />

        {/* "Time's up!" overlay — controlled by timesUpVisible boolean, not tvState.phase */}
        {timesUpVisible && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 animate-timesup">
            <p className="text-9xl font-black text-red-500 drop-shadow-2xl">⏰</p>
            <p className="mt-4 text-7xl font-black text-white drop-shadow-2xl">
              Time&apos;s up!
            </p>
          </div>
        )}

        {/* Winner reveal overlay */}
        {tvState.phase === 'winner' && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80">
            <p className="mb-4 text-4xl text-gray-300">Winner!</p>
            <p className="mb-6 text-8xl font-bold text-yellow-400">
              {tvState.playerName}
            </p>
            <p className="text-5xl text-white">
              {tvState.isNoPrize ? 'Better luck next time!' : tvState.prizeName}
            </p>
          </div>
        )}

        {/* Header — event name with party style */}
        <div className="shrink-0 border-b border-gray-800 bg-gradient-to-r from-purple-900/50 via-pink-900/50 to-yellow-900/50 px-4 py-3 text-center">
          <h1 className="animate-pulse bg-gradient-to-r from-yellow-300 via-pink-400 to-purple-400 bg-clip-text text-2xl font-extrabold tracking-wide text-transparent drop-shadow-lg md:text-4xl">
            🎉 {session.event_name} 🎉
          </h1>
        </div>

        {/* Main content — QR left + wheel center + leaderboard right */}
        <div className="flex min-h-0 flex-1">
          {/* Left sidebar — QR code (top) + Timer (middle) + Queue (below) */}
          <div className="flex w-[260px] shrink-0 flex-col border-r border-gray-800">
            {/* QR Code section — compact at top */}
            <div className="shrink-0 border-b border-gray-800 p-3 text-center">
              <p className="mb-2 text-sm font-semibold text-gray-300">Scan to Join!</p>
              <div className="flex justify-center">
                <QRCodeSVG
                  value={joinUrl}
                  size={140}
                  bgColor="#030712"
                  fgColor="#ffffff"
                  level="M"
                />
              </div>
              <p className="mt-2 max-w-[200px] mx-auto text-center text-[10px] text-gray-500">{joinUrl}</p>
            </div>

            {/* Countdown timer — visible only during player_active phase */}
            {tvState.phase === 'player_active' && (
              <div className="shrink-0 border-b border-gray-800 p-3 flex justify-center">
                <SpinCountdownTimer
                  key={activationKey}
                  durationSeconds={session.spin_timeout_seconds}
                  size="lg"
                />
              </div>
            )}

            {/* Active player name / idle prompt — always rendered for stable sidebar height */}
            <div className="shrink-0 border-b border-gray-800 p-3 text-center">
              {currentPlayerName !== null ? (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                    Now Playing
                  </p>
                  <p className="text-lg font-bold text-yellow-300 truncate">
                    {currentPlayerName}
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-400">Scan the QR code to join!</p>
              )}
            </div>

            {/* Queue display — fills remaining space */}
            <div className="min-h-0 flex-1 overflow-hidden p-3">
              <QueueDisplay
                queue={queue.map((q) => ({
                  ...q,
                  isActive: (tvState.phase === 'player_active' || tvState.phase === 'spinning')
                    ? tvState.participantId === q.id
                    : false,
                }))}
                activePlayerName={currentPlayerName}
              />
            </div>
          </div>

          {/* Wheel — centered, pushed down */}
          <div className="flex flex-1 flex-col items-center justify-center pt-16">
            <SpinWheel
              prizes={prizes}
              theme={session.theme}
              targetIndex={targetIndex}
              onStopSpinning={handleStopSpinning}
            />
          </div>

          {/* Right sidebar — leaderboard only */}
          <div className="flex w-[360px] shrink-0 flex-col border-l border-gray-800 p-4">
            <div className="min-h-0 flex-1 overflow-hidden">
              <WinnerLeaderboard winners={winners} />
            </div>
          </div>
        </div>

        {/* Footer — scrolling ticker like news channels */}
        <div className="relative shrink-0 overflow-hidden border-t border-gray-800 bg-gray-900 py-2">
          <div className="flex items-center">
            {/* Logo fixed on left */}
            <div className="z-10 shrink-0 bg-gray-900 pl-4 pr-4">
              <img
                src="/logo/utsav_logo.png"
                alt="Logo"
                className="h-8 w-auto"
              />
            </div>
            {/* Scrolling ticker */}
            <div className="flex-1 overflow-hidden">
              <div className="animate-ticker flex whitespace-nowrap">
                <span className="mx-8 text-base font-semibold text-yellow-400">🎉 {session.event_name}</span>
                <span className="mx-8 text-base text-gray-300">Scan the QR code to join and win prizes!</span>
                <span className="mx-8 text-base text-gray-300">🏆 {winners.length} winner{winners.length !== 1 ? 's' : ''} so far</span>
                <span className="mx-8 text-base font-semibold text-yellow-400">🎊 Good luck to all participants!</span>
                <span className="mx-8 text-base text-gray-300">Spin the wheel and win amazing prizes!</span>
                <span className="mx-8 text-base font-semibold text-yellow-400">🎉 {session.event_name}</span>
                <span className="mx-8 text-base text-gray-300">Scan the QR code to join and win prizes!</span>
                <span className="mx-8 text-base text-gray-300">🏆 {winners.length} winner{winners.length !== 1 ? 's' : ''} so far</span>
                <span className="mx-8 text-base font-semibold text-yellow-400">🎊 Good luck to all participants!</span>
                <span className="mx-8 text-base text-gray-300">Spin the wheel and win amazing prizes!</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
