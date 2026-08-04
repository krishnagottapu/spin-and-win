## Architect Verdict: spin-and-win full review

**Date:** 2026-08-04
**Reviewer:** architect
**Scope:** Full codebase review covering skip/queue feature set, auto-skip timer, queue display, DB schema changes, winner leaderboard fix, and sessions/[id] include= pattern.

---

### Code Review Summary

Verdict from code_reviewer: **NEEDS_CHANGES**

Key findings (summarized by severity):

**CRITICAL**
- C-1: `POST /api/queue/skip` has no authentication. Any unauthenticated caller knowing a `session_id` can repeatedly skip the active player, disrupting a live event. This is the single release blocker.

**HIGH**
- H-1: `skipped` ParticipantStatus is dead code — the CHECK constraint and TypeScript type include it, but no participant ever receives it. The skip endpoint immediately re-queues players as `queued`. This creates a misleading type contract.
- H-2: `handleQueueUpdated` in `tv-client.tsx` silently substitutes `name: 'Player'` as a placeholder when a `queue:updated` event arrives before the mount-time `syncState()` recovery fetch completes. Real names can be lost in the display.
- H-3: Race condition in skip endpoint — `newPosition = max + 1` is computed across two separate queries with no transaction. Concurrent skips assign duplicate queue positions.
- H-4: Auto-skip `setTimeout` fires in every open TV browser tab simultaneously. Multiple concurrent skip requests fire for the same player if multiple TV displays are open.

**MEDIUM (7 items):** TV token auth bypass too permissive (M-1), phone enumeration risk on `/api/queue/status` (M-2), weak `SessionStatus` runtime validation in PATCH (M-3), `simulate/promote` not setting `activated_at` (M-4), `isActive` comparison by name instead of ID (M-5), slug collision fallback only retries once (M-6), `broadcastEvent` creates/destroys a new Supabase channel per call adding latency (M-7).

**LOW (6 items):** `spin_started_at` never set (L-1), non-deterministic prize sort when `created_at` ties (L-2), `QueueDisplay` heading shown when queue is empty but active player exists (L-3), no tests for skip endpoint (L-4), `player:skipped → idle` flicker between broadcasts (L-5), N+1 winners query instead of join (L-6).

**Security:** Unauthenticated skip endpoint (SEC-1/C-1) is the blocker. Secondary: TV token over-exposure (SEC-2), phone enumeration (SEC-3), no RLS safety net (SEC-4, documented tradeoff), missing `name` length validation (SEC-5).

---

### UAT Review Summary

Verdict from uat_reviewer: **APPROVED**

All 6 acceptance criteria confirmed satisfied:

1. **Utsav logo in spinning circles** — confirmed in `SpinButton.tsx` for both idle and spinning states; asset `public/logo/utsav_logo.png` present.
2. **TV leaderboard shows ALL winners** — no LIMIT on queries; full list returned by recovery endpoint; `pendingAnnouncementsRef` prevents loss during wheel animation.
3. **TV left panel layout (QR top, queue below)** — `QRCodeSVG` at top with `QueueDisplay` filling remaining space; initial queue loaded from server; real-time updates and recovery both maintain queue state.
4. **Auto-skip 30s timer** — `useEffect` in `tv-client.tsx` fires `POST /api/queue/skip` after 30,000 ms; cleaned up on phase change.
5. **Skipped players re-queue at back** — skip route sets `status='queued'`, `position=max+1`, increments `skip_count`.
6. **Skip endpoint dual-purpose** — accepts `reason: 'timeout' | 'admin'`; same logic path for both.

No gaps found at the feature level.

---

### Architecture Assessment

#### Auto-Skip Pattern: TV-Side Timer vs Server-Side Timer

The auto-skip is implemented as a client-side `setTimeout` in `tv-client.tsx`. This is architecturally intentional given the stateless serverless constraint (Vercel Serverless Functions cannot hold timers between requests), but it introduces the following risks that are confirmed by code review:

