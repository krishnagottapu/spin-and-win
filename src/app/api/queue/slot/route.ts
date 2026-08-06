import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import type { SlotStatusResponse, ApiError } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json<ApiError>(
        { error: 'sessionId query parameter is required' },
        { status: 422 }
      );
    }

    const supabase = createServiceClient();

    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, status, end_time, queue_enabled')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json<ApiError>(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // If session is not in a joinable state, slot is not occupied
    // (returning false here lets the play page show its own "not active" message)
    if (session.status !== 'active' && session.status !== 'ending') {
      return NextResponse.json<SlotStatusResponse>(
        { slot_occupied: false, queue_enabled: session.queue_enabled ?? true },
        { status: 200 }
      );
    }

    const { data: activeParticipants } = await supabase
      .from('participants')
      .select('id')
      .eq('session_id', sessionId)
      .in('status', ['active', 'spinning']);

    const slotOccupied = activeParticipants !== null && activeParticipants.length > 0;

    return NextResponse.json<SlotStatusResponse>(
      { slot_occupied: slotOccupied, queue_enabled: session.queue_enabled ?? true },
      { status: 200 }
    );
  } catch (err) {
    console.error('[GET /api/queue/slot]', err);
    return NextResponse.json<ApiError>(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
