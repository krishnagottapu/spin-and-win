# Local Development Setup

Step-by-step instructions for running the Spin and Win application locally for development and testing.

---

## Prerequisites

Install the following before starting:

| Tool | Version | Purpose | Install |
|------|---------|---------|---------|
| Node.js | 20 LTS | Runtime | https://nodejs.org/ |
| npm | 10+ | Package manager | Comes with Node.js |
| Git | Latest | Version control | https://git-scm.com/ |
| Docker Desktop | Latest | Local Supabase | https://www.docker.com/products/docker-desktop/ |
| Supabase CLI | Latest | Local DB + Realtime | `npm install -g supabase` |

Verify installations:

```bash
node --version     # Should show v20.x.x
npm --version      # Should show 10.x.x
git --version      # Should show 2.x.x
docker --version   # Should show 24.x.x or higher
supabase --version # Should show 1.x.x
```

---

## Step 1: Clone the Repository

```bash
cd C:\github
git clone https://github.com/YOUR_USERNAME/spin-and-win.git
cd spin-and-win
```

If you already have the repo:

```bash
cd C:\github\spin-and-win
git checkout develop
git pull origin develop
```

---

## Step 2: Install Dependencies

```bash
npm install
```

This installs all packages defined in `package.json`.

---

## Step 3: Start Local Supabase

Supabase runs locally via Docker. Make sure Docker Desktop is running first.

```bash
supabase init    # Only needed first time (creates supabase/ directory)
supabase start
```

