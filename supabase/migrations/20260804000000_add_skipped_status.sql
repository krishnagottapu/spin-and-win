-- Add 'skipped' to the participants status check constraint
-- Skipped players are re-queued at the back with a skip count

ALTER TABLE participants DROP CONSTRAINT IF EXISTS participants_status_check;
ALTER TABLE participants ADD CONSTRAINT participants_status_check
  CHECK (status IN ('queued', 'active', 'spinning', 'completed', 'skipped'));

-- Track how many times a player was skipped
ALTER TABLE participants ADD COLUMN IF NOT EXISTS skip_count int NOT NULL DEFAULT 0;

-- Track when the player became active (for auto-skip timer)
ALTER TABLE participants ADD COLUMN IF NOT EXISTS activated_at timestamptz;
