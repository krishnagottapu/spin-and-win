# Spin and Win — Architecture Document

**Version:** 1.0.0
**Date:** 2026-08-03
**Status:** Approved for Implementation

---

## 1. Overview

Spin and Win is a real-time event engagement application. Attendees scan a QR code on a shared TV, register on their phones, queue for a turn, and spin a prize wheel. The server is the single source of truth for all game state. Clients are display-only — they subscribe to broadcasts and render what the server tells them.

### Key Design Principles

- **Server-authoritative:** All prize calculations, queue management, and state transitions happen server-side. No client can influence outcomes.
- **Broadcast-driven UI:** The TV and mobile clients subscribe to a Supabase Realtime channel and react to events. They do not poll.
- **Stateless API routes:** Every API route is a Vercel Serverless Function — no in-memory state between requests.
- **One active player at a time:** The queue is strictly FIFO. Concurrency concerns are limited to atomic inventory decrement on spin.

---

## 2. Folder / File Structure

```
spin-and-win/
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── migrations.yml
├── docs/
│   ├── business-requirements.md
│   ├── technical-requirements.md
│   ├── local-development.md
│   ├── session-context.md
│   ├── reviews/
│   │   ├── code-review.md
│   │   ├── uat-review.md
│   │   └── architect-verdict.md
│   └── architecture/
│       ├── architecture.md          ← this file
│       └── tasks/
│           ├── task-1.md … task-10.md
├── public/
│   ├── logo/
│   │   └── utsav_logo.png           ← Utsav Events branding asset
│   └── sounds/
│       ├── drumroll.mp3
│       ├── gameshow.mp3
│       └── casino.mp3
├── src/
│   ├── app/
│   │   ├── layout.tsx               ← root layout (fonts, global CSS)
│   │   ├── page.tsx                 ← redirect to /admin
│   │   ├── tv/
│   │   │   └── [token]/
│   │   │       ├── page.tsx         ← TV display server component
│   │   │       └── tv-client.tsx    ← TV display client component (state machine, realtime, auto-skip)
│   │   ├── play/
│   │   │   └── [slug]/
│   │   │       ├── page.tsx         ← Mobile play server component
│   │   │       └── PlayClient.tsx   ← Mobile play client component
│   │   ├── admin/
│   │   │   ├── layout.tsx           ← admin shell + auth guard
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   │   ├── sessions/
│   │   │   │   ├── page.tsx         ← session list
│   │   │   │   ├── new/
│   │   │   │   │   └── page.tsx     ← create session form
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx     ← edit session form
│   │   │   ├── reports/
│   │   │   │   ├── page.tsx         ← live dashboard + past sessions
│   │   │   │   └── [sessionId]/
│   │   │   │       └── page.tsx     ← per-session report + export
│   │   │   └── staff/
│   │   │       └── page.tsx         ← manage staff / generate invite codes
│   │   ├── claim/
│   │   │   ├── page.tsx             ← staff entry point (login gate)
│   │   │   ├── [sessionId]/
│   │   │   │   └── page.tsx         ← staff fulfillment (scan + search)
│   │   │   ├── register/
│   │   │   │   └── [sessionId]/
│   │   │   │       ├── page.tsx
│   │   │   │       └── StaffRegisterForm.tsx
│   │   │   └── setup/
│   │   │       └── [token]/
│   │   │           ├── page.tsx
│   │   │           └── StaffSetupForm.tsx
│   │   └── api/
│   │       ├── auth/
│   │       │   ├── login/
│   │       │   │   └── route.ts     ← POST: admin login → JWT cookie
│   │       │   ├── logout/
│   │       │   │   └── route.ts     ← POST: clear JWT cookie
│   │       │   └── staff/
│   │       │       ├── route.ts     ← POST: staff invite code registration (legacy)
│   │       │       ├── login/
│   │       │       │   └── route.ts ← POST: staff login with OTP
│   │       │       └── register/
│   │       │           └── route.ts ← POST: staff self-registration
│   │       ├── otp/
│   │       │   └── route.ts         ← POST: send OTP to staff phone
│   │       ├── sessions/
│   │       │   ├── route.ts         ← GET list, POST create
│   │       │   ├── active/
│   │       │   │   └── route.ts     ← GET: find active session by slug
│   │       │   └── [id]/
│   │       │       ├── route.ts     ← GET (+ include=), PUT edit, PATCH status
│   │       │       ├── end/
│   │       │       │   └── route.ts ← POST: manual end event
│   │       │       └── prizes/
│   │       │           └── route.ts ← prize management sub-route
│   │       ├── spin/
│   │       │   └── route.ts         ← POST: trigger spin
│   │       ├── queue/
│   │       │   ├── join/
│   │       │   │   └── route.ts     ← POST: register + join queue
│   │       │   ├── status/
│   │       │   │   └── route.ts     ← GET: recover session by phone
│   │       │   └── skip/
│   │       │       └── route.ts     ← POST: skip active player (timeout or admin)
│   │       ├── claim/
│   │       │   ├── verify/
│   │       │   │   └── [token]/
│   │       │   │       └── route.ts ← GET: look up participant by result token
│   │       │   ├── fulfill/
│   │       │   │   └── route.ts     ← POST: mark as fulfilled
│   │       │   └── search/
│   │       │       └── route.ts     ← GET: search by name/phone
│   │       ├── staff/
│   │       │   ├── generate/
│   │       │   │   └── route.ts     ← POST: generate invite code(s)
│   │       │   ├── create/
│   │       │   │   └── route.ts     ← POST: create staff member
│   │       │   ├── list/
│   │       │   │   └── route.ts     ← GET: list staff for session
│   │       │   └── setup/
│   │       │       └── route.ts     ← POST: complete staff device setup
│   │       ├── simulate/
│   │       │   ├── spin/
│   │       │   │   └── route.ts     ← POST: simulate a spin (dev only)
│   │       │   └── promote/
│   │       │       └── route.ts     ← POST: simulate queue promotion (dev only)
│   │       └── export/
│   │           └── [sessionId]/
│   │               └── route.ts     ← GET: CSV download
│   ├── components/
│   │   ├── tv/
│   │   │   ├── SpinWheel.tsx        ← react-custom-roulette wrapper
│   │   │   ├── WinnerLeaderboard.tsx
│   │   │   ├── ActivePlayerBanner.tsx
│   │   │   ├── QueueDisplay.tsx     ← live queue list shown in TV left panel
│   │   │   ├── SimulationPanel.tsx  ← dev-only simulation controls overlay
│   │   │   └── ConfettiOverlay.tsx
│   │   ├── play/
│   │   │   ├── RegistrationForm.tsx
│   │   │   ├── QueuePosition.tsx
│   │   │   ├── SpinButton.tsx       ← shows Utsav logo; spinning state has logo inside rings
│   │   │   └── ResultDisplay.tsx
│   │   ├── claim/
│   │   │   ├── InviteCodeGate.tsx
│   │   │   ├── QrScanner.tsx        ← html5-qrcode wrapper
│   │   │   ├── WinnerCard.tsx
│   │   │   ├── SearchForm.tsx
│   │   │   ├── ClaimInterface.tsx
│   │   │   ├── StaffLoginGate.tsx
│   │   │   └── StaffSessionLogin.tsx
│   │   ├── admin/
│   │   │   ├── SessionForm.tsx
│   │   │   ├── PrizeEditor.tsx
│   │   │   ├── LiveDashboard.tsx
│   │   │   ├── LivePrizeManager.tsx
│   │   │   ├── SessionStatusControls.tsx
│   │   │   ├── StaffManager.tsx
│   │   │   └── ExportButton.tsx
│   │   └── ui/
│   │       └── ErrorBoundary.tsx
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts            ← browser Supabase client (singleton)
│   │   │   ├── server.ts            ← server-side Supabase client (service role)
│   │   │   ├── broadcast.ts         ← server-side broadcastEvent helper
│   │   │   └── realtime.ts          ← useSessionChannel hook (client-side)
│   │   ├── auth/
│   │   │   ├── jwt.ts               ← sign/verify JWT helpers
│   │   │   └── middleware.ts        ← requireAdmin, requireStaff guards
│   │   ├── game/
│   │   │   ├── prizePicker.ts       ← weighted random + atomic decrement
│   │   │   └── queueManager.ts      ← promote next player, drain queue, set activated_at
│   │   ├── utils/
│   │   │   ├── slugify.ts
│   │   │   ├── csvExport.ts
│   │   │   └── tokenGen.ts          ← crypto random UUID helpers
│   │   └── types.ts                 ← all shared TypeScript types (see Section 5)
│   ├── __tests__/
│   │   ├── auth.test.ts
│   │   ├── claim.test.ts
│   │   ├── export.test.ts
│   │   ├── lifecycle.test.ts
│   │   ├── mobile.test.tsx
│   │   ├── queue.test.ts
│   │   ├── skip.test.ts             ← tests for POST /api/queue/skip
│   │   ├── spin.test.ts
│   │   ├── tv.test.tsx
│   │   ├── types.test.ts
│   │   └── wheel.test.ts
│   ├── middleware.ts                ← Next.js edge middleware (admin route protection)
│   └── test-setup.ts
├── supabase/
│   ├── migrations/
│   │   ├── 20260803000000_initial_schema.sql
│   │   ├── 20260803000001_prize_functions.sql
│   │   ├── 20260803000002_add_paused_status.sql
│   │   ├── 20260803000003_staff_self_registration.sql
│   │   ├── 20260804000000_add_skipped_status.sql   ← adds skip_count, activated_at; removes 'skipped' from CHECK
│   │   ├── 20260804000001_skip_queue_rpc.sql       ← requeue_skipped_participant() atomic RPC
│   │   └── 20260804000002_name_length_constraint.sql ← participants.name max 100 chars
│   └── seed.sql
├── .env.example
├── .env.local                       ← local secrets (not committed)
├── .gitignore
├── next.config.js
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── vitest.config.ts
```

