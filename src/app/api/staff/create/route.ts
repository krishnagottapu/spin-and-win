import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAuthError } from '@/lib/auth/middleware';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * POST /api/staff/create
 * Admin creates a staff entry with a name. Generates a unique registration token.
 * Staff uses that token URL to set their own password.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (isAuthError(auth)) return auth;

  try {
    const body = await request.json();
    const { session_id, name } = body;

    if (!session_id || !name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'session_id and name are required' }, { status: 422 });
    }

    const supabase = createServiceClient();

    // Verify session exists
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id')
      .eq('id', session_id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Generate unique registration token
    const registrationToken = crypto.randomUUID();

    // Insert staff record
    const { data: staff, error: insertError } = await supabase
      .from('staff')
      .insert({
        session_id,
        name: name.trim(),
        invite_code: registrationToken,
        device_registered: false,
      })
      .select('id, name, invite_code, device_registered')
      .single();

    if (insertError) {
      console.error('[POST /api/staff/create]', insertError);
      return NextResponse.json({ error: 'Failed to create staff' }, { status: 500 });
    }

    return NextResponse.json({
      staff: {
        id: staff.id,
        name: staff.name,
        registration_token: staff.invite_code,
        device_registered: staff.device_registered,
      },
    }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/staff/create]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
