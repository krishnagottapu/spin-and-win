---
id: task-5
task: Build the server-side spin engine — weighted prize calculation, atomic inventory decrement, and real-time broadcast
agent: backend
status: approved
depends_on: [task-2, task-4]
skills:
  - global/security
  - testing/philosophy
context:
  project: spin-and-win
  branch: feature/task-5-spin-engine
  files:
    - src/app/api/spin/route.ts
    - src/lib/game/prizePicker.ts
    - src/lib/game/queueManager.ts
    - src/lib/supabase/realtime.ts
    - supabase/migrations/20260803000001_prize_functions.sql
acceptance_criteria:
  - POST /api/spin with a valid active participant returns 200 with {prize_id, prize_name, prize_index, is_no_prize, result_token}
  - POST /api/spin with a participant whose status is not 'active' returns 403 {"error":"Participant is not in active state"}
  - POST /api/spin when spins_used >= max_spins_per_user returns 403 {"error":"Spin limit reached"}
  - POST /api/spin when session status is not 'active' or 'ending' returns 422 {"error":"Session is not active"}
  - After a successful spin, the participant row has: status='completed', prize_id set, result_token set (UUID), spins_used incremented by 1, spin_completed_at set to current UTC timestamp
  - After a successful spin, the selected prize's inventory_count is decremented by exactly 1 in the database
  - A prize with inventory_count=0 is never selected (weighted random excludes zero-inventory prizes)
  - When all prizes have inventory_count=0 and include_no_prize=false, POST /api/spin returns 409 {"error":"No prizes available"}
  - When all non-no-prize prizes are depleted and include_no_prize=true, the no-prize entry is selected
  - After a successful spin, the next queued participant (lowest queue_position with status='queued') is promoted to status='active'
  - After promotion, if session status is 'ending' and no queued participants remain, session status is set to 'ended'
  - POST /api/spin broadcasts spin:start event on channel session:{session_id} before prize calculation
  - POST /api/spin broadcasts spin:result event after prize is determined
  - POST /api/spin broadcasts winner:announced if is_no_prize is false
  - POST /api/spin broadcasts player:active with the next participant's data after promotion
  - POST /api/spin broadcasts queue:updated with updated positions for all remaining queued participants
  - prize_index in the response is the 0-based index of the selected prize in the full prize list (ordered by insertion order), matching the TV wheel's slice order
  - Weighted random distribution: running 10,000 spins on two prizes with weights 1 and 9 produces prize A selected between 800 and 1200 times (within ±200 of expected 1000) — unit test verifies this
  - Unit test: prizePicker selects prizes in proportion to their weights over many trials
  - Unit test: prizePicker never returns a prize with inventory_count=0
  - Unit test: prizePicker returns the no-prize entry when all inventory is depleted and include_no_prize=true
  - Unit test: queueManager.promoteNext returns null when no queued participants exist
---

## Instructions

This is the core game logic task. The spin engine is a server-side API route that is the single source of truth for all prize outcomes. It must be completely authoritative — the client cannot influence the result.

### 1. Prize picker (`src/lib/game/prizePicker.ts`)

```typescript
import type { Prize } from '@/lib/types';

interface PickResult {
  prize: Prize;
  prizeIndex: number; // 0-based index in the full prizes array
}

export function pickPrize(prizes: Prize[]): PickResult {
  // 1. Filter to prizes with inventory_count > 0 (including is_no_prize entries)
  // 2. If no eligible prizes: throw PrizeDepletedError
  // 3. Calculate total weight of eligible prizes
  // 4. Generate random number in [0, total_weight)
  // 5. Walk prizes accumulating weight until cumulative > random number
  // 6. Return the selected prize and its index in the ORIGINAL (unfiltered) prizes array
}
```

Key points:
- The `prizeIndex` returned must be the index in the original prizes array, not the filtered array. The TV wheel renders slices in original order. If prize at index 3 is selected, prizeIndex=3.
- Use `Math.random()` — cryptographic randomness is not required here (this is a prize wheel, not security-sensitive RNG).
- Export a custom `PrizeDepletedError` class for the case where no eligible prizes exist.

