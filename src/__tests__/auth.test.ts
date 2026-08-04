import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock environment variable before importing modules
vi.stubEnv('JWT_SECRET', 'test-secret-that-is-at-least-32-chars-long!');

describe('JWT utilities', () => {
  it('sign and verify round-trip', async () => {
    const { signAdminJwt, verifyAdminJwt } = await import('@/lib/auth/jwt');

    const payload = { sub: 'admin-123', username: 'testadmin' };
    const token = await signAdminJwt(payload);

    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);

    const decoded = await verifyAdminJwt(token);

    expect(decoded.sub).toBe('admin-123');
    expect(decoded.username).toBe('testadmin');
    expect(decoded.role).toBe('admin');
    expect(decoded.iat).toBeDefined();
    expect(decoded.exp).toBeDefined();
  });

  it('verify rejects tampered token', async () => {
    const { signAdminJwt, verifyAdminJwt } = await import('@/lib/auth/jwt');

    const token = await signAdminJwt({ sub: 'admin-1', username: 'admin' });
    const tampered = token.slice(0, -5) + 'xxxxx';

    await expect(verifyAdminJwt(tampered)).rejects.toThrow();
  });

  it('verify rejects expired token', async () => {
    // Use jose directly to create an already-expired token
    const { SignJWT } = await import('jose');
    const { verifyAdminJwt } = await import('@/lib/auth/jwt');

    const secret = new TextEncoder().encode(
      'test-secret-that-is-at-least-32-chars-long!'
    );

    const expiredToken = await new SignJWT({
      sub: 'admin-1',
      username: 'admin',
      role: 'admin',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 172800) // 2 days ago
      .setExpirationTime(Math.floor(Date.now() / 1000) - 86400) // 1 day ago (expired)
      .sign(secret);

    await expect(verifyAdminJwt(expiredToken)).rejects.toThrow();
  });
});

describe('requireAdmin middleware', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns 401 on missing token', async () => {
    const { requireAdmin, isAuthError } = await import(
      '@/lib/auth/middleware'
    );

    const request = new NextRequest('http://localhost:3000/api/sessions', {
      method: 'GET',
    });

    const result = await requireAdmin(request);

    expect(isAuthError(result)).toBe(true);
    if (isAuthError(result)) {
      expect(result.status).toBe(401);
      const body = await result.json();
      expect(body.error).toBe('Authentication required');
    }
  });

  it('returns 401 on expired token', async () => {
    const { SignJWT } = await import('jose');
    const { requireAdmin, isAuthError } = await import(
      '@/lib/auth/middleware'
    );

    const secret = new TextEncoder().encode(
      'test-secret-that-is-at-least-32-chars-long!'
    );

    const expiredToken = await new SignJWT({
      sub: 'admin-1',
      username: 'admin',
      role: 'admin',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 172800)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 86400)
      .sign(secret);

    const request = new NextRequest('http://localhost:3000/api/sessions', {
      method: 'GET',
      headers: {
        Cookie: `spin_admin_token=${expiredToken}`,
      },
    });

    const result = await requireAdmin(request);

    expect(isAuthError(result)).toBe(true);
    if (isAuthError(result)) {
      expect(result.status).toBe(401);
      const body = await result.json();
      expect(body.error).toBe('Invalid or expired token');
    }
  });

  it('returns 401 on invalid token', async () => {
    const { requireAdmin, isAuthError } = await import(
      '@/lib/auth/middleware'
    );

    const request = new NextRequest('http://localhost:3000/api/sessions', {
      method: 'GET',
      headers: {
        Cookie: 'spin_admin_token=not-a-valid-jwt',
      },
    });

    const result = await requireAdmin(request);

    expect(isAuthError(result)).toBe(true);
    if (isAuthError(result)) {
      expect(result.status).toBe(401);
    }
  });

  it('returns payload on valid token', async () => {
    const { signAdminJwt } = await import('@/lib/auth/jwt');
    const { requireAdmin, isAuthError } = await import(
      '@/lib/auth/middleware'
    );

    const token = await signAdminJwt({ sub: 'admin-42', username: 'admin' });

    const request = new NextRequest('http://localhost:3000/api/sessions', {
      method: 'GET',
      headers: {
        Cookie: `spin_admin_token=${token}`,
      },
    });

    const result = await requireAdmin(request);

    expect(isAuthError(result)).toBe(false);
    if (!isAuthError(result)) {
      expect(result.sub).toBe('admin-42');
      expect(result.username).toBe('admin');
      expect(result.role).toBe('admin');
    }
  });
});

describe('slugify', () => {
  it('converts spaces to hyphens', async () => {
    const { slugify } = await import('@/lib/utils/slugify');
    expect(slugify('Summer Party')).toBe('summer-party');
  });

  it('converts to lowercase', async () => {
    const { slugify } = await import('@/lib/utils/slugify');
    expect(slugify('SUMMER PARTY')).toBe('summer-party');
  });

  it('strips special characters', async () => {
    const { slugify } = await import('@/lib/utils/slugify');
    expect(slugify("Summer Party! @#$%^&*()_+='s")).toBe('summer-party-s');
  });

  it('collapses multiple hyphens', async () => {
    const { slugify } = await import('@/lib/utils/slugify');
    expect(slugify('hello   world')).toBe('hello-world');
  });

  it('trims leading and trailing hyphens', async () => {
    const { slugify } = await import('@/lib/utils/slugify');
    expect(slugify('  hello world  ')).toBe('hello-world');
  });

  it('handles special characters only', async () => {
    const { slugify } = await import('@/lib/utils/slugify');
    expect(slugify('!@#$%')).toBe('');
  });

  it('handles already-slugified input', async () => {
    const { slugify } = await import('@/lib/utils/slugify');
    expect(slugify('already-slugified')).toBe('already-slugified');
  });

  it('slugifyWithSuffix appends a 4-char suffix', async () => {
    const { slugifyWithSuffix } = await import('@/lib/utils/slugify');
    const result = slugifyWithSuffix('Summer Party');
    expect(result).toMatch(/^summer-party-[a-z0-9]{4}$/);
  });
});
