import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireStaffOrAdmin, isStaffOrAdminError } from '@/lib/auth/middleware';
import type { ClaimVerifyResponse } from '@/lib/types';

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
): Promise<NextResponse> {
  try {
    const authResult = await requireStaffOrAdmin(request);
    if (isStaffOrAdminError(authResult)) {
      return authResult;
    }

    const { token } = params;

    if (!token || token.trim() === '') {
      return NextResponse.json(
        { error: 'Result token is required' },
        { status: 422 }
      );
    }

    const supabase = createServiceClient();

    // Query participant with prize and fulfilled_by staff info
    // Use the column name for the FK relationship
    const { data: participant, error } = await supabase
      .from('participants')
      .select(`
        id,
        name,
        phone,
        is_fulfilled,
        fulfilled_at,
        fulfilled_by,
        prize_id,
        prizes (
          name,
          is_no_prize
        )
      `)
      .eq('result_token', token)
      .single();

    if (error || !participant) {
      return NextResponse.json(
        { error: 'Result token not found' },
        { status: 404 }
      );
    }

    // If there's a fulfilled_by, fetch the staff name separately
    let fulfilledByName: string | null = null;
    if (participant.fulfilled_by) {
      const { data: staffRow } = await supabase
        .from('staff')
        .select('name')
        .eq('id', participant.fulfilled_by)
        .single();
      fulfilledByName = staffRow?.name ?? null;
    }

    // Extract prize info
    const prizeData = participant.prizes as { name: string; is_no_prize: boolean } | { name: string; is_no_prize: boolean }[] | null;
    const prize = Array.isArray(prizeData) ? prizeData[0] ?? null : prizeData;

    const response: ClaimVerifyResponse = {
      participant_id: participant.id,
      name: participant.name,
      phone: participant.phone,
      prize_name: prize ? prize.name : 'No Prize',
      is_no_prize: prize ? prize.is_no_prize : true,
      is_fulfilled: participant.is_fulfilled,
      fulfilled_by_name: fulfilledByName,
      fulfilled_at: participant.fulfilled_at,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    console.error('[GET /api/claim/verify/[token]]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