---

## 3. Component Breakdown

| Component | Route / Location | Responsibility |
|---|---|---|
| TV Display | `/tv/[token]` | Fullscreen wheel (center), winner leaderboard (right), QR code + live queue (left sidebar) — listens to Realtime; auto-skip timer fires after 30s of player inactivity |
| Mobile Play | `/play/[slug]` | Register, queue, spin, result — listens to Realtime |
| Admin Dashboard | `/admin/*` | Event CRUD, live analytics, export, staff codes |
| Staff Claim | `/claim` | Invite-code gate, QR scan, search, fulfill |
| Spin Engine | `POST /api/spin` | Authoritative prize calculation + broadcast |
| Queue Engine | `POST /api/queue/join`, `POST /api/queue/skip` | FIFO registration, auto-promote first player; skip re-queues active player at back |
| Auth Layer | `POST /api/auth/login` | JWT issuance; middleware guards admin routes |
| Export | `GET /api/export/[sessionId]` | Stream CSV of participant records |
| Realtime Bridge | Supabase Broadcast | Server publishes; TV and mobile subscribe |

---


## 4. Data Flow

### 4.1 Happy Path: User Joins, Spins, Claims Prize

```
User Phone                  Next.js API             Supabase DB         Supabase Realtime
    |                           |                        |                      |
    |-- POST /api/queue/join --> |                        |                      |
    |   {slug, name, phone}      |-- INSERT participant -->|                      |
    |                           |<-- participant row ----|                      |
    |                           |-- if first: UPDATE status='active' ->|       |
    |                           |-- BROADCAST player:active ----------->       |
    |<-- {status, position} ----|                        |              TV subscribes
    |                           |                        |              |
    |  (user sees "TAP TO SPIN")|                        |              |-- receives player:active
    |                           |                        |              |   shows "[Name] is spinning..."
    |-- POST /api/spin -------> |                        |              |
    |   {sessionId, phone}       |-- SELECT prizes ------>|              |
    |                           |   (weighted pick)      |              |
    |                           |-- UPDATE prize.inventory_count-1 ---->|
    |                           |-- UPDATE participant.prize_id ------->|
    |                           |-- UPDATE participant.status='completed'->|
    |                           |-- BROADCAST spin:start --------------->       |
    |                           |-- BROADCAST spin:result -------------->       |
    |<-- {prize_name, result_token}|                     |              |-- receives spin:result
    |   shows result + QR code  |                        |              |   animates wheel to prizeNumber
    |                           |-- promote next queued user ----------->|
    |                           |-- BROADCAST player:active (next) ---->|
    |                           |-- BROADCAST queue:updated ------------>       |
    |                           |                        |         All phones receive queue:updated
    |
    | (Staff scans QR)
    |-- GET /api/claim/verify/[result_token] -->
    |                           |-- SELECT participant -->|
    |<-- {name, prize_name, is_fulfilled} ---|
    |-- POST /api/claim/fulfill -->
    |                           |-- UPDATE participant.is_fulfilled=true ->|
    |<-- {success} -------------|
```

