import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAuthError } from '@/lib/auth/middleware';
import { createServiceClient } from '@/lib/supabase/server';
import { broadcastEvent } from '@/lib/supabase/broadcast';

interface RouteParams {
  params: { id: string };
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAdmin(request);
  if (isAuthError(auth)) return auth;

  try {
    const supabase = createServiceClient();

    // Check session exists
    const { data: existing, error: fetchError } = await supabase
      .from('sessions')
      .select('id, status')
      .eq('id', params.id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    if (existing.status === 'ended') {
      return NextResponse.json(
        { error: 'Session is already ended' },
        { status: 422 }
      );
    }

    // Set session status to ended
    const { error: updateSessionError } = await supabase
      .from('sessions')
      .update({ status: 'ended' })
      .eq('id', params.id);

    if (updateSessionError) {
      console.error('[POST /api/sessions/[id]/end] update session', updateSessionError);
      return NextResponse.json(
        { error: 'Failed to end session' },
        { status: 500 }
      );
    }

    // Set all queued participants to completed
    const { error: updateParticipantsError } = await supabase
      .from('participants')
      .update({ status: 'completed' })
      .eq('session_id', params.id)
      .eq('status', 'queued');

    if (updateParticipantsError) {
      console.error('[POST /api/sessions/[id]/end] update participants', updateParticipantsError);
      return NextResponse.json(
        { error: 'Failed to update participants' },
        { status: 500 }
      );
    }

    // Broadcast session:ended to all connected clients
    await broadcastEvent(params.id, 'session:ended', { reason: 'manual' });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('[POST /api/sessions/[id]/end]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
