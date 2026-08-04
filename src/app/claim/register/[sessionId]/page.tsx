import { notFound } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase/server';
import StaffRegisterForm from './StaffRegisterForm';

interface PageProps {
  params: { sessionId: string };
}

export default async function StaffRegisterPage({ params }: PageProps) {
  const supabase = createServiceClient();

  // Verify session exists and is not ended
  const { data: session, error } = await supabase
    .from('sessions')
    .select('id, status, event_name')
    .eq('id', params.sessionId)
    .single();

  if (error || !session) {
    notFound();
  }

  if (session.status === 'ended') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4">
        <p className="text-center text-xl text-gray-400">This event has ended.</p>
      </div>
    );
  }

  return <StaffRegisterForm sessionId={session.id} />;
}
