---
id: task-10
task: Implement full event lifecycle management — soft stop, manual end, network recovery, error boundaries, and edge case polish
agent: backend
status: approved
depends_on: [task-5, task-6, task-7]
skills:
  - global/security
  - testing/philosophy
context:
  project: spin-and-win
  branch: feature/task-10-lifecycle-edge-cases
  files:
    - src/app/api/sessions/[id]/end/route.ts
    - src/app/api/sessions/[id]/route.ts
    - src/app/play/[slug]/page.tsx
    - src/app/tv/[token]/page.tsx
    - src/components/ui/ErrorBoundary.tsx
    - src/lib/game/queueManager.ts
acceptance_criteria:
  - POST /api/sessions/[id]/end sets session status to 'ended', sets all participants with status='queued' to status='completed', and broadcasts session:ended with reason='manual'
  - POST /api/sessions/[id]/end returns 200 {"success":true} and the response arrives within 2 seconds
  - After POST /api/sessions/[id]/end, any subsequent POST /api/queue/join for that session returns 422 {"error":"Session is not accepting new participants"}
  - After POST /api/sessions/[id]/end, any subsequent POST /api/spin for a participant already active returns 403 (spin is rejected for that completed participant since status was set to completed)
  - Soft stop: when session status transitions to 'ending' (via PATCH /api/sessions/[id] with status='ending'), POST /api/queue/join is rejected with 422
  - Soft stop: when session status is 'ending', POST /api/spin succeeds for the currently active participant
  - Soft stop: after the last queued participant completes their spin in an 'ending' session, the session status automatically transitions to 'ended'
  - Soft stop → 'ended' transition broadcasts session:ended with reason='queue_drained'
  - When a mobile user is on the queue screen and receives session:ended, they see "The event has ended — thank you for joining!"
  - When the TV receives session:ended, it displays the final leaderboard with a "Thanks for playing!" message
  - TV page: on mount, fetches current session state (active player, last winner) via REST so the TV recovers correctly after a browser refresh
  - TV page: document.addEventListener('visibilitychange') triggers a state re-sync when the tab becomes visible again
  - Mobile page: on mount, checks sessionStorage for a stored phone number and calls GET /api/queue/status to recover session state
  - Mobile page: network error on POST /api/spin shows a user-friendly error message ("Something went wrong — please try again") without losing the participant's state
  - Mobile page: if POST /api/spin returns 403 (already spun), the mobile page shows the result screen by calling GET /api/queue/status to recover the result_token
  - ErrorBoundary component wraps the TV page root and the mobile play page root — renders a friendly error screen instead of a blank page on unhandled JS errors
  - All loading states have skeleton UI or spinner — no layout shift on data load
  - Unit test: queueManager.promoteNext transitions session to 'ended' when no queued participants remain and session is 'ending'
  - Unit test: POST /api/sessions/[id]/end — queued participants are marked completed
  - Integration test: full lifecycle — join → spin → complete → session auto-ends when last player finishes in 'ending' status
---

## Instructions

This task handles all the lifecycle edges and resilience patterns. It is the polish pass that makes the application production-ready. Depends on tasks 5, 6, and 7 being complete.

### 1. Complete the manual end route (`src/app/api/sessions/[id]/end/route.ts`)

Task-2 left a TODO comment for the broadcast. Implement it fully:

```typescript
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(request);
  const supabase = createServiceClient();

  // 1. Fetch session — validate it exists and is not already ended
  const { data: session } = await supabase
    .from('sessions')
    .select()
    .eq('id', params.id)
    .single();

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  if (session.status === 'ended') return NextResponse.json({ error: 'Session already ended' }, { status: 409 });

  // 2. Atomically end the session and complete all queued participants
  await supabase
    .from('sessions')
    .update({ status: 'ended' })
    .eq('id', params.id);

  await supabase
    .from('participants')
    .update({ status: 'completed' })
    .eq('session_id', params.id)
    .eq('status', 'queued');

  // 3. Broadcast
  await broadcastEvent(params.id, 'session:ended', { reason: 'manual' });

  return NextResponse.json({ success: true });
}
```

### 2. Soft stop completion in queueManager

In `src/lib/game/queueManager.ts`, update `promoteNextParticipant` to handle the auto-end case:

```typescript
export async function promoteNextParticipant(
  supabase: SupabaseClient,
  sessionId: string,
  sessionStatus: SessionStatus
): Promise<{ promoted: Participant | null; sessionEnded: boolean }> {
  // 1. Find next queued participant
  const next = await findNextQueued(supabase, sessionId);

  if (next) {
    await supabase.from('participants')
      .update({ status: 'active' })
      .eq('id', next.id);
    return { promoted: next, sessionEnded: false };
  }

  // 2. No next participant
  if (sessionStatus === 'ending') {
    await supabase.from('sessions')
      .update({ status: 'ended' })
      .eq('id', sessionId);
    await broadcastEvent(sessionId, 'session:ended', { reason: 'queue_drained' });
    return { promoted: null, sessionEnded: true };
  }

  return { promoted: null, sessionEnded: false };
}
```

