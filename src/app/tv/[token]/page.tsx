import { notFound } from 'next/navigation';
import { Metadata } from 'next';

import { createServiceClient } from '@/lib/supabase/server';
import { TvClient } from '@/app/tv/[token]/tv-client';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

interface TvPageProps {
  params: { token: string };
}

export async function generateMetadata({ params }: TvPageProps): Promise<Metadata> {
  const supabase = createServiceClient();

  const { data: session } = await supabase
    .from('sessions')
    .select('event_name')
    .eq('tv_token', params.token)
    .not('status', 'eq', 'ended')
    .single();

  return {
    title: session?.event_name ?? 'TV Display',
  };
}

export default async function TvPage({ params }: TvPageProps) {
  const supabase = createServiceClient();

  // Validate token: find an active session with this tv_token
  const { data: session } = await supabase
    .from('sessions')
    .select('*')
    .eq('tv_token', params.token)
    .not('status', 'eq', 'ended')
    .single();

  if (!session) {
    notFound();
  }

  // Fetch completed participants with a prize for the winner leaderboard
  const { data: participants } = await supabase
    .from('participants')
    .select('name, prize_id, spin_completed_at')
    .eq('session_id', session.id)
    .eq('status', 'completed')
    .not('prize_id', 'is', null)
    .order('spin_completed_at', { ascending: false });

  // Fetch prizes for wheel display and name mapping (ordered by creation for stable index)
  const { data: prizes } = await supabase
    .from('prizes')
    .select('id, name, is_no_prize')
    .eq('session_id', session.id)
    .order('created_at', { ascending: true });

  // Build winner list: exclude no-prize entries
  const prizeMap = new Map(
    (prizes ?? []).map((p: { id: string; name: string; is_no_prize: boolean }) => [p.id, p])
  );

  const winners = (participants ?? [])
    .map((p: { name: string; prize_id: string | null; spin_completed_at: string | null }) => {
      const prize = p.prize_id ? prizeMap.get(p.prize_id) : null;
      if (!prize || prize.is_no_prize) return null;
      return {
        name: p.name,
        prize_name: prize.name,
        spin_completed_at: p.spin_completed_at ?? '',
      };
    })
    .filter((w): w is { name: string; prize_name: string; spin_completed_at: string } => w !== null);

  // Fetch currently active participant
  const { data: activeParticipant } = await supabase
    .from('participants')
    .select('name')
    .eq('session_id', session.id)
    .eq('status', 'active')
    .single();

  // Fetch queued participants for the queue display
  const { data: queuedParticipants } = await supabase
    .from('participants')
    .select('id, name, queue_position')
    .eq('session_id', session.id)
    .eq('status', 'queued')
    .order('queue_position', { ascending: true });

  const initialQueue = (queuedParticipants ?? []).map((p: { id: string; name: string; queue_position: number }) => ({
    id: p.id,
    name: p.name,
    position: p.queue_position,
  }));

  // Build prizes array for the wheel (stable order matches prize_index from server)
  const wheelPrizes = (prizes ?? []).map((p: { id: string; name: string; is_no_prize: boolean }) => ({
    name: p.name,
  }));

  return (
    <ErrorBoundary>
      <TvClient
        session={{
          id: session.id,
          event_name: session.event_name,
          slug: session.slug,
          theme: session.theme,
          sound_preset: session.sound_preset,
          tv_token: session.tv_token,
        }}
        prizes={wheelPrizes}
        winners={winners}
        activePlayerName={activeParticipant?.name ?? null}
        initialQueue={initialQueue}
      />
    </ErrorBoundary>
  );
}