**Multi-instance race (H-4 — HIGH risk for a live event):** Any number of browser tabs pointing at `/tv/[token]` will independently start the same 30-second timer. All will fire simultaneously and POST to `/api/queue/skip`. The current endpoint is not idempotent — the first call skips the player and the second returns a 404. This means: (a) a 404 error is surfaced on the TV display that is not showing the skip, (b) if the first call's player:skipped broadcast arrives at the second TV tab before its timer fires, the second tab clears the timer correctly; but the timer fires first in a race scenario. At a live event with even two TVs, this is a real failure mode.

**Recommended mitigation:** The skip endpoint must accept a `participant_id` parameter and validate that the provided ID matches the currently active player before applying the skip. If the IDs do not match (because another skip already fired), return `200` with `{ skipped: null, reason: 'already_processed' }`. This makes the endpoint idempotent and eliminates the duplicate-fire hazard from H-4.

**Timer drift:** The TV client starts the 30-second timer on receipt of `player:active`. If the Supabase Realtime connection drops and reconnects (Supabase JS auto-reconnects), the timer is not restarted. The player could stay active past 30 seconds with no auto-skip. The visibility-change recovery (`syncState`) re-hydrates state but does NOT restart the auto-skip timer. This is an edge case but observable when the event venue has intermittent WiFi.

The alternative — a server-side scheduled job — would require an external scheduler (Vercel Cron, pg_cron, or a background worker), which is a valid upgrade path for v2 but out of scope here. For v1 the TV-side timer is acceptable *provided* the endpoint is made idempotent (see above).

#### Queue Display: Client-Side State + Realtime Events

The queue display strategy is layered correctly:
- **Initial state:** `page.tsx` fetches queued participants server-side and passes them as `initialQueue` props before the page renders.
- **Live updates:** `queue:updated` events carry full position maps; `handleQueueUpdated` merges them.
- **Recovery:** Visibility-change triggers `syncState()` which fetches authoritative queue from `GET /api/sessions/[id]?include=queue`.

This three-layer approach (SSR → realtime → recovery) is sound for a live event. The identified gap (H-2: placeholder names) is a correctness issue rather than an architectural flaw — the recovery path is there, but the realtime handler races against it. The fix (guard `handleQueueUpdated` with the `recovering` flag) is straightforward.

One architectural note: `QueueUpdatedPayload` carries only `{ id, position }` pairs — it does not carry names. This is a deliberate design choice (names are stable after join, and the TV already has them). However, it creates the H-2 failure mode for players who joined before the TV page loaded. The clean architectural fix is to either (a) include names in the payload (increases payload size trivially), or (b) use the `recovering` guard as recommended. Option (b) preserves the clean payload design.

#### New DB Columns: skip_count and activated_at

Both columns are cleanly integrated:
- `activated_at` is set in `promoteNextParticipant` (queueManager.ts) and in `queue/join/route.ts` for direct promotion, and cleared to `null` on skip. This is correct — it accurately tracks when the current active window started.
- `skip_count` increments correctly in the skip endpoint. No overflow risk for any realistic event.
- The migration uses `ADD COLUMN IF NOT EXISTS` — idempotent and safe for re-runs.

The `simulate/promote` inconsistency (M-4) is a medium-priority gap: `activated_at` will be `null` for simulated promotions, which will cause the auto-skip timer to start at the wrong base if future logic reads `activated_at` to compute remaining time. Fix it before adding any timer-based logic that depends on `activated_at`.

#### Winner Leaderboard: Pending Announcements Queue

The `pendingAnnouncementsRef` pattern in `tv-client.tsx` is architecturally correct for this use case:

```
spin:result received → pendingWinnerRef set → wheel animation starts
winner:announced received → pushed to pendingAnnouncementsRef[]
wheel stops → handleStopSpinning → drains pendingAnnouncementsRef into winners state
```

This correctly handles the case where `winner:announced` arrives during wheel animation and would otherwise be lost because `setWinners` would be overwritten by the subsequent state update. It also handles the case where multiple `winner:announced` events arrive before the wheel stops (rapid consecutive spins after recovery).

