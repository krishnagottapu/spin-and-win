'use client';

import { useEffect, useRef, useState } from 'react';

interface WinnerLeaderboardProps {
  winners: Array<{ name: string; prize_name: string; spin_completed_at: string }>;
}

export function WinnerLeaderboard({ winners }: WinnerLeaderboardProps) {
  const [visibleCount, setVisibleCount] = useState(0);
  const prevLengthRef = useRef(winners.length);
  const isInitialLoad = useRef(true);

  // Stagger on initial load
  useEffect(() => {
    if (!isInitialLoad.current) return;
    if (winners.length === 0) return;

    let count = 0;
    const interval = setInterval(() => {
      count++;
      setVisibleCount(count);
      if (count >= winners.length) {
        clearInterval(interval);
        isInitialLoad.current = false;
      }
    }, 150);

    return () => clearInterval(interval);
  }, [winners.length]);

  // Animate new winners added during the session
  useEffect(() => {
    if (isInitialLoad.current) return;
    if (winners.length > prevLengthRef.current) {
      // New winner added — briefly hide it then reveal
      setVisibleCount(winners.length - 1);
      const timeout = setTimeout(() => {
        setVisibleCount(winners.length);
      }, 50);
      prevLengthRef.current = winners.length;
      return () => clearTimeout(timeout);
    }
    prevLengthRef.current = winners.length;
  }, [winners.length]);

  if (winners.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xl text-gray-400">No winners yet — be the first!</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <h2 className="mb-4 text-2xl font-bold text-yellow-400">🏆 Winners</h2>
      <div className="flex-1 space-y-3 overflow-y-auto">
        {winners.map((winner, index) => {
          const isVisible = index < visibleCount;
          return (
            <div
              key={`${winner.name}-${winner.spin_completed_at}-${index}`}
              className={`flex items-center justify-between rounded-lg bg-gray-800 px-4 py-3 transition-all duration-500 ease-out ${
                isVisible
                  ? 'translate-y-0 opacity-100'
                  : '-translate-y-4 opacity-0'
              }`}
            >
              <span className="text-2xl font-semibold text-white">{winner.name}</span>
              <span className="rounded-full bg-yellow-500 px-3 py-1 text-sm font-bold text-gray-950">
                {winner.prize_name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
