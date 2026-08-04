'use client';

import { useState, useEffect, FormEvent } from 'react';
import type { Session } from '@/lib/types';

interface StaffEntry {
  id: string;
  name: string;
  registration_token: string;
  device_registered: boolean;
}

export default function StaffPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [staffName, setStaffName] = useState('');
  const [staffList, setStaffList] = useState<StaffEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [baseUrl, setBaseUrl] = useState('');

  useEffect(() => {
    setBaseUrl(window.location.origin);
  }, []);

  useEffect(() => {
    async function fetchSessions() {
      try {
        const res = await fetch('/api/sessions');
        if (res.ok) {
          const data = await res.json();
          setSessions(data.sessions ?? []);
          if (data.sessions?.length > 0) {
            setSelectedSessionId(data.sessions[0].id);
          }
        }
      } catch {
        console.error('Failed to fetch sessions');
      }
    }
    fetchSessions();
  }, []);

  // Fetch staff for selected session
  useEffect(() => {
    if (!selectedSessionId) return;
    async function fetchStaff() {
      try {
        const res = await fetch(`/api/staff/list?sessionId=${selectedSessionId}`);
        if (res.ok) {
          const data = await res.json();
          setStaffList(data.staff ?? []);
        }
      } catch {
        console.error('Failed to fetch staff');
      }
    }
    fetchStaff();
  }, [selectedSessionId]);

  async function handleAddStaff(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!staffName.trim()) return;
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/staff/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: selectedSessionId,
          name: staffName.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to create staff');
        setLoading(false);
        return;
      }

      const data = await res.json();
      setStaffList((prev) => [...prev, data.staff]);
      setStaffName('');
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }

  function getRegistrationUrl(token: string) {
    return `${baseUrl}/claim/setup/${token}`;
  }

  async function copyUrl(token: string) {
    try {
      await navigator.clipboard.writeText(getRegistrationUrl(token));
    } catch { /* ignore */ }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Staff Management</h1>

      <div className="rounded-md border border-gray-200 bg-white p-6">
        {/* Session selector */}
        <div className="mb-6">
          <label htmlFor="session" className="block text-sm font-medium text-gray-700">
            Session
          </label>
          <select
            id="session"
            value={selectedSessionId}
            onChange={(e) => setSelectedSessionId(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none"
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.event_name} ({s.status})
              </option>
            ))}
          </select>
        </div>

        {/* Add staff form */}
        <form onSubmit={handleAddStaff} className="mb-6 flex gap-3">
          <input
            type="text"
            value={staffName}
            onChange={(e) => setStaffName(e.target.value)}
            placeholder="Staff member name"
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading || !staffName.trim()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Adding...' : 'Add Staff'}
          </button>
        </form>

        {error && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Staff list with URLs */}
        {staffList.length > 0 ? (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">Staff Members & Registration Links</h2>
            {staffList.map((staff) => (
              <div
                key={staff.id}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{staff.name}</span>
                    {staff.device_registered ? (
                      <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        Registered ✓
                      </span>
                    ) : (
                      <span className="rounded bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
                        Pending
                      </span>
                    )}
                  </div>
                  {!staff.device_registered && (
                    <p className="mt-1 break-all font-mono text-xs text-gray-500">
                      {getRegistrationUrl(staff.registration_token)}
                    </p>
                  )}
                </div>
                {!staff.device_registered && (
                  <button
                    onClick={() => copyUrl(staff.registration_token)}
                    className="ml-3 shrink-0 rounded border border-gray-300 bg-white px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
                  >
                    Copy URL
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-sm text-gray-400">No staff added yet for this session.</p>
        )}
      </div>
    </div>
  );
}