### 4.2 Session Recovery Flow

```
User Phone (reconnects)       Next.js API             Supabase DB
    |                              |                        |
    |-- GET /api/queue/status?     |                        |
    |   sessionId=X&phone=Y -----> |                        |
    |                              |-- SELECT participant -->|
    |                              |   WHERE session_id=X   |
    |                              |   AND phone=Y          |
    |<-- {status, position,        |                        |
    |     prize_name, result_token}|                        |
    |   (re-renders correct view)  |                        |
```

### 4.3 Admin Manual End Event

```
Admin Browser                 Next.js API             Supabase DB         Supabase Realtime
    |                              |                        |                      |
    |-- POST /api/sessions/[id]/end|                        |                      |
    |                              |-- UPDATE session.status='ended' -->|          |
    |                              |-- UPDATE queued participants       |          |
    |                              |   status='completed' ------------->|          |
    |                              |-- BROADCAST session:ended -------->           |
    |<-- {success} ----------------|                        |     All clients notified
```

### 4.4 Auto-Skip Flow (30-Second Inactivity Timer)

When a player becomes active, the TV client starts a 30-second countdown. If the player does not spin within that window, the TV fires an auto-skip request.

```
TV Browser (tv-client.tsx)    Next.js API             Supabase DB         Supabase Realtime
    |                              |                        |                      |
    | player:active received       |                        |                      |
    | → setTimeout(30s)            |                        |                      |
    |                              |                        |                      |
    | (30s elapses, no spin)       |                        |                      |
    |-- POST /api/queue/skip ----> |                        |                      |
    |   {session_id, tv_token,     |                        |                      |
    |    participant_id,           |-- Validate tv_token -->|                      |
    |    reason: 'timeout'}        |-- Find active player ->|                      |
    |                              |-- UPDATE participant:  |                      |
    |                              |   status='queued'      |                      |
    |                              |   position=max+1       |                      |
    |                              |   skip_count+1         |                      |
    |                              |   activated_at=null -->|                      |
    |                              |-- BROADCAST player:skipped -------->          |
    |                              |-- promoteNextParticipant() ------->|          |
    |                              |-- UPDATE next: status='active'     |          |
    |                              |         activated_at=now() ------->|          |
    |                              |-- BROADCAST player:active --------->          |
    |                              |-- BROADCAST queue:updated --------->          |
    |<-- {skipped, promoted} ------|                        |                      |
    |                              |                        |         TV receives player:skipped
    |                              |                        |         → resets to idle
    |                              |                        |         TV receives player:active
    |                              |                        |         → shows next player
    |                              |                        |         → starts new 30s timer
```

**Key behaviors:**
- The timer starts when `tvState.phase` transitions to `'player_active'`. It is cancelled if the phase changes (player spins, session ends, etc.).
- The skip request includes `participant_id` so the server can validate the correct player is still active (idempotency guard — multiple TV tabs firing simultaneously only skip once).
- The skipped player is re-queued at the back, not removed. Their `skip_count` is incremented for analytics.
- `activated_at` is cleared on skip and re-set when the player is next promoted.

---

## 5. Shared TypeScript Types

All types live in `src/lib/types.ts`. Implementing agents MUST use these types — do not redefine them locally.

