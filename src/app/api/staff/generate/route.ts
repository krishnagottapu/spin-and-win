import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAuthError } from '@/lib/auth/middleware';
import { createServiceClient } from '@/lib/supabase/server';
import { generateInviteCode } from '@/lib/utils/tokenGen';
import type { GenerateInviteRequest } from '@/lib/types';

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (isAuthError(auth)) return auth;

  try {
    const body = (await request.json()) as Partial<GenerateInviteRequest>;

    if (!body.session_id) {
      return NextResponse.json(
        { error: 'session_id is required' },
        { status: 422 }
      );
    }

    if (!body.count || body.count < 1 || body.count > 10) {
      return NextResponse.json(
        { error: 'count must be between 1 and 10' },
        { status: 422 }
      );
    }

    const supabase = createServiceClient();

    // Verify session exists
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id')
      .eq('id', body.session_id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Generate invite codes
    const codes: string[] = [];
    const staffRows = [];

    for (let i = 0; i < body.count; i++) {
      const code = generateInviteCode();
      codes.push(code);
      staffRows.push({
        session_id: body.session_id,
        name: '',
        invite_code: code,
        device_registered: false,
      });
    }

    const { error: insertError } = await supabase
      .from('staff')
      .insert(staffRows);

    if (insertError) {
      console.error('[POST /api/staff/generate] insert', insertError);
      return NextResponse.json(
        { error: 'Failed to generate invite codes' },
        { status: 500 }
      );
    }

    return NextResponse.json({ codes }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/staff/generate]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
