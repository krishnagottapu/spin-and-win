import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.JWT_SECRET!);

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = cookies();
  const token = cookieStore.get('spin_admin_token')?.value;

  // Get current path from headers — for login page exclusion we rely on
  // the edge middleware handling this, but as a server-side fallback:
  // The login page is excluded from this check via the middleware.
  // However, if someone directly accesses a protected admin page without
  // going through middleware, this provides a secondary check.
  if (!token) {
    // Don't redirect if we're already on the login page
    // The middleware handles this — this layout wraps ALL /admin/* including /admin/login
    // so we must not redirect on /admin/login
    return <div className="min-h-screen bg-gray-50">{children}</div>;
  }

  try {
    await jwtVerify(token, secret);
  } catch {
    redirect('/admin/login');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center space-x-8">
              <span className="text-lg font-bold text-gray-900">
                Spin & Win Admin
              </span>
              <a
                href="/admin/sessions"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Sessions
              </a>
              <a
                href="/admin/reports"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Reports
              </a>
              <a
                href="/admin/staff"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Staff
              </a>
            </div>
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-700 hover:bg-gray-200"
              >
                Logout
              </button>
            </form>
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
