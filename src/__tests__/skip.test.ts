import { describe, it, expect, vi, beforeEach } from 'vitest';
// @vitest-environment node
import { NextRequest } from 'next/server';

// ─── Mock: broadcastEvent ─────────────────────────────────────────────────────
const mockBroadcastEvent = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/supabase/broadcast', () => ({
  broadcastEvent: (...args: unknown[]) => mockBroadcastEvent(...args),
}));

// ─── Mock: promoteNextParticipant and getQueuePositions ───────────────────────
const mockPromoteNextParticipant = vi.fn().mockResolvedValue({ promoted: null, sessionEnded: false });
const mockGetQueuePositions = vi.fn().mockResolvedValue([]);
vi.mock('@/lib/game/queueManager', () => ({
  promoteNextParticipant: (...args: unknown[]) => mockPromoteNextParticipant(...args),
  getQueuePositions: (...args: unknown[]) => mockGetQueuePositions(...args),
}));

// ─── Mock: requireAdmin and isAuthError ───────────────────────────────────────
const mockRequireAdmin = vi.fn();
vi.mock('@/lib/auth/middleware', () => ({
  requireAdmin: (...args: unknown[]) => mockRequireAdmin(...args),
  isAuthError: (result: unknown) => result instanceof Response || (result && typeof result === 'object' && 'status' in result && typeof (result as { json?: unknown }).json === 'function'),
}));

/**
 * Helper to create a chainable mock for the skip route's supabase queries.
 * The skip route performs these calls in order:
 *   1. sessions.select().eq(id).eq(tv_token).single() — tv_token auth check
 *   2. sessions.select().eq(id).single() — session validation
 *   3. participants.select(*).eq(session_id).eq(status,'active').limit(1).single() — find active player
 *   4. supabase.rpc('requeue_skipped_participant', ...) — atomic requeue
 */
function createMockSupabase(config: {
  tokenLookup?: { data: object | null; error: object | null };
  sessionLookup: { data: object | null; error: object | null };
  activePlayer?: { data: object | null; error: object | null };
  rpcResult?: { data: number | null; error: object | null };
}) {
  let sessionCallIndex = 0;

  return {
    from: (table: string) => {
      if (table === 'sessions') {
        sessionCallIndex++;
        if (sessionCallIndex === 1 && config.tokenLookup) {
          // tv_token auth check
          return createChainable(config.tokenLookup);
        }
        if (sessionCallIndex === 1 && !config.tokenLookup) {
          // No tv_token auth — first sessions call is session validation
          return createChainable(config.sessionLookup);
        }
        // Second sessions call is session validation (after tv_token auth)
        return createChainable(config.sessionLookup);
      }
      if (table === 'participants') {
        return createChainableWithLimit(config.activePlayer ?? { data: null, error: { code: 'PGRST116' } });
      }
      return createChainable({ data: null, error: null });
    },
    rpc: vi.fn().mockResolvedValue(config.rpcResult ?? { data: 5, error: null }),
  };
}

function createChainable(resolution: { data: object | null; error: object | null }) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolution);
  return chain;
}

function createChainableWithLimit(resolution: { data: object | null; error: object | null }) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolution);
  return chain;
}

let mockSupabaseInstance: ReturnType<typeof createMockSupabase>;

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => mockSupabaseInstance,
}));

