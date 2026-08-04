import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireStaffOrAdmin, isStaffOrAdminError } from '@/lib/auth/middleware';
import type { FulfillRequest, FulfillResponse } from '@/lib/types';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const authResult = await requireStaffOrAdmin(request);
    if (isStaffOrAdminError(authResult)) {
      return authResult;
    }

    const body = (await request.json()) as FulfillRequest;

    if (!body.participant_id || body.participant_id.trim() === '') {
      return NextResponse.json(
        { error: 'participant_id is required' },
        { status: 422 }
      );
    }

    const supabase = createServiceClient();

    // Fetch participant to check existence and session scoping
    const { data: participant, error: fetchError } = await supabase
      .from('participants')
      .select('id, session_id, is_fulfilled')
      .eq('id', body.participant_id)
      .single();

    if (fetchError || !participant) {
      return NextResponse.json(
        { error: 'Participant not found' },
        { status: 404 }
      );
    }

    // Staff session scoping: staff can only fulfill within their own session
    if (authResult.role === 'staff') {
      if (participant.session_id !== authResult.sessionId) {
        return NextResponse.json(
          { error: 'Access denied: participant not in your session' },
          { status: 403 }
        );
      }
    }

    // Early check for already fulfilled
    if (participant.is_fulfilled) {
      return NextResponse.json(
        { error: 'Prize already fulfilled' },
        { status: 409 }
      );
    }

    // Determine who is fulfilling
    const fulfilledBy = authResult.role === 'staff' ? authResult.staffId : authResult.adminId;
    const fulfilledAt = new Date().toISOString();

    // Atomic UPDATE with rowcount check for race condition
    const { data: updatedRows, error: updateError } = await supabase
      .from('participants')
      .update({
        is_fulfilled: true,
        fulfilled_by: fulfilledBy,
        fulfilled_at: fulfilledAt,
      })
      .eq('id', body.participant_id)
      .eq('is_fulfilled', false)
      .select('id');

    if (updateError) {
      console.error('[POST /api/claim/fulfill]', updateError);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }

    // Race condition: another request fulfilled between our check and update
    if (!updatedRows || updatedRows.length === 0) {
      return NextResponse.json(
        { error: 'Prize already fulfilled' },
        { status: 409 }
      );
    }

    const responseBody: FulfillResponse = {
      success: true,
      fulfilled_at: fulfilledAt,
    };

    return NextResponse.json(responseBody, { status: 200 });
  } catch (err) {
    console.error('[POST /api/claim/fulfill]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
