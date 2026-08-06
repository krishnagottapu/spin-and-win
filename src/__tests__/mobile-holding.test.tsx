import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock modules BEFORE importing PlayClient
vi.mock('@/lib/supabase/realtime', () => ({
  useSessionChannel: vi.fn(),
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
import { useSessionChannel } from '@/lib/supabase/realtime';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockUseSessionChannel = vi.mocked(useSessionChannel);

const defaultPlayClientProps = {
  sessionId: 'session-abc',
  slug: 'test-event',
  status: 'active',
  endTime: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
  eventName: 'Test Event',
  otpEnabled: false,
  spinTimeoutSeconds: 30,
  queueEnabled: false, // walk-up mode
};

describe('PlayClient — Walk-Up Holding Screen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSessionChannel.mockImplementation(() => {});
    // Clear sessionStorage for each test
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows holding screen when walk-up mode and slot is occupied on mount', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ slot_occupied: true, queue_enabled: false }),
    });

    render(<PlayClient {...defaultPlayClientProps} />);

    await waitFor(() => {
      expect(screen.getByText('Someone is playing right now.')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /check again/i })).toBeInTheDocument();
  });

  it('shows registration form when walk-up mode and slot is free on mount', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ slot_occupied: false, queue_enabled: false }),
    });

    render(<PlayClient {...defaultPlayClientProps} />);

    await waitFor(() => {
      expect(screen.getByTestId('registration-form')).toBeInTheDocument();
    });
  });

  it('shows registration form directly in queue mode (queueEnabled=true)', async () => {
    render(<PlayClient {...defaultPlayClientProps} queueEnabled={true} />);

    await waitFor(() => {
      expect(screen.getByTestId('registration-form')).toBeInTheDocument();
    });

    // Should NOT call the slot endpoint in queue mode
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('shows "Tap to Play Now!" button when slot just opened after Check Again', async () => {
    // Initial mount: slot is occupied → holding screen
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ slot_occupied: true, queue_enabled: false }),
    });

    render(<PlayClient {...defaultPlayClientProps} />);

    await waitFor(() => {
      expect(screen.getByText('Someone is playing right now.')).toBeInTheDocument();
    });

    // User clicks "Check Again" and slot is now free
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ slot_occupied: false, queue_enabled: false }),
    });

    const checkAgainBtn = screen.getByRole('button', { name: /check again/i });
    await userEvent.click(checkAgainBtn);

    await waitFor(() => {
      expect(screen.getByText('The slot just opened!')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /tap to play now/i })).toBeInTheDocument();
  });

  it('"Tap to Play Now!" button transitions to register phase', async () => {
    // Initial mount: slot is occupied → holding screen
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ slot_occupied: true, queue_enabled: false }),
    });

    render(<PlayClient {...defaultPlayClientProps} />);

    await waitFor(() => {
      expect(screen.getByText('Someone is playing right now.')).toBeInTheDocument();
    });

    // User clicks "Check Again" and slot is now free
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ slot_occupied: false, queue_enabled: false }),
    });

    const checkAgainBtn = screen.getByRole('button', { name: /check again/i });
    await userEvent.click(checkAgainBtn);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /tap to play now/i })).toBeInTheDocument();
    });

    // Click "Tap to Play Now!" → registration form
    const playNowBtn = screen.getByRole('button', { name: /tap to play now/i });
    await userEvent.click(playNowBtn);

    await waitFor(() => {
      expect(screen.getByTestId('registration-form')).toBeInTheDocument();
    });
  });

  it('"Check Again" does not transition when slot is still occupied', async () => {
    // Initial mount: slot is occupied → holding screen
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ slot_occupied: true, queue_enabled: false }),
    });

    render(<PlayClient {...defaultPlayClientProps} />);

    await waitFor(() => {
      expect(screen.getByText('Someone is playing right now.')).toBeInTheDocument();
    });

    // User clicks "Check Again" but slot is still occupied
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ slot_occupied: true, queue_enabled: false }),
    });

    const checkAgainBtn = screen.getByRole('button', { name: /check again/i });
    await userEvent.click(checkAgainBtn);

    // Still on holding screen, not transitioned
    await waitFor(() => {
      expect(screen.getByText('Someone is playing right now.')).toBeInTheDocument();
    });

    expect(screen.queryByText('The slot just opened!')).not.toBeInTheDocument();
  });

  it('leaves spin phase when player:skipped fires after player:active was received via realtime', async () => {
    let capturedHandlers: Parameters<typeof mockUseSessionChannel>[1] = {};
    mockUseSessionChannel.mockImplementation((_id, handlers) => {
      capturedHandlers = handlers;
    });

    // Set sessionStorage so the component triggers session recovery into queue phase
    sessionStorage.setItem('spin_phone_test-event', '5551234567');
    sessionStorage.setItem('spin_name_test-event', 'Test Player');

    // Mock the queue/status API to return queued state
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          participant_id: 'player-001',
          status: 'queued',
          queue_position: 2,
          estimated_wait_seconds: 60,
          name: 'Test Player',
        }),
    });

    render(<PlayClient {...defaultPlayClientProps} queueEnabled={true} />);

    // Wait for queue phase to be rendered
    await waitFor(() => {
      expect(screen.getByTestId('queue-position')).toBeInTheDocument();
    });

    // Fire player:active — the functional setState reads prev.participantId from queue state
    act(() => {
      capturedHandlers.onPlayerActive?.({
        participant_id: 'player-001',
        name: 'Test Player',
        position: 1,
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('spin-button')).toBeInTheDocument();
    });

    // Fire player:skipped — phone must leave spin phase
    act(() => {
      capturedHandlers.onPlayerSkipped?.({
        participant_id: 'player-001',
        name: 'Test Player',
        reason: 'timeout',
      });
    });

    await waitFor(() => {
      expect(screen.queryByTestId('spin-button')).not.toBeInTheDocument();
    });
  });
});
