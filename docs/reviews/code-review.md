## Code Review: spin-and-win full codebase

**Date:** 2026-08-04  
**Reviewer:** code_reviewer  
**Scope:** Full codebase with focus on recent skip/queue changes

---

### Files Reviewed

**Recently Modified (Primary Focus)**
- `src/lib/types.ts` — added `skipped` status, `skip_count`, `activated_at`, `PlayerSkippedPayload`
- `src/lib/supabase/realtime.ts` — added `player:skipped` event handler
- `src/lib/game/queueManager.ts` — sets `activated_at` on promote
- `src/app/api/queue/skip/route.ts` — new skip endpoint
- `src/app/api/queue/join/route.ts` — sets `activated_at` on direct promotion
- `src/app/api/sessions/[id]/route.ts` — added `include=winners` and `include=queue`
- `src/app/tv/[token]/tv-client.tsx` — auto-skip timer, queue state, pending announcements
- `src/app/tv/[token]/page.tsx` — fetches initial queue
- `src/components/tv/QueueDisplay.tsx` — new queue display component
- `src/components/play/SpinButton.tsx` — Utsav logo in spinner
- `supabase/migrations/20260804000000_add_skipped_status.sql` — new migration

**Pre-existing (Reviewed for Context and Regression)**
- `src/lib/auth/middleware.ts`
- `src/lib/auth/jwt.ts`
- `src/lib/supabase/broadcast.ts`
- `src/lib/supabase/server.ts`
- `src/lib/supabase/client.ts`
- `src/lib/game/prizePicker.ts`
- `src/middleware.ts`
- `src/app/api/spin/route.ts`
- `src/app/api/queue/status/route.ts`
- `src/app/api/sessions/route.ts`
- `src/app/api/sessions/[id]/end/route.ts`
- `src/app/api/sessions/active/route.ts`
- `src/app/api/claim/verify/[token]/route.ts`
- `src/app/api/claim/fulfill/route.ts`
- `src/app/api/claim/search/route.ts`
- `src/app/api/export/[sessionId]/route.ts`
- `src/app/api/auth/login/route.ts`
- `src/app/api/auth/staff/route.ts`
- `src/app/api/simulate/spin/route.ts`
- `src/app/api/simulate/promote/route.ts`
- `src/components/tv/WinnerLeaderboard.tsx`
- `src/components/tv/ActivePlayerBanner.tsx`
- `src/components/tv/SpinWheel.tsx`
- `supabase/migrations/20260803000000_initial_schema.sql`
- `supabase/migrations/20260803000001_prize_functions.sql`
- `supabase/migrations/20260803000002_add_paused_status.sql`
- `supabase/migrations/20260803000003_staff_self_registration.sql`
- `src/__tests__/queue.test.ts`
- `src/__tests__/lifecycle.test.ts`

---

### Issues Found

#### CRITICAL

**C-1: `POST /api/queue/skip` has no authentication**  
`src/app/api/queue/skip/route.ts` — The skip endpoint accepts `session_id` and `participant_id` from the request body with no JWT validation. Any unauthenticated caller on the internet can skip the active player in any session by knowing (or guessing) a `session_id`. The auto-skip from `tv-client.tsx` uses `reason: 'timeout'`, but the admin-initiated skip path (`reason: 'admin'`) is also unprotected. At minimum, auto-skip from the TV page must include the `tv_token` in the request for validation; admin-initiated skip must require an admin JWT.

**Recommendation:** Add `tv_token` body field for timeout-triggered skips (validate it against the session the same way `GET /api/sessions/[id]` does), and add `requireAdmin` for any skip initiated without a `tv_token`. Alternatively, require an admin JWT for all skip calls and have the TV page obtain a short-lived session token before initiating auto-skips.

---

#### HIGH

**H-1: `skipped` status added to migration but is never actually set on a participant**  
`supabase/migrations/20260804000000_add_skipped_status.sql` and `src/app/api/queue/skip/route.ts` — The migration adds `'skipped'` as a valid CHECK constraint value, and the `ParticipantStatus` type includes it, but the skip endpoint sets the player's status back to `'queued'` (re-queuing them at the back). The `'skipped'` value is therefore dead code in the database constraint. This creates a misleading contract: the type says `'skipped'` is a valid status, but no participant will ever have that status in production. If `'skipped'` is intentionally a transient/historical marker, the re-queue path should pass through it. If re-queuing directly to `'queued'` is the intent, remove `'skipped'` from both the constraint and the type to avoid confusion.

