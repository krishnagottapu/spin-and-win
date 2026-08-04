import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import type { QueueStatusResponse, ApiError } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    const phone = searchParams.get('phone');

    if (!sessionId || !phone) {
      return NextResponse.json<ApiError>(
        { error: 'sessionId and phone query parameters are required' },
        { status: 422 }
      );
    }

    // Normalize phone to E.164 (same format as stored by queue/join)
    const digits = phone.replace(/\D/g, '');
    let normalizedPhone: string;
    if (digits.length === 10) {
      normalizedPhone = `+1${digits}`;
    } else if (digits.length === 11 && digits.startsWith('1')) {
      normalizedPhone = `+1${digits.slice(1)}`;
    } else {
      normalizedPhone = phone; // fallback to raw
    }

    const supabase = createServiceClient();

    // Query participant with prize join
    const { data: participant, error } = await supabase
      .from('participants')
      .select('id, status, queue_position, prize_id, result_token, is_fulfilled, fulfilled_at, prizes(name, is_no_prize)')
      .eq('session_id', sessionId)
      .eq('phone', normalizedPhone)
      .single();

    if (error || !participant) {
      return NextResponse.json<ApiError>(
        { error: 'Participant not found' },
        { status: 404 }
      );
    }

    // Extract prize info from join
    const prizeRaw = participant.prizes as { name: string; is_no_prize: boolean } | { name: string; is_no_prize: boolean }[] | null;
    const prizeData = Array.isArray(prizeRaw) ? prizeRaw[0] ?? null : prizeRaw;

    const response: QueueStatusResponse = {
      participant_id: participant.id,
      status: participant.status,
      queue_position: participant.status === 'queued' ? participant.queue_position : null,
      estimated_wait_seconds:
        participant.status === 'queued'
          ? (participant.queue_position - 1) * 60
          : null,
      prize_name: prizeData?.name ?? null,
      is_no_prize: prizeData?.is_no_prize ?? null,
      result_token: participant.result_token,
      is_fulfilled: participant.is_fulfilled ?? null,
      fulfilled_at: participant.fulfilled_at ?? null,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    console.error('[GET /api/queue/status]', err);
    return NextResponse.json<ApiError>(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