This spins up a local Supabase stack including:
- PostgreSQL database (port 54322)
- Supabase Studio UI (http://localhost:54323)
- Realtime server
- Auth server
- REST API (port 54321)

After startup, the CLI prints your local credentials:

```
API URL:          http://localhost:54321
anon key:         eyJ...local-anon-key...
service_role key: eyJ...local-service-role-key...
Studio URL:       http://localhost:54323
```

**Save these values — you'll use them in the next step.**

---

## Step 4: Run Database Migrations

Apply the schema to your local database:

```bash
supabase db push
```

This runs all migration files from `supabase/migrations/` against your local PostgreSQL.

To verify, open Supabase Studio at http://localhost:54323 and check that these tables exist:
- sessions
- prizes
- participants
- staff
- admins

---

## Step 5: Seed the Database (Optional)

Create an initial admin user for local testing:

```bash
supabase db reset
```

Or manually insert via Supabase Studio SQL Editor:

```sql
-- Create a local admin user (password: admin123)
-- The password hash below is bcrypt for "admin123"
INSERT INTO admins (id, username, password_hash)
VALUES (
  gen_random_uuid(),
  'admin',
  '$2b$12$LJ3UlGYz5E1S9TkXpRqW9eKIFp8GEz1xYf6OwV6Mq3h0lGM5VpKi2'
);
```

> Note: The actual seed file will be at `supabase/seed.sql` once the project is scaffolded.

---

## Step 6: Configure Environment Variables

Create a `.env.local` file in the project root:

```bash
cp .env.example .env.local
```

Then edit `.env.local` with your local Supabase credentials (from Step 3 output):

```env
# Supabase (local)
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...your-local-anon-key...
SUPABASE_SERVICE_ROLE_KEY=eyJ...your-local-service-role-key...

# Auth
JWT_SECRET=local-dev-secret-change-in-production

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

> `.env.local` is gitignored — never commit it.

---

## Step 7: Start the Development Server

```bash
npm run dev
```

The app starts at **http://localhost:3000**.

Available local URLs:

| URL | Purpose |
|-----|---------|
| http://localhost:3000/admin | Admin dashboard |
| http://localhost:3000/tv/[token] | TV display (need a valid token from a created session) |
| http://localhost:3000/play/[slug] | Mobile user view (need a valid slug from a created session) |
| http://localhost:3000/claim | Staff fulfillment view |
| http://localhost:54323 | Supabase Studio (DB management) |

---

## Step 8: Test the Full Flow Locally

### 8.1 Create an Event (Admin)

1. Go to http://localhost:3000/admin
2. Log in with `admin` / `admin123` (from seed data)
3. Create a new event session with prizes
4. Note the generated slug and TV token

### 8.2 Open the TV View

1. Open a new browser window (or tab)
2. Navigate to http://localhost:3000/tv/[tv-token-from-step-8.1]
3. You should see the wheel, QR code, and empty leaderboard
4. Click the fullscreen button to simulate TV mode

### 8.3 Join as a User (Mobile Simulation)

1. Open Chrome DevTools → Toggle device toolbar (Ctrl+Shift+M) to simulate mobile
2. Navigate to http://localhost:3000/play/[slug-from-step-8.1]
3. Register with a name and phone number
4. You should be promoted to active (since no one else is playing)
5. Tap "SPIN" — watch the TV window animate

### 8.4 Fulfill a Prize (Staff)

1. Open another tab at http://localhost:3000/claim
2. Enter a staff invite code (generate one from admin dashboard first)
3. Search for the winner by name or phone
4. Click "Mark Fulfilled"

### 8.5 Test Queue Behavior

1. Open a second mobile-simulated tab
2. Register with a different phone number
3. Verify it shows queue position while the first user is active

---

## Step 9: Run Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (re-runs on file change)
npm run test:watch

# Run tests with coverage report
npm test -- --coverage

# Run only unit tests
npm test -- --testPathPattern=unit

# Run only integration tests
npm test -- --testPathPattern=integration
```

---

## Step 10: Lint and Type Check

```bash
# Run ESLint
npm run lint

# Fix auto-fixable lint issues
npm run lint:fix

# Type check (no emit)
npx tsc --noEmit
```

These same checks run in CI — fix them locally before pushing.

---

## Step 11: Push Changes and Trigger Deployment

Once your changes work locally:

```bash
# Create a feature branch
git checkout -b feature/your-feature-name

# Stage and commit
git add .
git commit -m "feat: description of your change"

# Push to GitHub
git push -u origin feature/your-feature-name
```

Then on GitHub:
1. Open a Pull Request to `develop`
2. CI pipeline runs automatically (lint, typecheck, test, build)
3. Vercel creates a preview deployment URL on the PR
4. After review and approval, merge to `develop` (staging deployment)
5. Test on staging, then open PR from `develop` to `main`
6. Merge to `main` → production deployment

---

## Common Commands Reference

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server (http://localhost:3000) |
| `npm run build` | Production build (test locally before pushing) |
| `npm start` | Run production build locally |
| `npm test` | Run test suite |
| `npm run lint` | Check code style |
| `supabase start` | Start local Supabase (requires Docker) |
| `supabase stop` | Stop local Supabase |
| `supabase db push` | Apply migrations to local DB |
| `supabase db reset` | Reset local DB (re-run migrations + seed) |
| `supabase migration new [name]` | Create a new migration file |
| `supabase status` | Check local Supabase status |

---

## Troubleshooting

### Docker not running

```
Error: Cannot connect to the Docker daemon
```

**Fix:** Start Docker Desktop and wait for it to fully initialize before running `supabase start`.

### Port already in use

```
Error: listen tcp 0.0.0.0:3000: bind: address already in use
```

**Fix:** Kill the process using port 3000, or run on a different port:

```bash
npm run dev -- -p 3001
```

### Supabase won't start

```
Error: failed to start docker container
```

**Fix:** Ensure Docker has enough resources allocated (at least 4GB RAM). Try:

```bash
supabase stop
docker system prune -f
supabase start
```

### Migrations fail

```
Error: migration failed
```

**Fix:** Check the SQL syntax in the failing migration file. View detailed logs:

```bash
supabase db push --debug
```

If the local DB is in a bad state, reset it completely:

```bash
supabase db reset
```

### Realtime events not working locally

**Fix:** Ensure `NEXT_PUBLIC_SUPABASE_URL` in `.env.local` points to `http://localhost:54321` (not a remote URL). The local Supabase stack includes its own Realtime server.

### Environment variables not loading

**Fix:** Restart the dev server after changing `.env.local`. Next.js only reads env files at startup.

---

## Project Structure (After Scaffolding)

```
spin-and-win/
├── .github/
│   └── workflows/
│       ├── ci.yml               # CI pipeline
│       └── migrations.yml       # DB migration pipeline
├── docs/
│   ├── business-requirements.md
│   ├── technical-requirements.md
│   └── local-development.md    # This file
├── public/
│   └── sounds/                  # Audio presets (drumroll, gameshow, casino)
├── src/
│   └── app/
│       ├── tv/[token]/          # TV display
│       ├── play/[slug]/         # Mobile user flow
│       ├── admin/               # Admin dashboard
│       ├── claim/               # Staff fulfillment
│       └── api/                 # Server-side API routes
├── supabase/
│   ├── migrations/              # SQL migration files
│   └── seed.sql                 # Development seed data
├── .env.example                 # Template for .env.local
├── .env.local                   # Local env vars (gitignored)
├── .gitignore
├── next.config.js
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```
