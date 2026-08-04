import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { signAdminJwt } from '@/lib/auth/jwt';
import { createServiceClient } from '@/lib/supabase/server';
import type { LoginRequest, LoginResponse } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<LoginRequest>;

    if (!body.username || !body.password) {
      return NextResponse.json(
        { error: 'Username and password required' },
        { status: 422 }
      );
    }

    const supabase = createServiceClient();

    const { data: admin, error } = await supabase
      .from('admins')
      .select('id, username, password_hash')
      .eq('username', body.username)
      .single();

    if (error || !admin) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    const passwordValid = await bcrypt.compare(body.password, admin.password_hash);

    if (!passwordValid) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    const token = await signAdminJwt({
      sub: admin.id,
      username: admin.username,
    });

    const responseBody: LoginResponse = {
      admin: { id: admin.id, username: admin.username },
    };

    const response = NextResponse.json(responseBody, { status: 200 });

    response.cookies.set('spin_admin_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 86400,
      path: '/',
    });

    return response;
  } catch (err) {
    console.error('[POST /api/auth/login]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
