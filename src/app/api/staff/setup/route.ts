import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';

const secret = new TextEncoder().encode(process.env.JWT_SECRET!);

/**
 * POST /api/staff/setup
 * Staff completes registration using their unique token URL.
 * Sets username and password, marks as registered, returns auth cookie.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, username, password } = body;

    if (!token || !username || !password) {
      return NextResponse.json({ error: 'token, username, and password are required' }, { status: 422 });
    }

    if (username.trim().length < 3) {
      return NextResponse.json({ error: 'Username must be at least 3 characters' }, { status: 422 });
    }

    if (password.length < 4) {
      return NextResponse.json({ error: 'Password must be at least 4 characters' }, { status: 422 });
    }

    const supabase = createServiceClient();

    // Find staff by token (invite_code) that hasn't been registered yet
    const { data: staff, error: findError } = await supabase
      .from('staff')
      .select('id, session_id, name, device_registered')
      .eq('invite_code', token)
      .single();

    if (findError || !staff) {
      return NextResponse.json({ error: 'Invalid registration link' }, { status: 404 });
    }

    if (staff.device_registered) {
      return NextResponse.json({ error: 'This account has already been set up' }, { status: 409 });
    }

    // Check username uniqueness within session
    const { data: existingUser } = await supabase
      .from('staff')
      .select('id')
      .eq('session_id', staff.session_id)
      .eq('username', username.trim().toLowerCase())
      .single();

    if (existingUser) {
      return NextResponse.json({ error: 'Username already taken. Choose a different one.' }, { status: 409 });
    }

    // Hash password and update staff record
    const passwordHash = await bcrypt.hash(password, 12);

    const { error: updateError } = await supabase
      .from('staff')
      .update({
        username: username.trim().toLowerCase(),
        password_hash: passwordHash,
        device_registered: true,
        registered_at: new Date().toISOString(),
      })
      .eq('id', staff.id);

    if (updateError) {
      console.error('[POST /api/staff/setup]', updateError);
      return NextResponse.json({ error: 'Failed to complete setup' }, { status: 500 });
    }

    // Sign JWT and set cookie
    const jwtToken = await new SignJWT({
      staff_id: staff.id,
      session_id: staff.session_id,
      role: 'staff',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('48h')
      .sign(secret);

    const response = NextResponse.json({
      success: true,
      staff_id: staff.id,
      name: staff.name,
    }, { status: 200 });

    response.cookies.set('spin_staff_token', jwtToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 48,
    });

    return response;
  } catch (err) {
    console.error('[POST /api/staff/setup]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
