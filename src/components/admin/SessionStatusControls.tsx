'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { SessionStatus } from '@/lib/types';

interface SessionStatusControlsProps {
  sessionId: string;
  currentStatus: SessionStatus;
  slug: string;
  tvToken: string;
}

const TRANSITIONS: Record<SessionStatus, Array<{ next: SessionStatus; label: string; color: string }>> = {
  draft: [{ next: 'active', label: 'Start Session', color: 'bg-green-600 hover:bg-green-700' }],
  active: [
    { next: 'paused', label: 'Pause', color: 'bg-yellow-600 hover:bg-yellow-700' },
    { next: 'ending', label: 'Stop Session', color: 'bg-orange-600 hover:bg-orange-700' },
  ],
  paused: [
    { next: 'active', label: 'Resume', color: 'bg-green-600 hover:bg-green-700' },
    { next: 'ending', label: 'Stop Session', color: 'bg-orange-600 hover:bg-orange-700' },
  ],
  ending: [{ next: 'ended', label: 'End Session', color: 'bg-red-600 hover:bg-red-700' }],
  ended: [],
};

export default function SessionStatusControls({
  sessionId,
  currentStatus,
  slug,
  tvToken,
}: SessionStatusControlsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const transitions = TRANSITIONS[currentStatus];

  async function handleTransition(transition: { next: SessionStatus; label: string }) {
    const confirmMsg =
      transition.next === 'active' && currentStatus === 'draft'
        ? 'Start this session? Players will be able to join.'
        : transition.next === 'active' && currentStatus === 'paused'
          ? 'Resume the session? Players can join and spin again.'
          : transition.next === 'paused'
            ? 'Pause the session? No new joins or spins until resumed.'
            : transition.next === 'ending'
              ? 'Stop accepting new players? Active spins will complete.'
              : 'End this session permanently? This cannot be undone.';

    if (!confirm(confirmMsg)) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: transition.next }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to update session status');
        return;
      }

      router.refresh();
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }

  const [baseUrl, setBaseUrl] = useState('');

  useEffect(() => {
    setBaseUrl(window.location.origin);
  }, []);

  const tvUrl = `${baseUrl}/tv/${tvToken}`;
  const playerUrl = `${baseUrl}/play/${slug}`;

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500">Status:</span>
        <StatusBadge status={currentStatus} />

        {transitions.map((t) => (
          <button
            key={t.next}
            onClick={() => handleTransition(t)}
            disabled={loading}
            className={`rounded-md px-4 py-2 text-sm font-medium text-white ${t.color} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {loading ? 'Updating...' : t.label}
          </button>
        ))}
      </div>

      {baseUrl && (currentStatus === 'active' || currentStatus === 'paused' || currentStatus === 'ending' || currentStatus === 'ended') && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm">
          <p className="mb-2 font-medium text-blue-900">Session URLs</p>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-blue-800">TV Display:</span>
              <a
                href={tvUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline break-all"
              >
                {tvUrl}
              </a>
              <CopyButton text={tvUrl} />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-blue-800">Player Join:</span>
              <a
                href={playerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline break-all"
              >
                {playerUrl}
              </a>
              <CopyButton text={playerUrl} />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-blue-800">Staff Portal:</span>
              <a
                href={`${baseUrl}/claim/${sessionId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline break-all"
              >
                {baseUrl}/claim/{sessionId}
              </a>
              <CopyButton text={`${baseUrl}/claim/${sessionId}`} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: SessionStatus }) {
  const classes: Record<SessionStatus, string> = {
    draft: 'bg-yellow-100 text-yellow-800',
    active: 'bg-green-100 text-green-800',
    paused: 'bg-amber-100 text-amber-800',
    ending: 'bg-orange-100 text-orange-800',
    ended: 'bg-gray-100 text-gray-800',
  };

  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${classes[status]}`}>
      {status}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: ignore if clipboard API unavailable
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="rounded border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50"
      title="Copy to clipboard"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}
