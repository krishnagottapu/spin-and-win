'use client';

import { useEffect, useRef } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';
import type {
  QueueUpdatedPayload,
  PlayerActivePayload,
  SpinStartPayload,
  SpinResultPayload,
  WinnerAnnouncedPayload,
  SessionEndedPayload,
  PlayerSkippedPayload,
} from '@/lib/types';

type SessionChannelHandlers = Partial<{
  onQueueUpdated: (payload: QueueUpdatedPayload) => void;
  onPlayerActive: (payload: PlayerActivePayload) => void;
  onPlayerSkipped: (payload: PlayerSkippedPayload) => void;
  onSpinStart: (payload: SpinStartPayload) => void;
  onSpinResult: (payload: SpinResultPayload) => void;
  onWinnerAnnounced: (payload: WinnerAnnouncedPayload) => void;
  onSessionEnded: (payload: SessionEndedPayload) => void;
}>;

/**
 * Hook that subscribes to a Supabase Realtime broadcast channel for a session.
 * Must be used in a 'use client' component.
 * Registers event handlers and cleans up on unmount.
 */
export function useSessionChannel(
  sessionId: string,
  handlers: SessionChannelHandlers
): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const supabase = createBrowserClient();
    const channel = supabase
      .channel(`session:${sessionId}`)
      .on('broadcast', { event: 'queue:updated' }, ({ payload }) => {
        handlersRef.current.onQueueUpdated?.(payload as QueueUpdatedPayload);
      })
      .on('broadcast', { event: 'player:active' }, ({ payload }) => {
        handlersRef.current.onPlayerActive?.(payload as PlayerActivePayload);
      })
      .on('broadcast', { event: 'player:skipped' }, ({ payload }) => {
        handlersRef.current.onPlayerSkipped?.(payload as PlayerSkippedPayload);
      })
      .on('broadcast', { event: 'spin:start' }, ({ payload }) => {
        handlersRef.current.onSpinStart?.(payload as SpinStartPayload);
      })
      .on('broadcast', { event: 'spin:result' }, ({ payload }) => {
        handlersRef.current.onSpinResult?.(payload as SpinResultPayload);
      })
      .on('broadcast', { event: 'winner:announced' }, ({ payload }) => {
        handlersRef.current.onWinnerAnnounced?.(
          payload as WinnerAnnouncedPayload
        );
      })
      .on('broadcast', { event: 'session:ended' }, ({ payload }) => {
        handlersRef.current.onSessionEnded?.(payload as SessionEndedPayload);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);
}