**Recommendation:** Decide: (a) set status to `'skipped'` momentarily then update to `'queued'` in a single transaction, or (b) remove `'skipped'` from the type and migration entirely since it never appears on a row.

**H-2: `handleQueueUpdated` in `tv-client.tsx` can silently discard participant names**  
`src/app/tv/[token]/tv-client.tsx:~268` — When a `queue:updated` broadcast arrives with IDs not already in the local queue state, the code pushes a placeholder entry with `name: 'Player'`. This can happen when the TV client connects after players have already joined. The recovery `syncState()` fetch fills the queue from the server, but if `queue:updated` fires between mount and the `syncState()` response returning, real player names get replaced with `'Player'` in the display.

**Recommendation:** In `handleQueueUpdated`, only add placeholder names for IDs that were not present at mount time AND for which `syncState` has already completed. Guard with the `recovering` flag: if `recovering` is still `true`, defer queue updates until the recovery fetch finishes.

**H-3: Race condition in skip endpoint — queue position not atomic**  
`src/app/api/queue/skip/route.ts:~70` — The `newPosition` calculation is a two-step read-then-write: read the max `queue_position` in one query, then write `newPosition = max + 1`. Under concurrent skips (two admins clicking at the same moment, or auto-skip racing an admin click), two participants could be assigned the same `queue_position`. There is no unique constraint on `(session_id, queue_position)` in the schema.

**Recommendation:** Use a Supabase RPC function to atomically compute and assign the new position inside a transaction, similar to how `decrement_prize_inventory` uses a PL/pgSQL function for atomic decrement. Alternatively, add a `UNIQUE(session_id, queue_position)` constraint and handle conflicts with a retry loop.

**H-4: Auto-skip timer fires even when the TV client is not the authoritative instance**  
`src/app/tv/[token]/tv-client.tsx:~99` — The auto-skip `setTimeout` fires a `POST /api/queue/skip` 30 seconds after `player_active` state. If multiple browsers have the TV page open for the same session (e.g., a backup display), all of them will fire auto-skip for the same player, resulting in multiple concurrent skip requests. The second skip call will find no active player and return a 404, but by that point the queue has already been disrupted once.

**Recommendation:** Make the skip endpoint idempotent — if there is no active player matching `participant_id`, return 200 (not 404) with a `{ skipped: null }` response. Alternatively, accept a `participant_id` in the auto-skip request body and validate that the current active player still matches before applying the skip.

---

#### MEDIUM

**M-1: `GET /api/sessions/[id]` TV token auth bypass is too permissive**  
`src/app/api/sessions/[id]/route.ts:~18` — The logic `if (tvToken && includeParam) { isTokenAuth = true }` skips admin auth if *both* a `tv_token` and an `include` param are present. This means that anyone who can guess a `tv_token` (a random string, but not validated for format) can read the full session payload including all winner data and the queue. Since the `tv_token` is embedded in the TV page URL and visible to anyone watching the screen, this is a low-barrier information leak. PII is limited (only names) but the exposure is broader than intended.

**Recommendation:** The TV token auth path should be restricted to only the `include` values the TV page actually needs (`active_participant`, `last_winner`, `winners`, `queue`). Validate that `includeParam` contains only those values when using token auth.

**M-2: `src/app/api/queue/status/route.ts` uses phone as a lookup key without rate limiting**  
The status endpoint accepts a raw phone number from a query string and returns the participant's current status, prize, and result token. There is no rate limiting or CAPTCHA at the route or middleware level. An attacker can enumerate phone numbers to discover who has won prizes.

**Recommendation:** Add rate limiting middleware (e.g., via Vercel Edge Config, Upstash, or a simple IP-based counter) to this endpoint. Alternatively, migrate to a participant-ID-based status check once the participant registers (avoiding phone enumeration entirely after join).

**M-3: `paused` session status missing from `VALID_TRANSITIONS` in `sessions/[id]/route.ts`**  
`src/app/api/sessions/[id]/route.ts:~13` — The `VALID_TRANSITIONS` map includes `paused` as a transition target from `active`, but the sessions initial schema CHECK constraint does not include `'paused'` — it is only added in migration `20260803000002_add_paused_status.sql`. This is fine for production since migrations run in order. However, `VALID_TRANSITIONS` omits `paused → ending` — the map shows `paused: ['active', 'ending']`, which is correct. Cross-check: the skip endpoint accepts `paused` as a valid session status for allowing skips, which is also correct. No bug here, but the PATCH handler applies `newStatus` with no final `SessionStatus` type guard after the whitelist check — a `body.status` value of `'skipped'` (newly valid in the union type) could be attempted. The transition map would block it, but relying on a runtime map to prevent a compile-time type misuse is fragile.

