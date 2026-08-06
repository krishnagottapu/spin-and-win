-- Add sort_order to prizes for stable, insertion-order-preserving prize index.
-- created_at has second-level precision so batch inserts get the same timestamp,
-- making UUID tiebreaker non-deterministic and causing wheel/result mismatches.
ALTER TABLE prizes ADD COLUMN IF NOT EXISTS sort_order int NOT NULL DEFAULT 0;

-- Backfill existing prizes with stable per-session order based on id
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY id) - 1 AS rn
  FROM prizes
)
UPDATE prizes SET sort_order = ordered.rn
FROM ordered WHERE prizes.id = ordered.id;
