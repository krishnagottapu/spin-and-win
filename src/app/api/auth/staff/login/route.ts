import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';

const secret = new TextEncoder().encode(process.env.JWT_SECRET!);

/**
 * POST /api/auth/staff/login
 * Staff login with username and password.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { session_id, username, password } = body;

    if (!session_id || !username || !password) {
      return NextResponse.json(
        { error: 'session_id, username, and password are required' },
        { status: 422 }
      );
    }

    const supabase = createServiceClient();

    // Find staff by username and session
    const { data: staff, error } = await supabase
      .from('staff')
      .select('id, session_id, name, username, password_hash')
      .eq('session_id', session_id)
      .eq('username', username.trim().toLowerCase())
      .single();

    if (error || !staff || !staff.password_hash) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    // Verify password
    const valid = await bcrypt.compare(password, staff.password_hash);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    // Sign JWT
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
    }, { status: 200 });

    response.cookies.set('spin_staff_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 48,
    });

    return response;
  } catch (err) {
    console.error('[POST /api/auth/staff/login]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
