import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { broadcastEvent } from '@/lib/supabase/broadcast';
import { promoteNextParticipant, getQueuePositions } from '@/lib/game/queueManager';
import { requireAdmin, isAuthError } from '@/lib/auth/middleware';
import type {
  ApiError,
  PlayerSkippedPayload,
  PlayerActivePayload,
  QueueUpdatedPayload,
  Participant,
  Session,
} from '@/lib/types';

interface SkipRequest {
  session_id: string;
  participant_id?: string; // Optional: if not provided, skips the currently active player
  reason?: 'timeout' | 'admin';
  tv_token?: string; // TV auto-skip authentication token
}

/**
 * POST /api/queue/skip
 * Skips the active player (auto-timeout or admin-initiated).
 * The skipped player is re-queued at the back with an incremented skip_count.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<SkipRequest>;

    if (!body.session_id || typeof body.session_id !== 'string') {
      return NextResponse.json<ApiError>(
        { error: 'session_id is required' },
        { status: 422 }
      );
    }

    const { session_id, reason = 'timeout', tv_token } = body;
    const supabase = createServiceClient();

    // ─── Authentication: dual-auth (tv_token or admin JWT) ────────────────────
    if (tv_token) {
      // TV auto-skip: validate tv_token against the session
      const { data: tokenSession, error: tokenError } = await supabase
        .from('sessions')
        .select('id')
        .eq('id', session_id)
        .eq('tv_token', tv_token)
        .single();

      if (tokenError || !tokenSession) {
        return NextResponse.json<ApiError>(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }
    } else {
      // Admin skip: require valid admin JWT
      const authResult = await requireAdmin(request);
      if (isAuthError(authResult)) {
        return authResult;
      }
    }

    // 1. Validate session is active
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, status')
      .eq('id', session_id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json<ApiError>(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    const typedSession = session as Pick<Session, 'id' | 'status'>;
    if (typedSession.status !== 'active' && typedSession.status !== 'paused' && typedSession.status !== 'ending') {
      return NextResponse.json<ApiError>(
        { error: 'Session is not active' },
        { status: 422 }
      );
    }

    // 2. Find the active player to skip
    const { data: activePlayer, error: playerError } = await supabase
      .from('participants')
      .select('*')
      .eq('session_id', session_id)
      .eq('status', 'active')
      .limit(1)
      .single();

    if (playerError || !activePlayer) {
      // If participant_id was provided, the player may have already been processed
      if (body.participant_id) {
        return NextResponse.json(
          { skipped: null, reason: 'already_processed' },
          { status: 200 }
        );
      }
      return NextResponse.json<ApiError>(
        { error: 'No active player to skip' },
        { status: 404 }
      );
    }

    const typedPlayer = activePlayer as Participant;

    // Idempotency: if a specific participant was targeted but a different one is now active,
    // the original was already processed
    if (body.participant_id && typedPlayer.id !== body.participant_id) {
      return NextResponse.json(
        { skipped: null, reason: 'already_processed' },
        { status: 200 }
      );
    }

    // 3. Atomically re-queue the skipped player at the back via RPC
    const { data: newPosition, error: rpcError } = await supabase.rpc('requeue_skipped_participant', {
      p_participant_id: typedPlayer.id,
    });

    if (rpcError) {
      console.error('[POST /api/queue/skip] RPC error:', rpcError);
      return NextResponse.json<ApiError>(
        { error: 'Failed to skip participant' },
        { status: 500 }
      );
    }

    if (newPosition === -1) {
      // The RPC found no participant with status = 'active'.
      // This usually means the player transitioned to 'spinning' before the timer fired.
      // The spin will advance the queue when it completes — but as a safety net,
      // check whether the queue is stuck (no active or spinning player at all).
      const { data: activeOrSpinning } = await supabase
        .from('participants')
        .select('id')
        .eq('session_id', session_id)
        .in('status', ['active', 'spinning'])
        .limit(1);

      if (!activeOrSpinning || activeOrSpinning.length === 0) {
        // Dead queue: no one is active or spinning, but queued players may exist.
        // Promote the next participant so the queue can continue.
        const { promoted } = await promoteNextParticipant(
          supabase,
          session_id,
          typedSession.status
        );
        if (promoted) {
          const playerActivePayload: PlayerActivePayload = {
            participant_id: promoted.id,
            name: promoted.name,
            position: promoted.queue_position,
          };
          await broadcastEvent(session_id, 'player:active', playerActivePayload);

          const positions = await getQueuePositions(supabase, session_id);
          const queueUpdatedPayload: QueueUpdatedPayload = { positions };
          await broadcastEvent(session_id, 'queue:updated', queueUpdatedPayload);
        }
      }
      // In either case, return already_processed — the original targeted participant
      // was not re-queued by this request.
      return NextResponse.json(
        { skipped: null, reason: 'already_processed' },
        { status: 200 }
      );
    }

    // 4. Broadcast player:skipped
    const skippedPayload: PlayerSkippedPayload = {
      participant_id: typedPlayer.id,
      name: typedPlayer.name,
      reason,
    };
    await broadcastEvent(session_id, 'player:skipped', skippedPayload);

    // 5. Promote next player
    const { promoted } = await promoteNextParticipant(
      supabase,
      session_id,
      typedSession.status
    );

    if (promoted) {
      const playerActivePayload: PlayerActivePayload = {
        participant_id: promoted.id,
        name: promoted.name,
        position: promoted.queue_position,
      };
      await broadcastEvent(session_id, 'player:active', playerActivePayload);
    }

    // 6. Broadcast updated queue positions
    const positions = await getQueuePositions(supabase, session_id);
    const queueUpdatedPayload: QueueUpdatedPayload = { positions };
    await broadcastEvent(session_id, 'queue:updated', queueUpdatedPayload);

    return NextResponse.json(
      {
        skipped: {
          participant_id: typedPlayer.id,
          name: typedPlayer.name,
          new_position: newPosition,
        },
        promoted: promoted
          ? { participant_id: promoted.id, name: promoted.name }
          : null,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('[POST /api/queue/skip]', err);
    return NextResponse.json<ApiError>(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
