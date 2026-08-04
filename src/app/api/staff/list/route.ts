import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAuthError } from '@/lib/auth/middleware';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * GET /api/staff/list?sessionId=uuid
 * Returns all staff for a session with their registration status.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (isAuthError(auth)) return auth;

  const sessionId = request.nextUrl.searchParams.get('sessionId');
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId is required' }, { status: 422 });
  }

  try {
    const supabase = createServiceClient();

    const { data: staff, error } = await supabase
      .from('staff')
      .select('id, name, invite_code, device_registered')
      .eq('session_id', sessionId)
      .order('registered_at', { ascending: false, nullsFirst: true });

    if (error) {
      console.error('[GET /api/staff/list]', error);
      return NextResponse.json({ staff: [] }, { status: 200 });
    }

    const mapped = (staff ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      registration_token: s.invite_code,
      device_registered: s.device_registered,
    }));

    return NextResponse.json({ staff: mapped }, { status: 200 });
  } catch (err) {
    console.error('[GET /api/staff/list]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
