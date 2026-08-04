---
id: task-2
task: Make skip endpoint idempotent and pass participant_id from TV client
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
    - src/app/tv/[token]/tv-client.tsx
acceptance_criteria:
  - Auto-skip request body includes participant_id of the currently active player
  - Skip endpoint validates that the active player matches the provided participant_id before applying skip
  - If participant_id does not match (already processed), endpoint returns 200 with { skipped: null, reason: 'already_processed' }
  - Multiple TV tabs firing auto-skip simultaneously only results in one actual skip
  - Existing single-skip behavior is unchanged
---

## Implementation Instructions

### 1. Update `src/app/tv/[token]/tv-client.tsx`

The TV state machine stores the active player. When `tvState.phase === 'player_active'`, the `player:active` payload includes `participant_id`. Store it in state so the auto-skip timer can reference it.

Add `activeParticipantId` to the TV state for `player_active` and `spinning` phases:

```typescript
type TvState =
  | { phase: 'idle' }
  | { phase: 'player_active'; playerName: string; participantId: string }
  | { phase: 'spinning'; playerName: string; prizeIndex: number; participantId: string }
  | { phase: 'winner'; playerName: string; prizeName: string; isNoPrize: boolean }
  | { phase: 'ended' };
```

Update `handlePlayerActive` to store the `participant_id`:
```typescript
setTvState({ phase: 'player_active', playerName: payload.name, participantId: payload.participant_id });
```

Update the auto-skip body to include participant_id:
```typescript
body: JSON.stringify({
  session_id: session.id,
  tv_token: session.tv_token,
  participant_id: tvState.phase === 'player_active' ? tvState.participantId : undefined,
  reason: 'timeout',
})
```

Also pass `participantId` through to `spinning` phase when `handleSpinResult` fires.

### 2. Update `src/app/api/queue/skip/route.ts`

After finding the active player, if `body.participant_id` is provided, compare it:

```typescript
if (body.participant_id && typedPlayer.id !== body.participant_id) {
  return NextResponse.json(
    { skipped: null, reason: 'already_processed' },
    { status: 200 }
  );
}
```

This makes the endpoint idempotent — the second TV tab that fires auto-skip after the first already processed it will get a clean 200 response instead of a 404.

### 3. Update M-5: Use participant ID for isActive in QueueDisplay

In `tv-client.tsx`, update the queue render to compare by ID instead of name:

```typescript
queue={queue.map((q) => ({
  ...q,
  isActive: tvState.phase === 'player_active'
    ? (tvState as { participantId: string }).participantId === q.id
    : false,
}))}
```

Update `QueueDisplay.tsx` if needed — `isActive` field is already part of the entry interface, no change needed there.
