-- Atomic walk-up join RPC: serializes concurrent join attempts for the same session
-- using FOR UPDATE on the sessions row. Eliminates the TOCTOU race where two players
-- scanning simultaneously can both become active.
CREATE OR REPLACE FUNCTION join_walkup_slot(
  p_session_id uuid,
  p_name text,
  p_phone text
)
RETURNS TABLE(
  participant_id uuid,
  result_status text,
  queue_position int
) AS $$
DECLARE
  v_active_count int;
  v_participant_id uuid;
BEGIN
  -- Serialize concurrent walk-up join attempts for this session
  PERFORM id FROM sessions WHERE id = p_session_id FOR UPDATE;

  -- Check phone uniqueness within this session
  IF EXISTS (
    SELECT 1 FROM participants WHERE session_id = p_session_id AND phone = p_phone
  ) THEN
    RETURN QUERY SELECT NULL::uuid, 'already_registered'::text, 0;
    RETURN;
  END IF;

  -- Check slot availability
  SELECT COUNT(*) INTO v_active_count
  FROM participants
  WHERE session_id = p_session_id AND status IN ('active', 'spinning');

  IF v_active_count > 0 THEN
    RETURN QUERY SELECT NULL::uuid, 'slot_occupied'::text, 0;
    RETURN;
  END IF;

  -- Slot is free — insert participant as active
  INSERT INTO participants (
    session_id, name, phone, status, queue_position,
    spins_used, is_fulfilled, activated_at, skip_count
  )
  VALUES (
    p_session_id, p_name, p_phone, 'active', 1,
    0, false, now(), 0
  )
  RETURNING id INTO v_participant_id;

  RETURN QUERY SELECT v_participant_id, 'active'::text, 1;
END;
$$ LANGUAGE plpgsql;
