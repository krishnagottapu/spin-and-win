'use client';

import { useState, useEffect } from 'react';

interface StaffEntry {
  id: string;
  name: string;
  registration_token: string;
  device_registered: boolean;
}

interface StaffManagerProps {
  sessionId: string;
}

export default function StaffManager({ sessionId }: StaffManagerProps) {
  const [staff, setStaff] = useState<StaffEntry[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [baseUrl, setBaseUrl] = useState('');

  useEffect(() => {
    setBaseUrl(window.location.origin);
  }, []);

  useEffect(() => {
    async function fetchStaff() {
      try {
        const res = await fetch(`/api/staff/list?sessionId=${sessionId}`);
        if (res.ok) {
          const data = await res.json();
          setStaff(data.staff ?? []);
        }
      } catch { /* ignore */ }
    }
    fetchStaff();
  }, [sessionId]);

  async function handleAdd() {
    if (!name.trim()) return;
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/staff/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, name: name.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed');
        setLoading(false);
        return;
      }

      const data = await res.json();
      setStaff((prev) => [...prev, data.staff]);
      setName('');
    } catch {
      setError('Failed to add staff');
    } finally {
      setLoading(false);
    }
  }

  function getUrl(token: string) {
    return `${baseUrl}/claim/setup/${token}`;
  }

  async function copyUrl(token: string) {
    try {
      await navigator.clipboard.writeText(getUrl(token));
    } catch { /* ignore */ }
  }

  return (
    <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-700">Staff Members</h3>

      {/* Add staff */}
      <div className="mb-3 flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Staff name"
          className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        />
        <button
          onClick={handleAdd}
          disabled={loading || !name.trim()}
          className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? '...' : '+ Add'}
        </button>
      </div>

      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}

      {/* Staff list */}
      {staff.length > 0 ? (
        <div className="space-y-2">
          {staff.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded border border-gray-200 bg-white px-3 py-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-800">{s.name}</span>
                  {s.device_registered ? (
                    <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">Active ✓</span>
                  ) : (
                    <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-700">Pending</span>
                  )}
                </div>
                {!s.device_registered && (
                  <p className="mt-0.5 truncate font-mono text-xs text-gray-400">
                    {getUrl(s.registration_token)}
                  </p>
                )}
                {s.device_registered && (
                  <p className="mt-0.5 truncate font-mono text-xs text-gray-400">
                    Login: {baseUrl}/claim/{sessionId}
                  </p>
                )}
              </div>
              {!s.device_registered && (
                <button
                  onClick={() => copyUrl(s.registration_token)}
                  className="shrink-0 rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                >
                  Copy
                </button>
              )}
              {s.device_registered && (
                <button
                  onClick={() => { navigator.clipboard.writeText(`${baseUrl}/claim/${sessionId}`).catch(() => {}); }}
                  className="shrink-0 rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                >
                  Copy Login
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-center text-xs text-gray-400">No staff added yet</p>
      )}
    </div>
  );
}
