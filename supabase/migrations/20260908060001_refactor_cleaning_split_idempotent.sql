-- ============================================================================
-- Migration v2: Idempotent version of 20260908060000_refactor_cleaning_split.sql
-- Safe to run multiple times — uses IF NOT EXISTS + exception swallowing
-- ============================================================================

-- ============================================================================
-- 1. General Cleaning: add done_type column + update constraints (idempotent)
-- ============================================================================

-- Add done_type column (no-op if already exists)
ALTER TABLE general_cleaning
  ADD COLUMN IF NOT EXISTS done_type TEXT;

-- Drop old status check constraint if exists, then re-add (idempotent)
DO $$
BEGIN
  ALTER TABLE general_cleaning DROP CONSTRAINT IF EXISTS general_cleaning_status_check;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipping status check drop: %', SQLERRM;
END$$;

DO $$
BEGIN
  ALTER TABLE general_cleaning
    ADD CONSTRAINT general_cleaning_status_check
    CHECK (status IN ('pending', 'done', 'issue'));
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'status_check constraint already exists, skipping';
END$$;

-- Drop + re-add done_type check constraint (idempotent)
DO $$
BEGIN
  ALTER TABLE general_cleaning DROP CONSTRAINT IF EXISTS general_cleaning_done_type_check;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipping done_type check drop: %', SQLERRM;
END$$;

DO $$
BEGIN
  ALTER TABLE general_cleaning
    ADD CONSTRAINT general_cleaning_done_type_check
    CHECK (done_type IS NULL OR done_type IN ('housekeeping', 'engineering'));
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'done_type_check constraint already exists, skipping';
END$$;

-- Backfill: any existing 'done' records default to 'housekeeping'
UPDATE general_cleaning SET done_type = 'housekeeping'
WHERE status = 'done' AND done_type IS NULL;

-- Drop area_id column + its FK + indexes (idempotent — uses IF EXISTS)
DO $$
BEGIN
  ALTER TABLE general_cleaning DROP CONSTRAINT IF EXISTS general_cleaning_area_id_fkey;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipping area_id FK drop: %', SQLERRM;
END$$;

DROP INDEX IF EXISTS idx_general_cleaning_area_date;
DROP INDEX IF EXISTS idx_general_cleaning_room_area_date;

ALTER TABLE general_cleaning DROP COLUMN IF EXISTS area_id;

-- ============================================================================
-- 2. Special Cleaning: create table (idempotent — uses IF NOT EXISTS)
-- ============================================================================
CREATE TABLE IF NOT EXISTS special_cleaning (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES special_projects(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  area_id UUID NOT NULL REFERENCES inspection_areas(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'done', 'issue')),
  done_type TEXT
    CHECK (done_type IS NULL OR done_type IN ('housekeeping', 'engineering')),
  completed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (project_id, room_id, area_id)
);

-- Enable RLS (no-op if already enabled)
ALTER TABLE special_cleaning ENABLE ROW LEVEL SECURITY;

-- Drop & recreate policies (idempotent)
DROP POLICY IF EXISTS "Authenticated can read special_cleaning" ON special_cleaning;
DROP POLICY IF EXISTS "Authenticated can write special_cleaning" ON special_cleaning;

CREATE POLICY "Authenticated can read special_cleaning"
  ON special_cleaning FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can write special_cleaning"
  ON special_cleaning FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_special_cleaning_project ON special_cleaning(project_id);
CREATE INDEX IF NOT EXISTS idx_special_cleaning_project_room ON special_cleaning(project_id, room_id);
CREATE INDEX IF NOT EXISTS idx_special_cleaning_project_area ON special_cleaning(project_id, area_id);

-- ============================================================================
-- Done. Verification queries below — run them to check the result.
-- ============================================================================

-- Should print: done_type | text
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'general_cleaning' AND column_name = 'done_type';

-- Should return 1 row
-- SELECT to_regclass('special_cleaning') AS table_exists;

-- Should return 4 rows
-- SELECT count(*) AS area_count FROM inspection_areas;
