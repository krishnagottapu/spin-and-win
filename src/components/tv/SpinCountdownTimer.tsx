'use client';

import { useEffect, useRef, useState } from 'react';

interface SpinCountdownTimerProps {
  /** Total duration of the countdown in seconds. */
  durationSeconds: number;
  /**
   * Starting value in seconds. Defaults to durationSeconds.
   * Pass a smaller value when the timer should start mid-turn
   * (e.g., mobile player opens the app after active player has been active for some time).
   */
  initialSeconds?: number;
  /**
   * Seconds remaining at which the warning state activates (red + pulse).
   * Defaults to 10.
   */
  warningThreshold?: number;
  /**
   * 'lg' = 200px SVG (TV display).
   * 'sm' = 80px SVG (mobile display).
   * Defaults to 'lg'.
   */
  size?: 'lg' | 'sm';
}

// SVG geometry constants per size
const CONFIG = {
  lg: { svgSize: 200, cx: 100, cy: 100, radius: 90, strokeWidth: 8, fontSize: 'text-5xl' },
  sm: { svgSize: 80, cx: 40, cy: 40, radius: 32, strokeWidth: 4, fontSize: 'text-lg' },
} as const;

export default function SpinCountdownTimer({
  durationSeconds,
  initialSeconds,
  warningThreshold = 10,
  size = 'lg',
}: SpinCountdownTimerProps) {
  const startSeconds = initialSeconds ?? durationSeconds;

  const { svgSize, cx, cy, radius, strokeWidth, fontSize } = CONFIG[size];
  const circumference = 2 * Math.PI * radius;

  // Use wall-clock delta to avoid drift when the browser throttles setInterval
  const startTimeRef = useRef<number>(Date.now());
  const [remaining, setRemaining] = useState<number>(startSeconds);

  useEffect(() => {
    startTimeRef.current = Date.now();
    setRemaining(startSeconds);

    const id = setInterval(() => {
      const elapsedSec = (Date.now() - startTimeRef.current) / 1000;
      const newRemaining = Math.max(0, startSeconds - elapsedSec);
      setRemaining(newRemaining);
      if (newRemaining === 0) {
        clearInterval(id);
      }
    }, 100); // 100ms ticks for smooth sub-second animation

    return () => clearInterval(id);
  }, [startSeconds]);

  const isWarning = remaining <= warningThreshold;

  // Ring drains clockwise from the top (12 o'clock).
  // dashoffset = 0 → full ring. dashoffset = circumference → empty ring.
  const dashOffset = circumference * (1 - remaining / durationSeconds);

  // Ring color: green when normal, red when warning
  const ringColor = isWarning ? '#ef4444' : '#22c55e'; // red-500 / green-500
  const textColor = isWarning ? 'text-red-400' : 'text-white';

  return (
    <div className={`relative flex items-center justify-center ${isWarning ? 'animate-pulse' : ''}`}>
      <svg
        width={svgSize}
        height={svgSize}
        viewBox={`0 0 ${svgSize} ${svgSize}`}
        aria-label={`${Math.ceil(remaining)} seconds remaining`}
        role="timer"
      >
        {/* Background track */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="#374151" /* gray-700 */
          strokeWidth={strokeWidth}
        />
        {/* Draining progress ring */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dashoffset 100ms linear, stroke 300ms ease' }}
        />
      </svg>
      {/* Center seconds label */}
      <span
        className={`absolute font-bold tabular-nums ${fontSize} ${textColor}`}
        aria-hidden="true"
      >
        {Math.ceil(remaining)}
      </span>
    </div>
  );
}
