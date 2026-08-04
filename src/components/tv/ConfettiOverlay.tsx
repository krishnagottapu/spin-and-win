'use client';

import confetti from 'canvas-confetti';
import { useEffect } from 'react';

interface ConfettiOverlayProps {
  fire: boolean;
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
