---
id: task-8
task: Build staff device registration via invite code and the prize fulfillment interface (QR scan + search)
agent: backend
status: approved
depends_on: [task-2]
skills:
  - global/security
  - testing/philosophy
context:
  project: spin-and-win
  branch: feature/task-8-staff-fulfillment
  files:
    - src/app/claim/page.tsx
    - src/app/api/auth/staff/route.ts
    - src/app/api/claim/verify/[token]/route.ts
    - src/app/api/claim/fulfill/route.ts
    - src/app/api/claim/search/route.ts
    - src/components/claim/InviteCodeGate.tsx
    - src/components/claim/QrScanner.tsx
    - src/components/claim/WinnerCard.tsx
    - src/components/claim/SearchForm.tsx
acceptance_criteria:
  - GET /claim with no staff cookie and no admin cookie renders the InviteCodeGate (invite code entry form)
  - GET /claim with a valid staff cookie renders the fulfillment interface directly (no code re-entry)
  - POST /api/auth/staff with a valid unused invite_code and a name sets device_registered=true, registered_at=now(), and returns a staff session cookie (spin_staff_token)
  - POST /api/auth/staff with a non-existent invite_code returns 404 {"error":"Invalid invite code"}
  - POST /api/auth/staff with an already-used invite_code returns 409 {"error":"Invite code already used"}
  - GET /api/claim/verify/[token] with a valid result_token returns 200 with ClaimVerifyResponse including name, phone, prize_name, is_fulfilled, fulfilled_by_name, fulfilled_at
  - GET /api/claim/verify/[token] with an invalid token returns 404
  - GET /api/claim/verify/[token] requires staff or admin cookie — returns 401 without either
  - POST /api/claim/fulfill with a valid participant_id marks is_fulfilled=true, sets fulfilled_by to the staff.id from the cookie, sets fulfilled_at=now()
  - POST /api/claim/fulfill returns 200 {"success":true,"fulfilled_at":"..."}
  - POST /api/claim/fulfill on an already-fulfilled participant returns 409 {"error":"Prize already fulfilled"}
  - POST /api/claim/fulfill requires staff or admin cookie — returns 401 without either
  - GET /api/claim/search?sessionId=X&q=alice returns all participants whose name ILIKE '%alice%' OR phone ILIKE '%alice%'
  - GET /api/claim/search returns 401 without staff or admin cookie
  - GET /api/claim/search with q shorter than 2 characters returns 422 {"error":"Search query must be at least 2 characters"}
  - QrScanner component is lazy-loaded with dynamic import ssr:false
  - After scanning a valid QR code, WinnerCard displays the participant's name, prize, and a "Mark Fulfilled" button
  - WinnerCard for an already-fulfilled prize shows a red "Already Claimed!" banner with who fulfilled it and when (not the fulfill button)
  - SearchForm allows switching between QR scan mode and name/phone search mode
  - Unit test: POST /api/auth/staff — valid code sets device_registered=true and returns cookie
  - Unit test: POST /api/claim/fulfill — second fulfill attempt returns 409
---

## Instructions

This task builds the staff side of the application: device registration via invite code, QR scanning to look up a winner, and the fulfill action. Admins bypass the invite code gate (they use their admin cookie).

### 1. Staff auth route (`src/app/api/auth/staff/route.ts`)

```
POST /api/auth/staff
Body: { invite_code, name }
```

Implementation:
1. Validate both fields are non-empty.
2. Query staff table WHERE invite_code = ? using service client.
3. If not found: 404.
4. If `device_registered = true`: 409.
5. Atomically: `UPDATE staff SET device_registered=true, registered_at=now(), name=? WHERE id=?`.
6. Sign a staff JWT: `{ staff_id, session_id, role: 'staff', exp: '+48h' }`.
7. Set cookie `spin_staff_token` (httpOnly, Secure, SameSite=Strict).
8. Return `{ staff_id, session_id }`.

The invite code check and update must be atomic. Use a single `UPDATE ... WHERE invite_code = ? AND device_registered = false` and check rowcount to prevent race conditions.

### 2. Auth guard for claim routes

Create a helper `requireStaffOrAdmin(request: NextRequest)` in `src/lib/auth/middleware.ts`:
- Check `spin_admin_token` cookie first (admin has full access).
- If not admin: check `spin_staff_token` cookie.
- If neither valid: throw 401.
- Return `{ role: 'admin', adminId } | { role: 'staff', staffId, sessionId }`.

