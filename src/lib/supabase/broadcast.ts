import { createServiceClient } from '@/lib/supabase/server';

/**
 * Broadcast an event to all subscribers on a session channel.
 * Server-side only — uses the service role client.
 * Import this function only in route handlers or server components.
 */
export async function broadcastEvent(
  sessionId: string,
  event: string,
  payload: object
): Promise<void> {
  const supabase = createServiceClient();
  const channel = supabase.channel(`session:${sessionId}`);
  await channel.send({
    type: 'broadcast',
    event,
    payload,
  });
  await supabase.removeChannel(channel);
}
