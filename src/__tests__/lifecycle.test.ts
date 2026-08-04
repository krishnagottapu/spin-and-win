import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── queueManager.promoteNextParticipant: auto-end tests ─────────────────────

describe('promoteNextParticipant — session lifecycle', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('transitions session to ended when no queued participants and session is ending', async () => {
    const mockBroadcastEvent = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@/lib/supabase/realtime', () => ({
      broadcastEvent: mockBroadcastEvent,
    }));

    const { promoteNextParticipant } = await import('@/lib/game/queueManager');

    const mockUpdateFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    let callCount = 0;
    const mockSupabase = {
      from: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Select next queued — returns none
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      single: vi.fn().mockResolvedValue({
                        data: null,
                        error: { code: 'PGRST116' },
                      }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        // Update session status to ended
        return {
          update: mockUpdateFn,
        };
      }),
    };

    const result = await promoteNextParticipant(
      mockSupabase as unknown as Parameters<typeof promoteNextParticipant>[0],
      'session-123',
      'ending'
    );

    expect(result.promoted).toBeNull();
    expect(result.sessionEnded).toBe(true);

    // Verify session was updated to 'ended'
    expect(mockSupabase.from).toHaveBeenCalledWith('sessions');
    expect(mockUpdateFn).toHaveBeenCalledWith({ status: 'ended' });

    // Verify broadcast was called with correct event
    expect(mockBroadcastEvent).toHaveBeenCalledWith(
      'session-123',
      'session:ended',
      { reason: 'queue_drained' }
    );
  });

  it('does NOT end session when no queued participants and session is active', async () => {
    const mockBroadcastEvent = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@/lib/supabase/realtime', () => ({
      broadcastEvent: mockBroadcastEvent,
    }));

    const { promoteNextParticipant } = await import('@/lib/game/queueManager');

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: null,
                    error: { code: 'PGRST116' },
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    };

    const result = await promoteNextParticipant(
      mockSupabase as unknown as Parameters<typeof promoteNextParticipant>[0],
      'session-123',
      'active'
    );

    expect(result.promoted).toBeNull();
    expect(result.sessionEnded).toBe(false);

    // broadcastEvent should NOT have been called
    expect(mockBroadcastEvent).not.toHaveBeenCalled();
  });

  it('promotes next participant without ending session even when status is ending', async () => {
    const mockBroadcastEvent = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@/lib/supabase/realtime', () => ({
      broadcastEvent: mockBroadcastEvent,
    }));

    const { promoteNextParticipant } = await import('@/lib/game/queueManager');

    const nextParticipant = {
      id: 'p-next',
      session_id: 'session-123',
      name: 'Charlie',
      phone: '+13035559999',
      status: 'active',
      queue_position: 3,
      prize_id: null,
      result_token: null,
      spins_used: 0,
      is_fulfilled: false,
      fulfilled_by: null,
      fulfilled_at: null,
      spin_started_at: null,
      spin_completed_at: null,
      joined_at: '2026-08-03T10:00:00Z',
    };

    let callCount = 0;
    const mockSupabase = {
      from: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Select next queued — returns a participant
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      single: vi.fn().mockResolvedValue({
                        data: { ...nextParticipant, status: 'queued' },
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        // Update participant status to active
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: nextParticipant,
                  error: null,
                }),
              }),
            }),
          }),
        };
      }),
    };

    const result = await promoteNextParticipant(
      mockSupabase as unknown as Parameters<typeof promoteNextParticipant>[0],
      'session-123',
      'ending'
    );

    expect(result.promoted).not.toBeNull();
    expect(result.promoted?.id).toBe('p-next');
    expect(result.sessionEnded).toBe(false);

    // Session should NOT be ended since there was a participant to promote
    expect(mockBroadcastEvent).not.toHaveBeenCalled();
  });
});

// ─── POST /api/sessions/[id]/end: queued participants marked completed ───────

