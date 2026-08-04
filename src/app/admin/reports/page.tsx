import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { jwtVerify } from 'jose';
import Link from 'next/link';
import { createServiceClient } from '@/lib/supabase/server';
import type { SessionStatus } from '@/lib/types';

const secret = new TextEncoder().encode(process.env.JWT_SECRET!);

function StatusBadge({ status }: { status: SessionStatus }) {
  const styles: Record<SessionStatus, string> = {
    draft: 'bg-gray-100 text-gray-800',
    active: 'bg-green-100 text-green-800',
    paused: 'bg-amber-100 text-amber-800',
    ending: 'bg-yellow-100 text-yellow-800',
    ended: 'bg-red-100 text-red-800',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export default async function ReportsPage() {
  // Server-side admin auth check
  const cookieStore = cookies();
  const token = cookieStore.get('spin_admin_token')?.value;

  if (!token) {
    redirect('/admin/login');
  }

  try {
    await jwtVerify(token, secret);
  } catch {
    redirect('/admin/login');
  }

  const supabase = createServiceClient();

  // Fetch all sessions ordered by creation date
  const { data: sessions, error: sessionsError } = await supabase
    .from('sessions')
    .select('id, event_name, status, start_time, created_at')
    .order('created_at', { ascending: false });

  if (sessionsError) {
    console.error('[Reports Page] sessions query error:', sessionsError);
    return (
      <div className="text-center text-red-600">
        Failed to load sessions. Please try again.
      </div>
    );
  }

  // For each session, get participant counts
  const sessionsWithCounts = await Promise.all(
    (sessions ?? []).map(async (session) => {
      const { count: totalCount } = await supabase
        .from('participants')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', session.id);

      const { count: fulfilledCount } = await supabase
        .from('participants')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', session.id)
        .eq('is_fulfilled', true);

      return {
        ...session,
        total_participants: totalCount ?? 0,
        fulfilled_participants: fulfilledCount ?? 0,
      };
    })
  );

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Reports</h1>

      {sessionsWithCounts.length === 0 ? (
        <p className="text-gray-500">No sessions found.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Event Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Start Time
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Participants
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Fulfilled
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {sessionsWithCounts.map((session) => (
                <tr key={session.id}>
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                    {session.event_name}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm">
                    <StatusBadge status={session.status as SessionStatus} />
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {new Date(session.start_time).toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {session.total_participants}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {session.fulfilled_participants}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm">
                    <Link
                      href={`/admin/reports/${session.id}`}
                      className="text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      View Report
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
