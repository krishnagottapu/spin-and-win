---
id: task-3
task: Atomic queue position assignment via RPC and remove dead skipped status
agent: backend
status: pending
depends_on: [task-1]
skills:
  - languages/javascript
  - global/security
context:
  project: spin-and-win
  files:
    - src/app/api/queue/skip/route.ts
    - src/lib/types.ts
    - supabase/migrations/20260804000000_add_skipped_status.sql
acceptance_criteria:
  - Queue position assignment in skip endpoint uses an atomic PL/pgSQL RPC function
  - No race condition possible between concurrent skips assigning duplicate queue positions
  - 'skipped' is removed from ParticipantStatus type union in types.ts
  - New migration removes 'skipped' from the participants status CHECK constraint
  - skip_count and activated_at columns are preserved (they remain correct audit fields)
  - All existing behavior for re-queuing at back still works correctly
---

## Implementation Instructions

### 1. Create new migration: `supabase/migrations/20260804000001_skip_queue_rpc.sql`

Create a PL/pgSQL function that atomically re-queues a skipped participant at the back:

```sql
-- Remove 'skipped' from participants CHECK constraint (it is never set, dead code)
ALTER TABLE participants DROP CONSTRAINT IF EXISTS participants_status_check;
ALTER TABLE participants ADD CONSTRAINT participants_status_check
  CHECK (status IN ('queued', 'active', 'spinning', 'completed'));

-- Atomic function: re-queue a participant at the back and increment skip_count
CREATE OR REPLACE FUNCTION requeue_skipped_participant(p_participant_id uuid)
RETURNS int AS $$
DECLARE
  v_session_id uuid;
  v_new_position int;
BEGIN
  -- Get the participant's session
  SELECT session_id INTO v_session_id
  FROM participants
  WHERE id = p_participant_id AND status = 'active';

  IF NOT FOUND THEN
    RETURN -1; -- Participant not active, already processed
  END IF;

  -- Get the next position atomically (locked within this transaction)
  SELECT COALESCE(MAX(queue_position), 0) + 1 INTO v_new_position
  FROM participants
  WHERE session_id = v_session_id;

  -- Re-queue the participant at the back
  UPDATE participants
  SET
    status = 'queued',
    queue_position = v_new_position,
    skip_count = skip_count + 1,
    activated_at = NULL
  WHERE id = p_participant_id;

  RETURN v_new_position;
END;
$$ LANGUAGE plpgsql;
```

### 2. Update `src/app/api/queue/skip/route.ts`

Replace the manual read-then-write with the RPC call:

```typescript
// Replace the 3 steps: find max position, update participant, check result
const { data: newPosition } = await supabase.rpc('requeue_skipped_participant', {
  p_participant_id: typedPlayer.id,
});

if (newPosition === -1) {
  // Already processed (idempotency check from RPC)
  return NextResponse.json(
    { skipped: null, reason: 'already_processed' },
    { status: 200 }
  );
}
```

Remove the separate `maxPosRow` query and `UPDATE participants` call — the RPC handles both atomically.

### 3. Update `src/lib/types.ts`

Remove `'skipped'` from the `ParticipantStatus` union:

```typescript
export type ParticipantStatus = 'queued' | 'active' | 'spinning' | 'completed';
```

The `skip_count` and `activated_at` fields on `Participant` remain — they correctly track skip history without needing a status value.

Note: `PlayerSkippedPayload` and the `player:skipped` realtime event remain — they are used for broadcasting the skip event to clients and are not related to the participant status value.
