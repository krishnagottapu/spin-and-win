'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import PrizeEditor from '@/components/admin/PrizeEditor';
import type {
  CreatePrizeInput,
  WheelTheme,
  SoundPreset,
  SessionWithPrizes,
} from '@/lib/types';

interface SessionFormProps {
  session?: SessionWithPrizes;
  mode: 'create' | 'edit';
}

export default function SessionForm({ session, mode }: SessionFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [eventName, setEventName] = useState(session?.event_name ?? '');
  const [startTime, setStartTime] = useState(
    session?.start_time ? session.start_time.slice(0, 16) : ''
  );
  const [endTime, setEndTime] = useState(
    session?.end_time ? session.end_time.slice(0, 16) : ''
  );
  const [maxSpinsPerUser, setMaxSpinsPerUser] = useState(
    session?.max_spins_per_user ?? 1
  );
  const [includeNoPrize, setIncludeNoPrize] = useState(
    session?.include_no_prize ?? false
  );
  const [theme, setTheme] = useState<WheelTheme>(session?.theme ?? 'corporate');
  const [soundPreset, setSoundPreset] = useState<SoundPreset>(
    session?.sound_preset ?? 'drumroll'
  );
  const [prizes, setPrizes] = useState<CreatePrizeInput[]>(
    session?.prizes?.map((p) => ({
      name: p.name,
      weight: p.weight,
      inventory_count: p.inventory_count,
      is_no_prize: p.is_no_prize,
    })) ?? [{ name: '', weight: 1, inventory_count: 1, is_no_prize: false }]
  );

  function validate(): string | null {
    if (!eventName.trim()) return 'Event name is required';
    if (!startTime) return 'Start time is required';
    if (!endTime) return 'End time is required';

    if (new Date(endTime) <= new Date(startTime)) {
      return 'End time must be after start time';
    }

    if (prizes.length === 0) {
      return 'At least one prize is required';
    }

    for (const prize of prizes) {
      if (!prize.name.trim()) return 'All prizes must have a name';
      if (prize.weight < 1) return 'All prizes must have a weight of at least 1';
      if (prize.inventory_count < 1)
        return 'All prizes must have an inventory count of at least 1';
    }

    return null;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    try {
      const payload = {
        event_name: eventName.trim(),
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
        max_spins_per_user: maxSpinsPerUser,
        include_no_prize: includeNoPrize,
        theme,
        sound_preset: soundPreset,
        prizes,
      };

      const url =
        mode === 'create'
          ? '/api/sessions'
          : `/api/sessions/${session!.id}`;
      const method = mode === 'create' ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to save session');
        return;
      }

      router.push('/admin/sessions');
      router.refresh();
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label
            htmlFor="event_name"
            className="block text-sm font-medium text-gray-700"
          >
            Event Name
          </label>
          <input
            id="event_name"
            type="text"
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            required
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label
            htmlFor="start_time"
            className="block text-sm font-medium text-gray-700"
          >
            Start Time
          </label>
          <input
            id="start_time"
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label
            htmlFor="end_time"
            className="block text-sm font-medium text-gray-700"
          >
            End Time
          </label>
          <input
            id="end_time"
            type="datetime-local"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            required
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label
            htmlFor="max_spins"
            className="block text-sm font-medium text-gray-700"
          >
            Max Spins Per User
          </label>
          <input
            id="max_spins"
            type="number"
            min="1"
            value={maxSpinsPerUser}
            onChange={(e) =>
              setMaxSpinsPerUser(parseInt(e.target.value, 10) || 1)
            }
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label
            htmlFor="theme"
            className="block text-sm font-medium text-gray-700"
          >
            Theme
          </label>
          <select
            id="theme"
            value={theme}
            onChange={(e) => setTheme(e.target.value as WheelTheme)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="corporate">Corporate</option>
            <option value="party">Party</option>
            <option value="holiday">Holiday</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="sound_preset"
            className="block text-sm font-medium text-gray-700"
          >
            Sound Preset
          </label>
          <select
            id="sound_preset"
            value={soundPreset}
            onChange={(e) => setSoundPreset(e.target.value as SoundPreset)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="drumroll">Drumroll</option>
            <option value="gameshow">Game Show</option>
            <option value="casino">Casino</option>
          </select>
        </div>

        <div className="flex items-center sm:col-span-2">
          <input
            id="include_no_prize"
            type="checkbox"
            checked={includeNoPrize}
            onChange={(e) => setIncludeNoPrize(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label
            htmlFor="include_no_prize"
            className="ml-2 text-sm text-gray-700"
          >
            Include &quot;No Prize&quot; option on the wheel
          </label>
        </div>
      </div>

      <PrizeEditor prizes={prizes} onChange={setPrizes} />

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading
            ? 'Saving...'
            : mode === 'create'
              ? 'Create Session'
              : 'Update Session'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/admin/sessions')}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
