import { SignJWT, jwtVerify } from 'jose';
import type { AdminJwtPayload, StaffJwtPayload } from '@/lib/types';

const secret = new TextEncoder().encode(process.env.JWT_SECRET!);

export async function signAdminJwt(payload: { sub: string; username: string }): Promise<string> {
  return new SignJWT({ ...payload, role: 'admin' as const })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(secret);
}

export async function verifyAdminJwt(token: string): Promise<AdminJwtPayload> {
  const { payload } = await jwtVerify(token, secret);
  return payload as unknown as AdminJwtPayload;
}

export async function signStaffJwt(payload: { staff_id: string; session_id: string }): Promise<string> {
  return new SignJWT({ ...payload, role: 'staff' as const })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('48h')
    .sign(secret);
}

export async function verifyStaffJwt(token: string): Promise<StaffJwtPayload> {
  const { payload } = await jwtVerify(token, secret);
  return payload as unknown as StaffJwtPayload;
}
