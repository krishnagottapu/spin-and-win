import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation';
import { jwtVerify } from 'jose';
import { createServiceClient } from '@/lib/supabase/server';
import type { Session, Participant, Prize } from '@/lib/types';
import { LiveDashboard } from '@/components/admin/LiveDashboard';
import { ExportButton } from '@/components/admin/ExportButton';

const secret = new TextEncoder().encode(process.env.JWT_SECRET!);

interface PageProps {
  params: { sessionId: string };
}

export default async function SessionReportPage({ params }: PageProps) {
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

  const { sessionId } = params;
  const supabase = createServiceClient();

  // Fetch session
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) {
    notFound();
  }

  const typedSession = session as Session;

  // Fetch all participants for this session
  const { data: participants, error: participantsError } = await supabase
    .from('participants')
    .select('*')
    .eq('session_id', sessionId)
    .order('queue_position', { ascending: true });

  if (participantsError) {
    console.error('[Session Report] participants query error:', participantsError);
    return (
      <div className="text-center text-red-600">
        Failed to load participants. Please try again.
      </div>
    );
  }

  const typedParticipants = (participants ?? []) as Participant[];

  // Fetch all prizes for this session
  const { data: prizes, error: prizesError } = await supabase
    .from('prizes')
    .select('*')
    .eq('session_id', sessionId);

  if (prizesError) {
    console.error('[Session Report] prizes query error:', prizesError);
    return (
      <div className="text-center text-red-600">
        Failed to load prizes. Please try again.
      </div>
    );
  }

  const typedPrizes = (prizes ?? []) as Prize[];

  const isLive = typedSession.status === 'active' || typedSession.status === 'ending';

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {typedSession.event_name}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Status: {typedSession.status} | Started:{' '}
            {new Date(typedSession.start_time).toLocaleString()}
          </p>
        </div>
        <ExportButton sessionId={sessionId} slug={typedSession.slug} />
      </div>

      {isLive ? (
        <LiveDashboard
          session={typedSession}
          initialParticipants={typedParticipants}
          prizes={typedPrizes}
        />
      ) : (
        <StaticReport participants={typedParticipants} prizes={typedPrizes} />
      )}
    </div>
  );
}

/**
 * Static HTML table showing all participant data for draft/ended sessions.
 */
function StaticReport({
  participants,
  prizes,
}: {
  participants: Participant[];
  prizes: Prize[];
}) {
  // Build a map of prize_id -> prize for quick lookups
  const prizeMap = new Map(prizes.map((p) => [p.id, p]));

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              #
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Name
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Phone
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Prize Won
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Fulfilled
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Joined At
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Spin Completed
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {participants.map((participant) => {
            const prize = participant.prize_id
              ? prizeMap.get(participant.prize_id)
              : null;
            const prizeWon =
              prize && !prize.is_no_prize ? prize.name : '';

            return (
              <tr key={participant.id}>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                  {participant.queue_position}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                  {participant.name}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                  {participant.phone}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                  {participant.status}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                  {prizeWon || '—'}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                  {participant.is_fulfilled ? 'Yes' : 'No'}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                  {new Date(participant.joined_at).toLocaleString()}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                  {participant.spin_completed_at
                    ? new Date(participant.spin_completed_at).toLocaleString()
                    : '—'}
                </td>
              </tr>
            );
          })}
          {participants.length === 0 && (
            <tr>
              <td
                colSpan={8}
                className="px-4 py-6 text-center text-sm text-gray-500"
              >
                No participants yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
