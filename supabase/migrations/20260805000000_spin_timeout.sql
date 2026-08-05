-- Add configurable spin timeout to sessions
-- Default 30 preserves existing behavior for all current sessions
ALTER TABLE sessions
  ADD COLUMN spin_timeout_seconds INT NOT NULL DEFAULT 30
  CHECK (spin_timeout_seconds BETWEEN 10 AND 120);
