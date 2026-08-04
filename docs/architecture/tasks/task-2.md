---
id: task-2
task: Build admin authentication (JWT/httpOnly cookie) and session management API with admin UI
agent: backend
status: approved
depends_on: [task-1]
skills:
  - global/security
  - testing/philosophy
context:
  project: spin-and-win
  branch: feature/task-2-admin-auth-sessions
  files:
    - src/app/api/auth/login/route.ts
    - src/app/api/auth/logout/route.ts
    - src/app/api/sessions/route.ts
    - src/app/api/sessions/[id]/route.ts
    - src/app/api/sessions/[id]/end/route.ts
    - src/app/api/staff/generate/route.ts
    - src/lib/auth/jwt.ts
    - src/lib/auth/middleware.ts
    - src/middleware.ts
    - src/lib/utils/slugify.ts
    - src/lib/utils/tokenGen.ts
    - src/app/admin/login/page.tsx
    - src/app/admin/layout.tsx
    - src/app/admin/sessions/page.tsx
    - src/app/admin/sessions/new/page.tsx
    - src/app/admin/sessions/[id]/page.tsx
    - src/app/admin/staff/page.tsx
    - src/components/admin/SessionForm.tsx
    - src/components/admin/PrizeEditor.tsx
acceptance_criteria:
  - POST /api/auth/login with valid credentials returns 200 and sets spin_admin_token cookie (httpOnly, Secure, SameSite=Strict, Max-Age=86400)
  - POST /api/auth/login with invalid credentials returns 401 with body {"error":"Invalid credentials"}
  - POST /api/auth/login with missing fields returns 422
  - POST /api/auth/logout clears the spin_admin_token cookie and returns 200
  - GET /api/sessions without a valid JWT cookie returns 401
  - GET /api/sessions with a valid JWT returns 200 with a sessions array
  - POST /api/sessions creates a session and its prizes, returns 201 with the created session and prizes
  - POST /api/sessions auto-generates a unique slug from event_name (URL-safe, lowercase, hyphenated)
  - POST /api/sessions auto-generates a tv_token using crypto.randomUUID()
  - POST /api/sessions with a duplicate slug returns 409
  - POST /api/sessions with missing required fields (event_name, start_time, end_time, theme, sound_preset) returns 422
  - GET /api/sessions/[id] returns the session with its prizes array
  - PUT /api/sessions/[id] updates session fields and replaces prizes; returns 200
  - PUT /api/sessions/[id] on an ended session returns 403
  - PATCH /api/sessions/[id] with {"status":"active"} transitions a draft session to active; returns 200
  - PATCH /api/sessions/[id] with an invalid transition (e.g., ended → active) returns 422
  - POST /api/sessions/[id]/end sets session status to ended; returns 200
  - POST /api/staff/generate with count=3 inserts 3 staff rows and returns an array of 3 invite codes
  - Next.js middleware redirects unauthenticated requests to /admin/* pages to /admin/login
  - Admin login page renders a form with username and password fields and submits to /api/auth/login
  - Admin sessions list page renders sessions fetched from /api/sessions
  - Session creation form validates that end_time is after start_time before submitting
  - Unit tests cover: jwt.sign/verify round-trip, requireAdmin throws on missing/expired/invalid token, slugify produces correct output for edge cases (spaces, special chars, duplicates)
---

## Instructions

This task builds the admin authentication layer and all session management API routes. It is a prerequisite for the spin engine (task-5), staff code generation (used in task-8), and the live dashboard (task-9).

### 1. JWT utilities (`src/lib/auth/jwt.ts`)

Use the `jose` library (install: `npm install jose`) for JWT operations — it is edge-compatible.

```typescript
import { SignJWT, jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.JWT_SECRET!);

export async function signAdminJwt(payload: { sub: string; username: string }): Promise<string> {
  return new SignJWT({ ...payload, role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(secret);
}

export async function verifyAdminJwt(token: string): Promise<AdminJwtPayload> {
  const { payload } = await jwtVerify(token, secret);
  return payload as AdminJwtPayload;
}
```

### 2. Auth middleware (`src/lib/auth/middleware.ts`)

Export `requireAdmin(request: NextRequest)` — reads the `spin_admin_token` cookie, verifies it, returns the payload or throws with a 401 response. All protected route handlers call this first.

### 3. Next.js edge middleware (`src/middleware.ts`)

Protect `/admin/*` page routes (not API routes — those handle auth internally):

```typescript
export const config = { matcher: ['/admin/:path*'] };
```

On missing or invalid JWT: redirect to `/admin/login`. Pass through if JWT is valid or if the path is `/admin/login` itself.

### 4. Login route (`src/app/api/auth/login/route.ts`)

- Parse body: `{ username, password }`
- Query `admins` table with service client
- Use `bcryptjs` (install: `npm install bcryptjs @types/bcryptjs`) to compare password
- On success: sign JWT, set cookie with `response.cookies.set()`
- Never return the `password_hash` field

### 5. Session CRUD routes

**`POST /api/sessions`:**
- Validate all required fields
- Generate slug: `slugify(event_name)` — lowercase, hyphenate spaces, strip special chars, append random suffix if slug exists
- Generate `tv_token`: `crypto.randomUUID()`
- Insert session row, then insert all prize rows in a single batch
- Return `{ session, prizes }`

**`PUT /api/sessions/[id]`:**
- Check session exists and status is not `ended`
- Update session fields
- Delete existing prizes and re-insert new ones (simplest approach for v1)

**`PATCH /api/sessions/[id]`:**
- Validate the transition is legal (see valid transitions in architecture.md Section 6 API contract)
- Update status only

**`POST /api/sessions/[id]/end`:**
- Set session status → `ended`
- Set all participants with status `queued` → `completed`
- Do NOT broadcast here — the spin engine (task-5) handles broadcasting. Leave a `// TODO: broadcast session:ended` comment for task-10 to implement.

### 6. Staff invite code generation (`src/app/api/staff/generate/route.ts`)

- Validate `count` is between 1 and 10
- Generate `count` invite codes using `crypto.randomUUID().slice(0, 8).toUpperCase()`
- Insert staff rows with `device_registered: false`
- Return the array of codes

### 7. Admin UI (pages)

Build minimal but functional admin UI pages:

- **`/admin/login`**: Server-rendered form. On submit, POST to `/api/auth/login`, redirect to `/admin/sessions` on success.
- **`/admin/sessions`**: Fetch and list all sessions (Server Component). Link to create new and edit existing.
- **`/admin/sessions/new`**: `SessionForm` component. Includes `PrizeEditor` sub-component for adding/removing prizes.
- **`/admin/sessions/[id]`**: Pre-populate `SessionForm` with existing session data.
- **`/admin/staff`**: Show existing staff codes for a session; button to generate more.

`SessionForm` must validate:
- All required fields present
- `end_time > start_time`
- At least one prize with weight > 0 and inventory_count >= 1
- Theme is one of: corporate, party, holiday
- Sound preset is one of: drumroll, gameshow, casino

### 8. Security requirements

- `password_hash` must NEVER appear in any API response
- JWT_SECRET must be at minimum 32 characters (validate on startup)
- bcrypt cost factor must be 12 (match what seed.sql used)
- Cookie flags: httpOnly=true, secure=true, sameSite='strict'
- All admin API routes must call `requireAdmin()` before any business logic

### TypeScript + Next.js Patterns

Follow idiomatic TypeScript + Next.js App Router patterns. Reference technical-requirements.md for all architectural decisions. Use the shared types from `src/lib/types.ts` — do not redefine types locally.