```typescript
// ─── Database row types ───────────────────────────────────────────────────────

export type SessionStatus = 'draft' | 'active' | 'paused' | 'ending' | 'ended';
export type ParticipantStatus = 'queued' | 'active' | 'spinning' | 'completed';
export type WheelTheme = 'corporate' | 'party' | 'holiday';
export type SoundPreset = 'drumroll' | 'gameshow' | 'casino';

export interface Session {
  id: string;
  event_name: string;
  slug: string;
  start_time: string;       // ISO 8601
  end_time: string;         // ISO 8601
  max_spins_per_user: number;
  include_no_prize: boolean;
  theme: WheelTheme;
  sound_preset: SoundPreset;
  tv_token: string;
  status: SessionStatus;
  created_at: string;
  updated_at: string;
}

export interface Prize {
  id: string;
  session_id: string;
  name: string;
  weight: number;
  inventory_count: number;
  is_no_prize: boolean;
}

export interface Participant {
  id: string;
  session_id: string;
  name: string;
  phone: string;
  status: ParticipantStatus;
  queue_position: number;
  prize_id: string | null;
  result_token: string | null;
  spins_used: number;
  is_fulfilled: boolean;
  fulfilled_by: string | null;
  fulfilled_at: string | null;
  spin_started_at: string | null;
  spin_completed_at: string | null;
  skip_count: number;        // incremented each time this participant is auto-skipped or admin-skipped
  activated_at: string | null; // ISO 8601 — set when participant becomes 'active'; drives the 30s auto-skip timer
  joined_at: string;
}

export interface Staff {
  id: string;
  session_id: string;
  name: string;
  invite_code: string;
  device_registered: boolean;
  registered_at: string | null;
}

export interface Admin {
  id: string;
  username: string;
  // password_hash never returned to client
}

// ─── API request/response types ──────────────────────────────────────────────

export interface ApiError {
  error: string;
  code?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  admin: Pick<Admin, 'id' | 'username'>;
}

export interface CreateSessionRequest {
  event_name: string;
  start_time: string;
  end_time: string;
  max_spins_per_user?: number;
  include_no_prize?: boolean;
  theme: WheelTheme;
  sound_preset: SoundPreset;
  prizes: Array<{
    name: string;
    weight: number;
    inventory_count: number;
    is_no_prize?: boolean;
  }>;
}

export interface SessionWithPrizes extends Session {
  prizes: Prize[];
}

export interface JoinQueueRequest {
  session_id: string;
  name: string;
  phone: string;
}

export interface JoinQueueResponse {
  participant_id: string;
  status: ParticipantStatus;
  queue_position: number;
  estimated_wait_seconds: number;
}

export interface QueueStatusResponse {
  participant_id: string;
  status: ParticipantStatus;
  queue_position: number | null;
  estimated_wait_seconds: number | null;
  prize_name: string | null;
  result_token: string | null;
}

export interface SpinRequest {
  session_id: string;
  participant_id: string;
}

export interface SpinResponse {
  prize_id: string;
  prize_name: string;
  prize_index: number;    // wheel slice index for animation
  is_no_prize: boolean;
  result_token: string;
}

export interface StaffRegisterRequest {
  invite_code: string;
  name: string;
}

export interface StaffRegisterResponse {
  staff_id: string;
  session_id: string;
}

export interface ClaimVerifyResponse {
  participant_id: string;
  name: string;
  phone: string;
  prize_name: string;
  is_no_prize: boolean;
  is_fulfilled: boolean;
  fulfilled_by_name: string | null;
  fulfilled_at: string | null;
}

export interface FulfillRequest {
  participant_id: string;
}

export interface FulfillResponse {
  success: boolean;
  fulfilled_at: string;
}

export interface GenerateInviteRequest {
  session_id: string;
  count: number;         // number of codes to generate (1-10)
}

export interface GenerateInviteResponse {
  codes: string[];
}

// ─── Realtime broadcast payload types ────────────────────────────────────────

export interface QueueUpdatedPayload {
  positions: Array<{ id: string; position: number }>;
}

export interface PlayerActivePayload {
  participant_id: string;
  name: string;
  position: number;
}

export interface SpinStartPayload {
  participant_id: string;
  name: string;
}

export interface SpinResultPayload {
  participant_id: string;
  name: string;
  prize_name: string;
  prize_index: number;
  is_no_prize: boolean;
}

export interface WinnerAnnouncedPayload {
  name: string;
  prize_name: string;
  timestamp: string;
}

export interface SessionEndedPayload {
  reason: 'manual' | 'time_expired' | 'queue_drained';
}

export interface PlayerSkippedPayload {
  participant_id: string;
  name: string;
  reason: 'timeout' | 'admin'; // 'timeout' = 30s auto-skip; 'admin' = operator-initiated
}

// Union type for all broadcast events
export type RealtimeEvent =
  | { event: 'queue:updated';   payload: QueueUpdatedPayload }
  | { event: 'player:active';   payload: PlayerActivePayload }
  | { event: 'player:skipped';  payload: PlayerSkippedPayload }
  | { event: 'spin:start';      payload: SpinStartPayload }
  | { event: 'spin:result';     payload: SpinResultPayload }
  | { event: 'winner:announced';payload: WinnerAnnouncedPayload }
  | { event: 'session:ended';   payload: SessionEndedPayload };

// ─── Auth context types ───────────────────────────────────────────────────────

export interface AdminJwtPayload {
  sub: string;           // admin.id
  username: string;
  role: 'admin';
  iat: number;
  exp: number;
}

export interface StaffSessionPayload {
  staff_id: string;
  session_id: string;
  role: 'staff';
}
```

---


## 6. API Contract

All API routes are under `/api/`. All responses are JSON. Errors always return `{ "error": string }` with an appropriate HTTP status code. Server-side routes use the Supabase service-role client (bypasses RLS). Client-facing routes use the anon client where RLS is appropriate.

### Auth Routes

#### `POST /api/auth/login`

Validates admin credentials and sets a JWT in an httpOnly cookie.

Request:
```json
{ "username": "admin", "password": "plaintext" }
```

Response `200`:
```json
{ "admin": { "id": "uuid", "username": "admin" } }
```

Errors: `401 { "error": "Invalid credentials" }`, `422 { "error": "Username and password required" }`

Cookie set: `spin_admin_token` — httpOnly, Secure, SameSite=Strict, Max-Age=86400

---

#### `POST /api/auth/logout`

Clears the admin JWT cookie.

Response `200`: `{ "success": true }`

---

#### `POST /api/auth/staff`

