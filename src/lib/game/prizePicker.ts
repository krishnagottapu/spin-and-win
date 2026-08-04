import type { Prize } from '@/lib/types';

export class PrizeDepletedError extends Error {
  constructor(message = 'No prizes available') {
    super(message);
    this.name = 'PrizeDepletedError';
  }
}

interface PickResult {
  prize: Prize;
  prizeIndex: number;
}

/**
 * Weighted random prize selection.
 * Filters out prizes with inventory_count <= 0, then picks based on weight.
 * Returns the selected prize and its 0-based index in the ORIGINAL (unfiltered) array.
 * Throws PrizeDepletedError if no eligible prizes remain.
 */
export function pickPrize(prizes: Prize[]): PickResult {
  // Build eligible list with original indices
  const eligible: Array<{ prize: Prize; originalIndex: number }> = [];
  for (let i = 0; i < prizes.length; i++) {
    if (prizes[i].inventory_count > 0) {
      eligible.push({ prize: prizes[i], originalIndex: i });
    }
  }

  if (eligible.length === 0) {
    throw new PrizeDepletedError();
  }

  // Calculate total weight of eligible prizes
  const totalWeight = eligible.reduce((sum, entry) => sum + entry.prize.weight, 0);

  // Generate random number in [0, totalWeight)
  const random = Math.random() * totalWeight;

  // Walk eligible prizes accumulating weight
  let cumulative = 0;
  for (const entry of eligible) {
    cumulative += entry.prize.weight;
    if (random < cumulative) {
      return { prize: entry.prize, prizeIndex: entry.originalIndex };
    }
  }

  // Fallback to last eligible (handles floating-point edge case)
  const last = eligible[eligible.length - 1];
  return { prize: last.prize, prizeIndex: last.originalIndex };
}
