'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { WinnerCard } from '@/components/claim/WinnerCard';
import type { ClaimVerifyResponse } from '@/lib/types';

const QrScanner = dynamic(() => import('@/components/claim/QrScanner'), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center rounded-lg bg-gray-100">
      <p className="text-gray-500">Loading scanner...</p>
    </div>
  ),
});

interface SearchFormProps {
  sessionId: string;
}

interface SearchResult {
  participant_id: string;
  name: string;
  phone: string;
  prize_name: string;
  is_fulfilled: boolean;
  result_token: string | null;
}

export function SearchForm({ sessionId }: SearchFormProps) {
  const [mode, setMode] = useState<'scan' | 'search'>('scan');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState<ClaimVerifyResponse | null>(null);
  const [fulfilling, setFulfilling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVerify = useCallback(async (token: string) => {
    setError(null);
    try {
      const response = await fetch(`/api/claim/verify/${encodeURIComponent(token)}`);
      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Failed to verify token');
        setSelectedParticipant(null);
        return;
      }
      const data: ClaimVerifyResponse = await response.json();
      setSelectedParticipant(data);
    } catch {
      setError('Network error. Please try again.');
    }
  }, []);

  const handleScan = useCallback(
    (token: string) => {
      fetchVerify(token);
    },
    [fetchVerify]
  );

  async function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (query.trim().length < 2) {
      setError('Search query must be at least 2 characters');
      return;
    }

    setError(null);
    setSearching(true);
    setSelectedParticipant(null);

    try {
      const params = new URLSearchParams({
        sessionId,
        q: query.trim(),
      });
      const response = await fetch(`/api/claim/search?${params.toString()}`);
      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Search failed');
        return;
      }
      const data = await response.json();
      setResults(data.results || []);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSearching(false);
    }
  }

  function handleResultClick(result: SearchResult) {
    if (result.result_token) {
      fetchVerify(result.result_token);
    }
  }

  async function handleFulfill(participantId: string) {
    setFulfilling(true);
    setError(null);

    try {
      const response = await fetch('/api/claim/fulfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participant_id: participantId }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Fulfillment failed');
        // Refresh the participant data to show current state
        if (selectedParticipant) {
          // Re-fetch to get updated fulfilled status
          const tokenFromResults = results.find(
            (r) => r.participant_id === participantId
          )?.result_token;
          if (tokenFromResults) {
            await fetchVerify(tokenFromResults);
          }
        }
        return;
      }

      const data = await response.json();
      // Update the displayed participant info
      if (selectedParticipant) {
        setSelectedParticipant({
          ...selectedParticipant,
          is_fulfilled: true,
          fulfilled_at: data.fulfilled_at,
          fulfilled_by_name: 'You',
        });
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setFulfilling(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Mode toggle */}
      <div className="flex rounded-lg border border-gray-200 overflow-hidden">
        <button
          type="button"
          onClick={() => {
            setMode('scan');
            setSelectedParticipant(null);
            setError(null);
          }}
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            mode === 'scan'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          QR Scan
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('search');
            setSelectedParticipant(null);
            setError(null);
          }}
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            mode === 'search'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          Text Search
        </button>
      </div>

      {/* Error display */}
      {error && (
        <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Scan mode */}
      {mode === 'scan' && !selectedParticipant && (
        <QrScanner onScan={handleScan} />
      )}

      {/* Search mode */}
      {mode === 'search' && !selectedParticipant && (
        <div className="space-y-4">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or phone..."
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={searching || query.trim().length < 2}
              className="rounded-md bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {searching ? 'Searching...' : 'Search'}
            </button>
          </form>

          {/* Search results list */}
          {results.length > 0 && (
            <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200">
              {results.map((result) => (
                <li key={result.participant_id}>
                  <button
                    type="button"
                    onClick={() => handleResultClick(result)}
                    className="w-full px-4 py-3 text-left hover:bg-gray-50"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{result.name}</p>
                        <p className="text-sm text-gray-500">{result.prize_name}</p>
                      </div>
                      {result.is_fulfilled && (
                        <span className="rounded-full bg-red-100 px-2 py-1 text-xs text-red-700">
                          Fulfilled
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Winner card display */}
      {selectedParticipant && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => {
              setSelectedParticipant(null);
              setError(null);
            }}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            ← Back to {mode === 'scan' ? 'scanner' : 'search'}
          </button>
          <WinnerCard
            participant={selectedParticipant}
            onFulfill={handleFulfill}
            fulfilling={fulfilling}
          />
        </div>
      )}
    </div>
  );
}
