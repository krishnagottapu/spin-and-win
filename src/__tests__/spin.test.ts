import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Prize } from '@/lib/types';

// ─── Prize Picker Tests ──────────────────────────────────────────────────────

describe('pickPrize', () => {
  let pickPrize: typeof import('@/lib/game/prizePicker').pickPrize;
  let PrizeDepletedError: typeof import('@/lib/game/prizePicker').PrizeDepletedError;

  beforeEach(async () => {
    const mod = await import('@/lib/game/prizePicker');
    pickPrize = mod.pickPrize;
    PrizeDepletedError = mod.PrizeDepletedError;
  });

  const makePrize = (overrides: Partial<Prize> = {}): Prize => ({
    id: 'prize-1',
    session_id: 'session-1',
    name: 'Prize A',
    weight: 1,
    inventory_count: 10,
    is_no_prize: false,
    created_at: '2026-08-03T10:00:00Z',
    ...overrides,
  });

  it('selects prizes proportional to weights over 1000 trials', () => {
    const prizes: Prize[] = [
      makePrize({ id: 'a', name: 'Prize A', weight: 1, inventory_count: 100 }),
      makePrize({ id: 'b', name: 'Prize B', weight: 9, inventory_count: 100 }),
    ];

    const counts: Record<string, number> = { a: 0, b: 0 };

    for (let i = 0; i < 1000; i++) {
      const result = pickPrize(prizes);
      counts[result.prize.id] += 1;
    }

    // Prize A (weight=1) should be ~100 out of 1000 (10%)
    // Allow ±20% of expected: 100 ± 200 (very generous) -> between 0 and 300
    // Actually per the acceptance criteria: 10000 trials with weights 1 and 9
    // yields ~1000 ± 200. For 1000 trials: expect ~100 ± 60
    expect(counts['a']).toBeGreaterThanOrEqual(40);
    expect(counts['a']).toBeLessThanOrEqual(200);

    // Prize B (weight=9) should be ~900 out of 1000 (90%)
    expect(counts['b']).toBeGreaterThanOrEqual(800);
    expect(counts['b']).toBeLessThanOrEqual(960);
  });

  it('satisfies acceptance criteria: 10000 trials with weights 1 and 9, prize A between 800 and 1200', () => {
    const prizes: Prize[] = [
      makePrize({ id: 'a', name: 'Prize A', weight: 1, inventory_count: 10000 }),
      makePrize({ id: 'b', name: 'Prize B', weight: 9, inventory_count: 10000 }),
    ];

    let countA = 0;

    for (let i = 0; i < 10000; i++) {
      const result = pickPrize(prizes);
      if (result.prize.id === 'a') countA++;
    }

    // Expected: 1000 ± 200
    expect(countA).toBeGreaterThanOrEqual(800);
    expect(countA).toBeLessThanOrEqual(1200);
  });

  it('never returns a prize with inventory_count=0', () => {
    const prizes: Prize[] = [
      makePrize({ id: 'a', name: 'Depleted', weight: 9, inventory_count: 0 }),
      makePrize({ id: 'b', name: 'Available', weight: 1, inventory_count: 5 }),
    ];

    for (let i = 0; i < 500; i++) {
      const result = pickPrize(prizes);
      expect(result.prize.inventory_count).toBeGreaterThan(0);
      expect(result.prize.id).toBe('b');
    }
  });

  it('returns no-prize entry when all non-no-prize inventory is depleted', () => {
    const prizes: Prize[] = [
      makePrize({ id: 'real-1', name: 'Gift Card', weight: 5, inventory_count: 0, is_no_prize: false }),
      makePrize({ id: 'real-2', name: 'Tablet', weight: 3, inventory_count: 0, is_no_prize: false }),
      makePrize({ id: 'no-prize', name: 'No Prize', weight: 1, inventory_count: 999, is_no_prize: true }),
    ];

    for (let i = 0; i < 100; i++) {
      const result = pickPrize(prizes);
      expect(result.prize.id).toBe('no-prize');
      expect(result.prize.is_no_prize).toBe(true);
    }
  });

  it('throws PrizeDepletedError when no eligible prizes exist', () => {
    const prizes: Prize[] = [
      makePrize({ id: 'a', inventory_count: 0 }),
      makePrize({ id: 'b', inventory_count: 0 }),
    ];

    expect(() => pickPrize(prizes)).toThrow(PrizeDepletedError);
    expect(() => pickPrize(prizes)).toThrow('No prizes available');
  });

  it('throws PrizeDepletedError when prizes array is empty', () => {
    expect(() => pickPrize([])).toThrow(PrizeDepletedError);
  });

  it('returns correct prizeIndex from the ORIGINAL array (not filtered)', () => {
    const prizes: Prize[] = [
      makePrize({ id: 'a', name: 'Prize A', weight: 5, inventory_count: 0 }), // index 0, depleted
      makePrize({ id: 'b', name: 'Prize B', weight: 5, inventory_count: 0 }), // index 1, depleted
      makePrize({ id: 'c', name: 'Prize C', weight: 5, inventory_count: 10 }), // index 2, available
    ];

    const result = pickPrize(prizes);
    expect(result.prize.id).toBe('c');
    expect(result.prizeIndex).toBe(2); // Index in original array
  });
});

