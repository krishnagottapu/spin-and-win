# Spin and Win

A real-time event engagement application that turns any live venue into an interactive prize giveaway. Attendees scan a QR code on a shared TV display, register on their phones, queue for a turn, and spin a prize wheel — no app installation required. The server is the single source of truth for all game state: prize calculations, queue management, and state transitions happen server-side, while the TV and mobile clients subscribe to real-time broadcasts and render exactly what the server tells them.

Built for event organizers who need a polished, scalable, and zero-friction giveaway experience for up to 250 attendees.

---

## Table of Contents

1. [Feature Highlights](#feature-highlights)
2. [Views](#views)
3. [Tech Stack](#tech-stack)
4. [Getting Started (Local Development)](#getting-started-local-development)
5. [Environment Variables](#environment-variables)
6. [Project Structure](#project-structure)
7. [Architecture Overview](#architecture-overview)
8. [Deployment](#deployment)
9. [Admin Setup](#admin-setup)
10. [Usage Guide](#usage-guide)
11. [Development Notes](#development-notes)

---

## Feature Highlights

- **Spin wheel** — Animated prize wheel powered by `react-custom-roulette`. The server dictates the outcome; the wheel animates to the server-assigned slice index.
- **Real-time queue** — FIFO queue with live position updates and estimated wait times pushed to every queued phone via Supabase Realtime Broadcast.
- **Auto-skip** — If a player does not spin within 30 seconds of becoming active, the TV fires an auto-skip request. The player is re-queued at the back; the next player is promoted automatically.
- **OTP phone verification** — Twilio-based SMS OTP for staff device registration. Staff authenticate with their phone number before accessing the claim interface.
- **Server-authoritative game logic** — Prize selection is weighted random with atomic inventory decrement. No client influence on outcomes.
- **Prize fulfillment portal** — Staff scan the winner's result QR code or search by name/phone to view and fulfill prizes. Double-claim prevention enforced at the database level.
- **Admin dashboard** — Create and manage event sessions, configure prizes with weights and inventory, monitor the live queue, and view real-time fulfillment stats.
- **Leaderboard** — Rolling winner leaderboard shown on the TV during idle periods between spins.
- **Confetti and sound** — Three configurable sound presets (drumroll, gameshow, casino) and canvas-confetti burst on win. Audio preloaded on TV page mount for zero-delay playback.
- **CSV export** — Admins download a full participant report with name, phone, prize won, fulfillment status, timestamps, and the staff member who fulfilled each prize.
- **Session recovery** — Users who close and reopen the browser re-enter their phone number to recover their queue position or see their spin result.
- **Three wheel themes** — Corporate, party, and holiday color palettes.
- **Event lifecycle management** — Draft → Active → Ending (soft stop, existing queue drains) → Ended. Admin can force-end at any time.
- **Staff portal** — Invite-code-gated access with QR scanner and search. Admin has superset permissions without needing a code.
- **TV token protection** — Each session generates a cryptographically random TV URL token. The TV page is not publicly discoverable.

---

## Views

### TV Display (`/tv/[token]`)

<!-- screenshot -->

The fullscreen display projected at the event venue. Shows the animated prize wheel in the center, a scrolling winner leaderboard on the right panel, and the join QR code with a live queue list on the left sidebar. When a player becomes active, the sidebar shows their name with a countdown timer. When the spin triggers, the wheel animates with the configured sound preset; on result, confetti fires and the winner's name and prize are prominently displayed. After approximately 10 seconds, the view returns to idle. Supports fullscreen API to hide the browser chrome for a clean stage presentation.

### Mobile Player (`/play/[slug]`)

<!-- screenshot -->

The player-facing view, optimized for 375px mobile screens. Guides the attendee through three states: (1) registration form collecting name and phone number, (2) queue waiting screen showing live position and estimated wait time, and (3) active spin screen with a large "TAP TO SPIN" button featuring the Utsav Events logo. After spinning, the phone shows the prize result and a unique QR code the attendee presents to staff for fulfillment.

### Admin Dashboard (`/admin`)

<!-- screenshot -->

Password-protected management interface. Admins create and edit event sessions (name, times, prizes, theme, sound), monitor the live queue and inventory levels during an event, generate one-time invite codes for staff, view per-session reports, and export CSV files. The live dashboard subscribes to the same Realtime channel as the TV, so all metrics update without refreshing.

### Staff Claim Portal (`/claim`)

<!-- screenshot -->

Invite-code-gated fulfillment interface for event staff. After one-time device registration via OTP-verified invite code, staff can scan the winner's result QR code using the device camera or search by name/phone. Each result card shows the prize name, winner details, and a "Mark as Fulfilled" button. If a prize has already been claimed, the card shows a red "Already Claimed!" warning with the fulfilling staff member's name and timestamp, preventing double-claim.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 14.2.5 |
| Language | TypeScript | 5.5.4 |
| Database | Supabase (PostgreSQL) | — |
| Real-time | Supabase Realtime Broadcast | — |
| Auth | Custom JWT (`jose`) + httpOnly cookies | jose 5.6.3 |
| Styling | Tailwind CSS | 3.4.7 |
| Wheel animation | react-custom-roulette | 1.4.1 |
| QR generation | qrcode.react | 3.1.0 |
| QR scanning | html5-qrcode | 2.3.8 |
| Confetti | canvas-confetti | 1.9.3 |
| SMS / OTP | Twilio | 5.3.7 |
| Password hashing | bcryptjs | 2.4.3 |
| Deployment | Vercel | — |
| Test runner | Vitest | 2.0.5 |

---

## Getting Started (Local Development)

### Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 20 LTS | https://nodejs.org/ |
| npm | 10+ | Bundled with Node.js |
| Git | Latest | https://git-scm.com/ |
| Docker Desktop | Latest | https://www.docker.com/products/docker-desktop/ |
| Supabase CLI | Latest | `npm install -g supabase` |

Verify:

```bash
node --version     # v20.x.x
npm --version      # 10.x.x
docker --version   # 24.x.x or higher
supabase --version # 2.x.x
```

### 1. Clone and Install

```bash
git clone https://github.com/YOUR_USERNAME/spin-and-win.git
cd spin-and-win
npm install
```

### 2. Start Local Supabase

Make sure Docker Desktop is running, then:

```bash
supabase start
```

This launches a full local Supabase stack (PostgreSQL, Realtime, Auth, REST API). The CLI prints your local credentials when startup completes:

```
API URL:          http://localhost:54321
anon key:         eyJ...
service_role key: eyJ...
Studio URL:       http://localhost:54323
```

Save these values for the next step.

### 3. Configure Environment Variables

```bash
cp .env.example .env.local
```

Edit `.env.local` and fill in the values printed by `supabase start`:

```env
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase start>
SUPABASE_SERVICE_ROLE_KEY=<service_role key from supabase start>
JWT_SECRET=any-random-string-for-local-dev
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

The Twilio and Supabase CI variables (`TWILIO_*`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`) are only needed for staff OTP and production deployments. You can leave them blank for local testing.

`.env.local` is gitignored — never commit it.

### 4. Apply Database Migrations

```bash
supabase db push
```

This runs all SQL migration files from `supabase/migrations/` against your local database. Verify the tables in Supabase Studio at http://localhost:54323.

### 5. Seed the Database

```bash
supabase db reset
```

This resets the local database and runs the seed file, which creates a default admin user. See [Admin Setup](#admin-setup) for credentials and how to create your own.

### 6. Run the Development Server

```bash
npm run dev
```

The app is available at **http://localhost:3000**.

| URL | Purpose |
|---|---|
| http://localhost:3000/admin | Admin dashboard |
| http://localhost:3000/tv/[token] | TV display (token from a created session) |
| http://localhost:3000/play/[slug] | Mobile player view |
| http://localhost:3000/claim | Staff fulfillment portal |
| http://localhost:54323 | Supabase Studio |

### Troubleshooting

**Docker not running:**
Start Docker Desktop and wait for full initialization before running `supabase start`.

**Port 3000 in use:**
```bash
npm run dev -- -p 3001
```

**Migrations fail:**
```bash
supabase db reset  # Wipes and re-runs all migrations + seed
```

**Realtime events not working:**
Confirm `NEXT_PUBLIC_SUPABASE_URL` is `http://localhost:54321`. The local Supabase stack includes its own Realtime server.

**Env changes not picked up:**
Restart the dev server after editing `.env.local` — Next.js reads env files only at startup.

---

## Environment Variables

All variables are defined in `.env.example`. Copy to `.env.local` for local development; add to Vercel's environment settings for production.

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL. Exposed to the browser (client-side Realtime subscriptions). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key. Exposed to the browser. RLS enforced for all client queries. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service-role key. Server-side only — bypasses RLS. Never expose to the browser. |
| `JWT_SECRET` | Yes | Secret used to sign and verify admin JWT tokens. Use a long random string in production. |
| `NEXT_PUBLIC_APP_URL` | Yes | Full public URL of the app (e.g., `https://spin-and-win.vercel.app`). Used to build QR code URLs. |
| `SUPABASE_ACCESS_TOKEN` | CI only | Supabase personal access token for running `supabase db push` in GitHub Actions. |
| `SUPABASE_PROJECT_REF` | CI only | Supabase project reference ID for the CLI migration pipeline. |
| `TWILIO_ACCOUNT_SID` | Staff OTP | Twilio account SID for sending OTP SMS messages to staff during device registration. |
| `TWILIO_AUTH_TOKEN` | Staff OTP | Twilio auth token. Server-side only. |
| `TWILIO_PHONE_NUMBER` | Staff OTP | The Twilio-provisioned phone number used as the SMS sender (E.164 format, e.g., `+13035550123`). |

---

## Project Structure

```
spin-and-win/
├── .github/
│   └── workflows/
│       ├── ci.yml                  # Lint, typecheck, test, build on every PR
│       └── migrations.yml          # Runs supabase db push to production on merge to main
├── docs/                           # Architecture and requirements documentation
├── public/
│   ├── logo/                       # Utsav Events branding assets
│   └── sounds/                     # Audio presets: drumroll.mp3, gameshow.mp3, casino.mp3
├── src/
│   ├── app/
│   │   ├── tv/[token]/             # TV display (server component + client state machine)
│   │   ├── play/[slug]/            # Mobile player flow (register → queue → spin → result)
│   │   ├── admin/                  # Admin dashboard, session management, reports, staff
│   │   ├── claim/                  # Staff fulfillment portal (QR scan + search + fulfill)
│   │   └── api/                    # All server-side API route handlers
│   │       ├── auth/               # Admin login/logout, staff registration
│   │       ├── sessions/           # Session CRUD and status transitions
│   │       ├── spin/               # Core spin engine (prize calculation + broadcast)
│   │       ├── queue/              # Join queue, status recovery, skip
│   │       ├── claim/              # Verify result token, fulfill prize, search
│   │       ├── staff/              # Generate invite codes, list staff
│   │       ├── otp/                # Send OTP via Twilio
│   │       ├── export/             # CSV download
│   │       └── simulate/           # Dev-only simulation endpoints
│   ├── components/
│   │   ├── tv/                     # SpinWheel, WinnerLeaderboard, QueueDisplay, ConfettiOverlay
│   │   ├── play/                   # RegistrationForm, QueuePosition, SpinButton, ResultDisplay
│   │   ├── claim/                  # QrScanner, WinnerCard, SearchForm, StaffLoginGate
│   │   ├── admin/                  # SessionForm, PrizeEditor, LiveDashboard, ExportButton
│   │   └── ui/                     # Shared: ErrorBoundary
│   ├── lib/
│   │   ├── supabase/               # Browser client, server client, broadcast helper, realtime hook
│   │   ├── auth/                   # JWT sign/verify, requireAdmin/requireStaff guards
│   │   ├── game/                   # prizePicker.ts (weighted random), queueManager.ts (FIFO)
│   │   ├── utils/                  # slugify, csvExport, tokenGen
│   │   └── types.ts                # All shared TypeScript types (single source of truth)
│   ├── __tests__/                  # Integration and unit tests
│   └── middleware.ts               # Next.js edge middleware — protects /admin/* routes
├── supabase/
│   ├── migrations/                 # Timestamped SQL migration files
│   └── seed.sql                    # Local dev seed data (admin user)
├── .env.example                    # Environment variable template
├── next.config.js
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── vitest.config.ts
```

---

## Architecture Overview

### Server-Authoritative Design

All game logic runs on the server. The spin endpoint (`POST /api/spin`) performs weighted random prize selection, atomically decrements inventory using a PostgreSQL RPC function, persists the result, and only then broadcasts events to clients. The client never sends a desired prize — it only sends a spin request.

### Realtime Broadcast Pattern

Each session has one Supabase Realtime channel: `session:{session_id}`. The Next.js API routes publish events using the Supabase service-role client. TV and mobile clients subscribe using the anon client. No polling — all UI updates are push-driven.

Key events:

| Event | Trigger | Subscribers |
|---|---|---|
| `player:active` | Player promoted to front of queue | TV + promoted phone |
| `player:skipped` | Player timed out or admin-skipped | TV |
| `spin:start` | Player taps spin | TV |
| `spin:result` | Server calculates prize | TV + active phone |
| `winner:announced` | Non-no-prize spin completes | TV (leaderboard) |
| `queue:updated` | Any queue change | All queued phones |
| `session:ended` | Admin ends or queue drains | All connected clients |

### State Machine (TV Client)

The TV client (`tv-client.tsx`) drives its UI through explicit phases: `idle` → `player_active` → `spinning` → `result` → `idle`. Transitions are triggered by incoming Realtime events. The 30-second auto-skip timer starts when entering `player_active` and is cancelled on any phase change. The TV uses a pending-announcements buffer to defer leaderboard updates until the wheel animation completes, preventing winner entries from being lost during a spin.

### Session State Machine

```
draft → active → ending → ended
                    ↑
              (admin force-end from any state)
```

- **draft**: Session configured but not started. No joins allowed.
- **active**: Players can register and spin.
- **ending**: End time reached. No new joins. Existing queue drains normally.
- **ended**: All activity halted. Prizes remain fulfillable by staff.

### Queue Algorithm

FIFO. On join, the participant is assigned `queue_position = MAX(current positions) + 1`. If no player is currently `active` or `spinning`, the new participant is immediately promoted. On spin completion, the server promotes the next `queued` participant by queue position, sets their `activated_at` timestamp, and broadcasts `player:active`. If no queued participants remain and the session is `ending`, it transitions to `ended`.

---

## Deployment

### 1. Create a Supabase Cloud Project

1. Sign up at https://supabase.com and create a new project.
2. Note your **Project URL**, **anon key**, and **service_role key** from Project Settings → API.
3. Note your **Project Reference ID** from Project Settings → General.

### 2. Run Database Migrations

Install the Supabase CLI and link to your project:

```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

Push all migrations to the cloud database:

```bash
supabase db push
```

### 3. Seed the First Admin User

Run the following in the Supabase SQL Editor (Dashboard → SQL Editor):

```sql
-- Replace the hash with a bcrypt hash of your chosen password (cost factor 12).
-- See the Admin Setup section below for how to generate the hash.
INSERT INTO admins (id, username, password_hash)
VALUES (
  gen_random_uuid(),
  'admin',
  '$2b$12$REPLACE_WITH_YOUR_BCRYPT_HASH'
);
```

### 4. Deploy to Vercel

1. Push the repository to GitHub.
2. Import the repository at https://vercel.com/new.
3. Vercel auto-detects Next.js — no framework configuration needed.
4. Add the following environment variables in the Vercel project settings (Settings → Environment Variables):

| Variable | Environment |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production, Preview |
| `SUPABASE_SERVICE_ROLE_KEY` | Production, Preview |
| `JWT_SECRET` | Production, Preview |
| `NEXT_PUBLIC_APP_URL` | Production (set to your Vercel domain) |
| `TWILIO_ACCOUNT_SID` | Production, Preview |
| `TWILIO_AUTH_TOKEN` | Production, Preview |
| `TWILIO_PHONE_NUMBER` | Production, Preview |

5. Deploy. Vercel will build and deploy on every push to `main` (production) and `develop` (preview/staging).

### 5. Configure GitHub Secrets for the Migration Pipeline

For the automated migration workflow (`.github/workflows/migrations.yml`) to run on merge to `main`:

1. Go to your GitHub repository → Settings → Secrets → Actions.
2. Add `SUPABASE_ACCESS_TOKEN` (your personal Supabase access token from https://supabase.com/dashboard/account/tokens).
3. Add `SUPABASE_PROJECT_REF` (your project reference ID).

---

## Admin Setup

The admin account is stored in the `admins` table with a bcrypt-hashed password. There is no self-signup — you insert the first admin directly via SQL.

### Generate a bcrypt Hash

Using Node.js:

```bash
node -e "const b = require('bcryptjs'); b.hash('your-password-here', 12).then(h => console.log(h));"
```

This prints a hash like:

```
$2b$12$abc123...
```

### Insert the Admin

In Supabase Studio (local: http://localhost:54323, cloud: your project dashboard) or any PostgreSQL client:

```sql
INSERT INTO admins (id, username, password_hash)
VALUES (
  gen_random_uuid(),
  'admin',
  '$2b$12$YOUR_HASH_HERE'
);
```

The seed file at `supabase/seed.sql` contains a pre-hashed development password for local use only. Never use seed credentials in production.

---

## Usage Guide

### Running an Event End-to-End

#### 1. Create a Session (Admin)

1. Log in at `/admin`.
2. Navigate to **Sessions → New Session**.
3. Fill in event name, start time, end time.
4. Add prizes: each prize has a name, weight (relative probability), and inventory count. Optionally add a "No Prize / Better Luck Next Time" slice.
5. Select a wheel theme (corporate, party, holiday) and sound preset (drumroll, gameshow, casino).
6. Save. The session is created in **Draft** status.

#### 2. Generate Staff Invite Codes

1. In the admin dashboard, go to **Staff**.
2. Select the session and generate invite codes (1–10 at a time).
3. Distribute the one-time codes to your staff members.

#### 3. Start the Session

1. In the session list, click the session and change status to **Active**.
2. The TV URL and join slug are now live.

#### 4. Set Up the TV Display

1. Copy the TV URL from the session detail page (`/tv/[token]`).
2. Open it on the venue TV in a full-screen browser tab.
3. Click the fullscreen button to hide the browser chrome.
4. The QR code and empty leaderboard are now displayed.

#### 5. Staff Device Registration

1. Staff navigate to `/claim` on their phones.
2. Enter their invite code and phone number.
3. Enter the OTP sent via SMS to complete registration.
4. Staff are now on the fulfillment interface for the session.

#### 6. Players Join

1. Attendees scan the QR code on the TV with their phone camera.
2. They are taken to `/play/[slug]` and fill in their name and phone number.
3. The first player is immediately promoted to active and sees "TAP TO SPIN."
4. Subsequent players see their queue position and estimated wait time, updating live.

#### 7. Spin the Wheel

1. The active player taps the spin button on their phone.
2. The TV animates the wheel, plays the sound preset, and displays the result.
3. Confetti fires for prize winners. The winner is added to the leaderboard.
4. The player's phone shows the prize name and a result QR code.
5. The next queued player is automatically promoted.

#### 8. Auto-Skip (Inactive Player)

If a player does not spin within 30 seconds:
- The TV fires an auto-skip request.
- The inactive player is re-queued at the back (their skip count is recorded).
- The next player is promoted automatically.

#### 9. Prize Fulfillment (Staff)

1. The winner presents their phone showing the result QR code.
2. Staff tap **Scan QR** and point their camera at the winner's phone.
3. The winner card appears with prize name and a **Mark as Fulfilled** button.
4. Staff tap the button. The prize is marked fulfilled with the staff member's name and timestamp.
5. If the QR scan is not possible, staff tap **Search** and find the winner by name or phone number.

#### 10. End the Session

- **Natural end:** When the configured end time is reached, the session moves to **Ending** — no new joins are accepted but the current queue drains. When the last player spins, the session automatically moves to **Ended**.
- **Manual end:** Admin clicks **End Event** in the dashboard. The session immediately moves to **Ended**, all queued participants are dismissed, and all connected clients receive the `session:ended` event.

After the session ends, unfulfilled prizes remain accessible to staff for late fulfillment.

#### 11. Export the Report

1. In the admin dashboard, go to **Reports**.
2. Select the completed session.
3. Click **Export CSV**.
4. The downloaded file contains: name, phone, prize won, fulfilled status, queue position, spin time, fulfillment time, and the staff member who fulfilled each prize.

---

## Development Notes

### Test Commands

```bash
npm test                   # Run all tests once
npm run test:watch         # Watch mode — re-runs on file change
npm run test:coverage      # Coverage report (target: 80% for src/lib/game/)
```

Tests live in `src/__tests__/`. The suite covers auth middleware, claim verification, CSV export, session lifecycle, mobile registration flow, queue management, auto-skip logic, spin engine, TV state machine, type contracts, and wheel behavior.

### Lint and Type Check

```bash
npm run lint               # ESLint (Next.js config + Prettier)
npm run lint:fix           # Auto-fix fixable issues
npx tsc --noEmit           # Full TypeScript type check
```

These checks are enforced in CI — fix locally before pushing.

### Migration Workflow

Create a new migration:

```bash
supabase migration new descriptive_name
# Creates supabase/migrations/YYYYMMDDHHMMSS_descriptive_name.sql
```

Write SQL in the generated file, then apply locally:

```bash
supabase db push           # Apply to local DB
```

Migration files are committed to git. The GitHub Actions migration pipeline applies them to the production Supabase project on merge to `main`.

To reset the local database entirely (re-run all migrations and seed):

```bash
supabase db reset
```

### Simulation Endpoints (Dev Only)

Two API routes are available in development for testing without a phone:

- `POST /api/simulate/spin` — Simulates a spin for the active participant.
- `POST /api/simulate/promote` — Promotes the next queued participant to active.

The TV page renders a `SimulationPanel` overlay in development mode that calls these endpoints.

### Branching Strategy

| Branch | Deploys To |
|---|---|
| `main` | Vercel Production |
| `develop` | Vercel Preview (staging) |
| `feature/*` | Vercel Preview (per-PR URL) |
| `hotfix/*` | Production (after merge to main) |

Flow: `feature/*` → PR to `develop` → PR to `main` → production.

All PRs require CI to pass (lint, typecheck, tests, build) before merge.
