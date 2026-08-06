-- Add queue_enabled flag to sessions table.
-- Default true: all existing sessions retain their current queue-based behavior.
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS queue_enabled boolean NOT NULL DEFAULT true;
