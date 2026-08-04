---
id: task-1
task: Scaffold Next.js project with Tailwind, configure Supabase client, and create database schema via migrations
agent: backend
status: approved
depends_on: []
skills:
  - global/security
  - global/git-workflow
  - global/ci-cd
  - testing/philosophy
context:
  project: spin-and-win
  branch: feature/task-1-project-scaffolding
  files:
    - package.json
    - tsconfig.json
    - next.config.js
    - tailwind.config.ts
    - .env.example
    - .gitignore
    - src/lib/supabase/client.ts
    - src/lib/supabase/server.ts
    - src/lib/types.ts
    - supabase/migrations/20260803000000_initial_schema.sql
    - supabase/seed.sql
    - src/app/layout.tsx
    - src/app/page.tsx
    - .github/workflows/ci.yml
    - .github/workflows/migrations.yml
acceptance_criteria:
  - Running `npm run build` exits with code 0 and produces no TypeScript errors
  - Running `npx tsc --noEmit` exits with code 0
  - Running `npm run lint` exits with code 0
  - All five tables (sessions, prizes, participants, staff, admins) exist in local Supabase after `supabase db push`
  - All indexes defined in technical-requirements.md Section 2.2 are present in the schema
  - `src/lib/supabase/client.ts` exports a `createBrowserClient()` function returning a Supabase client using NEXT_PUBLIC_* env vars
  - `src/lib/supabase/server.ts` exports a `createServiceClient()` function using SUPABASE_SERVICE_ROLE_KEY (server-only)
  - `src/lib/types.ts` contains all shared types defined in architecture.md Section 5
  - `.env.example` documents all six environment variables from technical-requirements.md Section 11.4
  - `.env.local` is listed in `.gitignore` and not committed
  - `supabase/seed.sql` inserts a local admin user with username `admin` and a bcrypt-hashed password (pre-computed hash for `admin123`, cost 12)
  - CI workflow (`ci.yml`) runs lint, typecheck, test, and build steps on push and pull_request events
  - Migrations workflow (`migrations.yml`) triggers on push to `main` when files under `supabase/migrations/` change
  - Vercel project configuration (`vercel.json` if needed) is committed
---

## Instructions

This is the foundation task. All other tasks depend on it. The goal is a clean Next.js 14+ App Router project that builds, lints, and type-checks cleanly, with a Supabase schema ready for use.

### 1. Bootstrap the project

Use `create-next-app` with TypeScript and Tailwind options:

```bash
npx create-next-app@latest . --typescript --tailwind --app --src-dir --import-alias "@/*" --no-eslint
```

Then install project dependencies:

```bash
npm install @supabase/supabase-js @supabase/ssr
npm install -D eslint eslint-config-next @typescript-eslint/eslint-plugin @typescript-eslint/parser prettier eslint-config-prettier vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```

### 2. TypeScript configuration

Ensure `tsconfig.json` has `"strict": true`. The path alias `@/*` should map to `./src/*`.

### 3. Supabase clients

**`src/lib/supabase/client.ts`** — browser singleton:
```typescript
import { createBrowserClient as createSupabaseBrowserClient } from '@supabase/ssr';

export function createBrowserClient() {
  return createSupabaseBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

**`src/lib/supabase/server.ts`** — service role (server-only):
```typescript
import { createClient } from '@supabase/supabase-js';

export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
```

### 4. Shared types

Create `src/lib/types.ts` with all types defined in architecture.md Section 5. This file is the single source of truth — all other files import from here.

### 5. Database migration

Create `supabase/migrations/20260803000000_initial_schema.sql` with:
- All five tables exactly as defined in technical-requirements.md Section 2.1
- All indexes from Section 2.2
- The `decrement_prize_inventory(p_prize_id uuid)` PostgreSQL function described in architecture.md Section 9.4
- An `updated_at` trigger on the `sessions` table

### 6. Seed file

Create `supabase/seed.sql`:
```sql
-- Local development admin user (password: admin123)
INSERT INTO admins (id, username, password_hash)
VALUES (
  gen_random_uuid(),
  'admin',
  '$2b$12$LJ3UlGYz5E1S9TkXpRqW9eKIFp8GEz1xYf6OwV6Mq3h0lGM5VpKi2'
);
```

The hash must be a valid bcrypt hash for the string `admin123` with cost factor 12. Do not commit real credentials.

### 7. Environment variables

Create `.env.example` documenting all required variables (no real values):
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
JWT_SECRET=
NEXT_PUBLIC_APP_URL=
SUPABASE_ACCESS_TOKEN=
SUPABASE_PROJECT_REF=
```

Add `.env.local` and `.env*.local` to `.gitignore`.

### 8. Root layout and placeholder pages

`src/app/layout.tsx` — root layout with Tailwind base classes, Inter font, and `<html lang="en">`.

`src/app/page.tsx` — redirect to `/admin` using `next/navigation` `redirect()`.

### 9. CI/CD workflows

Review the existing `.github/workflows/ci.yml` and `migrations.yml` stubs. Update them to match the pipeline described in technical-requirements.md Section 11.2. The CI pipeline must run:
1. `npm ci`
2. `npm run lint`
3. `npx tsc --noEmit`
4. `npm test` (or `npm run test`)
5. `npm run build`

### 10. Vitest configuration

Add a `vitest.config.ts` at the project root:
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

Add `src/test-setup.ts` importing `@testing-library/jest-dom`.

Add test scripts to `package.json`:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

### TypeScript + Next.js Patterns

Follow idiomatic TypeScript + Next.js App Router patterns throughout. Reference technical-requirements.md for all architectural decisions. Key rules:
- Use `'use client'` only when browser APIs or hooks are required
- All route handlers use `NextRequest` / `NextResponse`
- Strict TypeScript — no `any` types
- All imports use the `@/` alias
