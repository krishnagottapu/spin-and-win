---
id: task-6
task: Write unit tests for POST /api/queue/skip endpoint
agent: backend
status: pending
depends_on: [task-1, task-2, task-3]
skills:
  - languages/javascript
  - testing/java
context:
  project: spin-and-win
  files:
    - src/__tests__/queue.test.ts
    - src/__tests__/skip.test.ts
    - src/app/api/queue/skip/route.ts
acceptance_criteria:
  - Test file src/__tests__/skip.test.ts exists
  - Unauthenticated request returns 401
  - Valid timeout skip with tv_token succeeds and re-queues player at back
  - Admin skip with valid admin JWT succeeds
  - Skip when no active player returns 404
  - Concurrent skip with mismatched participant_id returns 200 already_processed
  - skip_count increments correctly
  - player:skipped broadcast is called
  - promoteNextParticipant is called after skip
  - Tests follow the same mock patterns as src/__tests__/queue.test.ts
---

## Implementation Instructions

Read `src/__tests__/queue.test.ts` to understand the mock patterns used (Supabase mock chain, broadcastEvent mock, etc.). Follow the same patterns exactly.

Create `src/__tests__/skip.test.ts` covering:

1. **Unauthenticated request** — no tv_token, no admin JWT → 401
2. **tv_token mismatch** — tv_token present but doesn't match session → 401
3. **Valid timeout skip** — tv_token matches session, active player found → 200 with correct response, player re-queued at back, skip_count +1
4. **Admin skip** — valid admin JWT, no tv_token → 200
5. **No active player** — session valid but no participant with status='active' → 404
6. **Idempotency** — participant_id provided but doesn't match current active player → 200 with reason='already_processed'
7. **Broadcasts fired** — player:skipped and queue:updated and player:active (if next player promoted) all broadcast

Mock the `requeue_skipped_participant` RPC to return the new position (positive int) or -1 for the idempotency case.

Use `vi.mock` / `vitest` consistent with the project's test setup (`src/test-setup.ts` and `vitest.config.ts`).
