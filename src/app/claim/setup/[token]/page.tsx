import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyStaffJwt } from '@/lib/auth/jwt';
import StaffSetupForm from './StaffSetupForm';

interface PageProps {
  params: { token: string };
}

export default async function StaffSetupPage({ params }: PageProps) {
  const supabase = createServiceClient();

  // Look up staff by registration token (invite_code)
  const { data: staff, error } = await supabase
    .from('staff')
    .select('id, name, session_id, device_registered, sessions(event_name, status)')
    .eq('invite_code', params.token)
    .single();

  if (error || !staff) {
    notFound();
  }

  // If already registered, check if they have a valid cookie → redirect to claim
  if (staff.device_registered) {
    const cookieStore = cookies();
    const staffToken = cookieStore.get('spin_staff_token')?.value;
    if (staffToken) {
      try {
        const payload = await verifyStaffJwt(staffToken);
        if (payload.staff_id === staff.id) {
          redirect(`/claim/${staff.session_id}`);
        }
      } catch { /* fall through */ }
    }

    // No valid cookie — redirect to login page
    redirect(`/claim/${staff.session_id}`);
  }

  const sessionRaw = staff.sessions as { event_name: string; status: string } | { event_name: string; status: string }[] | null;
  const session = Array.isArray(sessionRaw) ? sessionRaw[0] ?? null : sessionRaw;

  return (
    <StaffSetupForm
      token={params.token}
      staffName={staff.name}
      sessionId={staff.session_id}
      eventName={session?.event_name ?? 'Event'}
    />
  );
}