Validates a one-time invite code and registers the staff device. Returns a staff session cookie.

Request:
```json
{ "invite_code": "ABC123", "name": "Jane Smith" }
```

Response `200`:
```json
{ "staff_id": "uuid", "session_id": "uuid" }
```

Errors: `404 { "error": "Invalid invite code" }`, `409 { "error": "Invite code already used" }`

Cookie set: `spin_staff_token` — httpOnly, Secure, SameSite=Strict

---

### Session Routes

#### `GET /api/sessions`

Returns all sessions. Requires admin JWT.

Response `200`:
```json
{
  "sessions": [
    {
      "id": "uuid",
      "event_name": "Summer Party",
      "slug": "summer-party",
      "start_time": "2026-08-03T18:00:00Z",
      "end_time": "2026-08-03T22:00:00Z",
      "status": "active",
      "created_at": "2026-08-03T10:00:00Z"
    }
  ]
}
```

---

#### `POST /api/sessions`

Creates a new session with prizes. Requires admin JWT. Auto-generates `slug` and `tv_token`.

Request: `CreateSessionRequest` (see Section 5)

Response `201`:
```json
{
  "session": { ...Session },
  "prizes": [ ...Prize[] ]
}
```

Errors: `422` validation errors (missing fields, invalid theme/preset, duplicate event_name), `409 { "error": "Slug already exists" }`

---

#### `GET /api/sessions/[id]`

Returns full session with prizes. Requires admin JWT.

Optionally accepts a `?include=` query parameter (comma-separated) to fetch additional data for TV recovery. When using `include=`, either an admin JWT or a valid `?tv_token=<session.tv_token>` is required.

**TV recovery usage:**
```
GET /api/sessions/{id}?include=active_participant,last_winner,winners,queue&tv_token={tv_token}
```

Supported `include` values:

| Value | Returns |
|---|---|
| `active_participant` | `{ id, name, status, queue_position }` of the current `active`/`spinning` participant, or `null` |
| `last_winner` | Most recent completed participant with a real prize (not `is_no_prize`), or `null` |
| `winners` | Full array of all completed participants with real prizes, ordered by `spin_completed_at DESC` |
| `queue` | Array of `{ id, name, position }` for all `queued` participants, ordered by `queue_position ASC` |

Response `200`: `{ "session": SessionWithPrizes, ...included fields }`

---

#### `PUT /api/sessions/[id]`

Full update of session fields and prizes. Requires admin JWT. Only allowed when status is `draft` or `active`.

Request: `CreateSessionRequest` (same shape as POST)

Response `200`: `{ "session": SessionWithPrizes }`

Errors: `403 { "error": "Cannot edit an ended session" }`

---

#### `PATCH /api/sessions/[id]`

Partial update — status transitions only. Requires admin JWT.

Request:
```json
{ "status": "active" }
```

Valid transitions: `draft → active`, `active → ending`, `ending → ended`

Response `200`: `{ "session": Session }`

Errors: `422 { "error": "Invalid status transition" }`

---

#### `POST /api/sessions/[id]/end`

Immediately ends the event. Sets status to `ended`, marks all queued participants as `completed`, broadcasts `session:ended`.

Requires admin JWT.

Request: `{}`

Response `200`: `{ "success": true }`

---

### Queue Routes

#### `POST /api/queue/join`

Registers a user and places them in the queue (or promotes them immediately if queue is empty).

Request:
```json
{ "session_id": "uuid", "name": "Alice", "phone": "+13035551234" }
```

Response `201`:
```json
{
  "participant_id": "uuid",
  "status": "active",
  "queue_position": 1,
  "estimated_wait_seconds": 0
}
```

Errors:
- `404 { "error": "Session not found" }`
- `409 { "error": "Phone number already registered for this session" }`
- `422 { "error": "Session is not accepting new participants" }` — status not `active`, or past `end_time`
- `422 { "error": "Invalid phone number format" }`

---

#### `GET /api/queue/status?sessionId=uuid&phone=E164`

Session recovery endpoint. Returns current state for a phone number within a session.

Response `200`: `QueueStatusResponse` (see Section 5)

Errors: `404 { "error": "Participant not found" }`

---

#### `POST /api/queue/skip`

Skips the currently active player and re-queues them at the back of the queue. Supports both auto-timeout (TV-initiated) and admin-initiated skips.

**Authentication:** Provide either `tv_token` (for timeout skips from the TV page) or an admin JWT cookie (for admin-initiated skips).

Request:
```json
{
  "session_id": "uuid",
  "participant_id": "uuid",
  "tv_token": "uuid",
  "reason": "timeout"
}
```

| Field | Required | Description |
|---|---|---|
| `session_id` | Yes | Session to apply the skip to |
| `participant_id` | Recommended | ID of the player expected to be active. Acts as an idempotency guard — if the active player no longer matches, the skip is a no-op. Required when called from the TV auto-skip timer. |
| `tv_token` | Conditional | Required when called without an admin JWT (TV timeout path) |
| `reason` | No | `'timeout'` (default) or `'admin'` |

Response `200`:
```json
{
  "skipped": {
    "participant_id": "uuid",
    "name": "Alice",
    "new_position": 7
  },
  "promoted": {
    "participant_id": "uuid",
    "name": "Bob"
  }
}
```
`promoted` is `null` if no queued participants remain.

Errors:
- `404 { "error": "Session not found" }`
- `404 { "error": "No active player to skip" }`
- `422 { "error": "Session is not active" }` — status is `draft` or `ended`
- `401` — no valid auth

**Side effects on success:**
1. Skipped participant: `status` → `'queued'`, `queue_position` → `max + 1`, `skip_count` incremented, `activated_at` cleared
2. Broadcasts: `player:skipped`, `player:active` (if promoted), `queue:updated`

