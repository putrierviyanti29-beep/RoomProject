-- ============================================================================
-- Migration v5: HK & ENG sebagai 2 status terpisah (bukan toggle)
--               + auto-generate special_cleaning saat project dibuat
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. general_cleaning: hapus done_type, tambah done_hk & done_eng (boolean)
--    Sekarang 1 kamar bisa di-done oleh HK DAN Eng secara independen
-- ============================================================================
ALTER TABLE general_cleaning DROP CONSTRAINT IF EXISTS general_cleaning_done_type_check;
ALTER TABLE general_cleaning DROP COLUMN IF EXISTS done_type;

ALTER TABLE general_cleaning ADD COLUMN IF NOT EXISTS done_hk BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE general_cleaning ADD COLUMN IF NOT EXISTS done_eng BOOLEAN NOT NULL DEFAULT FALSE;

-- Status check: pending | done_hk | done_eng | done_both | issue
-- (status 'done' di-keep untuk backward compat tapi tidak dipakai lagi di UI)
-- Kita pakai 2 boolean terpisah, status tetap 'done' kalau salah satu true
DO $$
BEGIN
  ALTER TABLE general_cleaning DROP CONSTRAINT IF EXISTS general_cleaning_status_check;
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

ALTER TABLE general_cleaning
  ADD CONSTRAINT general_cleaning_status_check
  CHECK (status IN ('pending', 'done', 'issue'));

-- Update existing 'done' rows: set done_hk=true (default ke HK)
UPDATE general_cleaning SET done_hk = TRUE WHERE status = 'done';

-- ============================================================================
-- 2. Trigger: auto-generate special_cleaning rows (4 areas × all rooms)
--    saat special_projects di-insert
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_special_cleaning_for_project()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert 1 row per (room, active_inspection_area) untuk project baru
  INSERT INTO special_cleaning (project_id, room_id, area_id, status)
  SELECT
    NEW.id,
    r.id,
    ia.id,
    'pending'
  FROM rooms r
  CROSS JOIN inspection_areas ia
  WHERE ia.is_active = TRUE
  ON CONFLICT (project_id, room_id, area_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_generate_special_cleaning ON special_projects;
CREATE TRIGGER trigger_generate_special_cleaning
  AFTER INSERT ON special_projects
  FOR EACH ROW
  EXECUTE FUNCTION generate_special_cleaning_for_project();

-- ============================================================================
-- 3. Backfill: untuk existing projects yang belum punya special_cleaning rows,
--    generate sekarang
-- ============================================================================
INSERT INTO special_cleaning (project_id, room_id, area_id, status)
SELECT
  sp.id,
  r.id,
  ia.id,
  'pending'
FROM special_projects sp
CROSS JOIN rooms r
CROSS JOIN inspection_areas ia
WHERE ia.is_active = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM special_cleaning sc
    WHERE sc.project_id = sp.id
      AND sc.room_id = r.id
      AND sc.area_id = ia.id
  )
ON CONFLICT (project_id, room_id, area_id) DO NOTHING;

COMMIT;

-- Reload PostgREST cache
NOTIFY pgrst, 'reload schema';
