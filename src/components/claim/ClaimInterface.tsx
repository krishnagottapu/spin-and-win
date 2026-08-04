'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';

const QrScanner = dynamic(() => import('@/components/claim/QrScanner'), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center rounded-lg bg-gray-100">
      <p className="text-gray-500">Loading camera...</p>
    </div>
  ),
});

interface Winner {
  participant_id: string;
  name: string;
  phone: string;
  prize_name: string;
  is_fulfilled: boolean;
  fulfilled_at: string | null;
}

interface ClaimInterfaceProps {
  role: 'admin' | 'staff';
  staffSessionId?: string;
}

export function ClaimInterface({ role, staffSessionId }: ClaimInterfaceProps) {
  const sessionId = staffSessionId || '';
  const [winners, setWinners] = useState<Winner[]>([]);
  const [filtered, setFiltered] = useState<Winner[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fulfilling, setFulfilling] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);

  // Fetch all winners on mount
  useEffect(() => {
    if (!sessionId) return;
    async function fetchWinners() {
      try {
        const res = await fetch(`/api/claim/search?sessionId=${sessionId}&q=__all__`);
        if (res.ok) {
          const data = await res.json();
          setWinners(data.results || []);
          setFiltered(data.results || []);
        } else {
          // Fallback: try with a broad search
          setWinners([]);
          setFiltered([]);
        }
      } catch {
        setError('Failed to load winners');
      } finally {
        setLoading(false);
      }
    }
    fetchWinners();
  }, [sessionId]);

  // Filter on search input
  useEffect(() => {
    if (!search.trim()) {
      setFiltered(winners);
      return;
    }
    const q = search.toLowerCase();
    setFiltered(
      winners.filter(
        (w) =>
          w.name.toLowerCase().includes(q) ||
          w.phone.includes(q) ||
          w.prize_name.toLowerCase().includes(q)
      )
    );
  }, [search, winners]);

  async function handleFulfill(participantId: string) {
    setFulfilling(participantId);
    try {
      const res = await fetch('/api/claim/fulfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participant_id: participantId }),
      });

      if (res.ok) {
        const data = await res.json();
        setWinners((prev) =>
          prev.map((w) =>
            w.participant_id === participantId
              ? { ...w, is_fulfilled: true, fulfilled_at: data.fulfilled_at }
              : w
          )
        );
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to fulfill');
      }
    } catch {
      alert('Network error');
    } finally {
      setFulfilling(null);
    }
  }

  // Handle QR scan — look up the result token
  const handleScan = useCallback(async (token: string) => {
    setScanResult(null);
    try {
      const res = await fetch(`/api/claim/verify/${encodeURIComponent(token)}`);
      if (res.ok) {
        const data = await res.json();
        // Filter to show just this winner
        setSearch(data.name);
        setShowScanner(false);
        setScanResult(`Found: ${data.name} — ${data.prize_name}`);
      } else {
        setScanResult('QR code not recognized');
      }
    } catch {
      setScanResult('Failed to verify QR code');
    }
  }, []);

  if (!sessionId) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="mx-auto max-w-lg text-center">
          <h1 className="text-2xl font-bold text-gray-900">Prize Claim Station</h1>
          <p className="mt-4 text-gray-500">No session selected. Please use the staff link provided by your admin.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-lg">
        <header className="mb-4 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Prize Claim Station</h1>
          <p className="mt-1 text-sm text-gray-500">
            {role === 'admin' ? 'Admin Access' : 'Staff Access'}
          </p>
        </header>

        {/* Search bar + QR button */}
        <div className="mb-4 flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, or prize..."
            className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={() => setShowScanner(!showScanner)}
            className={`shrink-0 rounded-lg px-4 py-3 text-sm font-medium ${
              showScanner
                ? 'bg-red-100 text-red-700'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {showScanner ? '✕ Close' : '📷 QR'}
          </button>
        </div>

        {/* QR Scanner */}
        {showScanner && (
          <div className="mb-4">
            <QrScanner onScan={handleScan} />
            {scanResult && (
              <p className="mt-2 text-center text-sm font-medium text-green-600">{scanResult}</p>
            )}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        {loading ? (
          <div className="py-8 text-center text-gray-400">Loading winners...</div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-gray-400">
            {search ? 'No matches found' : 'No winners yet'}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((w) => (
              <div
                key={w.participant_id}
                className={`rounded-lg border p-4 ${
                  w.is_fulfilled
                    ? 'border-green-200 bg-green-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">{w.name}</p>
                    <p className="text-sm text-gray-500">{w.phone}</p>
                    <p className="mt-1 text-sm font-medium text-purple-700">{w.prize_name}</p>
                  </div>
                  <div className="text-right">
                    {w.is_fulfilled ? (
                      <div>
                        <span className="inline-block rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                          ✓ Claimed
                        </span>
                        {w.fulfilled_at && (
                          <p className="mt-1 text-xs text-gray-400">
                            {new Date(w.fulfilled_at).toLocaleTimeString()}
                          </p>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => handleFulfill(w.participant_id)}
                        disabled={fulfilling === w.participant_id}
                        className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        {fulfilling === w.participant_id ? 'Fulfilling...' : 'Fulfill'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 text-center text-xs text-gray-400">
          {filtered.length} of {winners.length} winner{winners.length !== 1 ? 's' : ''}
        </p>
      </div>
    </div>
  );
}
