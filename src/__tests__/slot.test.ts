import { describe, it, expect, vi, beforeEach } from 'vitest';
// @vitest-environment node
import { NextRequest } from 'next/server';

/**
 * Mock helper for the slot endpoint.
 * The endpoint makes two queries:
 * 1. sessions.select(...).eq('id', sessionId).single()
 * 2. participants.select('id').eq('session_id', sessionId).in('status', [...])
 */
function createMockSupabase(config: {
  sessionLookup: { data: object | null; error: object | null };
  activeCheck?: { data: object[] | null; error: object | null };
}) {
  return {
    from: (table: string) => {
      if (table === 'sessions') {
        return createChainable(config.sessionLookup);
      }
      if (table === 'participants') {
        return createChainableInQuery(config.activeCheck ?? { data: [], error: null });
      }
      return createChainable({ data: null, error: null });
    },
  };
}

function createChainable(resolution: { data: object | null; error: object | null }) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolution);
  return chain;
}

function createChainableInQuery(resolution: { data: object[] | null; error: object | null }) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockResolvedValue(resolution);
  return chain;
}

let mockSupabaseInstance: ReturnType<typeof createMockSupabase>;

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => mockSupabaseInstance,
}));

import { GET } from '@/app/api/queue/slot/route';

function makeRequest(params?: string): NextRequest {
  const url = params
    ? `http://localhost:3000/api/queue/slot?${params}`
    : 'http://localhost:3000/api/queue/slot';
  return new NextRequest(url, { method: 'GET' });
}

describe('GET /api/queue/slot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns slot_occupied=false when no active participants', async () => {
    mockSupabaseInstance = createMockSupabase({
      sessionLookup: {
        data: { id: 's-1', status: 'active', end_time: '2099-01-01T00:00:00Z', queue_enabled: false },
        error: null,
      },
      activeCheck: { data: [], error: null },
    });

    const req = makeRequest('sessionId=s-1');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.slot_occupied).toBe(false);
    expect(data.queue_enabled).toBe(false);
  });

  it('returns slot_occupied=true when active participant exists', async () => {
    mockSupabaseInstance = createMockSupabase({
      sessionLookup: {
        data: { id: 's-1', status: 'active', end_time: '2099-01-01T00:00:00Z', queue_enabled: false },
        error: null,
      },
      activeCheck: { data: [{ id: 'p-active' }], error: null },
    });

    const req = makeRequest('sessionId=s-1');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.slot_occupied).toBe(true);
    expect(data.queue_enabled).toBe(false);
  });

  it('returns slot_occupied=true when spinning participant exists', async () => {
    mockSupabaseInstance = createMockSupabase({
      sessionLookup: {
        data: { id: 's-1', status: 'active', end_time: '2099-01-01T00:00:00Z', queue_enabled: false },
        error: null,
      },
      activeCheck: { data: [{ id: 'p-spinning' }], error: null },
    });

    const req = makeRequest('sessionId=s-1');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.slot_occupied).toBe(true);
  });

  it('returns 422 when sessionId is missing', async () => {
    const req = makeRequest();
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(422);
    expect(data.error).toBe('sessionId query parameter is required');
  });

  it('returns 404 when session not found', async () => {
    mockSupabaseInstance = createMockSupabase({
      sessionLookup: { data: null, error: { code: 'PGRST116', message: 'not found' } },
    });

    const req = makeRequest('sessionId=nonexistent');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toBe('Session not found');
  });

  it('returns queue_enabled=false for walk-up session', async () => {
    mockSupabaseInstance = createMockSupabase({
      sessionLookup: {
        data: { id: 's-1', status: 'active', end_time: '2099-01-01T00:00:00Z', queue_enabled: false },
        error: null,
      },
      activeCheck: { data: [], error: null },
    });

    const req = makeRequest('sessionId=s-1');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.queue_enabled).toBe(false);
  });

  it('returns queue_enabled=true for queue-mode session', async () => {
    mockSupabaseInstance = createMockSupabase({
      sessionLookup: {
        data: { id: 's-2', status: 'active', end_time: '2099-01-01T00:00:00Z', queue_enabled: true },
        error: null,
      },
      activeCheck: { data: [], error: null },
    });

    const req = makeRequest('sessionId=s-2');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.queue_enabled).toBe(true);
  });

  it('returns slot_occupied=false for inactive session (draft)', async () => {
    mockSupabaseInstance = createMockSupabase({
      sessionLookup: {
        data: { id: 's-3', status: 'draft', end_time: '2099-01-01T00:00:00Z', queue_enabled: false },
        error: null,
      },
    });

    const req = makeRequest('sessionId=s-3');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.slot_occupied).toBe(false);
    expect(data.queue_enabled).toBe(false);
  });
});
