import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import SessionForm from '@/components/admin/SessionForm';
import type { SessionWithPrizes } from '@/lib/types';

interface PageProps {
  params: { id: string };
}

async function getSession(id: string): Promise<SessionWithPrizes | null> {
  const cookieStore = cookies();
  const token = cookieStore.get('spin_admin_token')?.value;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const res = await fetch(`${baseUrl}/api/sessions/${id}`, {
    headers: {
      Cookie: `spin_admin_token=${token}`,
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    return null;
  }

  const data = await res.json();
  return data.session ?? null;
}

export default async function EditSessionPage({ params }: PageProps) {
  const session = await getSession(params.id);

  if (!session) {
    notFound();
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Edit Session</h1>
      <div className="rounded-md border border-gray-200 bg-white p-6">
        <SessionForm session={session} mode="edit" />
      </div>
    </div>
  );
}