**Recommendation:** Cast `body.status` through the `VALID_TRANSITIONS` key type explicitly: `if (!Object.keys(VALID_TRANSITIONS).includes(body.status))` before the transition check, or validate against the `SessionStatus` union at runtime.

**M-4: `simulate/promote` sets `activated_at: null` (not updated)**  
`src/app/api/simulate/promote/route.ts` — The promote endpoint is dev-only and force-promotes a participant, but it does not set `activated_at: new Date().toISOString()` when updating the participant to `active`. If the auto-skip timer on the TV client reads `activated_at` to compute elapsed time in future improvements, simulated promotions will have a null value and behave differently from real ones.

**Recommendation:** Add `activated_at: new Date().toISOString()` to the update payload in the simulate/promote route for consistency with `promoteNextParticipant`.

**M-5: `QueueDisplay` receives `isActive` based on name equality, not ID equality**  
`src/app/tv/[token]/tv-client.tsx:~384` — The queue is mapped with `isActive: currentPlayerName === q.name`. If two participants share the same name (which is allowed — the schema only enforces unique phone numbers), both entries would be highlighted as active in the queue display simultaneously.

**Recommendation:** Add the active participant's ID to the TV state and compare by ID in the `isActive` check.

**M-6: `src/app/api/sessions/route.ts` slug collision fallback is weak**  
`src/app/api/sessions/route.ts:~61` — When the initial slug is taken, a suffix (likely a random token or timestamp) is appended. If this second attempt also collides, the endpoint returns a 409 with message "Slug already exists" rather than retrying. In a high-volume environment this is rarely a problem, but the error message is not actionable for the caller.

**Recommendation:** Retry with an incrementing numeric suffix (`event-name-2`, `event-name-3`) up to a configurable max, or append a short random hex suffix that has negligible collision probability.

**M-7: `broadcastEvent` creates and immediately destroys a channel per call**  
`src/lib/supabase/broadcast.ts` — Every broadcast call calls `createServiceClient()`, creates a fresh channel, sends one message, and removes it. The spin endpoint alone makes 4–5 sequential broadcast calls per spin. Each channel creation involves a network round-trip. Under load, this pattern adds measurable latency to the spin hot path.

**Recommendation:** Accept a `SupabaseClient` parameter in `broadcastEvent` (callers already have one) to reuse the same client, and batch-send on a persistent channel per session, or at least reuse the channel across broadcasts within the same request lifecycle.

---

#### LOW

**L-1: `spin_started_at` is never set**  
`src/lib/types.ts` and `src/app/api/spin/route.ts` — `Participant.spin_started_at` is defined in the type and the schema but is never written. The spin endpoint sets `spin_completed_at` but skips `spin_started_at`. This field appears to have been intended for timing/analytics.

**Recommendation:** Either set `spin_started_at: new Date().toISOString()` when transitioning the participant to `spinning` status, or document in a comment that the field is reserved and unused.

**L-2: Missing `created_at` column on prizes breaks index stability assumption in tests**  
`supabase/migrations/20260803000001_prize_functions.sql` — `created_at` was added as a migration column with `DEFAULT now()`, which means existing rows in a live DB that were inserted before this migration will all receive the same `now()` timestamp. The spin endpoint and TV wheel rely on `ORDER BY created_at ASC` for stable `prize_index` alignment. If two prizes in the same session share an identical `created_at` (possible with bulk inserts), the sort order is non-deterministic.

**Recommendation:** Add a secondary sort key: `ORDER BY created_at ASC, id ASC`. Since `id` is a UUID (monotonically generated by `gen_random_uuid()` in Postgres v13+), this is not guaranteed to be insertion-ordered. A better option is to add an explicit `sort_order int` column, or use the original migration timestamp + sequence approach.

**L-3: `QueueDisplay` does not handle `activePlayerName` without a queue entry**  
`src/components/tv/QueueDisplay.tsx` — The component receives `activePlayerName` as a prop but only renders it via `isActive` on queue entries. If the active player has been removed from the queue (which happens in `handlePlayerActive`), the component correctly removes them from the list, but the heading "Up Next" still shows even when only the active player is present and the queue is empty.

**Recommendation:** Either rename the heading to "On Deck / Active" or show a dedicated active player indicator above the queue list when `activePlayerName` is non-null.

**L-4: No test coverage for the new skip endpoint**  
`src/__tests__/` — There are no tests for `POST /api/queue/skip`. Given the auth gap (C-1) and race condition (H-3) found in this endpoint, test coverage is especially important here. The queue test suite covers `queue/join` and lifecycle scenarios thoroughly.

