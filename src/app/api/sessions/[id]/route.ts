import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAuthError } from '@/lib/auth/middleware';
import { createServiceClient } from '@/lib/supabase/server';
import type {
  CreateSessionRequest,
  SessionStatus,
  WheelTheme,
  SoundPreset,
} from '@/lib/types';

const VALID_THEMES: WheelTheme[] = ['corporate', 'party', 'holiday'];
const VALID_SOUND_PRESETS: SoundPreset[] = ['drumroll', 'gameshow', 'casino'];

const VALID_TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  draft: ['active'],
  active: ['paused', 'ending'],
  paused: ['active', 'ending'],
  ending: ['ended'],
  ended: [],
};

interface RouteParams {
  params: { id: string };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const includeParam = request.nextUrl.searchParams.get('include');
  const tvToken = request.nextUrl.searchParams.get('tv_token');

  // If tv_token is provided (TV recovery), validate it against the session
  // Otherwise require admin JWT
  let isTokenAuth = false;
  if (tvToken && includeParam) {
    isTokenAuth = true;
  } else {
    const auth = await requireAdmin(request);
    if (isAuthError(auth)) return auth;
  }

  // Restrict TV token auth to known include values only
  const TV_ALLOWED_INCLUDES = new Set(['active_participant', 'last_winner', 'winners', 'queue']);

