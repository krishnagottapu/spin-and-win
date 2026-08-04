'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

interface SessionOption {
  id: string;
  event_name: string;
}

export default function StaffLoginGate() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Fetch active sessions for the dropdown
  useEffect(() => {
    async function fetchSessions() {
      try {
        const res = await fetch('/api/sessions/active');
        if (res.ok) {
          const data = await res.json();
          setSessions(data.sessions ?? []);
          if (data.sessions?.length === 1) {
            setSessionId(data.sessions[0].id);
          }
        }
      } catch {
        // Silently fail — staff can still type session ID
      }
    }
    fetchSessions();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/staff/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          username: username.trim(),
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login failed');
        setLoading(false);
        return;
      }

      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <img src="/logo/utsav_logo.png" alt="Logo" className="mx-auto h-12 w-auto" />
          <h1 className="mt-4 text-2xl font-bold text-white">Staff Login</h1>
          <p className="mt-1 text-sm text-gray-400">Login to manage prize fulfillment</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {sessions.length > 1 && (
            <div>
              <label htmlFor="session" className="block text-sm font-medium text-gray-300">
                Event
              </label>
              <select
                id="session"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
              >
                <option value="">Select event...</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>{s.event_name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-300">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              required
              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
            />
          </div>

          {error && (
            <p className="text-center text-sm text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !sessionId}
            className="w-full rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 py-3 text-lg font-bold text-white transition-all hover:from-purple-700 hover:to-pink-700 disabled:opacity-50"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Don&apos;t have an account? Ask your admin for the registration link.
        </p>
      </div>
    </div>
  );
}