**Recommendation:** Add unit tests for the skip endpoint covering: unauthenticated request, valid timeout skip with correct queue reordering, admin skip, skip when no active player, and concurrent skip idempotency.

**L-5: `tvState` transition in `handlePlayerSkipped` could cause a flash to idle**  
`src/app/tv/[token]/tv-client.tsx:~298` — When `player:skipped` is received, the handler resets to `{ phase: 'idle' }` if the current player matches. The `player:active` broadcast for the next player arrives shortly after. Between these two broadcasts, the TV briefly shows the idle state (wheel unattended, no player banner). On a fast connection this is imperceptible, but on a slow connection it can appear as a flicker.

**Recommendation:** Add a brief debounce (e.g., 800 ms) before transitioning to idle on a skipped event, or transition to a dedicated `{ phase: 'player_skipped' }` state that displays a "Skipping..." message and auto-resolves to idle if no `player:active` arrives within 2 seconds.

**L-6: `src/app/api/sessions/[id]/route.ts` — `winners` mapping filters in application code**  
`src/app/api/sessions/[id]/route.ts:~155` — The winners query fetches all completed participants, then fetches all their prize IDs in a separate query, then does a `prizeMap.get()` for each. This is an N-query anti-pattern for a cold-path endpoint. More critically, the winners list is not paginated and could theoretically return thousands of rows for a large event.

**Recommendation:** Use a single Supabase `select` with a `prizes:prize_id(name, is_no_prize)` join (same pattern used elsewhere in the codebase) and filter `is_no_prize = false` in SQL. This eliminates the secondary prize fetch and the application-side map.

---

### Security Findings

**SEC-1 (CRITICAL): Unauthenticated skip endpoint**  
As described in C-1. Any unauthenticated caller can skip the active player in any session. This is a game-integrity and availability risk. In an event setting, a malicious attendee who knows a session ID can repeatedly call the skip endpoint to prevent anyone from spinning.

**SEC-2 (HIGH): TV token exposure in URL allows full session data read**  
The `tv_token` is embedded in the TV display URL (`/tv/{token}`) and visible to anyone in the room. Because `GET /api/sessions/[id]` uses the `tv_token` as an auth bypass for any `include` parameter, it effectively exposes all session data (winner list, full queue) to anyone who can read the URL off the screen or from browser history. This is a low-severity leak for names, but the auth bypass should be scoped tighter.

**SEC-3 (MEDIUM): Phone number enumeration via `/api/queue/status`**  
No rate limiting on the status endpoint. Phone numbers are PII; enumeration allows discovery of who attended and won.

**SEC-4 (LOW): `SUPABASE_SERVICE_ROLE_KEY` used for all server-side operations**  
`src/lib/supabase/server.ts` — All API routes (including unauthenticated ones like `queue/join`) use the service role key, which bypasses all Supabase RLS policies. The initial schema grants `anon` and `authenticated` roles full SELECT/INSERT/UPDATE/DELETE on all tables. This means RLS is never enforced — all authorization logic lives exclusively in Next.js route handlers. If a route handler has a bug or is bypassed, there is no database-level safety net.

**Recommendation:** This is a known architectural tradeoff for simplicity. Document it explicitly. For higher-value data (admins table, prize inventory), consider enforcing RLS policies in addition to application-layer checks.

**SEC-5 (LOW): `name` field in queue/join is only `.trim()`-ed, not length-limited**  
`src/app/api/queue/join/route.ts:~93` — Participant names are inserted with only a trim. A 50,000-character name would be stored and then broadcast to all TV clients via the realtime channel, potentially causing UI layout issues. The schema has no `CHECK (char_length(name) <= N)` constraint either.

**Recommendation:** Add a server-side max-length validation (e.g., 100 characters) in the join route and a corresponding CHECK constraint in the schema.

---

### Verdict: NEEDS_CHANGES

---

### Summary

The core skip/queue feature is logically correct and well-structured — the data model, broadcast sequencing, and state machine integration are sound. However, the skip endpoint (`POST /api/queue/skip`) is deployed with no authentication, which is a critical security gap that must be resolved before this goes to production. Two additional high-severity issues (the unused `skipped` status creating a confusing dead-code contract, and the multi-TV race condition on auto-skip) also need resolution. The remaining medium and low findings are quality improvements that should be addressed in a follow-up, with the queue name placeholder bug (H-2) being the highest priority among them due to visible UX impact.
