'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

interface StaffSessionLoginProps {
  sessionId: string;
  eventName: string;
  sessionEnded: boolean;
}

type Mode = 'login' | 'register';

export default function StaffSessionLogin({
  sessionId,
  eventName,
  sessionEnded,
}: StaffSessionLoginProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('register');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (sessionEnded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4">
        <div className="text-center">
          <span className="text-5xl">🏁</span>
          <p className="mt-4 text-xl text-gray-400">This event has ended.</p>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const endpoint = mode === 'register'
      ? '/api/auth/staff/register'
      : '/api/auth/staff/login';

    const body = mode === 'register'
      ? { session_id: sessionId, name: name.trim(), username: username.trim(), password }
      : { session_id: sessionId, username: username.trim(), password };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed');
        setLoading(false);
        return;
      }

      // Refresh page — server will detect the cookie and show ClaimInterface
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="mb-6 text-center">
          <img src="/logo/utsav_logo.png" alt="Logo" className="mx-auto h-12 w-auto" />
          <h1 className="mt-4 text-2xl font-bold text-white">Staff Portal</h1>
          <p className="mt-1 text-sm text-gray-400">{eventName}</p>
        </div>

        {/* Toggle */}
        <div className="mb-4 flex rounded-lg border border-gray-700 bg-gray-800">
          <button
            onClick={() => { setMode('register'); setError(''); }}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
              mode === 'register' ? 'bg-purple-600 text-white' : 'text-gray-400'
            }`}
          >
            New Staff
          </button>
          <button
            onClick={() => { setMode('login'); setError(''); }}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
              mode === 'login' ? 'bg-purple-600 text-white' : 'text-gray-400'
            }`}
          >
            Existing Staff
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-300">
                Your Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Smith"
                required
                className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
              />
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
              placeholder={mode === 'register' ? 'Choose a username' : 'Enter your username'}
              required
              minLength={3}
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
              placeholder={mode === 'register' ? 'Create a password' : 'Enter your password'}
              required
              minLength={4}
              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
            />
          </div>

          {error && (
            <p className="text-center text-sm text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 py-3 text-lg font-bold text-white transition-all hover:from-purple-700 hover:to-pink-700 disabled:opacity-50"
          >
            {loading
              ? (mode === 'register' ? 'Registering...' : 'Logging in...')
              : (mode === 'register' ? 'Register & Start' : 'Login')
            }
          </button>
        </form>
      </div>
    </div>
  );
}
