'use client';

import type { ClaimVerifyResponse } from '@/lib/types';

interface WinnerCardProps {
  participant: ClaimVerifyResponse;
  onFulfill: (participantId: string) => void;
  fulfilling: boolean;
}

export function WinnerCard({ participant, onFulfill, fulfilling }: WinnerCardProps) {
  // No prize — nothing to claim
  if (participant.is_no_prize) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center">
        <h2 className="text-2xl font-bold text-gray-900">{participant.name}</h2>
        <p className="mt-2 text-lg text-gray-500">No Prize — Nothing to claim</p>
      </div>
    );
  }

  // Already fulfilled
  if (participant.is_fulfilled) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <div className="mb-4 rounded-md bg-red-600 px-4 py-2 text-white font-bold">
          Already Claimed!
        </div>
        <h2 className="text-2xl font-bold text-gray-900">{participant.name}</h2>
        <p className="mt-2 text-xl text-gray-700">{participant.prize_name}</p>
        <div className="mt-4 text-sm text-gray-600">
          <p>Fulfilled by: {participant.fulfilled_by_name}</p>
          <p>
            At:{' '}
            {participant.fulfilled_at
              ? new Date(participant.fulfilled_at).toLocaleString()
              : 'Unknown'}
          </p>
        </div>
      </div>
    );
  }

  // Not fulfilled — show fulfill button
  return (
    <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
      <h2 className="text-2xl font-bold text-gray-900">{participant.name}</h2>
      <p className="mt-2 text-xl text-gray-700">{participant.prize_name}</p>
      <button
        type="button"
        onClick={() => onFulfill(participant.participant_id)}
        disabled={fulfilling}
        className="mt-6 w-full rounded-md bg-green-600 px-6 py-3 text-lg font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {fulfilling ? 'Marking...' : 'Mark Fulfilled'}
      </button>
    </div>
  );
}