**Edge case analysis:**
- Multiple events arrive before wheel stops: all accumulate in `pendingAnnouncementsRef[]` and are drained together on `handleStopSpinning`. ✓
- `handleStopSpinning` fires but `pendingAnnouncementsRef` is empty (normal spin, no overlap): no-op. ✓
- TV page reloads mid-spin: recovery `syncState` fetches the full `winners` list from the server, replacing any stale local state. ✓
- `pendingAnnouncementsRef` items are never deduplicated. If the server fires duplicate `winner:announced` events (which it should not, but network retransmission could theoretically cause), the leaderboard would show duplicate entries. Low risk, no mitigation needed for v1.

The pattern is sound. No architectural concerns.

#### include= Pattern in sessions/[id]

The `include=` parameter approach in `GET /api/sessions/[id]` is a pragmatic solution to avoid a proliferation of dedicated TV-recovery endpoints. It works, but has the following architectural concerns:

**Over-broad token auth bypass (M-1 — MEDIUM):** The condition `if (tvToken && includeParam) { isTokenAuth = true }` grants full session read access (including all winner data and the queue) to anyone who can supply a valid `tv_token` and any `include` value. Since `tv_token` is embedded in the TV URL visible on-screen and in browser history, this is a low-friction bypass. The TV page only needs `active_participant`, `last_winner`, `winners`, and `queue` — the auth bypass should be constrained to only these values.

**Growing complexity:** The handler currently supports 4 include values with conditional DB queries for each. As more recovery data is needed, this handler will accumulate more branches. For v2, consider a dedicated `/api/sessions/[id]/recovery` endpoint with `tv_token` auth, returning a fixed payload that covers all TV recovery needs.

**No include value validation:** The handler silently ignores unknown include values. An explicit whitelist check would improve debuggability.

The N+1 query for winners (L-6) is confirmed: winners query + separate prize query per winner set. For a session with 200 winners this is 2 queries (thanks to the `IN (prizeIds)` bulk fetch), not N+1 — the code does a single batch prize fetch. The finding is technically a "2-query" pattern rather than N+1, and performance impact is negligible for recovery-path reads. Still worth cleaning up with a join.

#### Skipped Status: Dead Code

This is the most significant architectural inconsistency introduced by this feature. The CHECK constraint, the TypeScript union, and the `PlayerSkippedPayload` event all signal that `skipped` is a meaningful participant status. But the skip endpoint never writes it — it writes `queued` directly.

Two paths forward:
1. **Remove `skipped` from the type and constraint.** Clean, consistent. Historical skip data is tracked by `skip_count` and `player:skipped` events. No need for a status value.
2. **Use `skipped` transiently, then transition to `queued`.** Set `status='skipped'` first, then in the same transaction update to `status='queued'` with the new position. This gives operators a momentary status they could query for analytics. Requires the transaction to be atomic (use a PL/pgSQL function).

Option 1 is recommended for v1 — it is simpler and consistent with how skip_count and activated_at already carry the audit information. Option 2 is a v2 enhancement if analytics tooling needs a status-level audit trail.

---

### Documentation Updates Applied

The following sections of `docs/architecture/architecture.md` were updated to reflect the implementation:

1. **Section 5: Shared TypeScript Types** — `ParticipantStatus` updated to include `skipped`; `Participant` interface updated with `skip_count`, `activated_at`; `PlayerSkippedPayload` added; `RealtimeEvent` union updated with `player:skipped`.

2. **Section 4: Data Flow** — New subsection 4.4 added: Auto-Skip Flow documenting the 30s timer path.

3. **Section 3: Component Breakdown** — Queue Engine row updated to include skip route; TV Display row updated to describe left panel layout.

4. **Section 7: Supabase Realtime Channel Design** — Events Reference table updated with `player:skipped`; Winner Leaderboard subsection added documenting the pending announcements queue pattern.

5. **Section 6: API Contract** — `POST /api/queue/skip` added; `GET /api/sessions/[id]` updated with `include=winners` and `include=queue` query parameters.

6. **Section 11: Open Questions and Risks** — Items added for multi-TV auto-skip race condition, dead `skipped` status, and `include=` auth bypass scope.

---

### Overall Verdict: NEEDS_CHANGES

