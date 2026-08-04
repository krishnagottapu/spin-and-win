import { cookies } from 'next/headers';
import { verifyAdminJwt, verifyStaffJwt } from '@/lib/auth/jwt';
import { ClaimInterface } from '@/components/claim/ClaimInterface';

export default async function ClaimPage() {
  const cookieStore = cookies();

  // Check admin cookie first
  const adminToken = cookieStore.get('spin_admin_token')?.value;
  if (adminToken) {
    try {
      await verifyAdminJwt(adminToken);
      return <ClaimInterface role="admin" />;
    } catch { /* fall through */ }
  }

  // Check staff cookie
  const staffToken = cookieStore.get('spin_staff_token')?.value;
  if (staffToken) {
    try {
      const payload = await verifyStaffJwt(staffToken);
      return <ClaimInterface role="staff" staffSessionId={payload.session_id} />;
    } catch { /* fall through */ }
  }

  // No valid session — tell them to use the link from admin
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-sm text-center">
        <img src="/logo/utsav_logo.png" alt="Logo" className="mx-auto h-12 w-auto" />
        <h1 className="mt-4 text-2xl font-bold text-white">Staff Portal</h1>
        <p className="mt-4 text-gray-400">
          Please use the staff link provided by your event admin to register or login.
        </p>
        <p className="mt-2 text-sm text-gray-500">
          The link looks like: <span className="font-mono text-gray-400">/claim/[session-id]</span>
        </p>
      </div>
    </div>
  );
}
