-- OTP verification codes table
-- Replaces the in-memory Map in /api/otp/route.ts
-- Codes expire automatically via expires_at; a cron or DB trigger can clean up old rows

CREATE TABLE otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  code text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Only one active OTP per phone number at a time
CREATE UNIQUE INDEX idx_otp_codes_phone ON otp_codes (phone);

-- Index for fast lookup by phone
CREATE INDEX idx_otp_codes_expires ON otp_codes (expires_at);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON otp_codes TO service_role;
