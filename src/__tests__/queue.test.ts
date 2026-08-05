import { describe, it, expect, vi, beforeEach } from 'vitest';
// @vitest-environment node
import { NextRequest } from 'next/server';

// Mock broadcastEvent so tests don't need a real Supabase channel
vi.mock('@/lib/supabase/broadcast', () => ({
  broadcastEvent: vi.fn().mockResolvedValue(undefined),
}));

/**
 * Helper to create a chainable mock that resolves specific queries.
 * Each call to `from(table)` returns a builder that tracks .eq(), .in(), .select(), etc.
 * We configure the final resolution (single / resolved value) per scenario.
 */
function createMockSupabase(config: {
  sessionLookup: { data: object | null; error: object | null };
  phoneCheck?: { data: object | null; error: object | null };
  maxPosition?: { data: object | null; error: object | null };
  activeCheck?: { data: object[] | null; error: object | null };
  insert?: { data: object | null; error: object | null };
  queuePositions?: { data: object[] | null; error: object | null };
}) {
  let participantCallIndex = 0;

  return {
    from: (table: string) => {
      if (table === 'sessions') {
        return createChainable(config.sessionLookup);
      }
      if (table === 'participants') {
        participantCallIndex++;
        switch (participantCallIndex) {
          case 1: // Phone uniqueness check
            return createChainable(config.phoneCheck ?? { data: null, error: { code: 'PGRST116' } });
          case 2: // Max queue position
            return createChainableWithOrder(config.maxPosition ?? { data: null, error: { code: 'PGRST116' } });
          case 3: // Active/spinning check
            return createChainableInQuery(config.activeCheck ?? { data: [], error: null });
          case 4: // Insert
            return createChainableInsert(config.insert ?? { data: { id: 'p-1', status: 'active', queue_position: 1 }, error: null });
          case 5: // getQueuePositions call
            return createChainableList(config.queuePositions ?? { data: [], error: null });
          default:
            return createChainable({ data: null, error: null });
        }
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
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolution);
  return chain;
}

function createChainableWithOrder(resolution: { data: object | null; error: object | null }) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolution);
  return chain;
}

function createChainableList(resolution: { data: object[] | null; error: object | null }) {
  // For queries that resolve after .order() without .single()
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockResolvedValue(resolution);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolution);
  return chain;
}

function createChainableInQuery(resolution: { data: object[] | null; error: object | null }) {
  // For the in() query, it resolves directly (no .single())
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockResolvedValue(resolution);
  return chain;
}

function createChainableInsert(resolution: { data: object | null; error: object | null }) {
  const chain: Record<string, unknown> = {};
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.select = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolution);
  return chain;
}

let mockSupabaseInstance: ReturnType<typeof createMockSupabase>;

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => mockSupabaseInstance,
}));

import { POST } from '@/app/api/queue/join/route';

