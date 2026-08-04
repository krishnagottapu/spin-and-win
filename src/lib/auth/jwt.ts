import { SignJWT, jwtVerify } from 'jose';
import type { AdminJwtPayload, StaffJwtPayload } from '@/lib/types';

function getSecret(): Uint8Array {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) throw new Error('JWT_SECRET environment variable is not set');
  // Use globalThis.TextEncoder with fallback to Node's util.TextEncoder
  // to ensure correct Uint8Array instance in all environments (jsdom, node)
  return new Uint8Array(Buffer.from(jwtSecret, 'utf-8'));
}

export async function signAdminJwt(payload: { sub: string; username: string }): Promise<string> {
  return new SignJWT({ ...payload, role: 'admin' as const })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(getSecret());
}

export async function verifyAdminJwt(token: string): Promise<AdminJwtPayload> {
  const { payload } = await jwtVerify(token, getSecret());
  return payload as unknown as AdminJwtPayload;
}

export async function signStaffJwt(payload: { staff_id: string; session_id: string }): Promise<string> {
  return new SignJWT({ ...payload, role: 'staff' as const })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('48h')
    .sign(getSecret());
}

export async function verifyStaffJwt(token: string): Promise<StaffJwtPayload> {
  const { payload } = await jwtVerify(token, getSecret());
  return payload as unknown as StaffJwtPayload;
}
