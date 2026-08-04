import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';

const secret = new TextEncoder().encode(process.env.JWT_SECRET!);

/**
 * POST /api/auth/staff/register
 * Self-registration for staff — they create their own username/password.
 * Requires a valid session_id in the body.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { session_id, username, password, name } = body;

    // Validate
    if (!session_id || !username || !password || !name) {
      return NextResponse.json(
        { error: 'session_id, name, username, and password are required' },
        { status: 422 }
      );
    }

    if (username.length < 3) {
      return NextResponse.json(
        { error: 'Username must be at least 3 characters' },
        { status: 422 }
      );
    }

    if (password.length < 4) {
      return NextResponse.json(
        { error: 'Password must be at least 4 characters' },
        { status: 422 }
      );
    }

    const supabase = createServiceClient();

    // Verify session exists and is not ended
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, status')
      .eq('id', session_id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 404 });
    }

    if (session.status === 'ended') {
      return NextResponse.json({ error: 'This event has ended' }, { status: 403 });
    }

    // Check if username already taken for this session
    const { data: existing } = await supabase
      .from('staff')
      .select('id')
      .eq('session_id', session_id)
      .eq('username', username.trim().toLowerCase())
      .single();

    if (existing) {
      return NextResponse.json(
        { error: 'Username already taken. Choose a different one.' },
        { status: 409 }
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Insert staff record
    const { data: staff, error: insertError } = await supabase
      .from('staff')
      .insert({
        session_id,
        name: name.trim(),
        username: username.trim().toLowerCase(),
        password_hash: passwordHash,
        invite_code: `self_${crypto.randomUUID().slice(0, 8)}`,
        device_registered: true,
        registered_at: new Date().toISOString(),
      })
      .select('id, session_id, name, username')
      .single();

    if (insertError) {
      console.error('[POST /api/auth/staff/register]', insertError);
      return NextResponse.json({ error: 'Failed to register' }, { status: 500 });
    }

    // Sign JWT and set cookie
    const token = await new SignJWT({
      staff_id: staff.id,
      session_id: staff.session_id,
      role: 'staff',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('48h')
      .sign(secret);

    const response = NextResponse.json({
      staff_id: staff.id,
      session_id: staff.session_id,
      name: staff.name,
    }, { status: 201 });

    response.cookies.set('spin_staff_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 48,
    });

    return response;
  } catch (err) {
    console.error('[POST /api/auth/staff/register]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