function makeRequest(body: object): NextRequest {
  return new NextRequest('http://localhost:3000/api/queue/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const activeSession = {
  id: 'session-uuid-1',
  status: 'active',
  end_time: new Date(Date.now() + 3600000).toISOString(),
};

const expiredSession = {
  id: 'session-uuid-1',
  status: 'active',
  end_time: new Date(Date.now() - 3600000).toISOString(),
};

const draftSession = {
  id: 'session-uuid-1',
  status: 'draft',
  end_time: new Date(Date.now() + 3600000).toISOString(),
};

describe('POST /api/queue/join', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('first registrant gets status=active, queue_position=1', async () => {
    mockSupabaseInstance = createMockSupabase({
      sessionLookup: { data: activeSession, error: null },
      phoneCheck: { data: null, error: { code: 'PGRST116' } },
      maxPosition: { data: null, error: { code: 'PGRST116' } },
      activeCheck: { data: [], error: null },
      insert: {
        data: { id: 'participant-1', status: 'active', queue_position: 1 },
        error: null,
      },
    });

    const req = makeRequest({
      session_id: 'session-uuid-1',
      name: 'Alice',
      phone: '3035551234',
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.participant_id).toBe('participant-1');
    expect(data.status).toBe('active');
    expect(data.queue_position).toBe(1);
    expect(data.estimated_wait_seconds).toBe(0);
  });

  it('second registrant gets status=queued, queue_position=1 (rank)', async () => {
    mockSupabaseInstance = createMockSupabase({
      sessionLookup: { data: activeSession, error: null },
      phoneCheck: { data: null, error: { code: 'PGRST116' } },
      maxPosition: { data: { queue_position: 1 }, error: null },
      activeCheck: { data: [{ id: 'existing-active' }], error: null },
      insert: {
        data: { id: 'participant-2', status: 'queued', queue_position: 2 },
        error: null,
      },
      queuePositions: { data: [{ id: 'participant-2', name: 'Bob', queue_position: 2 }], error: null },
    });

    const req = makeRequest({
      session_id: 'session-uuid-1',
      name: 'Bob',
      phone: '3035552345',
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.participant_id).toBe('participant-2');
    expect(data.status).toBe('queued');
    expect(data.queue_position).toBe(1);
    expect(data.estimated_wait_seconds).toBe(0);
  });

  it('duplicate phone returns 409', async () => {
    mockSupabaseInstance = createMockSupabase({
      sessionLookup: { data: activeSession, error: null },
      phoneCheck: { data: { id: 'existing-participant' }, error: null },
    });

    const req = makeRequest({
      session_id: 'session-uuid-1',
      name: 'Alice',
      phone: '3035551234',
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toBe('Phone number already registered for this session');
  });

  it('registration after end_time returns 422', async () => {
    mockSupabaseInstance = createMockSupabase({
      sessionLookup: { data: expiredSession, error: null },
    });

    const req = makeRequest({
      session_id: 'session-uuid-1',
      name: 'Charlie',
      phone: '3035553456',
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(422);
    expect(data.error).toBe('Session is not accepting new participants');
  });

  it('invalid phone format returns 422', async () => {
    const req = makeRequest({
      session_id: 'session-uuid-1',
      name: 'Dave',
      phone: '123',
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(422);
    expect(data.error).toBe('Invalid phone number format');
  });

  it('session not active (draft) returns 422', async () => {
    mockSupabaseInstance = createMockSupabase({
      sessionLookup: { data: draftSession, error: null },
    });

    const req = makeRequest({
      session_id: 'session-uuid-1',
      name: 'Eve',
      phone: '3035554567',
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(422);
    expect(data.error).toBe('Session is not accepting new participants');
  });

  it('session not found returns 404', async () => {
    mockSupabaseInstance = createMockSupabase({
      sessionLookup: { data: null, error: { code: 'PGRST116', message: 'not found' } },
    });

    const req = makeRequest({
      session_id: 'nonexistent-session',
      name: 'Frank',
      phone: '3035555678',
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toBe('Session not found');
  });

  it('missing required fields returns 422', async () => {
    const req = makeRequest({
      session_id: '',
      name: '',
      phone: '',
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(422);
    expect(data.error).toContain('required');
  });

  it('normalizes phone with +1 prefix to E.164', async () => {
    mockSupabaseInstance = createMockSupabase({
      sessionLookup: { data: activeSession, error: null },
      phoneCheck: { data: null, error: { code: 'PGRST116' } },
      maxPosition: { data: null, error: { code: 'PGRST116' } },
      activeCheck: { data: [], error: null },
      insert: {
        data: { id: 'participant-3', status: 'active', queue_position: 1 },
        error: null,
      },
    });

    const req = makeRequest({
      session_id: 'session-uuid-1',
      name: 'Grace',
      phone: '+13035551234',
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
  });

  it('normalizes phone with 1 prefix (11 digits) to E.164', async () => {
    mockSupabaseInstance = createMockSupabase({
      sessionLookup: { data: activeSession, error: null },
      phoneCheck: { data: null, error: { code: 'PGRST116' } },
      maxPosition: { data: null, error: { code: 'PGRST116' } },
      activeCheck: { data: [], error: null },
      insert: {
        data: { id: 'participant-4', status: 'active', queue_position: 1 },
        error: null,
      },
    });

    const req = makeRequest({
      session_id: 'session-uuid-1',
      name: 'Hank',
      phone: '13035551234',
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
  });

  it('20th overall participant who is only queued player sees rank 1', async () => {
    // Simulate: 19 players have already joined and completed their turns.
    // The 20th player joins and is assigned queue_position = 20.
    // But they should see rank 1 because they are the only queued player.
    mockSupabaseInstance = createMockSupabase({
      sessionLookup: { data: activeSession, error: null },
      phoneCheck: { data: null, error: { code: 'PGRST116' } },
      maxPosition: { data: { queue_position: 19 }, error: null },
      activeCheck: { data: [{ id: 'current-active' }], error: null },
      insert: {
        data: { id: 'participant-20', status: 'queued', queue_position: 20 },
        error: null,
      },
      queuePositions: { data: [{ id: 'participant-20', name: 'Zara', queue_position: 20 }], error: null },
    });

    const req = makeRequest({
      session_id: 'session-uuid-1',
      name: 'Zara',
      phone: '3035559999',
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.queue_position).toBe(1);         // rank, not raw DB value 20
    expect(data.estimated_wait_seconds).toBe(0); // rank 1 = next up, 0 seconds
  });
});
