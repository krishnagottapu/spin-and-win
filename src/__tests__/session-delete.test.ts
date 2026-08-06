// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// Mock broadcastEvent
vi.mock('@/lib/supabase/broadcast', () => ({
  broadcastEvent: vi.fn().mockResolvedValue(undefined),
}));

// Mock auth middleware — default to authenticated admin
vi.mock('@/lib/auth/middleware', () => ({
  requireAdmin: vi.fn().mockResolvedValue({
    sub: 'admin-1',
    username: 'admin',
    role: 'admin',
    iat: 0,
    exp: 0,
  }),
  isAuthError: vi.fn().mockReturnValue(false),
}));

/**
 * Creates a mock Supabase client for DELETE endpoint tests.
 * The DELETE handler does:
 *   1. from('sessions').select('id, status').eq('id', id).single() → session lookup
 *   2. from('sessions').delete().eq('id', id) → cascade delete
 */
function createDeleteMockSupabase(config: {
  sessionLookup: { data: object | null; error: object | null };
  deleteResult?: { error: object | null };
}) {
  let callCount = 0;

  return {
    from: (table: string) => {
      if (table === 'sessions') {
        callCount++;
        if (callCount === 1) {
          // First call: select session lookup
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue(config.sessionLookup),
              }),
            }),
          };
        }
        // Second call: delete
        return {
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue(config.deleteResult ?? { error: null }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      };
    },
  };
}

let mockSupabaseInstance: ReturnType<typeof createDeleteMockSupabase>;

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => mockSupabaseInstance,
}));

import { DELETE } from '@/app/api/sessions/[id]/route';
import { requireAdmin, isAuthError } from '@/lib/auth/middleware';

function makeDeleteRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/sessions/${id}`, {
    method: 'DELETE',
  });
}

describe('DELETE /api/sessions/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to default authenticated admin
    vi.mocked(requireAdmin).mockResolvedValue({
      sub: 'admin-1',
      username: 'admin',
      role: 'admin',
      iat: 0,
      exp: 0,
    });
    vi.mocked(isAuthError).mockReturnValue(false);
  });

  it('returns 401 when no valid admin JWT is present', async () => {
    const unauthorizedResponse = NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
    vi.mocked(requireAdmin).mockResolvedValue(unauthorizedResponse);
    vi.mocked(isAuthError).mockReturnValue(true);

    const req = makeDeleteRequest('session-1');
    const res = await DELETE(req, { params: { id: 'session-1' } });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('Authentication required');
  });

  it('returns 404 when session does not exist', async () => {
    mockSupabaseInstance = createDeleteMockSupabase({
      sessionLookup: { data: null, error: { code: 'PGRST116', message: 'not found' } },
    });

    const req = makeDeleteRequest('nonexistent-id');
    const res = await DELETE(req, { params: { id: 'nonexistent-id' } });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe('Session not found');
  });

  it('returns 403 when session status is draft', async () => {
    mockSupabaseInstance = createDeleteMockSupabase({
      sessionLookup: { data: { id: 'session-1', status: 'draft' }, error: null },
    });

    const req = makeDeleteRequest('session-1');
    const res = await DELETE(req, { params: { id: 'session-1' } });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe('Session can only be deleted after it has ended');
  });

  it('returns 403 when session status is active', async () => {
    mockSupabaseInstance = createDeleteMockSupabase({
      sessionLookup: { data: { id: 'session-1', status: 'active' }, error: null },
    });

    const req = makeDeleteRequest('session-1');
    const res = await DELETE(req, { params: { id: 'session-1' } });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe('Session can only be deleted after it has ended');
  });

  it('returns 403 when session status is ending', async () => {
    mockSupabaseInstance = createDeleteMockSupabase({
      sessionLookup: { data: { id: 'session-1', status: 'ending' }, error: null },
    });

    const req = makeDeleteRequest('session-1');
    const res = await DELETE(req, { params: { id: 'session-1' } });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe('Session can only be deleted after it has ended');
  });

  it('returns 403 when session status is paused', async () => {
    mockSupabaseInstance = createDeleteMockSupabase({
      sessionLookup: { data: { id: 'session-1', status: 'paused' }, error: null },
    });

    const req = makeDeleteRequest('session-1');
    const res = await DELETE(req, { params: { id: 'session-1' } });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe('Session can only be deleted after it has ended');
  });

  it('returns 200 and calls supabase.delete when session status is ended', async () => {
    mockSupabaseInstance = createDeleteMockSupabase({
      sessionLookup: { data: { id: 'session-1', status: 'ended' }, error: null },
      deleteResult: { error: null },
    });

    const req = makeDeleteRequest('session-1');
    const res = await DELETE(req, { params: { id: 'session-1' } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 500 when DB delete fails', async () => {
    mockSupabaseInstance = createDeleteMockSupabase({
      sessionLookup: { data: { id: 'session-1', status: 'ended' }, error: null },
      deleteResult: { error: { message: 'FK constraint violation' } },
    });

    const req = makeDeleteRequest('session-1');
    const res = await DELETE(req, { params: { id: 'session-1' } });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe('Failed to delete session');
  });
});

// ─── PATCH /api/sessions/[id] — broadcast on session:ended transition ─────────

describe('PATCH /api/sessions/[id] — session:ended broadcast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockResolvedValue({
      sub: 'admin-1',
      username: 'admin',
      role: 'admin',
      iat: 0,
      exp: 0,
    });
    vi.mocked(isAuthError).mockReturnValue(false);
  });

  it('broadcasts session:ended with reason "manual" when transitioning to ended', async () => {
    // PATCH handler does:
    // 1. from('sessions').select('id, status').eq('id', id).single() → get current status
    // 2. from('sessions').update({ status: 'ended' }).eq('id', id).select().single() → update
    // 3. broadcastEvent(id, 'session:ended', { reason: 'manual' })
    let callCount = 0;
    const mockSupabase = {
      from: (table: string) => {
        if (table === 'sessions') {
          callCount++;
          if (callCount === 1) {
            // First: select current session (status: ending → can transition to ended)
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'session-1', status: 'ending' },
                    error: null,
                  }),
                }),
              }),
            };
          }
          // Second: update session
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'session-1', status: 'ended' },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        };
      },
    };

    mockSupabaseInstance = mockSupabase as unknown as ReturnType<typeof createDeleteMockSupabase>;

    const { PATCH } = await import('@/app/api/sessions/[id]/route');
    const { broadcastEvent } = await import('@/lib/supabase/broadcast');

    const req = new NextRequest('http://localhost:3000/api/sessions/session-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ended' }),
    });

    const res = await PATCH(req, { params: { id: 'session-1' } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.session.status).toBe('ended');
    expect(broadcastEvent).toHaveBeenCalledWith(
      'session-1',
      'session:ended',
      { reason: 'manual' }
    );
  });

  it('does NOT broadcast session:ended when transitioning to a non-ended status', async () => {
    let callCount = 0;
    const mockSupabase = {
      from: (table: string) => {
        if (table === 'sessions') {
          callCount++;
          if (callCount === 1) {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'session-1', status: 'draft' },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'session-1', status: 'active' },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        };
      },
    };

    mockSupabaseInstance = mockSupabase as unknown as ReturnType<typeof createDeleteMockSupabase>;

    const { PATCH } = await import('@/app/api/sessions/[id]/route');
    const { broadcastEvent } = await import('@/lib/supabase/broadcast');

    const req = new NextRequest('http://localhost:3000/api/sessions/session-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    });

    const res = await PATCH(req, { params: { id: 'session-1' } });

    expect(res.status).toBe(200);
    expect(broadcastEvent).not.toHaveBeenCalled();
  });
});
