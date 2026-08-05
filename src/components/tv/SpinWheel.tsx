'use client';

import Image from 'next/image';
import { Wheel } from 'react-custom-roulette';
import type { WheelTheme } from '@/lib/types';

interface SpinWheelProps {
  prizes: Array<{ name: string }>;
  theme: WheelTheme;
  targetIndex: number | null;
  onStopSpinning: () => void;
}

export function getThemeColors(theme: WheelTheme): string[] {
  const palettes: Record<WheelTheme, string[]> = {
    corporate: ['#1e40af', '#374151', '#2563eb', '#4b5563', '#3b82f6'],
    party: ['#f43f5e', '#f59e0b', '#10b981', '#6366f1', '#ec4899'],
    holiday: ['#dc2626', '#16a34a', '#fbbf24', '#15803d', '#b91c1c'],
  };
  return palettes[theme];
}

export default function SpinWheel({
  prizes,
  theme,
  targetIndex,
  onStopSpinning,
}: SpinWheelProps) {
  const colors = getThemeColors(theme);
  const data = prizes.map((p, i) => ({
    option: p.name,
    style: {
      backgroundColor: colors[i % colors.length],
      textColor: '#ffffff',
    },
  }));

  const mustStartSpinning = targetIndex !== null;
  const prizeNumber = targetIndex ?? 0;

  return (
    <div className="relative" style={{ transform: 'scale(1.6)', transformOrigin: 'center center' }}>
      <Wheel
        mustStartSpinning={mustStartSpinning}
        prizeNumber={prizeNumber}
        data={data}
        backgroundColors={colors}
        textColors={['#ffffff']}
        outerBorderColor="#ffffff"
        outerBorderWidth={4}
        radiusLineColor="#ffffff"
        radiusLineWidth={1}
        fontSize={16}
        innerRadius={20}
        spinDuration={0.5}
        onStopSpinning={onStopSpinning}
      />
      {/* Logo centered on wheel */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <Image
          src="/logo/utsav_dj_logo.png"
          alt="Logo"
          width={60}
          height={60}
          className="rounded-full"
        />
      </div>
    </div>
  );
}
