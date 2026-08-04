-- Add created_at column to prizes for canonical ordering.
-- The spin engine uses ORDER BY created_at ASC to determine prize_index
-- which must match the TV wheel's slice order.

ALTER TABLE prizes ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
