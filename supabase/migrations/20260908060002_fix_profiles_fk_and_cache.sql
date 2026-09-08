-- ============================================================================
-- Migration v3: Fix FK relationship + refresh schema cache
-- Solves: "Could not find a relationship between 'general_cleaning' and 'profiles'
--          in the schema cache"
-- ============================================================================

-- 1. Ensure FK from general_cleaning.completed_by → profiles.id exists (idempotent)
DO $$
BEGIN
  -- Drop the FK if it exists, then re-add. This re-registers it with Postgres.
  ALTER TABLE general_cleaning DROP CONSTRAINT IF EXISTS general_cleaning_completed_by_fkey;
END$$;

-- Add FK pointing to profiles(id) — NOT auth.users(id), so the join works
ALTER TABLE general_cleaning
  ADD CONSTRAINT general_cleaning_completed_by_fkey
  FOREIGN KEY (completed_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- 2. Same for special_cleaning (in case the project uses it later)
DO $$
BEGIN
  ALTER TABLE special_cleaning DROP CONSTRAINT IF EXISTS special_cleaning_completed_by_fkey;
END$$;

ALTER TABLE special_cleaning
  ADD CONSTRAINT special_cleaning_completed_by_fkey
  FOREIGN KEY (completed_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- 3. Same for special_checklists (existing table, fix its FK too)
DO $$
BEGIN
  ALTER TABLE special_checklists DROP CONSTRAINT IF EXISTS special_checklists_completed_by_fkey;
END$$;

ALTER TABLE special_checklists
  ADD CONSTRAINT special_checklists_completed_by_fkey
  FOREIGN KEY (completed_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- 4. Force Supabase to refresh its schema cache (this is the magic line)
NOTIFY pgrst, 'reload schema';

-- 5. Verification — these should return rows
-- SELECT constraint_name FROM information_schema.table_constraints
--   WHERE table_name = 'general_cleaning' AND constraint_type = 'FOREIGN KEY';
--
-- Expected:
--   general_cleaning_completed_by_fkey
--   general_cleaning_room_id_fkey (existing)