  if (isTokenAuth) {
    const requestedIncludes = includeParam?.split(',') ?? [];
    const invalid = requestedIncludes.filter((v) => !TV_ALLOWED_INCLUDES.has(v));
    if (invalid.length > 0) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  try {
    const supabase = createServiceClient();

    const sessionQuery = supabase
      .from('sessions')
      .select('*')
      .eq('id', params.id);

    // If using TV token auth, also verify the token matches
    if (isTokenAuth) {
      sessionQuery.eq('tv_token', tvToken!);
    }

    const { data: session, error: sessionError } = await sessionQuery.single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    const { data: prizes, error: prizesError } = await supabase
      .from('prizes')
      .select('*')
      .eq('session_id', params.id)
      .order('created_at', { ascending: true });

    if (prizesError) {
      console.error('[GET /api/sessions/[id]] prizes fetch', prizesError);
      return NextResponse.json(
        { error: 'Failed to fetch prizes' },
        { status: 500 }
      );
    }

    // Support ?include=active_participant,last_winner for TV recovery
    const includes = includeParam ? includeParam.split(',') : [];

    const responsePayload: Record<string, unknown> = {
      session: { ...session, prizes: prizes ?? [] },
    };

    if (includes.includes('active_participant')) {
      const { data: activeParticipant } = await supabase
        .from('participants')
        .select('id, name, status, queue_position')
        .eq('session_id', params.id)
        .in('status', ['active', 'spinning'])
        .limit(1)
        .single();

      responsePayload.active_participant = activeParticipant ?? null;
    }

    if (includes.includes('last_winner')) {
      const { data: lastWinner } = await supabase
        .from('participants')
        .select('id, name, prize_id, spin_completed_at')
        .eq('session_id', params.id)
        .eq('status', 'completed')
        .not('prize_id', 'is', null)
        .order('spin_completed_at', { ascending: false })
        .limit(1)
        .single();

      if (lastWinner && lastWinner.prize_id) {
        const { data: prize } = await supabase
          .from('prizes')
          .select('name, is_no_prize')
          .eq('id', lastWinner.prize_id)
          .single();

        responsePayload.last_winner = {
          ...lastWinner,
          prize_name: prize?.name ?? null,
          is_no_prize: prize?.is_no_prize ?? false,
        };
      } else {
        responsePayload.last_winner = null;
      }
    }

    if (includes.includes('winners')) {
      // Fetch ALL completed participants with real prizes using a join
      const { data: completedParticipants } = await supabase
        .from('participants')
        .select('name, spin_completed_at, prizes:prize_id(name, is_no_prize)')
        .eq('session_id', params.id)
        .eq('status', 'completed')
        .not('prize_id', 'is', null)
        .order('spin_completed_at', { ascending: false });

      responsePayload.winners = (completedParticipants ?? [])
        .map((p: { name: string; spin_completed_at: string | null; prizes: { name: string; is_no_prize: boolean } | { name: string; is_no_prize: boolean }[] | null }) => {
          const prizeRaw = p.prizes;
          const prize = Array.isArray(prizeRaw) ? prizeRaw[0] ?? null : prizeRaw;
          if (!prize || prize.is_no_prize) return null;
          return { name: p.name, prize_name: prize.name, spin_completed_at: p.spin_completed_at ?? '' };
        })
        .filter((w: unknown): w is { name: string; prize_name: string; spin_completed_at: string } => w !== null);
    }

    if (includes.includes('queue')) {
      const { data: queuedParticipants } = await supabase
        .from('participants')
        .select('id, name, queue_position')
        .eq('session_id', params.id)
        .eq('status', 'queued')
        .order('queue_position', { ascending: true });

      responsePayload.queue = (queuedParticipants ?? []).map(
        (p: { id: string; name: string; queue_position: number }) => ({
          id: p.id,
          name: p.name,
          position: p.queue_position,
        })
      );
    }

    return NextResponse.json(responsePayload, { status: 200 });
  } catch (err) {
    console.error('[GET /api/sessions/[id]]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAdmin(request);
  if (isAuthError(auth)) return auth;

  try {
    const supabase = createServiceClient();

    // Check session exists and is not ended
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
        { error: 'Cannot edit an ended session' },
        { status: 403 }
      );
    }

    const body = (await request.json()) as Partial<CreateSessionRequest>;

    // Validate required fields
    if (
      !body.event_name ||
      !body.start_time ||
      !body.end_time ||
      !body.theme ||
      !body.sound_preset
    ) {
      return NextResponse.json(
        { error: 'Missing required fields: event_name, start_time, end_time, theme, sound_preset' },
        { status: 422 }
      );
    }

    if (!VALID_THEMES.includes(body.theme)) {
      return NextResponse.json(
        { error: `Invalid theme. Must be one of: ${VALID_THEMES.join(', ')}` },
        { status: 422 }
      );
    }

    if (!VALID_SOUND_PRESETS.includes(body.sound_preset)) {
      return NextResponse.json(
        { error: `Invalid sound_preset. Must be one of: ${VALID_SOUND_PRESETS.join(', ')}` },
        { status: 422 }
      );
    }

    if (!body.prizes || body.prizes.length === 0) {
      return NextResponse.json(
        { error: 'At least one prize is required' },
        { status: 422 }
      );
    }

    // Update session
    const { data: session, error: updateError } = await supabase
      .from('sessions')
      .update({
        event_name: body.event_name,
        start_time: body.start_time,
        end_time: body.end_time,
        max_spins_per_user: body.max_spins_per_user ?? 1,
        include_no_prize: body.include_no_prize ?? false,
        theme: body.theme,
        sound_preset: body.sound_preset,
      })
      .eq('id', params.id)
      .select()
      .single();

    if (updateError) {
      console.error('[PUT /api/sessions/[id]] update', updateError);
      return NextResponse.json(
        { error: 'Failed to update session' },
        { status: 500 }
      );
    }

    // Delete existing prizes and re-insert
    // Only possible if no participants reference these prizes (FK constraint)
    const { count: referencedCount } = await supabase
      .from('participants')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', params.id)
      .not('prize_id', 'is', null);

    if (referencedCount && referencedCount > 0) {
      // Participants have already won prizes — cannot replace prize list.
      // Just update existing prize metadata (name, weight, inventory) where possible.
      // Return current prizes without modification.
      const { data: currentPrizes } = await supabase
        .from('prizes')
        .select('*')
        .eq('session_id', params.id)
        .order('created_at', { ascending: true });

      return NextResponse.json(
        { session: { ...session, prizes: currentPrizes ?? [] } },
        { status: 200 }
      );
    }

    const { error: deleteError } = await supabase
      .from('prizes')
      .delete()
      .eq('session_id', params.id);

    if (deleteError) {
      console.error('[PUT /api/sessions/[id]] delete prizes', deleteError);
      return NextResponse.json(
        { error: 'Failed to update prizes' },
        { status: 500 }
      );
    }

    const prizeRows = body.prizes.map((p) => ({
      session_id: params.id,
      name: p.name,
      weight: p.weight,
      inventory_count: p.inventory_count,
      is_no_prize: p.is_no_prize ?? false,
    }));

    const { data: prizes, error: prizesError } = await supabase
      .from('prizes')
      .insert(prizeRows)
      .select();

    if (prizesError) {
      console.error('[PUT /api/sessions/[id]] insert prizes', prizesError);
      return NextResponse.json(
        { error: 'Failed to insert prizes' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { session: { ...session, prizes: prizes ?? [] } },
      { status: 200 }
    );
  } catch (err) {
    console.error('[PUT /api/sessions/[id]]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAdmin(request);
  if (isAuthError(auth)) return auth;

  try {
    const body = (await request.json()) as { status?: string };

    if (!body.status) {
      return NextResponse.json(
        { error: 'Status field is required' },
        { status: 422 }
      );
    }

    const supabase = createServiceClient();

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

    const VALID_SESSION_STATUSES = Object.keys(VALID_TRANSITIONS) as SessionStatus[];
    if (!VALID_SESSION_STATUSES.includes(body.status as SessionStatus)) {
      return NextResponse.json(
        { error: 'Invalid status value' },
        { status: 422 }
      );
    }

    const currentStatus = existing.status as SessionStatus;
    const newStatus = body.status as SessionStatus;
    const allowedTransitions = VALID_TRANSITIONS[currentStatus];

    if (!allowedTransitions || !allowedTransitions.includes(newStatus)) {
      return NextResponse.json(
        { error: 'Invalid status transition' },
        { status: 422 }
      );
    }

    const { data: session, error: updateError } = await supabase
      .from('sessions')
      .update({ status: newStatus })
      .eq('id', params.id)
      .select()
      .single();

    if (updateError) {
      console.error('[PATCH /api/sessions/[id]]', updateError);
      return NextResponse.json(
        { error: 'Failed to update session status' },
        { status: 500 }
      );
    }

    return NextResponse.json({ session }, { status: 200 });
  } catch (err) {
    console.error('[PATCH /api/sessions/[id]]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
