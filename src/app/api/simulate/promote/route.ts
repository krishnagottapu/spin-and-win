import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { broadcastEvent } from '@/lib/supabase/broadcast';
import type { PlayerActivePayload } from '@/lib/types';

/**
 * DEV ONLY: Force-promote a participant to active status.
 * Used by the simulation panel on the TV page.
 */
export async function POST(request: NextRequest) {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  const body = await request.json();
  const { session_id, participant_id } = body;

  if (!session_id || !participant_id) {
    return NextResponse.json({ error: 'session_id and participant_id required' }, { status: 422 });
  }

  const supabase = createServiceClient();

  // Mark any currently active participant as completed
  await supabase
    .from('participants')
    .update({ status: 'completed' })
    .eq('session_id', session_id)
    .in('status', ['active', 'spinning']);

  // Promote the target participant
  const { data: participant, error } = await supabase
    .from('participants')
    .update({ status: 'active', activated_at: new Date().toISOString() })
    .eq('id', participant_id)
    .select('id, name, queue_position')
    .single();

  if (error || !participant) {
    return NextResponse.json({ error: 'Failed to promote' }, { status: 500 });
  }

  // Broadcast player:active
  const payload: PlayerActivePayload = {
    participant_id: participant.id,
    name: participant.name,
    position: participant.queue_position,
  };
  await broadcastEvent(session_id, 'player:active', payload);

  return NextResponse.json({ success: true, participant });
}
