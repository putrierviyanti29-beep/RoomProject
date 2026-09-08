-- ============================================================================
-- Migration: Refactor — move inspection areas to Special Cleaning
--            General Cleaning simplified to 1 checklist per room with 2 done types
-- ============================================================================

-- ============================================================================
-- 1. General Cleaning: simplify
--    Add done_type column (housekeeping | engineering)
--    Drop area_id (areas move to special_cleaning table)
--    Revert status check back to pending | done (we'll track done_type separately)
-- ============================================================================

ALTER TABLE general_cleaning
  ADD COLUMN IF NOT EXISTS done_type TEXT;

DO $$
BEGIN
  ALTER TABLE general_cleaning DROP CONSTRAINT IF EXISTS general_cleaning_status_check;
END$$;

ALTER TABLE general_cleaning
  ADD CONSTRAINT general_cleaning_status_check
  CHECK (status IN ('pending', 'done', 'issue'));

ALTER TABLE general_cleaning
  ADD CONSTRAINT general_cleaning_done_type_check
  CHECK (done_type IS NULL OR done_type IN ('housekeeping', 'engineering'));

-- Backfill: any existing 'done' records default to 'housekeeping'
UPDATE general_cleaning SET done_type = 'housekeeping' WHERE status = 'done' AND done_type IS NULL;

-- Drop area_id column (and its FK + index)
ALTER TABLE general_cleaning DROP CONSTRAINT IF EXISTS general_cleaning_area_id_fkey;
DROP INDEX IF EXISTS idx_general_cleaning_area_date;
DROP INDEX IF EXISTS idx_general_cleaning_room_area_date;
ALTER TABLE general_cleaning DROP COLUMN IF EXISTS area_id;

-- ============================================================================
-- 2. Special Cleaning: new table for per-room per-area inspection records
--    Replaces the generic special_checklists table for the room-inspection use case
--    (special_checklists kept for backward compat — generic checklist items per project)
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

ALTER TABLE special_cleaning ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read special_cleaning"
  ON special_cleaning FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can write special_cleaning"
  ON special_cleaning FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX idx_special_cleaning_project ON special_cleaning(project_id);
CREATE INDEX idx_special_cleaning_project_room ON special_cleaning(project_id, room_id);
CREATE INDEX idx_special_cleaning_project_area ON special_cleaning(project_id, area_id);

-- ============================================================================
-- 3. Notes:
--    - inspection_areas table stays as-is (now used by special_cleaning only)
--    - 4 default areas already seeded: Toilet Bowl, Shower Glass, Kettle Jug, Scrubing Floor
--    - special_checklists table kept for backward compat (generic checklist items per project)
-- ============================================================================
