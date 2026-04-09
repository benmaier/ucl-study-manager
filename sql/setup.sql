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
-- SECURITY DEFINER: fetch least-used API key for a participant
--
-- Resolution order:
--   1. Cohort-specific key (via cohort_key_pools) — if any are assigned
--   2. Any active key for the provider (global pool fallback)
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

  -- Try cohort-specific key first
  SELECT ak.id, ak.api_key INTO v_key_id, v_api_key
  FROM api_keys ak
  JOIN cohort_key_pools ckp ON ckp.api_key_id = ak.id
  WHERE ckp.cohort_id = v_cohort_id
    AND ak.provider = p_provider
    AND ak.is_active = true
  ORDER BY ak.session_assignment_count ASC
  LIMIT 1;

  -- Fall back to any active key for this provider
  IF v_key_id IS NULL THEN
    SELECT ak.id, ak.api_key INTO v_key_id, v_api_key
    FROM api_keys ak
    WHERE ak.provider = p_provider
      AND ak.is_active = true
    ORDER BY ak.session_assignment_count ASC
    LIMIT 1;
  END IF;

  IF v_key_id IS NULL THEN
    RAISE EXCEPTION 'No active % key available', p_provider;
  END IF;

  UPDATE api_keys SET session_assignment_count = session_assignment_count + 1
  WHERE id = v_key_id;

  INSERT INTO session_key_assignments (participant_id, api_key_id, provider)
  VALUES (p_participant_id, v_key_id, p_provider);

  RETURN v_api_key;
END;
$$;

-- ═══════════════════════════════════════════════════════
-- READ-ONLY ROLE for researchers (Prisma Studio access)
--
-- The researcher role is created by cli/setup-db.ts (not here)
-- because it needs to generate a random password and save it to a file.
-- This section only grants permissions (idempotent, safe to re-run).
-- ═══════════════════════════════════════════════════════

-- Grant read access to all existing tables (no-op if role doesn't exist yet)
DO $$ BEGIN
  GRANT USAGE ON SCHEMA public TO researcher;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO researcher;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO researcher;
EXCEPTION WHEN undefined_object THEN
  RAISE NOTICE 'researcher role does not exist yet — run: npx tsx cli/setup-db.ts';
END $$;