### 3. Claim verify route (`src/app/api/claim/verify/[token]/route.ts`)

```
GET /api/claim/verify/[token]
```

1. Call `requireStaffOrAdmin`.
2. Query participants JOIN prizes ON prize_id JOIN staff ON fulfilled_by WHERE result_token = ?.
3. If not found: 404.
4. Return `ClaimVerifyResponse` — include `fulfilled_by_name` (staff.name) and `fulfilled_at`.

Note: A participant with `is_no_prize=true` winner can still have a result_token if the event configured "no prize" entries. The claim interface should show "No Prize" with no fulfill button in this case (verify based on prize.is_no_prize).

### 4. Claim fulfill route (`src/app/api/claim/fulfill/route.ts`)

```
POST /api/claim/fulfill
Body: { participant_id }
```

1. Call `requireStaffOrAdmin` — extract `staffId` (or use admin.id for admins).
2. Fetch participant by ID.
3. If not found: 404.
4. If `is_fulfilled = true`: 409.
5. `UPDATE participants SET is_fulfilled=true, fulfilled_by=?, fulfilled_at=now() WHERE id=? AND is_fulfilled=false`.
6. Check rowcount — if 0 (race condition: fulfilled between step 4 and 5): 409.
7. Return `{ success: true, fulfilled_at }`.

The double-check at step 6 prevents race conditions from two staff members fulfilling simultaneously.

### 5. Claim search route (`src/app/api/claim/search/route.ts`)

```
GET /api/claim/search?sessionId=uuid&q=searchterm
```

1. Validate `q.length >= 2`.
2. Call `requireStaffOrAdmin`.
3. Query:
   ```sql
   SELECT p.id, p.name, p.phone, pr.name as prize_name, p.is_fulfilled
   FROM participants p
   LEFT JOIN prizes pr ON p.prize_id = pr.id
   WHERE p.session_id = $1
     AND p.status = 'completed'
     AND (p.name ILIKE $2 OR p.phone ILIKE $2)
   LIMIT 20
   ```
   Where `$2` = `%${q}%`.
4. Return `{ results: [...] }`.

### 6. Claim page (`src/app/claim/page.tsx`)

Server Component — reads cookies to determine if staff/admin is authenticated:
- If valid cookie: render the fulfillment interface (pass staff/session info to client component).
- If no valid cookie: render `InviteCodeGate`.

Note: Since this is edge middleware, reading cookies on the server requires `cookies()` from `next/headers`.

### 7. InviteCodeGate component

```tsx
'use client';
// Form: invite_code (text input) + name (text input) + submit
// Submits to POST /api/auth/staff
// On success: router.refresh() to re-render the page with the new cookie
// On error: display the error message inline
```

### 8. QrScanner component (`src/components/claim/QrScanner.tsx`)

Install: `npm install html5-qrcode`

```tsx
'use client';
// Lazy loaded: const QrScanner = dynamic(() => import(...), { ssr: false })
// Props: { onScan: (token: string) => void }
// Uses Html5Qrcode to start camera scanning
// On decode: parse the result_token from the scanned value and call onScan
// Show a camera-unavailable fallback if camera permission is denied
```

The QR code value (generated in task-7) is the raw `result_token` UUID. The scanner returns that UUID, and the claim page calls `GET /api/claim/verify/[token]`.

### 9. WinnerCard component

```tsx
interface WinnerCardProps {
  participant: ClaimVerifyResponse;
  onFulfill: (participantId: string) => void;
  fulfilling: boolean;
}
```

Rendering:
- Participant name (text-2xl bold)
- Prize name (text-xl)
- If `is_fulfilled=false`: green "Mark Fulfilled" button
- If `is_fulfilled=true`: red banner "⚠ Already Claimed!" + "Fulfilled by [name] at [time]"
- If `is_no_prize=true`: show "No Prize — Nothing to claim" with no button

### Security requirements

- Invite codes are single-use — atomically mark used before returning the cookie
- Staff cookies are scoped: a staff member from session A cannot fulfill prizes in session B (check session_id in JWT matches participant's session_id)
- Never expose `phone` in search results beyond what's needed for identification

### TypeScript + Next.js Patterns

Follow idiomatic TypeScript + Next.js App Router patterns. Reference technical-requirements.md for all architectural decisions. Use the shared types from `src/lib/types.ts`.
