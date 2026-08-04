import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import SpinButton from '@/components/play/SpinButton';
import ResultDisplay from '@/components/play/ResultDisplay';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('SpinButton', () => {
  const defaultProps = {
    sessionId: 'session-123',
    participantId: 'participant-456',
    onResult: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the TAP TO SPIN button initially enabled', () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
    render(<SpinButton {...defaultProps} />);

    const button = screen.getByRole('button', { name: /tap to spin/i });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('renders disabled and shows "Spinning..." after first click', async () => {
    const user = userEvent.setup();

    // Make fetch hang so we can observe the loading state
    mockFetch.mockReturnValueOnce(new Promise(() => {}));

    render(<SpinButton {...defaultProps} />);

    const button = screen.getByRole('button', { name: /tap to spin/i });
    await user.click(button);

    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Spinning...');
  });

  it('calls onResult with the API response data on success', async () => {
    const user = userEvent.setup();
    const mockResponse = {
      prize_id: 'prize-1',
      prize_name: 'Free Coffee',
      prize_index: 2,
      is_no_prize: false,
      result_token: 'token-abc-123',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    render(<SpinButton {...defaultProps} />);

    const button = screen.getByRole('button', { name: /tap to spin/i });
    await user.click(button);

    await waitFor(() => {
      expect(defaultProps.onResult).toHaveBeenCalledWith(mockResponse);
    });
  });

  it('re-enables the button and shows error message after error response', async () => {
    const user = userEvent.setup();

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Internal server error' }),
    });

    render(<SpinButton {...defaultProps} />);

    const button = screen.getByRole('button', { name: /tap to spin/i });
    await user.click(button);

    await waitFor(() => {
      expect(button).not.toBeDisabled();
      expect(button).toHaveTextContent('TAP TO SPIN');
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Internal server error');
  });

  it('re-enables the button on network error', async () => {
    const user = userEvent.setup();

    mockFetch.mockRejectedValueOnce(new Error('Network failure'));

    render(<SpinButton {...defaultProps} />);

    const button = screen.getByRole('button', { name: /tap to spin/i });
    await user.click(button);

    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Network error');
  });

  it('handles 403 by fetching queue/status and calling onResult', async () => {
    const user = userEvent.setup();

    const statusResponse = {
      participant_id: 'participant-456',
      status: 'completed',
      queue_position: null,
      estimated_wait_seconds: null,
      prize_name: 'Gift Card',
      is_no_prize: false,
      result_token: 'recovered-token',
    };

    // First fetch: POST /api/spin → 403
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ error: 'Participant is not in active state' }),
    });

    // Second fetch: GET /api/queue/status → 200
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(statusResponse),
    });

    render(<SpinButton {...defaultProps} />);

    const button = screen.getByRole('button', { name: /tap to spin/i });
    await user.click(button);

    await waitFor(() => {
      expect(defaultProps.onResult).toHaveBeenCalledWith({
        prize_id: '',
        prize_name: 'Gift Card',
        prize_index: 0,
        is_no_prize: false,
        result_token: 'recovered-token',
      });
    });
  });
});

describe('ResultDisplay', () => {
  it('renders prize name and QR code when isNoPrize is false', () => {
    render(
      <ResultDisplay
        prizeName="Free Coffee"
        isNoPrize={false}
        resultToken="token-uuid-123"
      />
    );

    expect(screen.getByText('Free Coffee')).toBeInTheDocument();
    expect(
      screen.getByText('Show this QR code to staff to claim your prize')
    ).toBeInTheDocument();

    // QRCodeSVG renders an SVG element
    const svg = document.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('renders "Better luck next time!" and no QR code when isNoPrize is true', () => {
    render(
      <ResultDisplay
        prizeName=""
        isNoPrize={true}
        resultToken={null}
      />
    );

    expect(screen.getByText('Better luck next time!')).toBeInTheDocument();
    expect(
      screen.queryByText('Show this QR code to staff to claim your prize')
    ).not.toBeInTheDocument();

    // No SVG (QR code) should be rendered
    const svg = document.querySelector('svg');
    expect(svg).not.toBeInTheDocument();
  });

  it('does not render QR code when resultToken is null even if prize exists', () => {
    render(
      <ResultDisplay
        prizeName="Gift Card"
        isNoPrize={false}
        resultToken={null}
      />
    );

    expect(screen.getByText('Gift Card')).toBeInTheDocument();
    // No QR instruction text since token is null
    expect(
      screen.queryByText('Show this QR code to staff to claim your prize')
    ).not.toBeInTheDocument();
  });
});
