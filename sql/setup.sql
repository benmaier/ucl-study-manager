-- UCL Study Manager: key pool tables + limited-privilege participant app user
-- Run this ONCE via admin connection after Prisma schema is pushed.

-- ═══════════════════════════════════════════════════════
-- API KEY POOL (not managed by Prisma)
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS api_keys (
  id SERIAL PRIMARY KEY,
  provider VARCHAR(20) NOT NULL,
  api_key TEXT NOT NULL,
  label VARCHAR(100),
  session_assignment_count INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS cohort_key_pools (
  id SERIAL PRIMARY KEY,
  cohort_id INT REFERENCES cohorts(id) ON DELETE CASCADE,
  api_key_id INT REFERENCES api_keys(id) ON DELETE CASCADE,
  UNIQUE(cohort_id, api_key_id)
);

CREATE TABLE IF NOT EXISTS session_key_assignments (
  id SERIAL PRIMARY KEY,
  participant_id INT NOT NULL,
  api_key_id INT REFERENCES api_keys(id),
  provider VARCHAR(20) NOT NULL,
  assigned_at TIMESTAMP DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════
-- SECURITY DEFINER: fetch least-used API key for a participant's cohort
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION assign_api_key(p_participant_id INT, p_provider VARCHAR(20))
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cohort_id INT;
  v_key_id INT;
  v_api_key TEXT;
BEGIN
  SELECT p.cohort_id INTO v_cohort_id
  FROM participants p
  WHERE p.id = p_participant_id;

  IF v_cohort_id IS NULL THEN
    RAISE EXCEPTION 'No participant found with id %', p_participant_id;
  END IF;

  SELECT ak.id, ak.api_key INTO v_key_id, v_api_key
  FROM api_keys ak
  JOIN cohort_key_pools ckp ON ckp.api_key_id = ak.id
  WHERE ckp.cohort_id = v_cohort_id
    AND ak.provider = p_provider
    AND ak.is_active = true
  ORDER BY ak.session_assignment_count ASC
  LIMIT 1;

  IF v_key_id IS NULL THEN
    RAISE EXCEPTION 'No active % key for cohort %', p_provider, v_cohort_id;
  END IF;

  UPDATE api_keys SET session_assignment_count = session_assignment_count + 1
  WHERE id = v_key_id;

  INSERT INTO session_key_assignments (participant_id, api_key_id, provider)
  VALUES (p_participant_id, v_key_id, p_provider);

  RETURN v_api_key;
END;
$$;

-- ═══════════════════════════════════════════════════════
-- LIMITED-PRIVILEGE USER for the Electron participant app
-- The password here is a placeholder — replace before running.
-- ═══════════════════════════════════════════════════════

-- CREATE USER participant_app WITH PASSWORD 'REPLACE_WITH_SECURE_PASSWORD';

-- Read access to study structure
-- GRANT SELECT ON studies, cohorts, stages, stage_files, study_sessions, participants TO participant_app;

-- Write access to logs and progress (INSERT only, no DELETE)
-- GRANT INSERT, SELECT ON chat_logs, chat_file_logs, participant_progress TO participant_app;
-- GRANT UPDATE (completed_at, input_answer) ON participant_progress TO participant_app;

-- Sequences for auto-increment
-- GRANT USAGE ON SEQUENCE chat_logs_id_seq, chat_file_logs_id_seq, participant_progress_id_seq TO participant_app;

-- Key assignment function (SECURITY DEFINER — runs as admin internally)
-- GRANT EXECUTE ON FUNCTION assign_api_key(INT, VARCHAR) TO participant_app;

-- Key pool tables: read-only for session_key_assignments (audit), no direct access to api_keys
-- GRANT INSERT ON session_key_assignments TO participant_app;
-- GRANT USAGE ON SEQUENCE session_key_assignments_id_seq TO participant_app;
