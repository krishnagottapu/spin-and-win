import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { broadcastEvent } from '@/lib/supabase/broadcast';
import { pickPrize, PrizeDepletedError } from '@/lib/game/prizePicker';
import { promoteNextParticipant, getQueuePositions } from '@/lib/game/queueManager';
import type {
  ApiError,
  SpinRequest,
  SpinResponse,
  SpinStartPayload,
  SpinResultPayload,
  WinnerAnnouncedPayload,
  PlayerActivePayload,
  QueueUpdatedPayload,
  Prize,
  Session,
  Participant,
} from '@/lib/types';

const MAX_DECREMENT_RETRIES = 3;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<SpinRequest>;

    // 1. Validate body: session_id and participant_id present
    if (
      !body.session_id ||
      typeof body.session_id !== 'string' ||
      !body.participant_id ||
      typeof body.participant_id !== 'string'
    ) {
      return NextResponse.json<ApiError>(
        { error: 'session_id and participant_id are required' },
        { status: 422 }
      );
    }

    const { session_id, participant_id } = body;
    const supabase = createServiceClient();

    // 2. Fetch session, validate status is 'active' or 'ending'
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', session_id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json<ApiError>(
        { error: 'Session is not active' },
        { status: 422 }
      );
    }

    const typedSession = session as Session;

    if (typedSession.status !== 'active' && typedSession.status !== 'ending') {
      return NextResponse.json<ApiError>(
        { error: 'Session is not active' },
        { status: 422 }
      );
    }

    // 3. Fetch participant, validate
    const { data: participant, error: participantError } = await supabase
      .from('participants')
      .select('*')
      .eq('id', participant_id)
      .single();

    if (participantError || !participant) {
      return NextResponse.json<ApiError>(
        { error: 'Participant is not in active state' },
        { status: 403 }
      );
    }

    const typedParticipant = participant as Participant;

    if (typedParticipant.session_id !== session_id) {
      return NextResponse.json<ApiError>(
        { error: 'Participant is not in active state' },
        { status: 403 }
      );
    }

    if (typedParticipant.status !== 'active') {
      return NextResponse.json<ApiError>(
        { error: 'Participant is not in active state' },
        { status: 403 }
      );
    }

    if (typedParticipant.spins_used >= typedSession.max_spins_per_user) {
      return NextResponse.json<ApiError>(
        { error: 'Spin limit reached' },
        { status: 403 }
      );
    }

    // Check if session needs to transition to 'ending' due to time
    let currentSessionStatus = typedSession.status;
    if (currentSessionStatus === 'active' && new Date() > new Date(typedSession.end_time)) {
      await supabase
        .from('sessions')
        .update({ status: 'ending' })
        .eq('id', session_id);
      currentSessionStatus = 'ending';
    }

    // 4. Broadcast spin:start BEFORE prize calculation
    const spinStartPayload: SpinStartPayload = {
      participant_id: typedParticipant.id,
      name: typedParticipant.name,
    };
    await broadcastEvent(session_id, 'spin:start', spinStartPayload);

    // 5. Fetch prizes ORDER BY sort_order ASC (stable insertion order — matches TV wheel index)
    const { data: prizes } = await supabase
      .from('prizes')
      .select('*')
      .eq('session_id', session_id)
      .order('sort_order', { ascending: true });

    if (!prizes || prizes.length === 0) {
      return NextResponse.json<ApiError>(
        { error: 'No prizes available' },
        { status: 409 }
      );
    }

    let typedPrizes = prizes as Prize[];

    // 6-7. Pick prize with retry loop for atomic decrement
    let selectedPrize: Prize | null = null;
    let selectedPrizeIndex = 0;

    for (let attempt = 0; attempt < MAX_DECREMENT_RETRIES; attempt++) {
      // 6. Call pickPrize
      const pickResult = pickPrize(typedPrizes);
      selectedPrize = pickResult.prize;
      selectedPrizeIndex = pickResult.prizeIndex;

      // 7. RPC decrement_prize_inventory
      const { data: decremented } = await supabase.rpc(
        'decrement_prize_inventory',
        { p_prize_id: selectedPrize.id }
      );

      if (decremented === true) {
        break; // Success
      }

      // Decrement failed — re-fetch prizes and retry
      selectedPrize = null;
      const { data: refreshedPrizes } = await supabase
        .from('prizes')
        .select('*')
        .eq('session_id', session_id)
        .order('sort_order', { ascending: true });

      if (!refreshedPrizes || refreshedPrizes.length === 0) {
        return NextResponse.json<ApiError>(
          { error: 'No prizes available' },
          { status: 409 }
        );
      }

      typedPrizes = refreshedPrizes as Prize[];
    }

    if (!selectedPrize) {
      // Prize inventory exhausted — perform graceful failure cleanup.
      // We must unblock the slot so other players can join. The participant
      // is marked completed (no prize) and spin:result is broadcast so their
      // phone transitions to the result screen instead of hanging.
      const failureToken = crypto.randomUUID();

      await supabase
        .from('participants')
        .update({
          status: 'completed',
          prize_id: null,
          result_token: failureToken,
          spins_used: typedParticipant.spins_used + 1,
          spin_started_at: new Date().toISOString(),
          spin_completed_at: new Date().toISOString(),
        })
        .eq('id', participant_id);

      // Broadcast spin:result so the active phone shows a result
      const failureResultPayload: SpinResultPayload = {
        participant_id: typedParticipant.id,
        name: typedParticipant.name,
        prize_name: 'No Prize',
        prize_index: 0,
        is_no_prize: true,
      };
      await broadcastEvent(session_id, 'spin:result', failureResultPayload);

      // Promote next participant if any are queued
      const { promoted: failurePromoted } = await promoteNextParticipant(
        supabase,
        session_id,
        currentSessionStatus
      );
      if (failurePromoted) {
        const failurePlayerActivePayload: PlayerActivePayload = {
          participant_id: failurePromoted.id,
          name: failurePromoted.name,
          position: failurePromoted.queue_position,
        };
        await broadcastEvent(session_id, 'player:active', failurePlayerActivePayload);
      }

      const failurePositions = await getQueuePositions(supabase, session_id);
      await broadcastEvent(session_id, 'queue:updated', { positions: failurePositions });

      return NextResponse.json<ApiError>(
        { error: 'No prizes available' },
        { status: 409 }
      );
    }

    // 8. Generate result_token
    const resultToken = crypto.randomUUID();

    // 9. UPDATE participant
    await supabase
      .from('participants')
      .update({
        status: 'completed',
        prize_id: selectedPrize.id,
        result_token: resultToken,
        spins_used: typedParticipant.spins_used + 1,
        spin_started_at: new Date().toISOString(),
        spin_completed_at: new Date().toISOString(),
      })
      .eq('id', participant_id);

    // 10. Broadcast spin:result
    const spinResultPayload: SpinResultPayload = {
      participant_id: typedParticipant.id,
      name: typedParticipant.name,
      prize_name: selectedPrize.name,
      prize_index: selectedPrizeIndex,
      is_no_prize: selectedPrize.is_no_prize,
    };
    await broadcastEvent(session_id, 'spin:result', spinResultPayload);

    // 11. If !is_no_prize: broadcast winner:announced
    if (!selectedPrize.is_no_prize) {
      const winnerPayload: WinnerAnnouncedPayload = {
        name: typedParticipant.name,
        prize_name: selectedPrize.name,
        timestamp: new Date().toISOString(),
      };
      await broadcastEvent(session_id, 'winner:announced', winnerPayload);
    }

    // 12. Promote next participant
    const { promoted } = await promoteNextParticipant(
      supabase,
      session_id,
      currentSessionStatus
    );

    // 13. If promoted: broadcast player:active
    if (promoted) {
      const playerActivePayload: PlayerActivePayload = {
        participant_id: promoted.id,
        name: promoted.name,
        position: promoted.queue_position,
      };
      await broadcastEvent(session_id, 'player:active', playerActivePayload);
    }

    // 14. Get updated queue positions, broadcast queue:updated
    const positions = await getQueuePositions(supabase, session_id);
    const queueUpdatedPayload: QueueUpdatedPayload = { positions };
    await broadcastEvent(session_id, 'queue:updated', queueUpdatedPayload);

    // 15. Return SpinResponse
    const response: SpinResponse = {
      prize_id: selectedPrize.id,
      prize_name: selectedPrize.name,
      prize_index: selectedPrizeIndex,
      is_no_prize: selectedPrize.is_no_prize,
      result_token: resultToken,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    if (err instanceof PrizeDepletedError) {
      return NextResponse.json<ApiError>(
        { error: 'No prizes available' },
        { status: 409 }
      );
    }
    console.error('[POST /api/spin]', err);
    return NextResponse.json<ApiError>(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
