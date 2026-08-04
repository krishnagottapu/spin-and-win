import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyStaffJwt, verifyAdminJwt } from '@/lib/auth/jwt';
import { ClaimInterface } from '@/components/claim/ClaimInterface';
import StaffSessionLogin from '@/components/claim/StaffSessionLogin';

interface PageProps {
  params: { sessionId: string };
}

export default async function StaffLoginPage({ params }: PageProps) {
  const supabase = createServiceClient();

  // Verify session exists
  const { data: session, error } = await supabase
    .from('sessions')
    .select('id, status, event_name')
    .eq('id', params.sessionId)
    .single();

  if (error || !session) {
    notFound();
  }

  // Check if already authenticated
  const cookieStore = cookies();

  const adminToken = cookieStore.get('spin_admin_token')?.value;
  if (adminToken) {
    try {
      await verifyAdminJwt(adminToken);
      return <ClaimInterface role="admin" staffSessionId={session.id} />;
    } catch { /* fall through */ }
  }

  const staffToken = cookieStore.get('spin_staff_token')?.value;
  if (staffToken) {
    try {
      const payload = await verifyStaffJwt(staffToken);
      if (payload.session_id === session.id) {
        return <ClaimInterface role="staff" staffSessionId={payload.session_id} />;
      }
    } catch { /* fall through */ }
  }

  // Not authenticated — show login/register for this session
  return (
    <StaffSessionLogin
      sessionId={session.id}
      eventName={session.event_name}
      sessionEnded={session.status === 'ended'}
    />
  );
}