// ─── Queue Manager Tests ─────────────────────────────────────────────────────

describe('promoteNextParticipant', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns { promoted: null, sessionEnded: false } when no queued participants exist', async () => {
    // Mock broadcastEvent
    vi.mock('@/lib/supabase/realtime', () => ({
      broadcastEvent: vi.fn().mockResolvedValue(undefined),
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
      'session-1',
      'active'
    );

    expect(result.promoted).toBeNull();
    expect(result.sessionEnded).toBe(false);
  });

  it('promotes the next queued participant and returns it', async () => {
    vi.mock('@/lib/supabase/realtime', () => ({
      broadcastEvent: vi.fn().mockResolvedValue(undefined),
    }));

    const { promoteNextParticipant } = await import('@/lib/game/queueManager');

    const promotedParticipant = {
      id: 'p-2',
      session_id: 'session-1',
      name: 'Bob',
      phone: '+13035551234',
      status: 'active',
      queue_position: 2,
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
          // First call: select next queued
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      single: vi.fn().mockResolvedValue({
                        data: { ...promotedParticipant, status: 'queued' },
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        // Second call: update status to active
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: promotedParticipant,
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
      'session-1',
      'active'
    );

    expect(result.promoted).not.toBeNull();
    expect(result.promoted?.id).toBe('p-2');
    expect(result.promoted?.name).toBe('Bob');
    expect(result.sessionEnded).toBe(false);
  });

  it('ends the session when no queued participants and status is ending', async () => {
    const mockBroadcastEvent = vi.fn().mockResolvedValue(undefined);
    vi.mock('@/lib/supabase/realtime', () => ({
      broadcastEvent: mockBroadcastEvent,
    }));

    const { promoteNextParticipant } = await import('@/lib/game/queueManager');

    let callCount = 0;
    const mockSupabase = {
      from: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call: select next queued — returns none
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
        // Second call: update session status to ended
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      }),
    };

    const result = await promoteNextParticipant(
      mockSupabase as unknown as Parameters<typeof promoteNextParticipant>[0],
      'session-1',
      'ending'
    );

    expect(result.promoted).toBeNull();
    expect(result.sessionEnded).toBe(true);
  });
});

// ─── Queue Positions Tests ───────────────────────────────────────────────────

describe('getQueuePositions', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns mapped positions from queued participants', async () => {
    vi.mock('@/lib/supabase/realtime', () => ({
      broadcastEvent: vi.fn().mockResolvedValue(undefined),
    }));

    const { getQueuePositions } = await import('@/lib/game/queueManager');

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  { id: 'p-1', queue_position: 2 },
                  { id: 'p-2', queue_position: 3 },
                  { id: 'p-3', queue_position: 4 },
                ],
                error: null,
              }),
            }),
          }),
        }),
      }),
    };

    const positions = await getQueuePositions(
      mockSupabase as unknown as Parameters<typeof getQueuePositions>[0],
      'session-1'
    );

    expect(positions).toEqual([
      { id: 'p-1', position: 1 },
      { id: 'p-2', position: 2 },
      { id: 'p-3', position: 3 },
    ]);
  });

  it('returns empty array when no queued participants', async () => {
    vi.mock('@/lib/supabase/realtime', () => ({
      broadcastEvent: vi.fn().mockResolvedValue(undefined),
    }));

    const { getQueuePositions } = await import('@/lib/game/queueManager');

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          }),
        }),
      }),
    };

    const positions = await getQueuePositions(
      mockSupabase as unknown as Parameters<typeof getQueuePositions>[0],
      'session-1'
    );

    expect(positions).toEqual([]);
  });
});
