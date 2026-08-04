import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { broadcastEvent } from '@/lib/supabase/broadcast';
import type {
  Prize,
  SpinStartPayload,
  SpinResultPayload,
  WinnerAnnouncedPayload,
} from '@/lib/types';

/**
 * DEV ONLY: Simulate a spin without affecting inventory or database state.
 * Broadcasts all realtime events so the TV animates, but:
 * - Does NOT decrement prize inventory
 * - Does NOT create or modify participant records
 * - Does NOT affect the queue
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  const body = await request.json();
  const { session_id, player_name } = body;

  if (!session_id) {
    return NextResponse.json({ error: 'session_id is required' }, { status: 422 });
  }

  const supabase = createServiceClient();
  const fakeName = player_name || `SimPlayer_${Date.now() % 10000}`;
  const fakeParticipantId = crypto.randomUUID();

  // Fetch prizes for the session (read-only — no modifications)
  const { data: prizes } = await supabase
    .from('prizes')
    .select('*')
    .eq('session_id', session_id)
    .order('created_at', { ascending: true });

  if (!prizes || prizes.length === 0) {
    return NextResponse.json({ error: 'No prizes configured for session' }, { status: 422 });
  }

  const typedPrizes = prizes as Prize[];

  // Pick a random prize using weights (but DO NOT decrement inventory)
  const totalWeight = typedPrizes.reduce((sum, p) => sum + p.weight, 0);
  const random = Math.random() * totalWeight;
  let cumulative = 0;
  let selectedPrize = typedPrizes[0];
  let selectedIndex = 0;

  for (let i = 0; i < typedPrizes.length; i++) {
    cumulative += typedPrizes[i].weight;
    if (random < cumulative) {
      selectedPrize = typedPrizes[i];
      selectedIndex = i;
      break;
    }
  }

  // Broadcast spin:start
  const spinStartPayload: SpinStartPayload = {
    participant_id: fakeParticipantId,
    name: fakeName,
  };
  await broadcastEvent(session_id, 'spin:start', spinStartPayload);

  // Broadcast spin:result
  const spinResultPayload: SpinResultPayload = {
    participant_id: fakeParticipantId,
    name: fakeName,
    prize_name: selectedPrize.name,
    prize_index: selectedIndex,
    is_no_prize: selectedPrize.is_no_prize,
  };
  await broadcastEvent(session_id, 'spin:result', spinResultPayload);

  // Broadcast winner:announced (only for real prizes)
  if (!selectedPrize.is_no_prize) {
    const winnerPayload: WinnerAnnouncedPayload = {
      name: fakeName,
      prize_name: selectedPrize.name,
      timestamp: new Date().toISOString(),
    };
    await broadcastEvent(session_id, 'winner:announced', winnerPayload);
  }

  return NextResponse.json({
    success: true,
    simulated: true,
    prize_name: selectedPrize.name,
    prize_index: selectedIndex,
    is_no_prize: selectedPrize.is_no_prize,
    player_name: fakeName,
  });
}
