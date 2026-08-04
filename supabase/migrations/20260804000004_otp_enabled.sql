-- Add otp_enabled flag to sessions
-- When false, players skip phone verification and join the queue directly
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS otp_enabled boolean NOT NULL DEFAULT true;
