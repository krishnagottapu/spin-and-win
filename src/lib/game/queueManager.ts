import type { SupabaseClient } from '@supabase/supabase-js';
import type { Participant, SessionStatus } from '@/lib/types';
import { broadcastEvent } from '@/lib/supabase/broadcast';

interface PromoteResult {
  promoted: Participant | null;
  sessionEnded: boolean;
}

/**
 * Promotes the next queued participant to active status.
 * If no queued participants remain and sessionStatus is 'ending',
 * sets the session status to 'ended' and broadcasts session:ended.
 */
export async function promoteNextParticipant(
  supabase: SupabaseClient,
  sessionId: string,
  sessionStatus: SessionStatus
): Promise<PromoteResult> {
  // Find the next queued participant (lowest queue_position)
  const { data: nextQueued } = await supabase
    .from('participants')
    .select('*')
    .eq('session_id', sessionId)
    .eq('status', 'queued')
    .order('queue_position', { ascending: true })
    .limit(1)
    .single();

  if (nextQueued) {
    // Promote to active and set activation timestamp for auto-skip timer
    const { data: promoted } = await supabase
      .from('participants')
      .update({ status: 'active', activated_at: new Date().toISOString() })
      .eq('id', nextQueued.id)
      .select('*')
      .single();

    return { promoted: promoted as Participant, sessionEnded: false };
  }

  // No queued participants remain
  if (sessionStatus === 'ending') {
    // End the session
    await supabase
      .from('sessions')
      .update({ status: 'ended' })
      .eq('id', sessionId);

    await broadcastEvent(sessionId, 'session:ended', {
      reason: 'queue_drained',
    });

    return { promoted: null, sessionEnded: true };
  }

  return { promoted: null, sessionEnded: false };
}

/**
 * Returns all queued participants with their positions for a session.
 */
export async function getQueuePositions(
  supabase: SupabaseClient,
  sessionId: string
): Promise<Array<{ id: string; position: number }>> {
  const { data } = await supabase
    .from('participants')
    .select('id, queue_position')
    .eq('session_id', sessionId)
    .eq('status', 'queued')
    .order('queue_position', { ascending: true });

  if (!data) return [];

  return data.map((row) => ({
    id: row.id as string,
    position: row.queue_position as number,
  }));
}
