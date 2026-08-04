---
id: task-3
task: Build the token-protected, fullscreen TV display page showing QR code and winner leaderboard in idle state
agent: frontend
status: approved
depends_on: [task-1]
skills:
  - global/security
  - testing/philosophy
context:
  project: spin-and-win
  branch: feature/task-3-tv-display-idle
  files:
    - src/app/tv/[token]/page.tsx
    - src/components/tv/WinnerLeaderboard.tsx
    - src/components/tv/ActivePlayerBanner.tsx
    - src/components/tv/SpinWheel.tsx
    - src/components/tv/ConfettiOverlay.tsx
    - src/components/ui/ErrorBoundary.tsx
acceptance_criteria:
  - GET /tv/[valid-token] returns a 200 response and renders the TV page
  - GET /tv/[invalid-token] returns a 404 page (not a redirect, a proper 404)
  - GET /tv/[token-for-ended-session] returns a 404 page
  - The page renders a QR code (using qrcode.react) whose value is the full URL to /play/[slug] (using NEXT_PUBLIC_APP_URL)
  - The QR code is visually large enough to be scanned from across a room (minimum 300x300px rendered size)
  - The page renders in fullscreen-ready layout: no scrollbars, bg-gray-950 dark background, text-white
  - A "Go Fullscreen" button is present and calls document.documentElement.requestFullscreen() on click
  - The WinnerLeaderboard component renders an empty state ("No winners yet") when there are no completed participants
  - The WinnerLeaderboard component renders a scrolling list of winner name + prize name when participants with prizes exist
  - The leaderboard data is fetched server-side from Supabase on initial page load (Server Component query)
  - SpinWheel, ConfettiOverlay are scaffolded as placeholder components (they will be wired in task-6); the TV page imports them but they render nothing or a static placeholder
  - ActivePlayerBanner renders "Waiting for players..." when no active participant, and "[Name] is spinning..." when an active participant is passed as prop
  - The page title (document.title / <title>) is set to the event_name from the session
  - Running `npm run build` with this page added exits with code 0
  - Unit test: WinnerLeaderboard renders correct number of items given a mock winners array
  - Unit test: WinnerLeaderboard renders empty-state message when given an empty array
---

## Instructions

This task builds the static/idle state of the TV display. The real-time animation and event wiring are added in task-6. Focus on the layout, QR code, leaderboard, and token validation.

### 1. Token validation (Server Component)

`src/app/tv/[token]/page.tsx` is a **Server Component**. On render:

1. Query Supabase (service client) for a session where `tv_token = token` AND status NOT IN ('ended').
2. If not found: call `notFound()` from `next/navigation` to render the Next.js 404 page.
3. If found: fetch completed participants with non-null prize_id for the leaderboard.
4. Pass session data and initial winners to client components as props.

### 2. Page layout

The TV page root element should be:
```
- Full viewport height/width: h-screen w-screen overflow-hidden
- Dark background: bg-gray-950 text-white
- Flex layout with the QR code on one side and the leaderboard on the other
```

Design for 1920×1080. Use large typography for the event name (`text-4xl font-bold`).

### 3. QR code

Install: `npm install qrcode.react`

The QR code value must be: `${process.env.NEXT_PUBLIC_APP_URL}/play/${session.slug}`

```tsx
// This is a client component (needs 'use client' for the fullscreen button)
import { QRCodeSVG } from 'qrcode.react';

<QRCodeSVG
  value={joinUrl}
  size={320}
  bgColor="#0f172a"
  fgColor="#ffffff"
  level="M"
/>
```

Display the URL in text below the QR code for accessibility.

### 4. Fullscreen button

This requires `'use client'`. The TV page should split into a Server Component (data fetching) and a Client Component (interactive elements including the fullscreen button and leaderboard scroll animation).

```tsx
'use client';
function FullscreenButton() {
  const handleFullscreen = () => {
    document.documentElement.requestFullscreen().catch(console.error);
  };
  return (
    <button onClick={handleFullscreen} className="...">
      Go Fullscreen
    </button>
  );
}
```

### 5. WinnerLeaderboard component

`src/components/tv/WinnerLeaderboard.tsx` — Client Component with scrolling animation.

Props:
```typescript
interface WinnerLeaderboardProps {
  winners: Array<{ name: string; prize_name: string; spin_completed_at: string }>;
}
```

- Empty state: centered "No winners yet — be the first!" text in muted color
- Winners: vertically scrolling list, auto-scrolls when list is long
- Each row: large name (text-2xl) + prize badge
- Most recent winner at the top

### 6. ActivePlayerBanner component

`src/components/tv/ActivePlayerBanner.tsx`

Props:
```typescript
interface ActivePlayerBannerProps {
  playerName: string | null;
}
```

- Renders at the bottom of the TV screen
- `null`: "Scan the QR code to join!"
- Non-null: "[Name] is spinning..." with a pulsing animation class

### 7. Placeholder components for task-6

Create `src/components/tv/SpinWheel.tsx` and `src/components/tv/ConfettiOverlay.tsx` as empty stubs that return `null`. Task-6 will implement them fully.

```tsx
// SpinWheel.tsx placeholder
export default function SpinWheel() {
  return null;
}
```

### 8. Lazy loading

The TV page imports `SpinWheel` with dynamic import (for when task-6 implements it):
```typescript
const SpinWheel = dynamic(() => import('@/components/tv/SpinWheel'), { ssr: false });
```

This is `ssr: false` because react-custom-roulette requires a browser context.

### Security requirement

The token must be validated server-side on every render — do not trust the token from query params or client-side state. A rendered page means the token was valid at render time.

### TypeScript + Next.js Patterns

Follow idiomatic TypeScript + Next.js App Router patterns. Reference technical-requirements.md for all architectural decisions. Use the shared types from `src/lib/types.ts`.
