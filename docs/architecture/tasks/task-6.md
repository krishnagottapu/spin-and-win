---
id: task-6
task: Wire TV display to real-time events — implement wheel animation, sound playback, confetti, and winner reveal
agent: frontend
status: approved
depends_on: [task-3, task-5]
skills:
  - global/security
  - testing/philosophy
context:
  project: spin-and-win
  branch: feature/task-6-tv-animation
  files:
    - src/app/tv/[token]/page.tsx
    - src/components/tv/SpinWheel.tsx
    - src/components/tv/ConfettiOverlay.tsx
    - src/components/tv/ActivePlayerBanner.tsx
    - src/components/tv/WinnerLeaderboard.tsx
acceptance_criteria:
  - TV page subscribes to channel session:{session_id} on mount and unsubscribes on unmount
  - On receiving spin:start event, ActivePlayerBanner updates to show "[Name] is spinning..." with a pulsing animation
  - On receiving spin:result event, the SpinWheel component begins spinning to the prize_index received in the payload
  - The wheel spins for at least 3 seconds before landing on the target slice (react-custom-roulette mustStartSpinning triggers correctly)
  - On receiving spin:result where is_no_prize=false, canvas-confetti fires a burst animation after the wheel stops
  - On receiving spin:result, the winner name and prize name are displayed prominently (text-6xl or larger) for 10 seconds
  - After 10 seconds, the display returns to idle state (QR code + leaderboard) automatically
  - On receiving winner:announced, the WinnerLeaderboard prepends the new winner to its list without a page reload
  - On receiving player:active, the ActivePlayerBanner updates to show the new player's name
  - On receiving session:ended, the TV displays a "Event has ended — thank you!" message and hides the QR code
  - The correct sound file plays on spin:start: drumroll.mp3 for drumroll preset, gameshow.mp3 for gameshow preset, casino.mp3 for casino preset
  - Sound files are preloaded on page mount (Audio object created and preload='auto' set) — no network fetch at spin time
  - SpinWheel slices are rendered in the same order as the session's prizes array (prize_index 0 = first slice)
  - Each theme applies the correct color palette to the wheel slices:
      corporate: blues and grays (e.g., #1e40af, #374151, #2563eb)
      party: bright multi-color (e.g., #f43f5e, #f59e0b, #10b981, #6366f1)
      holiday: reds and greens (e.g., #dc2626, #16a34a, #fbbf24)
  - SpinWheel is lazy-loaded with dynamic import ssr:false (does not cause SSR error)
  - Unit test: getThemeColors('corporate') returns an array of color strings
  - Unit test: getThemeColors returns arrays of at least 3 colors for each of the 3 themes
---

## Instructions

This task turns the static TV page (from task-3) into a live, animated display. All animation state is driven entirely by Supabase Realtime broadcast events from the server.

### 1. Install dependencies

```bash
npm install react-custom-roulette canvas-confetti
npm install -D @types/canvas-confetti
```

### 2. TV page state machine

The TV page Client Component manages this state:

```typescript
type TvState =
  | { phase: 'idle' }
  | { phase: 'player_active'; playerName: string }
  | { phase: 'spinning'; playerName: string; prizeIndex: number }
  | { phase: 'winner'; playerName: string; prizeName: string; isNoPrize: boolean }
  | { phase: 'ended' };
```

State transitions:
- `player:active` → `player_active`
- `spin:start` → `spinning` (wheel starts, sound plays)
- `spin:result` → `winner` (wheel stops, confetti if !isNoPrize)
- After 10s timeout in `winner` → `idle`
- `session:ended` → `ended`

### 3. SpinWheel component (`src/components/tv/SpinWheel.tsx`)

Install and wrap `react-custom-roulette`:

```tsx
'use client';
import { Wheel } from 'react-custom-roulette';

interface SpinWheelProps {
  prizes: Array<{ name: string }>;
  theme: WheelTheme;
  targetIndex: number | null;   // null = not spinning
  onStopSpinning: () => void;
}
```

Key implementation notes:
- `mustStartSpinning` should be true when `targetIndex !== null`
- `prizeNumber` = `targetIndex`
- `data` prop maps the prizes array to `{ option: prize.name }` objects
- Color palette from `getThemeColors(theme)` — cycle colors across slices
- On `onStopSpinning` callback: parent transitions from `spinning` to `winner`
- Component must be imported with `dynamic(..., { ssr: false })`

```typescript
// getThemeColors utility
export function getThemeColors(theme: WheelTheme): string[] {
  const palettes: Record<WheelTheme, string[]> = {
    corporate: ['#1e40af', '#374151', '#2563eb', '#4b5563', '#3b82f6'],
    party:     ['#f43f5e', '#f59e0b', '#10b981', '#6366f1', '#ec4899'],
    holiday:   ['#dc2626', '#16a34a', '#fbbf24', '#15803d', '#b91c1c'],
  };
  return palettes[theme];
}
```

### 4. Sound playback

In the TV page Client Component:

```tsx
const audioRef = useRef<HTMLAudioElement | null>(null);

useEffect(() => {
  // Preload on mount
  audioRef.current = new Audio(`/sounds/${session.sound_preset}.mp3`);
  audioRef.current.preload = 'auto';
}, [session.sound_preset]);

// When spin:start is received:
const playSound = () => {
  if (audioRef.current) {
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(console.error);
  }
};
```

Sound files (`public/sounds/drumroll.mp3`, `gameshow.mp3`, `casino.mp3`) must exist. If you cannot include real audio files, create placeholder empty mp3 stubs and document that real files must be added before production.

### 5. ConfettiOverlay component (`src/components/tv/ConfettiOverlay.tsx`)

```tsx
'use client';
import confetti from 'canvas-confetti';
import { useEffect } from 'react';

interface ConfettiOverlayProps {
  fire: boolean;  // set to true to trigger burst
}

export default function ConfettiOverlay({ fire }: ConfettiOverlayProps) {
  useEffect(() => {
    if (!fire) return;
    confetti({
      particleCount: 200,
      spread: 120,
      origin: { y: 0.4 },
      colors: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1'],
    });
  }, [fire]);
  return null;
}
```

### 6. Winner reveal overlay

When in `winner` phase, render a full-screen overlay (absolute positioned, z-50) displaying:
- Winner name: `text-8xl font-bold text-yellow-400`
- Prize name: `text-5xl font-semibold text-white`
- Countdown or fade-out after 10 seconds

Use a `useEffect` with `setTimeout` to transition back to idle after 10,000ms. Clear the timeout on cleanup.

### 7. Leaderboard live update

On receiving `winner:announced`, prepend the new winner to the local winners state array. This updates the leaderboard without a page reload.

### 8. Session ended state

On receiving `session:ended`: transition to `ended` phase. Display:
- "Event has ended — thank you for participating!"
- Hide QR code
- Show final leaderboard

### TypeScript + Next.js Patterns

Follow idiomatic TypeScript + Next.js App Router patterns. Reference technical-requirements.md for all architectural decisions. Use the shared types from `src/lib/types.ts`. Never import server-only modules (`@/lib/supabase/server`) in client components.
