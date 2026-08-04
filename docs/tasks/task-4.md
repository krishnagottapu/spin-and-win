---
id: task-4
task: Guard handleQueueUpdated with recovering flag to prevent name placeholder overwrites
agent: backend
status: pending
depends_on: []
skills:
  - languages/javascript
context:
  project: spin-and-win
  files:
    - src/app/tv/[token]/tv-client.tsx
acceptance_criteria:
  - If a queue:updated event arrives while recovering is still true, the update is deferred until recovery completes
  - After recovery completes, the authoritative queue from syncState replaces any placeholder names
  - No player in the queue ever displays as 'Player' when their real name is available
  - Queue display remains responsive after recovery completes
---

## Implementation Instructions

### `src/app/tv/[token]/tv-client.tsx`

The `handleQueueUpdated` callback currently runs regardless of whether `syncState()` has completed. It adds placeholder entries with `name: 'Player'` for IDs it doesn't recognize. If `queue:updated` fires before `syncState()` returns, these placeholders get saved into state and are then overwritten when `setQueue(data.queue)` runs in `syncState`. But if `syncState` somehow completes first and `queue:updated` fires immediately after with a partial payload, the merge handler still creates placeholders for new entries.

**Fix:** Buffer incoming queue updates during recovery, then replay them after recovery completes.

```typescript
// Add a ref to buffer queue:updated events that arrive during recovery
const pendingQueueUpdatesRef = useRef<QueueUpdatedPayload[]>([]);

// In handleQueueUpdated:
const handleQueueUpdated = useCallback((payload: QueueUpdatedPayload) => {
  if (recovering) {
    // Buffer the update — syncState will set authoritative queue state
    pendingQueueUpdatesRef.current.push(payload);
    return;
  }
  // ... existing merge logic
}, [recovering]);
```

Then in `syncState()`, after `setQueue(data.queue)` runs:

```typescript
// Drain any buffered queue:updated events that arrived during recovery
// but apply them against the freshly recovered queue
const buffered = pendingQueueUpdatesRef.current;
pendingQueueUpdatesRef.current = [];
if (buffered.length > 0) {
  // Use the last buffered payload (most recent positions are authoritative)
  const latest = buffered[buffered.length - 1];
  // Apply the merge against the recovered queue
  setQueue((prev) => {
    const updatedMap = new Map(latest.positions.map((p) => [p.id, p.position]));
    return prev
      .map((entry) => {
        const newPos = updatedMap.get(entry.id);
        return newPos !== undefined ? { ...entry, position: newPos } : entry;
      })
      .filter((entry) => updatedMap.has(entry.id));
  });
}
```

Note: `recovering` needs to be a ref (not just state) inside `handleQueueUpdated` since the callback closure won't see state updates. Use `useRef` to track recovering status in the callback:

```typescript
const recoveringRef = useRef(true);
// Update it in syncState's finally block:
recoveringRef.current = false;
setRecovering(false);
```

Then use `recoveringRef.current` inside `handleQueueUpdated` instead of `recovering`.
