import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAuthError } from '@/lib/auth/middleware';
import { createServiceClient } from '@/lib/supabase/server';
import { slugify } from '@/lib/utils/slugify';
import { generateToken } from '@/lib/utils/tokenGen';
import type {
  CreateSessionRequest,
  WheelTheme,
  SoundPreset,
} from '@/lib/types';

const VALID_THEMES: WheelTheme[] = ['corporate', 'party', 'holiday'];
const VALID_SOUND_PRESETS: SoundPreset[] = ['drumroll', 'gameshow', 'casino'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generateUniqueSlug(supabase: any, baseSlug: string): Promise<string> {
  for (let attempt = 0; attempt <= 5; attempt++) {
    const candidate = attempt === 0 ? baseSlug : `${baseSlug}-${attempt}`;
    const { data } = await supabase
      .from('sessions')
      .select('id')
      .eq('slug', candidate)
      .single();
    if (!data) return candidate;
  }
  // Fallback: append random 4-char hex
  return `${baseSlug}-${Math.random().toString(16).slice(2, 6)}`;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (isAuthError(auth)) return auth;

  try {
    const supabase = createServiceClient();

    const { data: sessions, error } = await supabase
      .from('sessions')
      .select('id, event_name, slug, start_time, end_time, status, created_at, updated_at, max_spins_per_user, include_no_prize, theme, sound_preset, tv_token, queue_enabled')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[GET /api/sessions]', error);
      return NextResponse.json(
        { error: 'Failed to fetch sessions' },
        { status: 500 }
      );
    }

    return NextResponse.json({ sessions }, { status: 200 });
  } catch (err) {
    console.error('[GET /api/sessions]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (isAuthError(auth)) return auth;

  try {
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

    // Validate spin_timeout_seconds
    const spinTimeout = body.spin_timeout_seconds ?? 30;
    if (!Number.isInteger(spinTimeout) || spinTimeout < 10 || spinTimeout > 120) {
      return NextResponse.json(
        { error: 'spin_timeout_seconds must be an integer between 10 and 120' },
        { status: 422 }
      );
    }

    const supabase = createServiceClient();

    // Generate slug — retry with incrementing suffix on collision
    const baseSlug = slugify(body.event_name);
    const slug = await generateUniqueSlug(supabase, baseSlug);

    // Generate tv_token
    const tv_token = generateToken();

    // Insert session
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .insert({
        event_name: body.event_name,
        slug,
        start_time: body.start_time,
        end_time: body.end_time,
        max_spins_per_user: body.max_spins_per_user ?? 1,
        include_no_prize: body.include_no_prize ?? false,
        otp_enabled: body.otp_enabled ?? true,
        theme: body.theme,
        sound_preset: body.sound_preset,
        spin_timeout_seconds: spinTimeout,
        queue_enabled: body.queue_enabled ?? true,
        tv_token,
        status: 'draft',
      })
      .select()
      .single();

    if (sessionError) {
      console.error('[POST /api/sessions] session insert', sessionError);
      return NextResponse.json(
        { error: 'Failed to create session', detail: sessionError.message },
        { status: 500 }
      );
    }

    // Insert prizes — sort_order preserves form order so prize_index is stable
    const prizeRows = body.prizes.map((p, i) => ({
      session_id: session.id,
      name: p.name,
      weight: p.weight,
      inventory_count: p.inventory_count,
      is_no_prize: p.is_no_prize ?? false,
      sort_order: i,
    }));

    const { data: prizes, error: prizesError } = await supabase
      .from('prizes')
      .insert(prizeRows)
      .select();

    if (prizesError) {
      console.error('[POST /api/sessions] prizes insert', prizesError);
      return NextResponse.json(
        { error: 'Failed to create prizes' },
        { status: 500 }
      );
    }

    return NextResponse.json({ session, prizes }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/sessions]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