---

### Spin Route

#### `POST /api/spin`

Core game logic. Validates the participant is `active`, calculates the weighted prize, decrements inventory atomically, persists the result, broadcasts events, and promotes the next player.

Request:
```json
{ "session_id": "uuid", "participant_id": "uuid" }
```

Response `200`: `SpinResponse` (see Section 5)

Errors:
- `403 { "error": "Participant is not in active state" }`
- `403 { "error": "Spin limit reached" }`
- `409 { "error": "No prizes available" }` — all inventory depleted and include_no_prize is false
- `422 { "error": "Session is not active" }`

**Side effects on success:**
1. `participant.status` → `'completed'`
2. `participant.prize_id` → selected prize UUID
3. `participant.result_token` → new crypto-random UUID
4. `participant.spins_used` incremented
5. `participant.spin_completed_at` → now()
6. `prize.inventory_count` decremented by 1 (atomic)
7. Broadcasts: `spin:start`, `spin:result`, `winner:announced` (if not no_prize), `player:active` (next user), `queue:updated`

---

### Claim Routes

#### `GET /api/claim/verify/[token]`

Looks up a participant by their result token. Used by staff after scanning the QR code.

Requires admin JWT OR staff session cookie.

Response `200`: `ClaimVerifyResponse` (see Section 5)

Errors: `404 { "error": "Result token not found" }`

---

#### `POST /api/claim/fulfill`

Marks a participant's prize as fulfilled. Idempotent — second call returns error.

Requires admin JWT OR staff session cookie.

Request:
```json
{ "participant_id": "uuid" }
```

Response `200`: `FulfillResponse`

Errors: `409 { "error": "Prize already fulfilled" }`, `404 { "error": "Participant not found" }`

---

#### `GET /api/claim/search?sessionId=uuid&q=searchterm`

Searches participants by name or phone (partial match). Requires admin JWT OR staff session cookie.

Response `200`:
```json
{
  "results": [
    {
      "participant_id": "uuid",
      "name": "Alice",
      "phone": "+13035551234",
      "prize_name": "Free Drink",
      "is_fulfilled": false
    }
  ]
}
```

---

### Staff Routes

#### `POST /api/staff/generate`

Generates one or more invite codes for a session. Requires admin JWT.

Request: `GenerateInviteRequest`

Response `201`: `GenerateInviteResponse`

Errors: `422 { "error": "count must be between 1 and 10" }`

---

### Export Route

#### `GET /api/export/[sessionId]`

Streams a CSV download of all participants for the session. Requires admin JWT.

Response `200`: `Content-Type: text/csv`, `Content-Disposition: attachment; filename="session-{slug}-report.csv"`

CSV columns (in order):
`name, phone, prize_won, fulfilled, queue_position, joined_at, spin_completed_at, fulfilled_at, fulfilled_by_staff_name`

Errors: `404 { "error": "Session not found" }`, `403` if not admin

---


## 7. Supabase Realtime Channel Design

### Channel Naming

One channel per session: `session:{session_id}` (UUID)

Clients subscribe using the Supabase JS client:
```typescript
const channel = supabase.channel(`session:${sessionId}`);
```

All messages use Supabase Broadcast (not Postgres Changes). This means:
- Lower latency — messages go through Supabase Realtime, not DB triggers
- Server publishes via the service-role client
- Clients subscribe via the anon client (no auth required to subscribe)

### Events Reference

| Event | Publisher | Subscribers | Payload Type |
|---|---|---|---|
| `queue:updated` | `/api/queue/join`, `/api/spin`, `/api/queue/skip` | All queued phones | `QueueUpdatedPayload` |
| `player:active` | `/api/queue/join`, `/api/spin`, `/api/queue/skip` | TV, promoted phone | `PlayerActivePayload` |
| `player:skipped` | `/api/queue/skip` | TV | `PlayerSkippedPayload` |
| `spin:start` | `/api/spin` | TV | `SpinStartPayload` |
| `spin:result` | `/api/spin` | TV, active phone | `SpinResultPayload` |
| `winner:announced` | `/api/spin` | TV | `WinnerAnnouncedPayload` |
| `session:ended` | `/api/sessions/[id]/end`, `queueManager` (queue drained) | All connected clients | `SessionEndedPayload` |

### Server-Side Broadcast Pattern

```typescript
// src/lib/supabase/server.ts — broadcast helper
export async function broadcastEvent(
  sessionId: string,
  event: string,
  payload: object
): Promise<void> {
  const supabase = createServiceClient();
  await supabase.channel(`session:${sessionId}`).send({
    type: 'broadcast',
    event,
    payload,
  });
}
```

### Client-Side Subscription Pattern

```typescript
// Used in TV and mobile pages
import { createBrowserClient } from '@/lib/supabase/client';

useEffect(() => {
  const supabase = createBrowserClient();
  const channel = supabase
    .channel(`session:${sessionId}`)
    .on('broadcast', { event: 'spin:result' }, ({ payload }) => {
      // handle SpinResultPayload
    })
    .on('broadcast', { event: 'queue:updated' }, ({ payload }) => {
      // handle QueueUpdatedPayload
    })
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}, [sessionId]);
```

### Reconnection Strategy

- Supabase JS client automatically reconnects on disconnect.
- On reconnect, clients call `GET /api/queue/status` or re-fetch session state via REST to re-sync.
- The channel subscription is re-established automatically by the Supabase client.
- TV page fetches the current active player and last winner on mount and on Visibility change.

### Winner Leaderboard: Pending Announcements Queue

The TV client uses a ref-based queue to defer leaderboard updates until the wheel animation finishes. This prevents `winner:announced` events from being lost when they arrive during the spin animation.

