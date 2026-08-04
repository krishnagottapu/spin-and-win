import SessionForm from '@/components/admin/SessionForm';

export default function NewSessionPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Create Session</h1>
      <div className="rounded-md border border-gray-200 bg-white p-6">
        <SessionForm mode="create" />
      </div>
    </div>
  );
}
