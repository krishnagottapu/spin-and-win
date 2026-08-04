---
id: task-7
task: Wire the mobile TAP TO SPIN button to the spin API and build the result display with prize QR code
agent: frontend
status: approved
depends_on: [task-4, task-5]
skills:
  - global/security
  - testing/philosophy
context:
  project: spin-and-win
  branch: feature/task-7-mobile-spin-result
  files:
    - src/app/play/[slug]/page.tsx
    - src/components/play/SpinButton.tsx
    - src/components/play/ResultDisplay.tsx
acceptance_criteria:
  - Active user sees the "TAP TO SPIN" button and no other action buttons
  - Tapping the spin button calls POST /api/spin with {session_id, participant_id}
  - After tapping, the spin button is immediately disabled (no double-tap) and shows a loading state
  - On receiving spin:result via Realtime, the mobile view transitions to the result screen
  - Result screen displays the prize name in large text (text-4xl or larger)
  - Result screen displays a QR code generated from the result_token (value: result_token UUID string)
  - Result screen for a no-prize outcome displays "Better luck next time!" instead of a prize name
  - Result screen for a no-prize outcome does NOT render a QR code (no QR code to claim)
  - Re-entering the phone number after a completed spin (session recovery) shows the result screen, not the spin button
  - On receiving session:ended while waiting in queue, the mobile view shows "The event has ended — thanks for joining!" and clears queue UI
  - On receiving player:active with the current user's participant_id, the view transitions from queue view to spin view
  - Realtime subscription on the mobile page listens for: player:active, spin:result, session:ended
  - The spin button is only shown when the participant's status is exactly 'active' (not 'queued', 'spinning', or 'completed')
  - Unit test: SpinButton renders disabled and shows loading text after first click
  - Unit test: ResultDisplay renders prize name and QR code when is_no_prize=false
  - Unit test: ResultDisplay renders "Better luck next time!" and no QR when is_no_prize=true
---

## Instructions

This task completes the mobile user flow by wiring the spin button (scaffolded in task-4) and implementing the result screen. The Realtime subscription scaffolded in task-4 is extended here to handle spin results.

### 1. SpinButton component (`src/components/play/SpinButton.tsx`)

```tsx
'use client';
interface SpinButtonProps {
  sessionId: string;
  participantId: string;
  onResult: (result: SpinResponse) => void;
}
```

Implementation:
1. Local state: `spinning: boolean` (false initially).
2. On click:
   - Set `spinning = true` immediately (disables button).
   - Call `POST /api/spin` with `{ session_id, participant_id }`.
   - On success: call `onResult(data)`.
   - On error: set `spinning = false`, show error toast/message.
3. Button disabled when `spinning === true`.
4. Button text: "TAP TO SPIN" normally, "Spinning..." when loading.

Note: The phone also receives `spin:result` via Realtime. Use whichever arrives first (API response or Realtime event) to transition to the result screen. The API response and Realtime payload carry the same data.

### 2. ResultDisplay component (`src/components/play/ResultDisplay.tsx`)

```tsx
'use client';
import { QRCodeSVG } from 'qrcode.react';

interface ResultDisplayProps {
  prizeName: string;
  isNoPrize: boolean;
  resultToken: string | null;
}
```

Rendering:
- `is_no_prize = false`: Show `prizeName` in large text + QRCodeSVG with `value={resultToken}`
- `is_no_prize = true`: Show "Better luck next time!" in large text. No QR code.
- QR code value is the raw `result_token` UUID (staff app scans this and calls `/api/claim/verify/[token]`)
- Add instructional text: "Show this QR code to staff to claim your prize"
- Style for mobile: centered, full-width, high-contrast

### 3. Mobile page state transitions

Extend the state machine from task-4 to handle spin-related states:

```typescript
type PlayState =
  | { phase: 'loading' }
  | { phase: 'closed' }           // session not active
  | { phase: 'register' }
  | { phase: 'queue'; position: number; estimatedWait: number }
  | { phase: 'spin'; participantId: string }
  | { phase: 'result'; prizeName: string; isNoPrize: boolean; resultToken: string | null }
  | { phase: 'ended' };
```

Realtime event handlers (extend the useSessionChannel subscription):

```typescript
// player:active → transition 'queue' to 'spin' if my participant_id matches
channel.on('broadcast', { event: 'player:active' }, ({ payload }) => {
  if (payload.participant_id === myParticipantId) {
    setState({ phase: 'spin', participantId: myParticipantId });
  }
});

// spin:result → transition 'spin' to 'result'
channel.on('broadcast', { event: 'spin:result' }, ({ payload }) => {
  if (payload.participant_id === myParticipantId) {
    setState({
      phase: 'result',
      prizeName: payload.prize_name,
      isNoPrize: payload.is_no_prize,
      resultToken: null, // result_token comes from API response, not realtime payload
    });
  }
});

// session:ended → show ended state regardless of current phase
channel.on('broadcast', { event: 'session:ended' }, () => {
  setState({ phase: 'ended' });
});
```

Important: `result_token` is NOT broadcast in the Realtime event (it would be visible to all subscribers). It comes only from the POST /api/spin response. Store it in component state when the API responds.

### 4. Session recovery for completed users

In the recovery flow (GET /api/queue/status), if the participant's status is `completed`:
- Return `result_token` and `prize_name` in the response
- Mobile page renders `ResultDisplay` immediately

If `result_token` is null (no-prize or pre-token-era record), show "Better luck next time!" without QR.

### 5. Mobile UX polish

- Between tapping spin and receiving the result, show a subtle loading animation (spinner or pulsing text "Waiting for result...")
- The result screen should feel like a celebration: consider a subtle CSS animation on the prize name
- The "ended" state message should be friendly and clear: "The event has ended. Thank you for playing!"

### Security requirements

- `result_token` is never broadcast over Realtime (would expose it to all channel subscribers)
- The spin button is disabled client-side after tap, but the server enforces the real guard (status check in /api/spin)
- `participant_id` is stored in component state from the registration response — never re-fetched from a user-editable source

### TypeScript + Next.js Patterns

Follow idiomatic TypeScript + Next.js App Router patterns. Reference technical-requirements.md for all architectural decisions. Use the shared types from `src/lib/types.ts`.
