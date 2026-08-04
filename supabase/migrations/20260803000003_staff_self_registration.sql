-- Add username and password_hash to staff table for self-registration
ALTER TABLE staff ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS password_hash text;

-- Make invite_code nullable (no longer required for self-registration)
ALTER TABLE staff ALTER COLUMN invite_code DROP NOT NULL;

-- Add unique constraint on username per session
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_session_username ON staff (session_id, username) WHERE username IS NOT NULL;