```
spin:result received
  → pendingWinnerRef set (prize data for overlay)
  → setTvState({ phase: 'spinning' })
  → wheel animation starts

winner:announced received (during animation)
  → pushed to pendingAnnouncementsRef[]   ← buffered, NOT applied yet

wheel animation stops (onStopSpinning callback)
  → pendingWinnerRef drained → winner overlay shown
  → pendingAnnouncementsRef[] drained → all entries prepended to winners state
  → leaderboard updates in one batch
```

This handles:
- Single spin: one entry added after wheel stops. ✓
- Multiple `winner:announced` events before stop (edge case / rapid replay): all accumulate and drain together. ✓
- TV page reload mid-event: recovery `syncState` fetches the full authoritative winners list from `GET /api/sessions/[id]?include=winners`, replacing local state entirely. ✓

---

## 8. Authentication Flow

### 8.1 Admin Authentication

```
1. Admin submits username + password to POST /api/auth/login
2. Server queries admins table, compares with bcrypt.compare()
3. On success: sign JWT with { sub: admin.id, username, role: 'admin', exp: +24h }
4. Set httpOnly cookie: spin_admin_token=<JWT>; Secure; SameSite=Strict; Max-Age=86400
5. Return { admin: { id, username } }

Subsequent admin requests:
- Next.js middleware (src/middleware.ts) checks cookie on /admin/* and /api/*
- Calls jwt.verify() — on failure, redirect to /admin/login or return 401
- On success, attaches admin payload to request headers for route handlers
```

### 8.2 Staff Authentication

```
1. Staff enters invite code + name to POST /api/auth/staff
2. Server queries staff table WHERE invite_code = ? AND device_registered = false
3. On success: UPDATE staff SET device_registered=true, registered_at=now()
4. Sign a staff JWT: { staff_id, session_id, role: 'staff', exp: session.end_time + 24h }
5. Set httpOnly cookie: spin_staff_token=<JWT>; Secure; SameSite=Strict
6. Return { staff_id, session_id }

Subsequent staff requests (/api/claim/*):
- Route handlers check spin_staff_token cookie OR spin_admin_token cookie
- Admin cookie is always sufficient (admin has superset of staff permissions)
```

### 8.3 Middleware Pattern

`src/middleware.ts` (Next.js Edge Middleware):

```typescript
// Protects /admin/* routes (pages) — redirects to /admin/login if no valid JWT
// Does NOT protect API routes — API routes handle auth internally
export const config = {
  matcher: ['/admin/:path*'],
};
```

API route auth guard pattern (used in each protected route handler):
```typescript
import { requireAdmin } from '@/lib/auth/middleware';

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request); // throws 401 if invalid
  // ... handler logic
}
```

### 8.4 TV Token Auth

- No cookie required for TV
- Token is embedded in the URL: `/tv/[token]`
- Page component queries `SELECT * FROM sessions WHERE tv_token = token`
- If not found or session is `ended`, render 404 page
- Token is a UUID v4 generated at session creation — not guessable

### 8.5 Mobile User "Auth"

- No authentication — users are identified by phone number within a session
- Phone number uniqueness is enforced at the DB level (UNIQUE index on session_id + phone)
- Session recovery uses phone number as the lookup key

---

## 9. Patterns Implementing Agents Must Follow

### 9.1 TypeScript / Next.js App Router

- Use **Server Components** by default. Only add `'use client'` when you need browser APIs, event handlers, or hooks.
- **Route Handlers** (`route.ts`) are server-only. Never import client-side libraries into route handlers.
- Use `NextRequest` / `NextResponse` from `next/server` in route handlers.
- Use `async/await` throughout — no callback patterns.
- Define all request/response types in `src/lib/types.ts` before implementing handlers.
- Use TypeScript strict mode (`strict: true` in tsconfig.json).

### 9.2 Supabase Client Usage

| Context | Client | Import From |
|---|---|---|
| Server Components, Route Handlers | Service role client | `@/lib/supabase/server.ts` |
| Client Components (browser) | Anon client | `@/lib/supabase/client.ts` |
| Realtime subscriptions | Anon client (browser) | `@/lib/supabase/client.ts` |

Never use the service-role client in client components — it would expose the secret key.

### 9.3 Error Handling

- All route handlers wrap their body in try/catch.
- Catch blocks return `NextResponse.json({ error: message }, { status: code })`.
- Never expose stack traces or internal DB errors to clients.
- Log errors server-side with `console.error()` (captured by Vercel logs).

Example pattern:
```typescript
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // validate...
    // execute...
    return NextResponse.json({ result }, { status: 201 });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error('[POST /api/queue/join]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

### 9.4 Database Transactions

Use Supabase's `rpc()` for operations that require atomicity (inventory decrement, queue promotion). Define PostgreSQL functions in migration files.

Example for atomic prize decrement:
```sql
-- In migration file
CREATE OR REPLACE FUNCTION decrement_prize_inventory(p_prize_id uuid)
RETURNS boolean AS $$
DECLARE
  updated_count int;
BEGIN
  UPDATE prizes
  SET inventory_count = inventory_count - 1
  WHERE id = p_prize_id AND inventory_count > 0;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$$ LANGUAGE plpgsql;
