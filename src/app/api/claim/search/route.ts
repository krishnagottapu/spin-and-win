import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireStaffOrAdmin, isStaffOrAdminError } from '@/lib/auth/middleware';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const authResult = await requireStaffOrAdmin(request);
    if (isStaffOrAdminError(authResult)) {
      return authResult;
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    const q = searchParams.get('q');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 422 }
      );
    }

    // Special case: __all__ returns all completed participants with prizes
    const isListAll = q === '__all__';

    if (!isListAll && (!q || q.length < 2)) {
      return NextResponse.json(
        { error: 'Search query must be at least 2 characters' },
        { status: 422 }
      );
    }

    // Staff session scoping: staff can only search their own session
    if (authResult.role === 'staff') {
      if (sessionId !== authResult.sessionId) {
        return NextResponse.json(
          { error: 'Access denied: cannot search other sessions' },
          { status: 403 }
        );
      }
    }

    const supabase = createServiceClient();

    // Query completed participants with prizes
    let query = supabase
      .from('participants')
      .select(`
        id,
        name,
        phone,
        is_fulfilled,
        fulfilled_at,
        result_token,
        prizes (
          name
        )
      `)
      .eq('session_id', sessionId)
      .eq('status', 'completed')
      .not('prize_id', 'is', null);

    if (!isListAll) {
      const searchPattern = `%${q}%`;
      query = query.or(`name.ilike.${searchPattern},phone.ilike.${searchPattern}`);
    }

    const { data: results, error } = await query.order('spin_completed_at', { ascending: false }).limit(100);

    if (error) {
      console.error('[GET /api/claim/search]', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }

    const mappedResults = (results || []).map((row) => {
      const prizeData = row.prizes as { name: string } | { name: string }[] | null;
      const prize = Array.isArray(prizeData) ? prizeData[0] ?? null : prizeData;
      return {
        participant_id: row.id,
        name: row.name,
        phone: row.phone,
        prize_name: prize ? prize.name : 'No Prize',
        is_fulfilled: row.is_fulfilled,
        fulfilled_at: row.fulfilled_at ?? null,
        result_token: row.result_token,
      };
    });

    return NextResponse.json({ results: mappedResults }, { status: 200 });
  } catch (err) {
    console.error('[GET /api/claim/search]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
