import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminJwt, verifyStaffJwt } from '@/lib/auth/jwt';
import type { AdminJwtPayload } from '@/lib/types';

export type StaffOrAdminResult =
  | { role: 'admin'; adminId: string }
  | { role: 'staff'; staffId: string; sessionId: string };

/**
 * Validates the spin_admin_token cookie on a request.
 * Returns the decoded JWT payload if valid, otherwise returns a 401 NextResponse.
 */
export async function requireAdmin(
  request: NextRequest
): Promise<AdminJwtPayload | NextResponse> {
  const token = request.cookies.get('spin_admin_token')?.value;

  if (!token) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    const payload = await verifyAdminJwt(token);
    return payload;
  } catch {
    return NextResponse.json(
      { error: 'Invalid or expired token' },
      { status: 401 }
    );
  }
}

/**
 * Type guard to check if requireAdmin returned an error response.
 */
export function isAuthError(
  result: AdminJwtPayload | NextResponse
): result is NextResponse {
  return result instanceof NextResponse;
}

/**
 * Validates either spin_admin_token or spin_staff_token cookie.
 * Checks admin cookie FIRST (admin has superset of permissions).
 * Returns the role and identity, or a 401 NextResponse.
 */
export async function requireStaffOrAdmin(
  request: NextRequest
): Promise<StaffOrAdminResult | NextResponse> {
  // Check admin cookie first
  const adminToken = request.cookies.get('spin_admin_token')?.value;
  if (adminToken) {
    try {
      const payload = await verifyAdminJwt(adminToken);
      return { role: 'admin', adminId: payload.sub };
    } catch {
      // Admin token invalid — fall through to check staff token
    }
  }

  // Check staff cookie second
  const staffToken = request.cookies.get('spin_staff_token')?.value;
  if (staffToken) {
    try {
      const payload = await verifyStaffJwt(staffToken);
      return { role: 'staff', staffId: payload.staff_id, sessionId: payload.session_id };
    } catch {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }
  }

  return NextResponse.json(
    { error: 'Authentication required' },
    { status: 401 }
  );
}

/**
 * Type guard to check if requireStaffOrAdmin returned an error response.
 */
export function isStaffOrAdminError(
  result: StaffOrAdminResult | NextResponse
): result is NextResponse {
  return result instanceof NextResponse;
}
