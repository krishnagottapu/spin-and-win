import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { WinnerLeaderboard } from '@/components/tv/WinnerLeaderboard';

// ─── Mocks for TvClient dependencies ─────────────────────────────────────────

// Mock the realtime hook — no-op for rendering tests
vi.mock('@/lib/supabase/realtime', () => ({
  useSessionChannel: vi.fn(),
}));

// Mock QRCodeSVG
vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => <svg data-testid="qr-code" data-value={value} />,
}));

// Mock react-custom-roulette (used by SpinWheel)
vi.mock('react-custom-roulette', () => ({
  Wheel: (_props: Record<string, unknown>) => <div data-testid="roulette-wheel">Wheel</div>,
}));

// Mock canvas-confetti (used by ConfettiOverlay)
vi.mock('canvas-confetti', () => ({
  __esModule: true,
  default: vi.fn(),
}));

// Mock next/image
vi.mock('next/image', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => <img {...props} />,
}));

// Mock Audio API
const mockAudio = {
  preload: '',
  loop: false,
  volume: 1,
  currentTime: 0,
  play: vi.fn().mockResolvedValue(undefined),
  pause: vi.fn(),
};
global.Audio = vi.fn(() => mockAudio) as unknown as typeof Audio;

// Mock document.fullscreenElement and fullscreen API
Object.defineProperty(document, 'fullscreenElement', {
  value: null,
  writable: true,
});

// Mock fetch for recovery endpoint
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import TvClient AFTER mocks are set up
import { TvClient } from '@/app/tv/[token]/tv-client';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function createDefaultTvClientProps(overrides: { queue_enabled?: boolean; initialQueue?: Array<{ id: string; name: string; position: number }> } = {}) {
  return {
    session: {
      id: 'session-123',
      event_name: 'Test Event',
      slug: 'test-event',
      theme: 'party' as const,
      sound_preset: 'drumroll' as const,
      tv_token: 'tv-token-abc',
      spin_timeout_seconds: 30,
      queue_enabled: overrides.queue_enabled ?? true,
    },
    prizes: [{ name: 'Prize A' }, { name: 'Prize B' }],
    winners: [],
    activePlayerName: null,
    activeParticipantId: null,
    activePlayerActivatedAt: null,
    initialQueue: overrides.initialQueue ?? [],
  };
}

// ─── WinnerLeaderboard Tests ──────────────────────────────────────────────────

describe('WinnerLeaderboard', () => {
  it('renders the empty-state message when given an empty array', () => {
    render(<WinnerLeaderboard winners={[]} />);

    expect(screen.getByText('No winners yet — be the first!')).toBeInTheDocument();
  });

  it('renders the correct number of winner items', () => {
    const winners = [
      { name: 'Alice', prize_name: 'Free Coffee', spin_completed_at: '2026-08-03T18:30:00Z' },
      { name: 'Bob', prize_name: 'Gift Card', spin_completed_at: '2026-08-03T18:25:00Z' },
      { name: 'Charlie', prize_name: 'T-Shirt', spin_completed_at: '2026-08-03T18:20:00Z' },
    ];

    render(<WinnerLeaderboard winners={winners} />);

    // Each winner's name should be visible
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();

    // Each winner's prize should be visible
    expect(screen.getByText('Free Coffee')).toBeInTheDocument();
    expect(screen.getByText('Gift Card')).toBeInTheDocument();
    expect(screen.getByText('T-Shirt')).toBeInTheDocument();

    // Should NOT show the empty state
    expect(screen.queryByText('No winners yet — be the first!')).not.toBeInTheDocument();
  });

  it('does not render empty-state message when winners exist', () => {
    const winners = [
      { name: 'Dana', prize_name: 'Mug', spin_completed_at: '2026-08-03T19:00:00Z' },
    ];

    render(<WinnerLeaderboard winners={winners} />);

    expect(screen.queryByText('No winners yet — be the first!')).not.toBeInTheDocument();
    expect(screen.getByText('Dana')).toBeInTheDocument();
    expect(screen.getByText('Mug')).toBeInTheDocument();
  });
});

// ─── TvClient Walk-Up Mode Sidebar Tests ──────────────────────────────────────

describe('TvClient walk-up mode sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        session: { status: 'active' },
        active_participant: null,
        last_winner: null,
        winners: [],
        queue: [],
      }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders walk-up CTA when queue_enabled is false', async () => {
    const props = createDefaultTvClientProps({ queue_enabled: false });

    await act(async () => {
      render(<TvClient {...props} />);
    });

    // Wait for recovery fetch to resolve and component to leave loading state
    await waitFor(() => {
      expect(screen.getByText('Walk-Up to Play!')).toBeInTheDocument();
    });

    expect(screen.getByText('Scan the QR code above when the slot opens to play instantly.')).toBeInTheDocument();
    // QueueDisplay "Queue" heading should NOT be present
    expect(screen.queryByText('Queue')).not.toBeInTheDocument();
    expect(screen.queryByText('Queue is empty')).not.toBeInTheDocument();
  });

  it('does not render QueueDisplay when queue_enabled is false', async () => {
    const props = createDefaultTvClientProps({
      queue_enabled: false,
      initialQueue: [
        { id: 'p1', name: 'Alice', position: 1 },
        { id: 'p2', name: 'Bob', position: 2 },
      ],
    });

    await act(async () => {
      render(<TvClient {...props} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Walk-Up to Play!')).toBeInTheDocument();
    });

    // Even with queue data present, QueueDisplay should not render names
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
  });

  it('renders QueueDisplay when queue_enabled is true', async () => {
    // Mock fetch to return queue entries matching initialQueue
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        session: { status: 'active' },
        active_participant: null,
        last_winner: null,
        winners: [],
        queue: [
          { id: 'p1', name: 'Alice', position: 1 },
          { id: 'p2', name: 'Bob', position: 2 },
        ],
      }),
    });

    const props = createDefaultTvClientProps({
      queue_enabled: true,
      initialQueue: [
        { id: 'p1', name: 'Alice', position: 1 },
        { id: 'p2', name: 'Bob', position: 2 },
      ],
    });

    await act(async () => {
      render(<TvClient {...props} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Queue')).toBeInTheDocument();
    });

    // Queue entries should be visible
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();

    // Walk-up CTA should NOT be present
    expect(screen.queryByText('Walk-Up to Play!')).not.toBeInTheDocument();
  });

  it('renders empty queue message when queue_enabled is true and queue is empty', async () => {
    const props = createDefaultTvClientProps({ queue_enabled: true, initialQueue: [] });

    await act(async () => {
      render(<TvClient {...props} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Queue is empty')).toBeInTheDocument();
    });

    // Walk-up CTA should NOT be present
    expect(screen.queryByText('Walk-Up to Play!')).not.toBeInTheDocument();
  });
});