UAT passes. The feature is functionally complete and correctly implements all six acceptance criteria. However, the unauthenticated skip endpoint (C-1) is a game-integrity blocker — it must be fixed before production deployment. Two additional high-severity issues (H-1 dead status code, H-3 race condition) should be resolved in the same pass.

---

### Required Actions Before Next Release

**CRITICAL — Must fix before deploy:**

1. **[C-1/SEC-1] Add authentication to `POST /api/queue/skip`**
   - For timeout-triggered skips (from TV page): include `tv_token` in the request body. Validate it against `sessions.tv_token` in the skip endpoint before processing.
   - For admin-triggered skips: require `spin_admin_token` JWT (`requireAdmin`).
   - The TV client currently sends no auth. Add `tv_token: session.tv_token` to the fetch body in `tv-client.tsx`.
   - File: `src/app/api/queue/skip/route.ts`, `src/app/tv/[token]/tv-client.tsx`

**HIGH — Fix in same release:**

2. **[H-3] Make skip queue position atomic**
   - Move the `max(queue_position) + 1` calculation and the participant UPDATE into a single PL/pgSQL function called via `supabase.rpc()`.
   - Pattern already established: see `decrement_prize_inventory` in migrations.
   - File: new migration + `src/app/api/queue/skip/route.ts`

3. **[H-4] Make skip endpoint idempotent for multi-TV scenarios**
   - The auto-skip request must include `participant_id` in the body.
   - The endpoint must check that the active player matches `participant_id` before applying the skip. If it does not match (already processed), return `200 { skipped: null, reason: 'already_processed' }`.
   - File: `src/app/api/queue/skip/route.ts`, `src/app/tv/[token]/tv-client.tsx`

4. **[H-1] Resolve dead `skipped` status**
   - Recommended: remove `'skipped'` from `ParticipantStatus` union in `src/lib/types.ts` and from the CHECK constraint in the migration.
   - `skip_count` and `player:skipped` realtime event already provide sufficient audit information.
   - File: `src/lib/types.ts`, `supabase/migrations/20260804000000_add_skipped_status.sql`

5. **[H-2] Guard `handleQueueUpdated` during recovery**
   - Add check: if `recovering` is still `true` when `queue:updated` fires, defer or skip the update. The `syncState()` fetch will provide the authoritative queue on completion.
   - File: `src/app/tv/[token]/tv-client.tsx`

**MEDIUM — Address before next release or in immediate follow-up:**

6. **[M-1/SEC-2] Restrict TV token auth bypass to known include values**
   - When `isTokenAuth = true`, validate that all values in `includeParam.split(',')` are members of `['active_participant', 'last_winner', 'winners', 'queue']`. Reject unknown values with 403.
   - File: `src/app/api/sessions/[id]/route.ts`

7. **[M-4] Set `activated_at` in `simulate/promote`**
   - Add `activated_at: new Date().toISOString()` to the participant update in the promote simulation endpoint.
   - File: `src/app/api/simulate/promote/route.ts`

8. **[M-5] Use participant ID for `isActive` check in queue display**
   - Pass `activeParticipantId` alongside `activePlayerName` to the TV render. Compare by ID, not name.
   - File: `src/app/tv/[token]/tv-client.tsx`, `src/components/tv/QueueDisplay.tsx`

9. **[L-4] Add tests for skip endpoint**
   - Cover: unauthenticated request (after C-1 fix), valid timeout skip, admin skip, skip with no active player, and concurrent skip idempotency (after H-4 fix).
   - File: `src/__tests__/skip.test.ts` (new)

**LOW — Backlog:**

10. **[M-2]** Add rate limiting to `GET /api/queue/status` to prevent phone enumeration.
11. **[L-1]** Set `spin_started_at` when participant transitions to `spinning`.
12. **[L-2]** Add secondary sort key `ORDER BY created_at ASC, id ASC` for prize ordering stability.
13. **[L-5]** Add debounce or intermediate `player_skipped` phase to prevent idle flicker between `player:skipped` and `player:active` broadcasts.
14. **[L-6]** Replace N+2 query pattern in `include=winners` with a single join query.
15. **[M-7]** Refactor `broadcastEvent` to accept a caller-provided Supabase client and reuse channels within a request lifecycle.
