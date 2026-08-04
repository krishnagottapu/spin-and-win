// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock broadcastEvent so tests don't need a real Supabase channel
vi.mock('@/lib/supabase/broadcast', () => ({
  broadcastEvent: vi.fn().mockResolvedValue(undefined),
}));

// Mock environment variable before importing modules
vi.stubEnv('JWT_SECRET', 'test-secret-that-is-at-least-32-chars-long!');
vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');

// Mock Supabase client
const mockSelect = vi.fn();
const mockUpdate = vi.fn();

const mockSupabase = {
  from: vi.fn(() => ({
    update: mockUpdate,
    select: mockSelect,
  })),
};

// Make update chainable
mockUpdate.mockReturnValue({
  eq: vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      select: vi.fn(),
    }),
  }),
});

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => mockSupabase,
}));

describe('POST /api/auth/staff', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    // Reset chain mocks for each test
    mockSupabase.from.mockImplementation(() => ({
      update: mockUpdate,
      select: mockSelect,
    }));
  });

  it('returns 422 if invite_code or name is missing', async () => {
    const { POST } = await import('@/app/api/auth/staff/route');

    const request = new NextRequest('http://localhost:3000/api/auth/staff', {
      method: 'POST',
      body: JSON.stringify({ invite_code: '', name: '' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toBe('Invite code and name are required');
  });

  it('returns 404 for non-existent invite code', async () => {
    // Mock: atomic update returns empty (no rows updated)
    const selectAfterUpdate = vi.fn().mockResolvedValue({
      data: [],
      error: null,
    });
    const eqDeviceRegistered = vi.fn().mockReturnValue({ select: selectAfterUpdate });
    const eqInviteCode = vi.fn().mockReturnValue({ eq: eqDeviceRegistered });
    mockUpdate.mockReturnValue({ eq: eqInviteCode });

    // Mock: existence check returns null (code not found)
    const singleFn = vi.fn().mockResolvedValue({ data: null, error: null });
    const eqCodeCheck = vi.fn().mockReturnValue({ single: singleFn });
    mockSelect.mockReturnValue({ eq: eqCodeCheck });

    // We need more precise mock: first from('staff') is for update, second is for select
    let callCount = 0;
    mockSupabase.from.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return { update: mockUpdate, select: vi.fn() };
      }
      return { select: mockSelect, update: vi.fn() };
    });

    const { POST } = await import('@/app/api/auth/staff/route');

    const request = new NextRequest('http://localhost:3000/api/auth/staff', {
      method: 'POST',
      body: JSON.stringify({ invite_code: 'INVALID123', name: 'Test User' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe('Invalid invite code');
  });

  it('returns 409 for already-used invite code', async () => {
    // Mock: atomic update returns empty (no rows updated)
    const selectAfterUpdate = vi.fn().mockResolvedValue({
      data: [],
      error: null,
    });
    const eqDeviceRegistered = vi.fn().mockReturnValue({ select: selectAfterUpdate });
    const eqInviteCode = vi.fn().mockReturnValue({ eq: eqDeviceRegistered });
    mockUpdate.mockReturnValue({ eq: eqInviteCode });

    // Mock: existence check returns a row with device_registered=true
    const singleFn = vi.fn().mockResolvedValue({
      data: { id: 'staff-1', device_registered: true },
      error: null,
    });
    const eqCodeCheck = vi.fn().mockReturnValue({ single: singleFn });
    mockSelect.mockReturnValue({ eq: eqCodeCheck });

    let callCount = 0;
    mockSupabase.from.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return { update: mockUpdate, select: vi.fn() };
      }
      return { select: mockSelect, update: vi.fn() };
    });

    const { POST } = await import('@/app/api/auth/staff/route');

    const request = new NextRequest('http://localhost:3000/api/auth/staff', {
      method: 'POST',
      body: JSON.stringify({ invite_code: 'USED_CODE', name: 'Test User' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe('Invite code already used');
  });

  it('sets device_registered=true and returns cookie on valid code', async () => {
    // Mock: atomic update succeeds — returns the staff row
    const selectAfterUpdate = vi.fn().mockResolvedValue({
      data: [{ id: 'staff-abc', session_id: 'session-xyz' }],
      error: null,
    });
    const eqDeviceRegistered = vi.fn().mockReturnValue({ select: selectAfterUpdate });
    const eqInviteCode = vi.fn().mockReturnValue({ eq: eqDeviceRegistered });
    mockUpdate.mockReturnValue({ eq: eqInviteCode });

    mockSupabase.from.mockImplementation(() => ({
      update: mockUpdate,
      select: vi.fn(),
    }));

    const { POST } = await import('@/app/api/auth/staff/route');

    const request = new NextRequest('http://localhost:3000/api/auth/staff', {
      method: 'POST',
      body: JSON.stringify({ invite_code: 'VALID_CODE', name: 'Jane Smith' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.staff_id).toBe('staff-abc');
    expect(body.session_id).toBe('session-xyz');

    // Verify the cookie is set
    const setCookieHeader = response.headers.getSetCookie();
    const staffCookie = setCookieHeader.find((c) => c.includes('spin_staff_token'));
    expect(staffCookie).toBeDefined();
    expect(staffCookie?.toLowerCase()).toContain('httponly');
    expect(staffCookie?.toLowerCase()).toContain('secure');
    expect(staffCookie?.toLowerCase()).toContain('samesite=strict');
  });
});

describe('POST /api/claim/fulfill', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns 409 on second fulfill attempt (race condition)', async () => {
    // Setup: mock a valid staff JWT cookie
    const { signStaffJwt } = await import('@/lib/auth/jwt');
    const staffToken = await signStaffJwt({
      staff_id: 'staff-1',
      session_id: 'session-1',
    });

    // Mock participant fetch — found and not yet fulfilled
    const participantSingle = vi.fn().mockResolvedValue({
      data: { id: 'participant-1', session_id: 'session-1', is_fulfilled: false },
      error: null,
    });
    const participantEqId = vi.fn().mockReturnValue({ single: participantSingle });
    const participantSelect = vi.fn().mockReturnValue({ eq: participantEqId });

    // Mock: atomic update returns empty (race condition — already fulfilled by another request)
    const updateSelectFn = vi.fn().mockResolvedValue({
      data: [],
      error: null,
    });
    const updateEqFulfilled = vi.fn().mockReturnValue({ select: updateSelectFn });
    const updateEqId = vi.fn().mockReturnValue({ eq: updateEqFulfilled });
    const updateFn = vi.fn().mockReturnValue({ eq: updateEqId });

    let fromCallCount = 0;
    mockSupabase.from.mockImplementation(() => {
      fromCallCount++;
      if (fromCallCount === 1) {
        // First call: fetch participant
        return { select: participantSelect, update: vi.fn() };
      }
      // Second call: update attempt
      return { update: updateFn, select: vi.fn() };
    });

    const { POST } = await import('@/app/api/claim/fulfill/route');

    const request = new NextRequest('http://localhost:3000/api/claim/fulfill', {
      method: 'POST',
      body: JSON.stringify({ participant_id: 'participant-1' }),
      headers: {
        'Content-Type': 'application/json',
        Cookie: `spin_staff_token=${staffToken}`,
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe('Prize already fulfilled');
  });

  it('returns 200 with fulfilled_at on success', async () => {
    const { signStaffJwt } = await import('@/lib/auth/jwt');
    const staffToken = await signStaffJwt({
      staff_id: 'staff-1',
      session_id: 'session-1',
    });

    // Mock participant fetch
    const participantSingle = vi.fn().mockResolvedValue({
      data: { id: 'participant-1', session_id: 'session-1', is_fulfilled: false },
      error: null,
    });
    const participantEqId = vi.fn().mockReturnValue({ single: participantSingle });
    const participantSelect = vi.fn().mockReturnValue({ eq: participantEqId });

    // Mock: atomic update succeeds
    const updateSelectFn = vi.fn().mockResolvedValue({
      data: [{ id: 'participant-1' }],
      error: null,
    });
    const updateEqFulfilled = vi.fn().mockReturnValue({ select: updateSelectFn });
    const updateEqId = vi.fn().mockReturnValue({ eq: updateEqFulfilled });
    const updateFn = vi.fn().mockReturnValue({ eq: updateEqId });

    let fromCallCount = 0;
    mockSupabase.from.mockImplementation(() => {
      fromCallCount++;
      if (fromCallCount === 1) {
        return { select: participantSelect, update: vi.fn() };
      }
      return { update: updateFn, select: vi.fn() };
    });

    const { POST } = await import('@/app/api/claim/fulfill/route');

    const request = new NextRequest('http://localhost:3000/api/claim/fulfill', {
      method: 'POST',
      body: JSON.stringify({ participant_id: 'participant-1' }),
      headers: {
        'Content-Type': 'application/json',
        Cookie: `spin_staff_token=${staffToken}`,
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.fulfilled_at).toBeDefined();
  });

  it('returns 401 without any cookie', async () => {
    const { POST } = await import('@/app/api/claim/fulfill/route');

    const request = new NextRequest('http://localhost:3000/api/claim/fulfill', {
      method: 'POST',
      body: JSON.stringify({ participant_id: 'participant-1' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });
});

describe('requireStaffOrAdmin middleware', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns 401 with no cookies', async () => {
    const { requireStaffOrAdmin, isStaffOrAdminError } = await import(
      '@/lib/auth/middleware'
    );

    const request = new NextRequest('http://localhost:3000/api/claim/verify/abc', {
      method: 'GET',
    });

    const result = await requireStaffOrAdmin(request);
    expect(isStaffOrAdminError(result)).toBe(true);
    if (isStaffOrAdminError(result)) {
      expect(result.status).toBe(401);
      const body = await result.json();
      expect(body.error).toBe('Authentication required');
    }
  });

  it('returns admin role with valid admin cookie', async () => {
    const { signAdminJwt } = await import('@/lib/auth/jwt');
    const { requireStaffOrAdmin, isStaffOrAdminError } = await import(
      '@/lib/auth/middleware'
    );

    const token = await signAdminJwt({ sub: 'admin-42', username: 'admin' });

    const request = new NextRequest('http://localhost:3000/api/claim/verify/abc', {
      method: 'GET',
      headers: { Cookie: `spin_admin_token=${token}` },
    });

    const result = await requireStaffOrAdmin(request);
    expect(isStaffOrAdminError(result)).toBe(false);
    if (!isStaffOrAdminError(result)) {
      expect(result.role).toBe('admin');
      if (result.role === 'admin') {
        expect(result.adminId).toBe('admin-42');
      }
    }
  });

  it('returns staff role with valid staff cookie', async () => {
    const { signStaffJwt } = await import('@/lib/auth/jwt');
    const { requireStaffOrAdmin, isStaffOrAdminError } = await import(
      '@/lib/auth/middleware'
    );

    const token = await signStaffJwt({
      staff_id: 'staff-99',
      session_id: 'session-55',
    });

    const request = new NextRequest('http://localhost:3000/api/claim/verify/abc', {
      method: 'GET',
      headers: { Cookie: `spin_staff_token=${token}` },
    });

    const result = await requireStaffOrAdmin(request);
    expect(isStaffOrAdminError(result)).toBe(false);
    if (!isStaffOrAdminError(result)) {
      expect(result.role).toBe('staff');
      if (result.role === 'staff') {
        expect(result.staffId).toBe('staff-99');
        expect(result.sessionId).toBe('session-55');
      }
    }
  });

  it('checks admin cookie first even if both are present', async () => {
    const { signAdminJwt, signStaffJwt } = await import('@/lib/auth/jwt');
    const { requireStaffOrAdmin, isStaffOrAdminError } = await import(
      '@/lib/auth/middleware'
    );

    const adminToken = await signAdminJwt({ sub: 'admin-1', username: 'admin' });
    const staffToken = await signStaffJwt({
      staff_id: 'staff-1',
      session_id: 'session-1',
    });

    const request = new NextRequest('http://localhost:3000/api/claim/verify/abc', {
      method: 'GET',
      headers: { Cookie: `spin_admin_token=${adminToken}; spin_staff_token=${staffToken}` },
    });

    const result = await requireStaffOrAdmin(request);
    expect(isStaffOrAdminError(result)).toBe(false);
    if (!isStaffOrAdminError(result)) {
      // Admin takes priority
      expect(result.role).toBe('admin');
    }
  });
});
