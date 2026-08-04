---
id: task-4
task: Build mobile user registration, queue join API, real-time queue position display, and session recovery
agent: backend
status: approved
depends_on: [task-1]
skills:
  - global/security
  - testing/philosophy
context:
  project: spin-and-win
  branch: feature/task-4-mobile-registration-queue
  files:
    - src/app/play/[slug]/page.tsx
    - src/app/api/queue/join/route.ts
    - src/app/api/queue/status/route.ts
    - src/components/play/RegistrationForm.tsx
    - src/components/play/QueuePosition.tsx
    - src/components/play/SpinButton.tsx
    - src/components/play/ResultDisplay.tsx
    - src/lib/supabase/realtime.ts
acceptance_criteria:
  - GET /play/[valid-slug] returns 200 and renders the mobile registration page
  - GET /play/[invalid-slug] returns a 404 page
  - GET /play/[slug] for a session with status 'draft' or 'ended' renders an "Event not available" message (not a 404)
  - POST /api/queue/join with valid {session_id, name, phone} returns 201 with {participant_id, status, queue_position, estimated_wait_seconds}
  - POST /api/queue/join with a phone number already registered in the session returns 409 {"error":"Phone number already registered for this session"}
  - POST /api/queue/join when session status is not 'active' returns 422 {"error":"Session is not accepting new participants"}
  - POST /api/queue/join when current time > session end_time returns 422 {"error":"Session is not accepting new participants"}
  - POST /api/queue/join with an invalid phone format (not matching E.164 or 10-digit US) returns 422 {"error":"Invalid phone number format"}
  - POST /api/queue/join when no other participant is active or spinning assigns the new user status='active' immediately
  - POST /api/queue/join when another participant is active assigns status='queued' with the correct queue_position (MAX+1)
  - GET /api/queue/status?sessionId=X&phone=Y for an existing participant returns 200 with correct status, queue_position, and result data
  - GET /api/queue/status for a non-existent participant returns 404
  - estimated_wait_seconds is calculated as (queue_position - 1) * 60 (60 seconds per spin as default estimate)
  - RegistrationForm submits name and phone, shows inline validation errors for empty fields and invalid phone format
  - QueuePosition component displays "You are #N in line" and "Estimated wait: ~X minutes"
  - SpinButton component renders a large "TAP TO SPIN" button (min-height 80px, full-width) — visible only when user status is 'active'
  - ResultDisplay component is scaffolded as a placeholder (wired in task-7)
  - On initial page load, if the user's phone is stored in sessionStorage and matches an active session participant, skip the registration form and show their current state
  - Supabase Realtime subscription on channel session:{session_id} for event queue:updated updates the displayed queue position in real time without a page reload
  - Unit test: POST /api/queue/join — first registrant gets status='active', queue_position=1
  - Unit test: POST /api/queue/join — second registrant gets status='queued', queue_position=2
  - Unit test: duplicate phone returns 409
  - Unit test: registration after end_time returns 422
---

## Instructions

This task builds the mobile user experience from scanning the QR code through seeing their queue position. The actual spin button and result display are wired in task-7; scaffold those components here.

### 1. Mobile page (`src/app/play/[slug]/page.tsx`)

Split into a Server Component (slug validation + session lookup) and a Client Component (registration form + realtime subscription).

Server Component logic:
1. Query session by slug using service client.
2. If not found: call `notFound()`.
3. If found but status is `draft` or `ended`: render an informational page "This event is not currently active." (do not 404 — the slug exists, the event is just closed).
4. Pass `session.id`, `session.slug`, and `session.status` to the client component.

### 2. Registration API (`src/app/api/queue/join/route.ts`)

```
POST /api/queue/join
Body: { session_id, name, phone }
```

Validation (in order — return first failure):
1. `session_id`, `name`, `phone` must all be non-empty strings.
2. Phone must match regex `/^\+?1?\d{10}$/` (10-digit US or E.164). Normalize to E.164 before storing.
3. Session must exist and status must be `active`.
4. Current UTC time must be <= `session.end_time`.
5. Phone must not already exist in participants for this session.

Queue assignment:
1. Query MAX(queue_position) for the session — default to 0 if no rows.
2. New position = MAX + 1.
3. Check if any participant has status `active` or `spinning` for this session.
4. If none: insert with status `active`.
5. If one exists: insert with status `queued`.
6. Broadcast `queue:updated` with all queued positions (only after task-5 wires the broadcast helper — leave a comment for now).

Response:
```typescript
{
  participant_id: string,
  status: 'active' | 'queued',
  queue_position: number,
  estimated_wait_seconds: number  // (position - 1) * 60
}
```

After inserting, store the phone in the response (client will save to sessionStorage).

### 3. Session recovery API (`src/app/api/queue/status/route.ts`)

```
GET /api/queue/status?sessionId=uuid&phone=E164
```

- Query participant WHERE session_id = ? AND phone = ?
- If not found: 404
- If found: return `QueueStatusResponse` (see types.ts)
- Join prizes table to get prize_name if prize_id is not null
- Return queue_position as null if status is not `queued`

### 4. Client component flow

The mobile play page Client Component manages a state machine:
```
'loading' → check sessionStorage for phone → call /api/queue/status
  ↓ not found              ↓ found
'register'              match status:
                          'queued'   → 'queue' view
                          'active'   → 'spin' view (task-7)
                          'spinning' → 'spin' view (task-7)
                          'completed'→ 'result' view (task-7)
'register' → submit → 'queue' or 'spin' view
```

On successful registration: save phone to `sessionStorage` keyed by session slug.

### 5. Realtime subscription (`src/lib/supabase/realtime.ts`)

Create a reusable hook `useSessionChannel(sessionId: string, handlers: ...)` that:
1. Creates a Supabase browser client.
2. Subscribes to `session:{sessionId}` channel.
3. Registers the handlers passed in.
4. Cleans up on unmount.

In the QueuePosition component, subscribe to `queue:updated` and update the displayed position when the user's participant_id appears in the payload.

### 6. Mobile-first styling

Design for 375px viewport width:
- Full-width inputs and buttons
- Large touch targets: buttons `min-h-[56px]`
- High-contrast text (white on dark or dark on light)
- `SpinButton`: `min-h-[80px] w-full text-3xl font-bold` with a vibrant color (e.g., `bg-yellow-400 text-gray-900`)
- Use Tailwind's responsive prefix `sm:` only for wider screens

### 7. Placeholder components

`ResultDisplay`: returns null for now. Task-7 implements it.
`SpinButton`: renders the button but the `onClick` handler is a no-op (`() => {}`). Task-7 wires the actual spin call.

### Security requirements

- Phone numbers must be normalized to E.164 before storage (strip spaces, dashes, parentheses)
- `session_id` in the request body must match the session looked up by slug — clients cannot submit a different session_id
- Do not expose other participants' data in any response

### TypeScript + Next.js Patterns

Follow idiomatic TypeScript + Next.js App Router patterns. Reference technical-requirements.md for all architectural decisions. Use the shared types from `src/lib/types.ts`.
