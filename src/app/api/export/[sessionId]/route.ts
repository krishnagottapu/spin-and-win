import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAuthError } from '@/lib/auth/middleware';
import { createServiceClient } from '@/lib/supabase/server';
import { toCsvString } from '@/lib/utils/csvExport';
import type { CsvParticipantRow } from '@/lib/utils/csvExport';

interface RouteContext {
  params: { sessionId: string };
}

export async function GET(request: NextRequest, context: RouteContext) {
  const authResult = await requireAdmin(request);
  if (isAuthError(authResult)) {
    return authResult;
  }

  const { sessionId } = context.params;

  try {
    const supabase = createServiceClient();

    // Fetch session to verify it exists and get the slug for the filename
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, slug')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Query all participants with LEFT JOIN on prizes and staff (fulfilled_by)
    // Includes ALL participants regardless of status
    const { data: participants, error: participantsError } = await supabase
      .from('participants')
      .select(`
        name,
        phone,
        queue_position,
        joined_at,
        spin_completed_at,
        is_fulfilled,
        fulfilled_at,
        fulfilled_by,
        prizes:prize_id (name, is_no_prize),
        staff:fulfilled_by (name)
      `)
      .eq('session_id', sessionId)
      .order('queue_position', { ascending: true });

    if (participantsError) {
      console.error('[GET /api/export] participants query error:', participantsError);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }

    // Map database rows to CsvParticipantRow[]
    // PII Note: phone numbers are included in the export — handle CSV files per data retention policies
    const rows: CsvParticipantRow[] = (participants ?? []).map((p) => {
      const prizeRaw = p.prizes as { name: string; is_no_prize: boolean } | { name: string; is_no_prize: boolean }[] | null;
      const prizeData = Array.isArray(prizeRaw) ? prizeRaw[0] ?? null : prizeRaw;
      const staffRaw = p.staff as { name: string } | { name: string }[] | null;
      const staffData = Array.isArray(staffRaw) ? staffRaw[0] ?? null : staffRaw;

      // prize_won is the prize name, or empty string if no prize assigned or is a no-prize
      const prizeWon = prizeData && !prizeData.is_no_prize ? prizeData.name : '';

      return {
        name: p.name as string,
        phone: p.phone as string,
        prize_won: prizeWon,
        fulfilled: (p.is_fulfilled as boolean) ? 'Yes' : 'No',
        queue_position: p.queue_position as number,
        joined_at: p.joined_at as string,
        spin_completed_at: (p.spin_completed_at as string | null) ?? null,
        fulfilled_at: (p.fulfilled_at as string | null) ?? null,
        fulfilled_by_staff_name: staffData?.name ?? null,
      };
    });

    const csvString = toCsvString(rows);

    return new NextResponse(csvString, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="session-${session.slug}-report.csv"`,
      },
    });
  } catch (err) {
    console.error('[GET /api/export]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
