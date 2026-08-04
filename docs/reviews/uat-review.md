## UAT Review: spin-and-win full feature validation

**Date:** 2026-08-04
**Reviewer:** UAT Reviewer (Automated)

---

### Features Validated

- [x] **Feature 1: Utsav Events logo appears inside spinning circles when player clicks Spin** — The `SpinButton.tsx` component (lines 89-99) renders an animated spinner state with two concentric spinning rings and an `<img src="/logo/utsav_logo.png">` centered inside. The static "TAP TO SPIN" button (lines 108-120) also displays the logo inside the inner circle. The asset `public/logo/utsav_logo.png` (275KB) exists. Both spinning and idle states show the Utsav Events branding as expected.

- [x] **Feature 2: TV leaderboard shows ALL winners, not just last 2** — The `tv-client.tsx` fetches ALL winners on initial page load via the server component (`page.tsx` lines 35-51 queries all completed participants with prizes ordered by spin_completed_at DESC, no LIMIT). The recovery endpoint (`GET /api/sessions/[id]?include=winners`) also fetches all completed participants without any limit (session route lines 98-130). The `WinnerLeaderboard` component renders the full `winners` array with scrollable overflow (`overflow-y-auto`). The `pendingAnnouncementsRef` queue in `tv-client.tsx` (line 174) defers leaderboard updates until the wheel animation stops, then adds all pending announcements — this prevents entries from being lost during animations.

- [x] **Feature 3: TV left panel — QR code at top, live queue below showing all queued players in order** — The `tv-client.tsx` layout (lines 271-298) renders a left sidebar (`w-[260px]`) with: (1) QR code section at top with "Scan to Join!" label and `QRCodeSVG`, (2) Queue display below filling remaining space. The `QueueDisplay.tsx` component renders all entries from the `queue` state sorted by position, with overflow scrolling. Initial queue is loaded from `page.tsx` (lines 79-87, queued participants ordered by queue_position ASC). Real-time updates via `queue:updated` and `player:active` events keep the queue current. Recovery on visibility change also refreshes the full queue from the server.

- [x] **Feature 4: Auto-skip — player has 30 seconds to spin before being moved to back of queue** — The `tv-client.tsx` implements a `useEffect` (lines 92-108) that starts a 30-second timer (`AUTO_SKIP_DELAY_MS = 30_000`) whenever `tvState.phase === 'player_active'`. When the timer fires, it calls `POST /api/queue/skip` with `reason: 'timeout'`. The timer is cleared if the phase changes (player spins, wins, or is otherwise transitioned). This correctly implements the 30-second auto-skip requirement.

- [x] **Feature 5: Skipped players re-queue at back (not removed), skip_count tracked** — The `POST /api/queue/skip` route (lines 68-82) finds the max `queue_position` in the session and assigns the skipped player `newPosition = max + 1`. It updates the participant's status back to `'queued'`, sets the new position, and increments `skip_count: typedPlayer.skip_count + 1`. The `Participant` type in `types.ts` includes `skip_count: number` and `activated_at: string | null`. The player is NOT removed from the session — they are re-queued at the back with their skip history preserved.

- [x] **Feature 6: POST /api/queue/skip works for both timeout and admin-initiated skips** — The endpoint accepts an optional `reason` field (`'timeout' | 'admin'`, defaults to `'timeout'`). The TV client calls it with `reason: 'timeout'` on auto-skip. An admin can call it with `reason: 'admin'` or omit the reason. Both paths execute the same logic: validate session is active/paused/ending, find active player, re-queue at back, broadcast `player:skipped`, promote next player, and broadcast `queue:updated`. The `PlayerSkippedPayload` type includes the `reason` field for downstream consumers to differentiate the trigger.

---

### Gaps Found

None. All six features are fully implemented with:
- Correct server-side logic and database state management
- Proper real-time broadcast events for all state transitions
- Recovery mechanisms (visibility change, page reload) that fetch authoritative state from the server
- Type safety across the full stack (TypeScript types match API contracts)

---

### Verdict: APPROVED

All acceptance criteria are met. The implementation correctly handles:
1. Logo branding in both idle and spinning states of the mobile spin button
2. Full winner history on the TV leaderboard (no artificial limits, deferred updates during animation)
3. TV left panel layout with QR at top and scrollable live queue below
4. 30-second auto-skip timer with proper cleanup on state transitions
5. Re-queuing skipped players at the back with skip_count tracking
6. Unified skip endpoint supporting both timeout and admin-initiated triggers

---

### Feedback

No changes required. Implementation is complete and well-structured.
