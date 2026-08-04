---
id: task-1
task: Add authentication to POST /api/queue/skip endpoint
agent: backend
status: pending
depends_on: []
skills:
  - languages/javascript
  - tooling/eslint
  - global/security
context:
  project: spin-and-win
  files:
    - src/app/api/queue/skip/route.ts
    - src/app/tv/[token]/tv-client.tsx
    - src/lib/auth/middleware.ts
acceptance_criteria:
  - Timeout-triggered skips (from TV) include tv_token in request body and the endpoint validates it against sessions.tv_token
  - Admin-triggered skips (reason='admin') require a valid admin JWT via requireAdmin middleware
  - If neither tv_token nor admin JWT is provided, endpoint returns 401
  - tv-client.tsx auto-skip fetch includes tv_token in the request body
  - Existing happy-path behavior is unchanged
---

## Implementation Instructions

### 1. Update `src/app/api/queue/skip/route.ts`

The skip endpoint currently has zero authentication. Implement dual-auth:

**For TV auto-skip (`reason: 'timeout'`):**
- Accept an optional `tv_token` field in the request body
- If `tv_token` is provided, validate it: query `sessions` where `id = session_id AND tv_token = tv_token`. If no match, return 401.

**For admin skip (`reason: 'admin'` or no `tv_token`):**
- Require a valid admin JWT using the existing `requireAdmin(request)` pattern from `src/lib/auth/middleware.ts`
- If auth fails, return 401.

Logic flow:
```
if body.tv_token present:
  validate tv_token against session → proceed or 401
else:
  requireAdmin(request) → proceed or 401
```

Update the `SkipRequest` interface to include `tv_token?: string`.

### 2. Update `src/app/tv/[token]/tv-client.tsx`

The TV client already has `session.tv_token` available. In the auto-skip fetch:

```typescript
body: JSON.stringify({
  session_id: session.id,
  tv_token: session.tv_token,   // ADD THIS
  reason: 'timeout',
})
```

Do not log or expose the tv_token in any other way.