### 2. Queue manager (`src/lib/game/queueManager.ts`)

```typescript
export async function promoteNextParticipant(
  supabase: SupabaseClient,
  sessionId: string
): Promise<Participant | null> {
  // Query: SELECT * FROM participants
  //   WHERE session_id = ? AND status = 'queued'
  //   ORDER BY queue_position ASC LIMIT 1
  // If found: UPDATE status = 'active' WHERE id = ?
  // Return the updated participant row, or null if none
}

export async function getQueuePositions(
  supabase: SupabaseClient,
  sessionId: string
): Promise<Array<{ id: string; position: number }>> {
  // Returns all queued participants ordered by queue_position
}
```

### 3. Spin route (`src/app/api/spin/route.ts`)

```
POST /api/spin
Body: { session_id, participant_id }
No auth required — participant_id and session_id serve as the identity proof
```

**Execution order (must be exactly this sequence):**

1. Validate request body is non-empty with both fields.
2. Fetch session by session_id — validate status is `active` or `ending`.
3. Fetch participant by participant_id — validate:
   - participant.session_id matches request session_id
   - participant.status === 'active'
   - participant.spins_used < session.max_spins_per_user
4. **Broadcast `spin:start`** immediately (TV starts showing anticipation state).
5. Fetch all prizes for the session (ORDER BY created_at ASC — this is the canonical order for prize_index).
6. Call `pickPrize(prizes)` to get the selected prize and index.
7. **Atomic inventory decrement** via Supabase RPC `decrement_prize_inventory(prize_id)`:
   - If returns false (race condition — inventory hit 0): re-fetch prizes and retry from step 6.
   - Max 3 retries before returning 409.
8. Generate `result_token = crypto.randomUUID()`.
9. Update participant: `status='completed'`, `prize_id`, `result_token`, `spins_used+1`, `spin_completed_at=now()`.
10. **Broadcast `spin:result`**.
11. If `!is_no_prize`: **broadcast `winner:announced`**.
12. Call `promoteNextParticipant()` — if a participant is promoted, **broadcast `player:active`**.
13. If no next participant and session.status === 'ending': update session status to `ended`.
14. **Broadcast `queue:updated`** with remaining queued positions.
15. Return `SpinResponse`.

### 4. Broadcast implementation (`src/lib/supabase/realtime.ts`)

Add the server-side broadcast helper:

```typescript
import { createServiceClient } from '@/lib/supabase/server';

export async function broadcastEvent(
  sessionId: string,
  event: string,
  payload: object
): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .channel(`session:${sessionId}`)
    .send({ type: 'broadcast', event, payload });
}
```

Note the known risk from architecture.md: verify in integration testing that the service-role client can broadcast without being subscribed as a listener. If broadcast delivery is unreliable, use Supabase's `POST /realtime/v1/api/broadcast` REST endpoint as a fallback.

### 5. Migration for atomic decrement function

Create `supabase/migrations/20260803000001_prize_functions.sql`:

```sql
CREATE OR REPLACE FUNCTION decrement_prize_inventory(p_prize_id uuid)
RETURNS boolean AS $$
DECLARE
  updated_count int;
BEGIN
  UPDATE prizes
  SET inventory_count = inventory_count - 1
  WHERE id = p_prize_id AND inventory_count > 0;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 6. Idempotency guard

At step 3, check participant status BEFORE any writes. If status is already `spinning` or `completed`, return the existing result (or 403). This prevents double-spin from a double-tap.

### Security requirements

- The client sends only `session_id` and `participant_id` — it does NOT send a desired prize or any game-influencing data
- Prize calculation happens entirely on the server from DB-sourced prize data
- `result_token` is generated server-side with `crypto.randomUUID()`

### TypeScript + Next.js Patterns

Follow idiomatic TypeScript + Next.js App Router patterns. Reference technical-requirements.md for all architectural decisions. Use the shared types from `src/lib/types.ts`.
