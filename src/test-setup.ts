import '@testing-library/jest-dom';

// ─── Environment variables required by auth/jwt modules ──────────────────────
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-chars-long!';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
