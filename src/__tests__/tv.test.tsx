import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { WinnerLeaderboard } from '@/components/tv/WinnerLeaderboard';

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
