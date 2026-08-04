import { describe, expect, it } from 'vitest';
import { getThemeColors } from '@/components/tv/SpinWheel';
import type { WheelTheme } from '@/lib/types';

describe('getThemeColors', () => {
  it('returns an array of color strings for corporate theme', () => {
    const colors = getThemeColors('corporate');
    expect(Array.isArray(colors)).toBe(true);
    expect(colors.length).toBeGreaterThan(0);
    colors.forEach((color) => {
      expect(typeof color).toBe('string');
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });

  it('returns arrays of at least 3 colors for each theme', () => {
    const themes: WheelTheme[] = ['corporate', 'party', 'holiday'];
    themes.forEach((theme) => {
      const colors = getThemeColors(theme);
      expect(colors.length).toBeGreaterThanOrEqual(3);
    });
  });

  it('returns different colors for different themes', () => {
    const corporate = getThemeColors('corporate');
    const party = getThemeColors('party');
    const holiday = getThemeColors('holiday');

    // Each theme should have a distinct palette
    expect(corporate).not.toEqual(party);
    expect(corporate).not.toEqual(holiday);
    expect(party).not.toEqual(holiday);
  });
});