describe('POST /api/sessions/[id]/end', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('marks all queued participants as completed and broadcasts session:ended', async () => {
    const mockBroadcastEvent = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@/lib/supabase/realtime', () => ({
      broadcastEvent: mockBroadcastEvent,
    }));

    const mockUpdateSession = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    const mockUpdateParticipants = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    });

    let fromCallCount = 0;
    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        fromCallCount++;
        if (table === 'sessions' && fromCallCount === 1) {
          // First call: select session
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'session-1', status: 'active' },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'sessions' && fromCallCount === 2) {
          // Second call: update session status
          return { update: mockUpdateSession };
        }
        if (table === 'participants') {
          // Third call: update participants
          return { update: mockUpdateParticipants };
        }
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) };
      }),
    };

    vi.doMock('@/lib/supabase/server', () => ({
      createServiceClient: () => mockSupabase,
    }));

    vi.doMock('@/lib/auth/middleware', () => ({
      requireAdmin: vi.fn().mockResolvedValue({
        sub: 'admin-1',
        username: 'admin',
        role: 'admin',
        iat: 0,
        exp: 0,
      }),
      isAuthError: vi.fn().mockReturnValue(false),
    }));

    const { POST } = await import(
      '@/app/api/sessions/[id]/end/route'
    );

    const request = new NextRequest('http://localhost/api/sessions/session-1/end', {
      method: 'POST',
    });

    const response = await POST(request, { params: { id: 'session-1' } });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    // Verify session was updated to 'ended'
    expect(mockUpdateSession).toHaveBeenCalledWith({ status: 'ended' });

    // Verify queued participants were set to 'completed'
    expect(mockUpdateParticipants).toHaveBeenCalledWith({ status: 'completed' });

    // Verify broadcast was called with session:ended and reason='manual'
    expect(mockBroadcastEvent).toHaveBeenCalledWith(
      'session-1',
      'session:ended',
      { reason: 'manual' }
    );
  });

  it('returns 404 when session does not exist', async () => {
    vi.doMock('@/lib/supabase/realtime', () => ({
      broadcastEvent: vi.fn().mockResolvedValue(undefined),
    }));

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116' },
            }),
          }),
        }),
      }),
    };

    vi.doMock('@/lib/supabase/server', () => ({
      createServiceClient: () => mockSupabase,
    }));

    vi.doMock('@/lib/auth/middleware', () => ({
      requireAdmin: vi.fn().mockResolvedValue({
        sub: 'admin-1',
        username: 'admin',
        role: 'admin',
        iat: 0,
        exp: 0,
      }),
      isAuthError: vi.fn().mockReturnValue(false),
    }));

    const { POST } = await import(
      '@/app/api/sessions/[id]/end/route'
    );

    const request = new NextRequest('http://localhost/api/sessions/nonexistent/end', {
      method: 'POST',
    });

    const response = await POST(request, { params: { id: 'nonexistent' } });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('Session not found');
  });

  it('returns 422 when session is already ended', async () => {
    vi.doMock('@/lib/supabase/realtime', () => ({
      broadcastEvent: vi.fn().mockResolvedValue(undefined),
    }));

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'session-1', status: 'ended' },
              error: null,
            }),
          }),
        }),
      }),
    };

    vi.doMock('@/lib/supabase/server', () => ({
      createServiceClient: () => mockSupabase,
    }));

    vi.doMock('@/lib/auth/middleware', () => ({
      requireAdmin: vi.fn().mockResolvedValue({
        sub: 'admin-1',
        username: 'admin',
        role: 'admin',
        iat: 0,
        exp: 0,
      }),
      isAuthError: vi.fn().mockReturnValue(false),
    }));

    const { POST } = await import(
      '@/app/api/sessions/[id]/end/route'
    );

    const request = new NextRequest('http://localhost/api/sessions/session-1/end', {
      method: 'POST',
    });

    const response = await POST(request, { params: { id: 'session-1' } });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toBe('Session is already ended');
  });

  it('returns 401 when no admin JWT is present', async () => {
    vi.doMock('@/lib/supabase/realtime', () => ({
      broadcastEvent: vi.fn().mockResolvedValue(undefined),
    }));

    vi.doMock('@/lib/supabase/server', () => ({
      createServiceClient: vi.fn(),
    }));

    const { NextResponse } = await import('next/server');
    const unauthorizedResponse = NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );

    vi.doMock('@/lib/auth/middleware', () => ({
      requireAdmin: vi.fn().mockResolvedValue(unauthorizedResponse),
      isAuthError: vi.fn().mockReturnValue(true),
    }));

    const { POST } = await import(
      '@/app/api/sessions/[id]/end/route'
    );

    const request = new NextRequest('http://localhost/api/sessions/session-1/end', {
      method: 'POST',
    });

    const response = await POST(request, { params: { id: 'session-1' } });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Authentication required');
  });
});


// ─── Integration-style test: full lifecycle ──────────────────────────────────

describe('Full lifecycle: join → spin → complete → session auto-ends (ending status)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('auto-ends session when last player spins in ending session', async () => {
    const mockBroadcastEvent = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@/lib/supabase/realtime', () => ({
      broadcastEvent: mockBroadcastEvent,
    }));

    const { promoteNextParticipant } = await import('@/lib/game/queueManager');

    // Scenario: Session is 'ending', one participant just spun (completed).
    // promoteNextParticipant is called to find the next player.
    // There are no queued participants remaining.
    // Expected: session transitions to 'ended', broadcasts session:ended with reason='queue_drained'

    const mockUpdateFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    let callCount = 0;
    const mockSupabase = {
      from: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Query for next queued participant — none exist (queue drained)
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      single: vi.fn().mockResolvedValue({
                        data: null,
                        error: { code: 'PGRST116' },
                      }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        // Update session status to 'ended'
        return { update: mockUpdateFn };
      }),
    };

    const result = await promoteNextParticipant(
      mockSupabase as unknown as Parameters<typeof promoteNextParticipant>[0],
      'session-ending',
      'ending'
    );

    // Verify the session auto-ended
    expect(result.promoted).toBeNull();
    expect(result.sessionEnded).toBe(true);

    // Verify DB update was called
    expect(mockUpdateFn).toHaveBeenCalledWith({ status: 'ended' });

    // Verify broadcast with correct reason
    expect(mockBroadcastEvent).toHaveBeenCalledWith(
      'session-ending',
      'session:ended',
      { reason: 'queue_drained' }
    );
  });

  it('does NOT auto-end when session is active and queue is empty', async () => {
    const mockBroadcastEvent = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@/lib/supabase/realtime', () => ({
      broadcastEvent: mockBroadcastEvent,
    }));

    const { promoteNextParticipant } = await import('@/lib/game/queueManager');

    // Scenario: Session is 'active', queue is empty after a spin.
    // Expected: session stays active (waiting for more joins), no broadcast
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: null,
                    error: { code: 'PGRST116' },
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    };

    const result = await promoteNextParticipant(
      mockSupabase as unknown as Parameters<typeof promoteNextParticipant>[0],
      'session-active',
      'active'
    );

    expect(result.promoted).toBeNull();
    expect(result.sessionEnded).toBe(false);
    expect(mockBroadcastEvent).not.toHaveBeenCalled();
  });
});
