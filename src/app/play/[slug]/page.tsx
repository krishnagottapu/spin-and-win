import { notFound } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase/server';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import PlayClient from './PlayClient';

interface PlayPageProps {
  params: { slug: string };
}

export default async function PlayPage({ params }: PlayPageProps) {
  const { slug } = params;
  const supabase = createServiceClient();

  const { data: session, error } = await supabase
    .from('sessions')
    .select('id, slug, status, end_time, event_name, otp_enabled, spin_timeout_seconds, queue_enabled')
    .eq('slug', slug)
    .single();

  if (error || !session) {
    notFound();
  }

  // If session is draft or ended, render informational message (not 404 — slug exists)
  if (session.status === 'draft' || session.status === 'ended') {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <p className="text-center text-xl text-gray-600">
          This event is not currently active.
        </p>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <PlayClient
        sessionId={session.id}
        slug={session.slug}
        status={session.status}
        endTime={session.end_time}
        eventName={session.event_name}
        otpEnabled={session.otp_enabled ?? true}
        spinTimeoutSeconds={session.spin_timeout_seconds ?? 30}
        queueEnabled={session.queue_enabled ?? true}
      />
    </ErrorBoundary>
  );
}
