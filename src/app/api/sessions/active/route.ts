import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * GET /api/sessions/active
 * Returns active/paused sessions (no auth required — just session IDs and names for staff login)
 */
export async function GET() {
  try {
    const supabase = createServiceClient();

    const { data: sessions, error } = await supabase
      .from('sessions')
      .select('id, event_name')
      .in('status', ['active', 'paused', 'ending'])
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[GET /api/sessions/active]', error);
      return NextResponse.json({ sessions: [] }, { status: 200 });
    }

    return NextResponse.json({ sessions: sessions ?? [] }, { status: 200 });
  } catch (err) {
    console.error('[GET /api/sessions/active]', err);
    return NextResponse.json({ sessions: [] }, { status: 200 });
  }
}
