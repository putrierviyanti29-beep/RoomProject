-- ============================================================================
-- ALL-IN-ONE FIX — Run this if you're getting "done_type missing" OR
-- "Could not find a relationship between general_cleaning and profiles" errors.
-- Idempotent — safe to run multiple times.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Ensure all required columns exist on general_cleaning
-- ============================================================================
ALTER TABLE general_cleaning ADD COLUMN IF NOT EXISTS done_type TEXT;
ALTER TABLE general_cleaning ADD COLUMN IF NOT EXISTS notes TEXT;

-- Drop area_id column (legacy, no longer used)
DO $$
BEGIN
  ALTER TABLE general_cleaning DROP CONSTRAINT IF EXISTS general_cleaning_area_id_fkey;
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

DROP INDEX IF EXISTS idx_general_cleaning_area_date;
DROP INDEX IF EXISTS idx_general_cleaning_room_area_date;
ALTER TABLE general_cleaning DROP COLUMN IF EXISTS area_id;

-- ============================================================================
-- 2. Fix status check constraint (allow pending | done | issue)
-- ============================================================================
DO $$
BEGIN
  ALTER TABLE general_cleaning DROP CONSTRAINT IF EXISTS general_cleaning_status_check;
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

DO $$
BEGIN
  ALTER TABLE general_cleaning
    ADD CONSTRAINT general_cleaning_status_check
    CHECK (status IN ('pending', 'done', 'issue'));
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

-- ============================================================================
-- 3. Fix done_type check constraint
-- ============================================================================
DO $$
BEGIN
  ALTER TABLE general_cleaning DROP CONSTRAINT IF EXISTS general_cleaning_done_type_check;
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

DO $$
BEGIN
  ALTER TABLE general_cleaning
    ADD CONSTRAINT general_cleaning_done_type_check
    CHECK (done_type IS NULL OR done_type IN ('housekeeping', 'engineering'));
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

-- Backfill
UPDATE general_cleaning SET done_type = 'housekeeping'
WHERE status = 'done' AND done_type IS NULL;

-- ============================================================================
-- 4. Fix FK from general_cleaning.completed_by → profiles(id)
--    (was pointing to auth.users(id) which PostgREST can't join)
-- ============================================================================
DO $$
BEGIN
  ALTER TABLE general_cleaning DROP CONSTRAINT IF EXISTS general_cleaning_completed_by_fkey;
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

DO $$
BEGIN
  ALTER TABLE general_cleaning
    ADD CONSTRAINT general_cleaning_completed_by_fkey
    FOREIGN KEY (completed_by) REFERENCES profiles(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

-- ============================================================================
-- 5. Create special_cleaning table (if not exists)
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
  completed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (project_id, room_id, area_id)
);

ALTER TABLE special_cleaning ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read special_cleaning" ON special_cleaning;
DROP POLICY IF EXISTS "Authenticated can write special_cleaning" ON special_cleaning;
CREATE POLICY "Authenticated can read special_cleaning"
  ON special_cleaning FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can write special_cleaning"
  ON special_cleaning FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_special_cleaning_project ON special_cleaning(project_id);
CREATE INDEX IF NOT EXISTS idx_special_cleaning_project_room ON special_cleaning(project_id, room_id);
CREATE INDEX IF NOT EXISTS idx_special_cleaning_project_area ON special_cleaning(project_id, area_id);

-- ============================================================================
-- 6. Same FK fix for special_checklists (existing table)
-- ============================================================================
DO $$
BEGIN
  ALTER TABLE special_checklists DROP CONSTRAINT IF EXISTS special_checklists_completed_by_fkey;
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

DO $$
BEGIN
  ALTER TABLE special_checklists
    ADD CONSTRAINT special_checklists_completed_by_fkey
    FOREIGN KEY (completed_by) REFERENCES profiles(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

COMMIT;

-- ============================================================================
-- 7. CRITICAL: Force Supabase PostgREST to reload its schema cache.
--    Without this, the API keeps returning stale "relationship not found" errors
--    even after the FK has been added.
-- ============================================================================
NOTIFY pgrst, 'reload schema';

-- Done. Now verify by running the queries below one by one:
--
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'general_cleaning' AND column_name = 'done_type';
-- (should return 1 row)
--
-- SELECT to_regclass('special_cleaning');
-- (should return 'special_cleaning', not null)
--
-- SELECT conname FROM pg_constraint
--   WHERE contype = 'f' AND conrelid::regclass::text = 'general_cleaning';
-- (should include general_cleaning_completed_by_fkey)
