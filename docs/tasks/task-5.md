---
id: task-5
task: Medium and low priority fixes - auth scope, simulate/promote, spin_started_at, queue display, skip flicker
agent: backend
status: pending
depends_on: [task-1, task-2, task-3, task-4]
skills:
  - languages/javascript
  - global/security
context:
  project: spin-and-win
  files:
    - src/app/api/sessions/[id]/route.ts
    - src/app/api/simulate/promote/route.ts
    - src/app/api/spin/route.ts
    - src/app/tv/[token]/tv-client.tsx
    - src/components/tv/QueueDisplay.tsx
acceptance_criteria:
  - TV token auth bypass in GET /api/sessions/[id] only permits known include values
  - Unknown include values with tv_token auth return 403
  - simulate/promote sets activated_at when promoting a participant
  - spin_started_at is set when participant transitions to spinning status in POST /api/spin
  - Skip flicker prevented - brief debounce before transitioning to idle on player:skipped
  - QueueDisplay heading handles empty queue with active player correctly
---

## Implementation Instructions

### M-1: Restrict TV token include values — `src/app/api/sessions/[id]/route.ts`

When `isTokenAuth = true`, validate includes against a known whitelist:

```typescript
const TV_ALLOWED_INCLUDES = new Set(['active_participant', 'last_winner', 'winners', 'queue']);

if (isTokenAuth) {
  const requestedIncludes = includeParam?.split(',') ?? [];
  const invalid = requestedIncludes.filter((v) => !TV_ALLOWED_INCLUDES.has(v));
  if (invalid.length > 0) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
}
```

### M-3: Validate session status in PATCH handler — `src/app/api/sessions/[id]/route.ts`

Add an explicit runtime check before the transition lookup:

```typescript
const VALID_SESSION_STATUSES = Object.keys(VALID_TRANSITIONS) as SessionStatus[];
if (!VALID_SESSION_STATUSES.includes(body.status as SessionStatus)) {
  return NextResponse.json({ error: 'Invalid status value' }, { status: 422 });
}
```

### M-4: Set activated_at in simulate/promote — `src/app/api/simulate/promote/route.ts`

In the participant update inside the promote route, add:
```typescript
activated_at: new Date().toISOString(),
```

Read the current file first to find the exact update call location.

### L-1: Set spin_started_at — `src/app/api/spin/route.ts`

When the participant is updated to `spinning` status (or at the point where spin_completed_at is set), also set:
```typescript
spin_started_at: new Date().toISOString(),
```

Read the spin route to find where the participant status is updated and add this field.

### L-5: Skip flicker debounce — `src/app/tv/[token]/tv-client.tsx`

In `handlePlayerSkipped`, instead of immediately going to idle, use a short timeout:

```typescript
const handlePlayerSkipped = useCallback((payload: PlayerSkippedPayload) => {
  setTvState((prev) => {
    if (prev.phase === 'player_active' && prev.playerName === payload.name) {
      // Delay transition to idle — player:active for next player arrives shortly after
      // The auto-dismiss timeout gives the next player:active a chance to arrive first
      return prev; // Don't change state yet
    }
    return prev;
  });
  // Brief delay before falling back to idle if no next player:active arrives
  const timeout = setTimeout(() => {
    setTvState((prev) => {
      if (prev.phase === 'player_active' && prev.playerName === payload.name) {
        return { phase: 'idle' };
      }
      return prev;
    });
  }, 1500); // 1.5 seconds — enough time for player:active to arrive

  return () => clearTimeout(timeout);
}, []);
```

Note: Since `handlePlayerSkipped` is a `useCallback`, the cleanup timeout can't be returned directly. Use a ref to store the timeout:

```typescript
const skipFlickerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

const handlePlayerSkipped = useCallback((payload: PlayerSkippedPayload) => {
  if (skipFlickerTimerRef.current) clearTimeout(skipFlickerTimerRef.current);
  skipFlickerTimerRef.current = setTimeout(() => {
    setTvState((prev) => {
      if (prev.phase === 'player_active' && prev.playerName === payload.name) {
        return { phase: 'idle' };
      }
      return prev;
    });
    skipFlickerTimerRef.current = null;
  }, 1500);
}, []);
```

### L-3: Fix QueueDisplay heading — `src/components/tv/QueueDisplay.tsx`

When the queue is empty but there is an active player, don't show "No players in queue". Update the empty state check:

```typescript
if (queue.length === 0) {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-gray-500">Queue is empty</p>
    </div>
  );
}
```

(Remove the `&& !activePlayerName` condition from the original empty check — when there's an active player, the queue list only shows the upcoming players, and "empty" just means no one is waiting, which is fine to show.)

Also rename the heading from "Up Next" to "Queue" when there are entries, so it's clear even when all entries are upcoming (not active).
