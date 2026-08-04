-- ============================================================
-- SPIN AND WIN — PRODUCTION SCHEMA
-- Run this entire script in Supabase Dashboard → SQL Editor
-- ============================================================

-- ─── Extensions ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── Tables ──────────────────────────────────────────────────

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  slug text UNIQUE NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  max_spins_per_user int NOT NULL DEFAULT 1,
  include_no_prize boolean NOT NULL DEFAULT false,
  theme text NOT NULL CHECK (theme IN ('corporate', 'party', 'holiday')),
  sound_preset text NOT NULL CHECK (sound_preset IN ('drumroll', 'gameshow', 'casino')),
  tv_token text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'ending', 'ended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE prizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name text NOT NULL,
  weight int NOT NULL CHECK (weight > 0),
  inventory_count int NOT NULL CHECK (inventory_count >= 0),
  is_no_prize boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name text NOT NULL,
  invite_code text UNIQUE,
  username text,
  password_hash text,
  device_registered boolean NOT NULL DEFAULT false,
  registered_at timestamptz
);

CREATE TABLE participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) <= 100),
  phone text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'active', 'spinning', 'completed')),
  queue_position int NOT NULL,
  prize_id uuid REFERENCES prizes(id),
  result_token text,
  spins_used int NOT NULL DEFAULT 0,
  is_fulfilled boolean NOT NULL DEFAULT false,
  fulfilled_by uuid REFERENCES staff(id),
  fulfilled_at timestamptz,
  spin_started_at timestamptz,
  spin_completed_at timestamptz,
  skip_count int NOT NULL DEFAULT 0,
  activated_at timestamptz,
  joined_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  password_hash text NOT NULL
);

CREATE TABLE otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  code text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Indexes ──────────────────────────────────────────────────

CREATE UNIQUE INDEX idx_participants_session_phone ON participants (session_id, phone);
CREATE UNIQUE INDEX idx_sessions_slug ON sessions (slug);
CREATE UNIQUE INDEX idx_sessions_tv_token ON sessions (tv_token);
CREATE UNIQUE INDEX idx_participants_result_token ON participants (result_token) WHERE result_token IS NOT NULL;
CREATE UNIQUE INDEX idx_staff_invite_code ON staff (invite_code) WHERE invite_code IS NOT NULL;
CREATE UNIQUE INDEX idx_staff_session_username ON staff (session_id, username) WHERE username IS NOT NULL;
CREATE INDEX idx_participants_session_status ON participants (session_id, status);
CREATE INDEX idx_participants_session_queue ON participants (session_id, queue_position);
CREATE INDEX idx_prizes_session ON prizes (session_id);
CREATE UNIQUE INDEX idx_otp_codes_phone ON otp_codes (phone);
CREATE INDEX idx_otp_codes_expires ON otp_codes (expires_at);

-- ─── Triggers ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ─── Functions ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION decrement_prize_inventory(p_prize_id uuid)
RETURNS boolean AS $$
DECLARE
  updated_count int;
BEGIN
  UPDATE prizes
  SET inventory_count = inventory_count - 1
  WHERE id = p_prize_id AND inventory_count > 0;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION requeue_skipped_participant(p_participant_id uuid)
RETURNS int AS $$
DECLARE
  v_session_id uuid;
  v_new_position int;
BEGIN
  SELECT session_id INTO v_session_id
  FROM participants
  WHERE id = p_participant_id AND status = 'active';

  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  SELECT COALESCE(MAX(queue_position), 0) + 1 INTO v_new_position
  FROM participants
  WHERE session_id = v_session_id;

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

-- ─── Grants ───────────────────────────────────────────────────

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