```

### 9.5 Environment Variable Access

- `NEXT_PUBLIC_*` variables: accessible in both server and client code
- Non-prefixed variables: server-side only (route handlers, server components)
- Never access `process.env` in client components — use only `NEXT_PUBLIC_*` vars there

### 9.6 Tailwind CSS

- Use Tailwind utility classes only — no custom CSS files except `globals.css` for base resets.
- TV-specific styles: design for 1920×1080. Use `text-6xl` / `text-8xl` for winner display.
- Mobile styles: optimize for 375px width. Use full-width buttons (`w-full`), large touch targets (`min-h-[56px]`).
- Dark theme for TV: `bg-gray-950 text-white`.
- High contrast for mobile: sufficient contrast ratio for noisy environments.

### 9.7 Component Lazy Loading

Per technical requirements Section 10:
- `SpinWheel` (react-custom-roulette): lazy load only on `/tv/[token]`
- `QrScanner` (html5-qrcode): lazy load only on `/claim`
- Use `dynamic(() => import(...), { ssr: false })` for browser-only components

```typescript
const SpinWheel = dynamic(() => import('@/components/tv/SpinWheel'), { ssr: false });
```

### 9.8 Sound Preloading

On the TV page, preload audio files in a `useEffect` on mount:
```typescript
useEffect(() => {
  const audio = new Audio(`/sounds/${soundPreset}.mp3`);
  audio.preload = 'auto';
  audioRef.current = audio;
}, [soundPreset]);
```

Never create Audio objects at the module level — they require a browser context.

### 9.9 Testing Conventions

- Unit tests: co-located with source files (`*.test.ts` / `*.test.tsx`) for utility functions and game logic.
- Integration tests: in `src/__tests__/integration/` for API route tests using `@supabase/supabase-js` against the local Supabase instance.
- Test framework: Vitest (preferred) or Jest — align with what Task 1 scaffolds.
- Mock Supabase client in unit tests; use the real local instance for integration tests.
- Coverage target: 80% for `src/lib/game/` (prize picker, queue manager).

---

## 10. Security Checklist (All Implementing Agents Must Verify)

- [ ] Prize calculation is server-side only — no prize data passed from client in spin request
- [ ] Admin JWT verified on every protected route handler call
- [ ] Staff cookie verified on every `/api/claim/*` call
- [ ] Phone numbers validated with a regex before DB insert (E.164 format recommended)
- [ ] Invite codes are single-use — checked and invalidated atomically
- [ ] `password_hash` column never returned in any API response
- [ ] `tv_token` and `result_token` generated with `crypto.randomUUID()` (not Math.random)
- [ ] All DB queries use parameterized values (Supabase JS client handles this automatically)
- [ ] CSV export streams — does not load all rows into memory at once for large sessions
- [ ] Rate limiting headers set on `/api/queue/join` and `/api/spin` (Vercel rate limit or middleware)

---

## 11. Open Questions and Risks

| # | Item | Risk Level | Recommendation |
|---|---|---|---|
| 1 | Supabase Broadcast requires the server to join the channel before publishing. The Supabase JS service-role client can broadcast, but the channel must be subscribed before `send()` returns reliably. Test this in Task 5. | High | Verify broadcast delivery in integration tests. Consider using Supabase `realtime.broadcast` REST endpoint as fallback. |
| 2 | `react-custom-roulette` `prizeNumber` prop controls the final position. The wheel library spins to that index. The prize list order on the TV must exactly match the server's prize array order. If prizes are reordered or filtered, the wheel lands on the wrong slice. | High | Server always returns `prize_index` as the position in the full, ordered prize array (including no-prize slot). TV renders wheel slices in the same DB insertion order. Never re-sort client-side. |
| 3 | Supabase free tier: 200 concurrent Realtime connections. At 250 attendees (each with a phone + TV + admin), this may be exceeded. | Medium | Each mobile user connects to one channel. TV and admin also connect. 250 phones + 1 TV + 1 admin = 252 connections — within limit. Monitor in production. |
| 4 | `html5-qrcode` requires camera permission on staff device. iOS Safari requires HTTPS for camera access. Preview deployments are HTTPS by default on Vercel. Local dev (http://localhost) also works. | Low | Document in local-development.md that staff claim testing must be done over HTTPS or localhost. |
| 5 | The `POST /api/spin` endpoint must be idempotent at the participant level — if a phone double-taps and sends two concurrent POST requests, the second must be rejected (participant already `spinning` or `completed`). | Medium | Check participant status at the start of the spin handler before any DB writes. Use a DB-level status check in the UPDATE statement. |
| 6 | Admin password seeding: the `supabase/seed.sql` file must hash the password with bcrypt before inserting. A plain-text seed is a security risk. | Medium | Use a pre-computed bcrypt hash in seed.sql with a documented test password. Never commit real credentials. |
| 7 | No explicit session for mobile users means a user could re-register with a different name but the same phone. The UNIQUE index on (session_id, phone) prevents duplicate entries but doesn't prevent someone sharing a phone. | Low | Acceptable for v1. Out of scope per business requirements. |
| 8 | **Multi-TV auto-skip race:** If multiple browser tabs have the TV page open for the same session, all of them independently start the 30-second auto-skip timer and fire `POST /api/queue/skip` simultaneously. | High | The skip endpoint must validate `participant_id` matches the current active player before applying. If it does not match (already processed), return `200 { skipped: null }` — idempotent no-op. The TV client must include `participant_id` in auto-skip requests. |
| 9 | ~~**`skipped` ParticipantStatus is dead code**~~ **RESOLVED** — `'skipped'` has been removed from `ParticipantStatus` and the DB CHECK constraint. `skip_count` field and `player:skipped` realtime event provide sufficient audit information. | Resolved | ✓ |
| 10 | **`include=` auth bypass scope:** `GET /api/sessions/[id]` accepts a `tv_token` to skip admin JWT verification for any `include` parameter value. The TV URL is visible on-screen and in browser history, making the token low-friction to capture. | Medium | Restrict the token-auth path to only the `include` values the TV page actually needs: `active_participant`, `last_winner`, `winners`, `queue`. Reject unknown include values with a 403 when using token auth. |