Update `/api/spin/route.ts` to pass `session.status` to `promoteNextParticipant` and handle the returned `sessionEnded` flag.

### 3. TV page recovery on mount

In the TV page Client Component, add a recovery `useEffect`:

```typescript
useEffect(() => {
  // Fetch current state from REST on mount
  async function syncState() {
    const res = await fetch(`/api/sessions/${session.id}?include=active_participant,last_winner`);
    // Update local state with current active player and last winner
  }
  syncState();

  // Re-sync when tab becomes visible
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') syncState();
  };
  document.addEventListener('visibilitychange', handleVisibility);
  return () => document.removeEventListener('visibilitychange', handleVisibility);
}, [session.id]);
```

Add support for `?include=active_participant,last_winner` query params to `GET /api/sessions/[id]` — return the current active participant (if any) and the most recent winner.

### 4. Mobile page recovery on mount

In the mobile play page Client Component, implement the full recovery flow:

```typescript
useEffect(() => {
  const storedPhone = sessionStorage.getItem(`spin_phone_${session.slug}`);
  if (!storedPhone) {
    setState({ phase: 'register' });
    return;
  }

  fetch(`/api/queue/status?sessionId=${session.id}&phone=${encodeURIComponent(storedPhone)}`)
    .then(res => res.ok ? res.json() : null)
    .then(data => {
      if (!data) { setState({ phase: 'register' }); return; }
      // Map status to the appropriate phase
      switch (data.status) {
        case 'queued':
          setState({ phase: 'queue', position: data.queue_position, estimatedWait: data.estimated_wait_seconds });
          break;
        case 'active':
          setState({ phase: 'spin', participantId: data.participant_id });
          break;
        case 'completed':
          setState({ phase: 'result', prizeName: data.prize_name, isNoPrize: !data.prize_name, resultToken: data.result_token });
          break;
        default:
          setState({ phase: 'register' });
      }
    })
    .catch(() => setState({ phase: 'register' }));
}, [session.id, session.slug]);
```

### 5. Spin error recovery on mobile

In `SpinButton`, handle the case where POST /api/spin returns 403 because the participant already completed:

```typescript
if (res.status === 403) {
  // Already spun — fetch current state and show result
  const statusRes = await fetch(`/api/queue/status?sessionId=${sessionId}&phone=${phone}`);
  if (statusRes.ok) {
    const data = await statusRes.json();
    onResult({ /* construct from status data */ });
  }
  return;
}
```

### 6. ErrorBoundary component

```tsx
'use client';
import { Component, ReactNode } from 'react';

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { hasError: boolean; }

export class ErrorBoundary extends Component<Props, State> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex items-center justify-center h-screen bg-gray-950 text-white">
          <div className="text-center">
            <p className="text-2xl font-bold">Something went wrong</p>
            <p className="text-gray-400 mt-2">Please refresh the page</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
```

Wrap the TV page and mobile play page roots with `<ErrorBoundary>`.

### 7. Loading states

Add skeleton loading states for:
- TV page while session data loads: dark pulsing placeholder rectangles
- Mobile page while recovery fetch is in-flight: a centered spinner
- Queue position while waiting for first Realtime update: display the initial value from REST response

Use Tailwind's `animate-pulse` class for skeleton elements.

### 8. Edge case: session end_time polling

The business requirement states that when `end_time` is reached, the session transitions to `ending` status. This is a time-based event that requires a mechanism to trigger it:

- Option A (recommended for v1): The `/api/queue/join` route already checks `current_time > end_time` and rejects new joins. Additionally, add a check in `/api/spin`: if session.status is `active` and `now() > session.end_time`, update status to `ending` before proceeding.
- Option B (future): Vercel Cron Jobs to poll for expired sessions. This is out of scope for v1 but note it as a recommended enhancement in a code comment.

Implement Option A in this task.

### Security requirements

- The session:ended broadcast carries only `reason` — no participant data
- Manual end is admin-only (verify JWT before any state change)
- Ensure that force-ending a session does not expose unfulfilled prize tokens — they remain claimable by staff after end

### TypeScript + Next.js Patterns

Follow idiomatic TypeScript + Next.js App Router patterns. Reference technical-requirements.md for all architectural decisions. Use the shared types from `src/lib/types.ts`.
