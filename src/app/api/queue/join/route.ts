import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { broadcastEvent } from '@/lib/supabase/broadcast';
import { getQueuePositions } from '@/lib/game/queueManager';
import type { QueueJoinRequest, QueueJoinResponse, ApiError, PlayerActivePayload, QueueUpdatedPayload } from '@/lib/types';

/**
 * Normalize a phone number to E.164 format (+1XXXXXXXXXX).
 * Accepts: 10-digit US, +1XXXXXXXXXX, 1XXXXXXXXXX.
 */
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1${digits.slice(1)}`;
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<QueueJoinRequest>;

    // 1. Validate required fields
    if (
      !body.session_id ||
      typeof body.session_id !== 'string' ||
      !body.name ||
      typeof body.name !== 'string' ||
      !body.phone ||
      typeof body.phone !== 'string'
    ) {
      return NextResponse.json<ApiError>(
        { error: 'session_id, name, and phone are required' },
        { status: 422 }
      );
    }

    const { session_id, name } = body;

    // Validate name length
    if (name.trim().length > 100) {
      return NextResponse.json<ApiError>(
        { error: 'Name must be 100 characters or fewer' },
        { status: 422 }
      );
    }

    // 2. Validate and normalize phone
    const phone = normalizePhone(body.phone);
    if (!phone) {
      return NextResponse.json<ApiError>(
        { error: 'Invalid phone number format' },
        { status: 422 }
      );
    }

    const supabase = createServiceClient();

    // 3. Validate session exists and is active
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, status, end_time, queue_enabled')
      .eq('id', session_id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json<ApiError>(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    if (session.status !== 'active') {
      return NextResponse.json<ApiError>(
        { error: 'Session is not accepting new participants' },
        { status: 422 }
      );
    }

    // 4. Check if past end_time
    const now = new Date();
    const endTime = new Date(session.end_time);
    if (now > endTime) {
      return NextResponse.json<ApiError>(
        { error: 'Session is not accepting new participants' },
        { status: 422 }
      );
    }

    // 5. Check phone uniqueness within this session
    const { data: existing } = await supabase
      .from('participants')
      .select('id')
      .eq('session_id', session_id)
      .eq('phone', phone)
      .single();

    if (existing) {
      return NextResponse.json<ApiError>(
        { error: 'Phone number already registered for this session' },
        { status: 409 }
      );
    }

    // 5b. Walk-up mode: reject if slot is currently occupied
    if (session.queue_enabled === false) {
      const { data: walkUpActive } = await supabase
        .from('participants')
        .select('id')
        .eq('session_id', session_id)
        .in('status', ['active', 'spinning']);

      if (walkUpActive !== null && walkUpActive.length > 0) {
        return NextResponse.json<ApiError>(
          {
            error: 'Someone is currently playing. Please wait and try again.',
            code: 'SLOT_OCCUPIED',
          },
          { status: 409 }
        );
      }
    }

    // 6. Get max queue position for this session
    // In walk-up mode, always use position 1 (no persistent queue)
    let nextPosition: number;
    if (session.queue_enabled === false) {
      nextPosition = 1;
    } else {
      const { data: maxPosRow } = await supabase
        .from('participants')
        .select('queue_position')
        .eq('session_id', session_id)
        .order('queue_position', { ascending: false })
        .limit(1)
        .single();
      nextPosition = (maxPosRow?.queue_position ?? 0) + 1;
    }

    // 7. Check if any participant is currently active or spinning
    const { data: activeParticipants } = await supabase
      .from('participants')
      .select('id')
      .eq('session_id', session_id)
      .in('status', ['active', 'spinning']);

    const hasActivePlayer =
      activeParticipants !== null && activeParticipants.length > 0;

    const assignedStatus = hasActivePlayer ? 'queued' : 'active';

    // 8. Insert participant
    const { data: participant, error: insertError } = await supabase
      .from('participants')
      .insert({
        session_id,
        name: name.trim(),
        phone,
        status: assignedStatus,
        queue_position: nextPosition,
        spins_used: 0,
        is_fulfilled: false,
        activated_at: assignedStatus === 'active' ? new Date().toISOString() : null,
      })
      .select('id, status, queue_position')
      .single();

    if (insertError || !participant) {
      console.error('[POST /api/queue/join] Insert error:', insertError);
      return NextResponse.json<ApiError>(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }

    // Broadcast player:active if this participant was promoted immediately
    if (assignedStatus === 'active') {
      const playerActivePayload: PlayerActivePayload = {
        participant_id: participant.id,
        name: name.trim(),
        position: nextPosition,
      };
      await broadcastEvent(session_id, 'player:active', playerActivePayload);
    }

    // Broadcast queue:updated with current positions
    const positions = await getQueuePositions(supabase, session_id);
    const queueUpdatedPayload: QueueUpdatedPayload = { positions };
    await broadcastEvent(session_id, 'queue:updated', queueUpdatedPayload);

    // Derive the display rank for this participant from the positions list
    const myEntry = positions.find((p) => p.id === participant.id);
    // If participant was promoted directly to 'active', they won't be in the queued list.
    // Fall back to position 1 / 0 wait seconds (correct for an immediately-active player).
    const displayRank = myEntry?.position ?? 1;
    const estimatedWaitSeconds = myEntry ? (displayRank - 1) * 60 : 0;

    const response: QueueJoinResponse = {
      participant_id: participant.id,
      status: participant.status,
      queue_position: displayRank,
      estimated_wait_seconds: estimatedWaitSeconds,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (err) {
    console.error('[POST /api/queue/join]', err);
    return NextResponse.json<ApiError>(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
