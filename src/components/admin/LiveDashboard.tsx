'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSessionChannel } from '@/lib/supabase/realtime';
import { ExportButton } from '@/components/admin/ExportButton';
import type {
  Session,
  Participant,
  Prize,
  QueueUpdatedPayload,
  PlayerActivePayload,
  SpinResultPayload,
  WinnerAnnouncedPayload,
} from '@/lib/types';

interface LiveDashboardProps {
  session: Session;
  initialParticipants: Participant[];
  prizes: Prize[];
}

interface RecentWinner {
  name: string;
  prize_name: string;
  timestamp: string;
}

export function LiveDashboard({
  session,
  initialParticipants,
  prizes: initialPrizes,
}: LiveDashboardProps) {
  const [participants, setParticipants] = useState<Participant[]>(initialParticipants);
  const [prizeInventory, setPrizeInventory] = useState<Prize[]>(initialPrizes);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(() => {
    const active = initialParticipants.find(
      (p) => p.status === 'active' || p.status === 'spinning'
    );
    return active?.id ?? null;
  });
  const [recentWinners, setRecentWinners] = useState<RecentWinner[]>([]);

  // Poll GET /api/sessions/[id] every 30 seconds to refresh fulfillment rate.
  // Fulfillment events happen out-of-band (staff scans QR) and are not broadcast
  // via Realtime, so polling is necessary to keep the rate up to date.
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/sessions/${session.id}`);
        if (!res.ok) return;
        const data = await res.json();
        // Update prize inventory from the server response
        if (data.session?.prizes) {
          setPrizeInventory(data.session.prizes as Prize[]);
        }
      } catch {
        // Silently ignore polling errors — will retry on next interval
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [session.id]);

  // Handle realtime events
  const handleQueueUpdated = useCallback((payload: QueueUpdatedPayload) => {
    setParticipants((prev) => {
      const updated = [...prev];
      for (const pos of payload.positions) {
        const idx = updated.findIndex((p) => p.id === pos.id);
        if (idx >= 0) {
          updated[idx] = { ...updated[idx], queue_position: pos.position };
        }
      }
      return updated.sort((a, b) => a.queue_position - b.queue_position);
    });
  }, []);

  const handlePlayerActive = useCallback((payload: PlayerActivePayload) => {
    setActivePlayerId(payload.participant_id);
    setParticipants((prev) =>
      prev.map((p) =>
        p.id === payload.participant_id
          ? { ...p, status: 'active' as const }
          : p
      )
    );
  }, []);

  const handleSpinResult = useCallback((payload: SpinResultPayload) => {
    // Decrement the prize inventory for the won prize
    if (!payload.is_no_prize) {
      setPrizeInventory((prev) =>
        prev.map((prize) =>
          prize.name === payload.prize_name
            ? { ...prize, inventory_count: Math.max(0, prize.inventory_count - 1) }
            : prize
        )
      );
    }

    // Update participant status to completed
    setParticipants((prev) =>
      prev.map((p) =>
        p.id === payload.participant_id
          ? { ...p, status: 'completed' as const }
          : p
      )
    );
  }, []);

  const handleWinnerAnnounced = useCallback((payload: WinnerAnnouncedPayload) => {
    setRecentWinners((prev) => [
      { name: payload.name, prize_name: payload.prize_name, timestamp: payload.timestamp },
      ...prev.slice(0, 9), // Keep last 10 winners
    ]);
  }, []);

  useSessionChannel(session.id, {
    onQueueUpdated: handleQueueUpdated,
    onPlayerActive: handlePlayerActive,
    onSpinResult: handleSpinResult,
    onWinnerAnnounced: handleWinnerAnnounced,
  });

  // Calculate fulfillment rate: fulfilled / total completed with actual prizes
  const completedWithPrizes = participants.filter(
    (p) => p.status === 'completed' && p.prize_id !== null
  );
  const fulfilledCount = completedWithPrizes.filter((p) => p.is_fulfilled).length;
  const fulfillmentRate =
    completedWithPrizes.length > 0
      ? Math.round((fulfilledCount / completedWithPrizes.length) * 100)
      : 0;

  // Current queue: participants that are queued, active, or spinning
  const queuedParticipants = participants
    .filter((p) => p.status === 'queued' || p.status === 'active' || p.status === 'spinning')
    .sort((a, b) => a.queue_position - b.queue_position);

  return (
    <div className="space-y-6">
      {/* Active Player Banner */}
      {activePlayerId && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <h3 className="text-sm font-medium text-green-800">Now Playing</h3>
          <p className="mt-1 text-lg font-bold text-green-900">
            {participants.find((p) => p.id === activePlayerId)?.name ?? 'Unknown'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Current Queue */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">
            Current Queue ({queuedParticipants.length})
          </h2>
          {queuedParticipants.length === 0 ? (
            <p className="text-sm text-gray-500">Queue is empty.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {queuedParticipants.map((participant) => {
                const isActive =
                  participant.id === activePlayerId ||
                  participant.status === 'active' ||
                  participant.status === 'spinning';
                return (
                  <li
                    key={participant.id}
                    className={`flex items-center justify-between py-2 ${
                      isActive ? 'rounded bg-yellow-50 px-2 font-semibold' : ''
                    }`}
                  >
                    <span className="text-sm text-gray-900">
                      #{participant.queue_position} — {participant.name}
                    </span>
                    {isActive && (
                      <span className="text-xs font-medium text-yellow-700">
                        Active
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Prize Inventory */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">
            Prize Inventory
          </h2>
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="py-2 text-left text-xs font-medium uppercase text-gray-500">
                  Prize
                </th>
                <th className="py-2 text-right text-xs font-medium uppercase text-gray-500">
                  Remaining
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {prizeInventory
                .filter((p) => !p.is_no_prize)
                .map((prize) => (
                  <tr key={prize.id}>
                    <td className="py-2 text-sm text-gray-900">{prize.name}</td>
                    <td className="py-2 text-right text-sm text-gray-600">
                      {prize.inventory_count}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Fulfillment Rate */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-gray-900">
          Fulfillment Rate
        </h2>
        <p className="text-2xl font-bold text-gray-900">
          {fulfilledCount} / {completedWithPrizes.length} fulfilled ({fulfillmentRate}%)
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Refreshes automatically every 30 seconds
        </p>
      </div>

      {/* Recent Winners */}
      {recentWinners.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">
            Recent Winners
          </h2>
          <ul className="divide-y divide-gray-100">
            {recentWinners.map((winner, idx) => (
              <li key={`${winner.timestamp}-${idx}`} className="flex items-center justify-between py-2">
                <span className="text-sm font-medium text-gray-900">
                  {winner.name}
                </span>
                <span className="text-sm text-gray-500">{winner.prize_name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Export Button */}
      <div className="flex justify-end">
        <ExportButton sessionId={session.id} slug={session.slug} />
      </div>
    </div>
  );
}
