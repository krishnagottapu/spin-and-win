import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { signStaffJwt } from '@/lib/auth/jwt';
import type { StaffRegisterRequest, StaffRegisterResponse } from '@/lib/types';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as StaffRegisterRequest;

    if (!body.invite_code || !body.name || body.invite_code.trim() === '' || body.name.trim() === '') {
      return NextResponse.json(
        { error: 'Invite code and name are required' },
        { status: 422 }
      );
    }

    const supabase = createServiceClient();

    // Atomic UPDATE: only succeeds if invite_code exists AND device_registered is false
    const { data: updatedRows, error: updateError } = await supabase
      .from('staff')
      .update({
        device_registered: true,
        registered_at: new Date().toISOString(),
        name: body.name.trim(),
      })
      .eq('invite_code', body.invite_code.trim())
      .eq('device_registered', false)
      .select('id, session_id');

    if (updateError) {
      console.error('[POST /api/auth/staff]', updateError);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }

    // If rowcount is 0, determine whether code doesn't exist or is already used
    if (!updatedRows || updatedRows.length === 0) {
      const { data: existing } = await supabase
        .from('staff')
        .select('id, device_registered')
        .eq('invite_code', body.invite_code.trim())
        .single();

      if (!existing) {
        return NextResponse.json(
          { error: 'Invalid invite code' },
          { status: 404 }
        );
      }

      // Code exists but device_registered is already true
      return NextResponse.json(
        { error: 'Invite code already used' },
        { status: 409 }
      );
    }

    const staff = updatedRows[0];

    // Sign staff JWT
    const token = await signStaffJwt({
      staff_id: staff.id,
      session_id: staff.session_id,
    });

    const responseBody: StaffRegisterResponse = {
      staff_id: staff.id,
      session_id: staff.session_id,
    };

    const response = NextResponse.json(responseBody, { status: 200 });

    response.cookies.set('spin_staff_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 48 * 60 * 60, // 48 hours
    });

    return response;
  } catch (err) {
    console.error('[POST /api/auth/staff]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
