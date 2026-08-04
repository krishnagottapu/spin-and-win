import { cookies } from 'next/headers';
import Link from 'next/link';
import SessionStatusControls from '@/components/admin/SessionStatusControls';
import LivePrizeManager from '@/components/admin/LivePrizeManager';
import StaffManager from '@/components/admin/StaffManager';
import type { Session } from '@/lib/types';

async function getSessions(): Promise<Session[]> {
  const cookieStore = cookies();
  const token = cookieStore.get('spin_admin_token')?.value;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const res = await fetch(`${baseUrl}/api/sessions`, {
    headers: {
      Cookie: `spin_admin_token=${token}`,
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    return [];
  }

  const data = await res.json();
  return data.sessions ?? [];
}

export default async function AdminSessionsPage() {
  const sessions = await getSessions();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Sessions</h1>
        <Link
          href="/admin/sessions/new"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Create Session
        </Link>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-md border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-500">No sessions yet. Create your first session to get started.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="rounded-md border border-gray-200 bg-white p-6"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {session.event_name}
                  </h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Slug: <span className="font-mono">{session.slug}</span>
                    {' | '}
                    Start: {new Date(session.start_time).toISOString().slice(0, 16).replace('T', ' ')}
                  </p>
                </div>
                <Link
                  href={`/admin/sessions/${session.id}`}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Edit
                </Link>
              </div>

              <div className="mt-4">
                <SessionStatusControls
                  sessionId={session.id}
                  currentStatus={session.status}
                  slug={session.slug}
                  tvToken={session.tv_token}
                />
              </div>

              <LivePrizeManager sessionId={session.id} />
              <StaffManager sessionId={session.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
