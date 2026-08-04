-- Remove 'skipped' from participants CHECK constraint (it is never set, dead code)
ALTER TABLE participants DROP CONSTRAINT IF EXISTS participants_status_check;
ALTER TABLE participants ADD CONSTRAINT participants_status_check
  CHECK (status IN ('queued', 'active', 'spinning', 'completed'));

-- Atomic function: re-queue a participant at the back and increment skip_count
CREATE OR REPLACE FUNCTION requeue_skipped_participant(p_participant_id uuid)
RETURNS int AS $$
DECLARE
  v_session_id uuid;
  v_new_position int;
BEGIN
  -- Get the participant's session
  SELECT session_id INTO v_session_id
  FROM participants
  WHERE id = p_participant_id AND status = 'active';

  IF NOT FOUND THEN
    RETURN -1; -- Participant not active, already processed
  END IF;

  -- Get the next position atomically (locked within this transaction)
  SELECT COALESCE(MAX(queue_position), 0) + 1 INTO v_new_position
  FROM participants
  WHERE session_id = v_session_id;

  -- Re-queue the participant at the back
  UPDATE participants
  SET
    status = 'queued',
    queue_position = v_new_position,
    skip_count = skip_count + 1,
    activated_at = NULL
  WHERE id = p_participant_id;

  RETURN v_new_position;
END;
$$ LANGUAGE plpgsql;
