import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Capture the handlers passed to useSessionChannel
let capturedHandlers: Record<string, ((...args: unknown[]) => void) | undefined> = {};

vi.mock('@/lib/supabase/realtime', () => ({
  useSessionChannel: (_sessionId: string, handlers: Record<string, unknown>) => {
    capturedHandlers = handlers as Record<string, ((...args: unknown[]) => void) | undefined>;
  },
}));

vi.mock('@/components/play/RegistrationForm', () => ({
  default: () => <div data-testid="registration-form">Registration Form</div>,
}));

vi.mock('@/components/play/QueuePosition', () => ({
  default: () => <div data-testid="queue-position">Queue Position</div>,
}));

vi.mock('@/components/play/SpinButton', () => ({
  default: () => <div data-testid="spin-button">Spin Button</div>,
}));

vi.mock('@/components/play/ResultDisplay', () => ({
  default: () => <div data-testid="result-display">Result Display</div>,
}));

vi.mock('@/components/tv/SpinCountdownTimer', () => ({
  default: () => <div data-testid="countdown-timer">Timer</div>,
}));

import PlayClient from '@/app/play/[slug]/PlayClient';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const defaultProps = {
  sessionId: 'session-abc',
  slug: 'test-event',
  status: 'active',
  endTime: new Date(Date.now() + 3600000).toISOString(),
  eventName: 'Test Event',
  otpEnabled: false,
  spinTimeoutSeconds: 30,
  queueEnabled: true,
};

describe('PlayClient onSessionEnded handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedHandlers = {};
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('transitions from spin phase to ended phase on session:ended', async () => {
    // Simulate a recovered session where the player is in "active" (spin) state
    const phone = '+13035551234';
    sessionStorage.setItem('spin_phone_test-event', phone);
    sessionStorage.setItem('spin_name_test-event', 'Alice');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        participant_id: 'p-1',
        status: 'active',
        queue_position: null,
        estimated_wait_seconds: null,
        prize_name: null,
        is_no_prize: false,
        result_token: null,
        name: 'Alice',
      }),
    });

    render(<PlayClient {...defaultProps} />);

    // Wait for recovery to complete and spin phase to render
    await waitFor(() => {
      expect(screen.getByTestId('spin-button')).toBeInTheDocument();
    });

    // Fire the onSessionEnded handler
    act(() => {
      capturedHandlers.onSessionEnded?.({ reason: 'manual' });
    });

    // Should transition to ended phase
    await waitFor(() => {
      expect(screen.getByText('The event has ended — thank you for joining!')).toBeInTheDocument();
    });

    // Spin button should no longer be visible
    expect(screen.queryByTestId('spin-button')).not.toBeInTheDocument();
  });

  it('transitions from queue phase to ended phase on session:ended', async () => {
    // Simulate a recovered session where the player is in "queued" state
    const phone = '+13035552222';
    sessionStorage.setItem('spin_phone_test-event', phone);
    sessionStorage.setItem('spin_name_test-event', 'Bob');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        participant_id: 'p-2',
        status: 'queued',
        queue_position: 3,
        estimated_wait_seconds: 120,
        prize_name: null,
        is_no_prize: false,
        result_token: null,
        name: 'Bob',
      }),
    });

    render(<PlayClient {...defaultProps} />);

    // Wait for recovery to complete and queue phase to render
    await waitFor(() => {
      expect(screen.getByTestId('queue-position')).toBeInTheDocument();
    });

    // Fire the onSessionEnded handler
    act(() => {
      capturedHandlers.onSessionEnded?.({ reason: 'manual' });
    });

    // Should transition to ended phase
    await waitFor(() => {
      expect(screen.getByText('The event has ended — thank you for joining!')).toBeInTheDocument();
    });

    // Queue position should no longer be visible
    expect(screen.queryByTestId('queue-position')).not.toBeInTheDocument();
  });

  it('stays in result phase on session:ended (preserves existing behavior)', async () => {
    // Simulate a recovered session where the player has already completed their spin
    const phone = '+13035553333';
    sessionStorage.setItem('spin_phone_test-event', phone);
    sessionStorage.setItem('spin_name_test-event', 'Charlie');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        participant_id: 'p-3',
        status: 'completed',
        queue_position: null,
        estimated_wait_seconds: null,
        prize_name: 'Free Coffee',
        is_no_prize: false,
        result_token: 'token-abc-123',
        name: 'Charlie',
      }),
    });

    render(<PlayClient {...defaultProps} />);

    // Wait for recovery to complete and result phase to render
    await waitFor(() => {
      expect(screen.getByTestId('result-display')).toBeInTheDocument();
    });

    // Fire the onSessionEnded handler
    act(() => {
      capturedHandlers.onSessionEnded?.({ reason: 'manual' });
    });

    // Should still show result display — NOT transition to ended
    expect(screen.getByTestId('result-display')).toBeInTheDocument();
    expect(screen.queryByText('The event has ended — thank you for joining!')).not.toBeInTheDocument();
  });
});