import { POST } from '@/app/api/queue/skip/route';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeRequest(body: object, _options?: { adminCookie?: string }): NextRequest {
  const req = new NextRequest('http://localhost:3000/api/queue/skip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  // NextRequest doesn't support cookies in constructor directly in test env,
  // but requireAdmin reads from request.cookies — we mock requireAdmin instead
  return req;
}

const activeSession = {
  id: 'session-uuid-1',
  status: 'active',
};

const activePlayer = {
  id: 'participant-uuid-1',
  session_id: 'session-uuid-1',
  name: 'Alice',
  phone: '+13035551234',
  status: 'active',
  queue_position: 1,
  skip_count: 0,
  activated_at: new Date().toISOString(),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/queue/skip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({ sub: 'admin-1', username: 'admin', role: 'admin' });
    mockPromoteNextParticipant.mockResolvedValue({ promoted: null, sessionEnded: false });
    mockGetQueuePositions.mockResolvedValue([]);
  });

  // ─── 1. Unauthenticated request ──────────────────────────────────────────────

  describe('Authentication', () => {
    it('returns 401 when no tv_token and no admin JWT', async () => {
      // We need a NextResponse for the isAuthError check
      const { NextResponse: NR } = await import('next/server');
      const nextAuthResponse = NR.json({ error: 'Authentication required' }, { status: 401 });
      mockRequireAdmin.mockResolvedValue(nextAuthResponse);

      mockSupabaseInstance = createMockSupabase({
        sessionLookup: { data: activeSession, error: null },
      });

      const req = makeRequest({
        session_id: 'session-uuid-1',
        reason: 'admin',
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.error).toBe('Authentication required');
    });

    it('returns 401 when tv_token does not match session', async () => {
      mockSupabaseInstance = createMockSupabase({
        tokenLookup: { data: null, error: { code: 'PGRST116', message: 'not found' } },
        sessionLookup: { data: activeSession, error: null },
      });

      const req = makeRequest({
        session_id: 'session-uuid-1',
        tv_token: 'invalid-token',
        reason: 'timeout',
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.error).toBe('Authentication required');
    });
  });

  // ─── 2. Valid timeout skip with tv_token ──────────────────────────────────────

  describe('TV token skip (timeout)', () => {
    it('succeeds and re-queues player at back with incremented skip_count', async () => {
      mockSupabaseInstance = createMockSupabase({
        tokenLookup: { data: { id: 'session-uuid-1' }, error: null },
        sessionLookup: { data: activeSession, error: null },
        activePlayer: { data: activePlayer, error: null },
        rpcResult: { data: 5, error: null },
      });

      const req = makeRequest({
        session_id: 'session-uuid-1',
        tv_token: 'valid-tv-token',
        reason: 'timeout',
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.skipped).toEqual({
        participant_id: 'participant-uuid-1',
        name: 'Alice',
        new_position: 5,
      });
      // Verify RPC was called with correct participant ID
      expect(mockSupabaseInstance.rpc).toHaveBeenCalledWith('requeue_skipped_participant', {
        p_participant_id: 'participant-uuid-1',
      });
    });

    it('broadcasts player:skipped event', async () => {
      mockSupabaseInstance = createMockSupabase({
        tokenLookup: { data: { id: 'session-uuid-1' }, error: null },
        sessionLookup: { data: activeSession, error: null },
        activePlayer: { data: activePlayer, error: null },
        rpcResult: { data: 5, error: null },
      });

      const req = makeRequest({
        session_id: 'session-uuid-1',
        tv_token: 'valid-tv-token',
        reason: 'timeout',
      });

      await POST(req);

      expect(mockBroadcastEvent).toHaveBeenCalledWith(
        'session-uuid-1',
        'player:skipped',
        {
          participant_id: 'participant-uuid-1',
          name: 'Alice',
          reason: 'timeout',
        }
      );
    });

    it('broadcasts queue:updated event', async () => {
      const positions = [
        { id: 'p-2', position: 1 },
        { id: 'participant-uuid-1', position: 5 },
      ];
      mockGetQueuePositions.mockResolvedValue(positions);

      mockSupabaseInstance = createMockSupabase({
        tokenLookup: { data: { id: 'session-uuid-1' }, error: null },
        sessionLookup: { data: activeSession, error: null },
        activePlayer: { data: activePlayer, error: null },
        rpcResult: { data: 5, error: null },
      });

      const req = makeRequest({
        session_id: 'session-uuid-1',
        tv_token: 'valid-tv-token',
        reason: 'timeout',
      });

      await POST(req);

      expect(mockBroadcastEvent).toHaveBeenCalledWith(
        'session-uuid-1',
        'queue:updated',
        { positions }
      );
    });
  });

  // ─── 3. Admin skip with valid JWT ────────────────────────────────────────────

  describe('Admin skip', () => {
    it('succeeds with valid admin JWT (no tv_token)', async () => {
      mockRequireAdmin.mockResolvedValue({ sub: 'admin-1', username: 'admin', role: 'admin' });

      mockSupabaseInstance = createMockSupabase({
        sessionLookup: { data: activeSession, error: null },
        activePlayer: { data: activePlayer, error: null },
        rpcResult: { data: 3, error: null },
      });

      const req = makeRequest({
        session_id: 'session-uuid-1',
        reason: 'admin',
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.skipped).toEqual({
        participant_id: 'participant-uuid-1',
        name: 'Alice',
        new_position: 3,
      });
      expect(mockRequireAdmin).toHaveBeenCalled();
    });
  });

  // ─── 4. No active player → 404 ──────────────────────────────────────────────

  describe('No active player', () => {
    it('returns 404 when no active player exists (admin skip)', async () => {
      mockRequireAdmin.mockResolvedValue({ sub: 'admin-1', username: 'admin', role: 'admin' });

      mockSupabaseInstance = createMockSupabase({
        sessionLookup: { data: activeSession, error: null },
        activePlayer: { data: null, error: { code: 'PGRST116', message: 'not found' } },
      });

      const req = makeRequest({
        session_id: 'session-uuid-1',
        reason: 'admin',
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toBe('No active player to skip');
    });

    it('returns 200 already_processed when no active player but participant_id provided', async () => {
      mockRequireAdmin.mockResolvedValue({ sub: 'admin-1', username: 'admin', role: 'admin' });

      mockSupabaseInstance = createMockSupabase({
        sessionLookup: { data: activeSession, error: null },
        activePlayer: { data: null, error: { code: 'PGRST116', message: 'not found' } },
      });

      const req = makeRequest({
        session_id: 'session-uuid-1',
        participant_id: 'participant-uuid-1',
        reason: 'timeout',
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.skipped).toBeNull();
      expect(data.reason).toBe('already_processed');
    });
  });

  // ─── 5. Idempotency — participant_id mismatch ────────────────────────────────

  describe('Idempotency', () => {
    it('returns 200 already_processed when participant_id does not match active player', async () => {
      mockRequireAdmin.mockResolvedValue({ sub: 'admin-1', username: 'admin', role: 'admin' });

      // Active player has a different ID than the one specified
      const differentPlayer = { ...activePlayer, id: 'participant-uuid-2', name: 'Bob' };

      mockSupabaseInstance = createMockSupabase({
        sessionLookup: { data: activeSession, error: null },
        activePlayer: { data: differentPlayer, error: null },
      });

      const req = makeRequest({
        session_id: 'session-uuid-1',
        participant_id: 'participant-uuid-1', // Targeting original player, but Bob is now active
        reason: 'timeout',
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.skipped).toBeNull();
      expect(data.reason).toBe('already_processed');
    });

    it('returns 200 already_processed when RPC returns -1', async () => {
      mockSupabaseInstance = createMockSupabase({
        tokenLookup: { data: { id: 'session-uuid-1' }, error: null },
        sessionLookup: { data: activeSession, error: null },
        activePlayer: { data: activePlayer, error: null },
        rpcResult: { data: -1, error: null },
      });

      const req = makeRequest({
        session_id: 'session-uuid-1',
        tv_token: 'valid-tv-token',
        reason: 'timeout',
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.skipped).toBeNull();
      expect(data.reason).toBe('already_processed');
    });
  });

  // ─── 6. Broadcasts and promotion ────────────────────────────────────────────

  describe('Broadcasts and promotion', () => {
    it('calls promoteNextParticipant after skip', async () => {
      mockSupabaseInstance = createMockSupabase({
        tokenLookup: { data: { id: 'session-uuid-1' }, error: null },
        sessionLookup: { data: activeSession, error: null },
        activePlayer: { data: activePlayer, error: null },
        rpcResult: { data: 5, error: null },
      });

      const req = makeRequest({
        session_id: 'session-uuid-1',
        tv_token: 'valid-tv-token',
        reason: 'timeout',
      });

      await POST(req);

      expect(mockPromoteNextParticipant).toHaveBeenCalledWith(
        mockSupabaseInstance,
        'session-uuid-1',
        'active'
      );
    });

    it('broadcasts player:active when next player is promoted', async () => {
      const promotedPlayer = {
        id: 'participant-uuid-2',
        name: 'Bob',
        queue_position: 2,
        status: 'active',
      };
      mockPromoteNextParticipant.mockResolvedValue({ promoted: promotedPlayer, sessionEnded: false });

      mockSupabaseInstance = createMockSupabase({
        tokenLookup: { data: { id: 'session-uuid-1' }, error: null },
        sessionLookup: { data: activeSession, error: null },
        activePlayer: { data: activePlayer, error: null },
        rpcResult: { data: 5, error: null },
      });

      const req = makeRequest({
        session_id: 'session-uuid-1',
        tv_token: 'valid-tv-token',
        reason: 'timeout',
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.promoted).toEqual({
        participant_id: 'participant-uuid-2',
        name: 'Bob',
      });

      expect(mockBroadcastEvent).toHaveBeenCalledWith(
        'session-uuid-1',
        'player:active',
        {
          participant_id: 'participant-uuid-2',
          name: 'Bob',
          position: 2,
        }
      );
    });

    it('does not broadcast player:active when no next player to promote', async () => {
      mockPromoteNextParticipant.mockResolvedValue({ promoted: null, sessionEnded: false });

      mockSupabaseInstance = createMockSupabase({
        tokenLookup: { data: { id: 'session-uuid-1' }, error: null },
        sessionLookup: { data: activeSession, error: null },
        activePlayer: { data: activePlayer, error: null },
        rpcResult: { data: 5, error: null },
      });

      const req = makeRequest({
        session_id: 'session-uuid-1',
        tv_token: 'valid-tv-token',
        reason: 'timeout',
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.promoted).toBeNull();

      // player:skipped and queue:updated should be called, but NOT player:active
      const playerActiveCalls = mockBroadcastEvent.mock.calls.filter(
        (call) => call[1] === 'player:active'
      );
      expect(playerActiveCalls).toHaveLength(0);
    });
  });

  // ─── 7. Validation ──────────────────────────────────────────────────────────

  describe('Validation', () => {
    it('returns 422 when session_id is missing', async () => {
      const req = makeRequest({
        reason: 'admin',
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(422);
      expect(data.error).toBe('session_id is required');
    });

    it('returns 404 when session does not exist', async () => {
      mockRequireAdmin.mockResolvedValue({ sub: 'admin-1', username: 'admin', role: 'admin' });

      mockSupabaseInstance = createMockSupabase({
        sessionLookup: { data: null, error: { code: 'PGRST116', message: 'not found' } },
      });

      const req = makeRequest({
        session_id: 'nonexistent-session',
        reason: 'admin',
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toBe('Session not found');
    });

    it('returns 422 when session is not active', async () => {
      mockRequireAdmin.mockResolvedValue({ sub: 'admin-1', username: 'admin', role: 'admin' });

      mockSupabaseInstance = createMockSupabase({
        sessionLookup: { data: { id: 'session-uuid-1', status: 'draft' }, error: null },
      });

      const req = makeRequest({
        session_id: 'session-uuid-1',
        reason: 'admin',
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(422);
      expect(data.error).toBe('Session is not active');
    });

    it('returns 500 when RPC returns an error', async () => {
      mockRequireAdmin.mockResolvedValue({ sub: 'admin-1', username: 'admin', role: 'admin' });

      mockSupabaseInstance = createMockSupabase({
        sessionLookup: { data: activeSession, error: null },
        activePlayer: { data: activePlayer, error: null },
        rpcResult: { data: null, error: { message: 'function failed' } },
      });

      const req = makeRequest({
        session_id: 'session-uuid-1',
        reason: 'admin',
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error).toBe('Failed to skip participant');
    });
  });
});
