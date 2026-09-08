-- ============================================================================
-- Migration: Sync schema with spreadsheet template
-- Adds: section/floor to rooms, issue status + notes to general_cleaning,
--       inspection_areas & inspection_items tables, 79 seed rooms, 2 room types
-- ============================================================================

-- ============================================================================
-- 1. Add section & floor columns to rooms
-- ============================================================================
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS section TEXT,
  ADD COLUMN IF NOT EXISTS floor INTEGER;

-- Add index for faster grouping queries
CREATE INDEX IF NOT EXISTS idx_rooms_section_floor ON rooms(section, floor);

-- ============================================================================
-- 2. Expand general_cleaning status + add notes
--    Old: pending | done
--    New: pending | done | issue
-- ============================================================================
DO $$
BEGIN
  -- Drop the old constraint if it exists
  ALTER TABLE general_cleaning DROP CONSTRAINT IF EXISTS general_cleaning_status_check;
END$$;

ALTER TABLE general_cleaning
  ADD CONSTRAINT general_cleaning_status_check
  CHECK (status IN ('pending', 'done', 'issue'));

ALTER TABLE general_cleaning
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE general_cleaning
  ADD COLUMN IF NOT EXISTS area_id UUID;

-- ============================================================================
-- 3. Inspection areas table (admin-customizable item groups)
--    Each area = an inspection category like "Toilet Bowl", "Shower Glass"
--    Defaults to 4 areas matching the spreadsheet template
-- ============================================================================
CREATE TABLE IF NOT EXISTS inspection_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE inspection_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated can read inspection_areas"
  ON inspection_areas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage inspection_areas"
  ON inspection_areas FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================================
-- 4. General cleaning now optionally references an inspection_area
--    (one row per room per area per date — replaces the single-row model)
-- ============================================================================
ALTER TABLE general_cleaning
  ADD CONSTRAINT general_cleaning_area_id_fkey
  FOREIGN KEY (area_id) REFERENCES inspection_areas(id) ON DELETE SET NULL;

-- ============================================================================
-- 5. Seed default inspection areas (matching spreadsheet template)
-- ============================================================================
INSERT INTO inspection_areas (name, display_order) VALUES
  ('Toilet Bowl', 1),
  ('Shower Glass', 2),
  ('Kettle Jug', 3),
  ('Scrubing Floor', 4)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 6. Seed default room types (JSUIT & DLX from spreadsheet)
-- ============================================================================
INSERT INTO room_types (name) VALUES
  ('JSUIT'),
  ('DLX')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 7. Seed all 79 rooms from the spreadsheet template
--    Structure: Section Gedung A (Floors 3,4,5) + Section Gedung C (Floors 2,3,4,5)
-- ============================================================================
DO $$
DECLARE
  v_jsuit UUID; v_dlx UUID;
BEGIN
  SELECT id INTO v_jsuit FROM room_types WHERE name = 'JSUIT' LIMIT 1;
  SELECT id INTO v_dlx FROM room_types WHERE name = 'DLX' LIMIT 1;

  -- Section Gedung A — Floor 3 (301–311): 301 & 302 are JSUIT, rest DLX
  INSERT INTO rooms (room_number, room_type_id, section, floor)
  VALUES
    ('301', v_jsuit, 'A', 3),
    ('302', v_jsuit, 'A', 3),
    ('303', v_dlx, 'A', 3),
    ('304', v_dlx, 'A', 3),
    ('305', v_dlx, 'A', 3),
    ('306', v_dlx, 'A', 3),
    ('307', v_dlx, 'A', 3),
    ('308', v_dlx, 'A', 3),
    ('309', v_dlx, 'A', 3),
    ('310', v_dlx, 'A', 3),
    ('311', v_dlx, 'A', 3)
  ON CONFLICT (room_number) DO NOTHING;

  -- Section Gedung A — Floor 4 (401–411): 401 & 402 are JSUIT, rest DLX
  INSERT INTO rooms (room_number, room_type_id, section, floor)
  VALUES
    ('401', v_jsuit, 'A', 4),
    ('402', v_jsuit, 'A', 4),
    ('403', v_dlx, 'A', 4),
    ('404', v_dlx, 'A', 4),
    ('405', v_dlx, 'A', 4),
    ('406', v_dlx, 'A', 4),
    ('407', v_dlx, 'A', 4),
    ('408', v_dlx, 'A', 4),
    ('409', v_dlx, 'A', 4),
    ('410', v_dlx, 'A', 4),
    ('411', v_dlx, 'A', 4)
  ON CONFLICT (room_number) DO NOTHING;

  -- Section Gedung A — Floor 5 (501–507): all DLX
  INSERT INTO rooms (room_number, room_type_id, section, floor)
  VALUES
    ('501', v_dlx, 'A', 5),
    ('502', v_dlx, 'A', 5),
    ('503', v_dlx, 'A', 5),
    ('504', v_dlx, 'A', 5),
    ('505', v_dlx, 'A', 5),
    ('506', v_dlx, 'A', 5),
    ('507', v_dlx, 'A', 5)
  ON CONFLICT (room_number) DO NOTHING;

  -- Section Gedung C — Floor 2 (201–213): all DLX
  INSERT INTO rooms (room_number, room_type_id, section, floor)
  VALUES
    ('201', v_dlx, 'C', 2),
    ('202', v_dlx, 'C', 2),
    ('203', v_dlx, 'C', 2),
    ('204', v_dlx, 'C', 2),
    ('205', v_dlx, 'C', 2),
    ('206', v_dlx, 'C', 2),
    ('207', v_dlx, 'C', 2),
    ('208', v_dlx, 'C', 2),
    ('209', v_dlx, 'C', 2),
    ('210', v_dlx, 'C', 2),
    ('211', v_dlx, 'C', 2),
    ('212', v_dlx, 'C', 2),
    ('213', v_dlx, 'C', 2)
  ON CONFLICT (room_number) DO NOTHING;

  -- Section Gedung C — Floor 3 (312–324): all DLX
  INSERT INTO rooms (room_number, room_type_id, section, floor)
  VALUES
    ('312', v_dlx, 'C', 3),
    ('313', v_dlx, 'C', 3),
    ('314', v_dlx, 'C', 3),
    ('315', v_dlx, 'C', 3),
    ('316', v_dlx, 'C', 3),
    ('317', v_dlx, 'C', 3),
    ('318', v_dlx, 'C', 3),
    ('319', v_dlx, 'C', 3),
    ('320', v_dlx, 'C', 3),
    ('321', v_dlx, 'C', 3),
    ('322', v_dlx, 'C', 3),
    ('323', v_dlx, 'C', 3),
    ('324', v_dlx, 'C', 3)
  ON CONFLICT (room_number) DO NOTHING;

  -- Section Gedung C — Floor 4 (412–424): all DLX
  INSERT INTO rooms (room_number, room_type_id, section, floor)
  VALUES
    ('412', v_dlx, 'C', 4),
    ('413', v_dlx, 'C', 4),
    ('414', v_dlx, 'C', 4),
    ('415', v_dlx, 'C', 4),
    ('416', v_dlx, 'C', 4),
    ('417', v_dlx, 'C', 4),
    ('418', v_dlx, 'C', 4),
    ('419', v_dlx, 'C', 4),
    ('420', v_dlx, 'C', 4),
    ('421', v_dlx, 'C', 4),
    ('422', v_dlx, 'C', 4),
    ('423', v_dlx, 'C', 4),
    ('424', v_dlx, 'C', 4)
  ON CONFLICT (room_number) DO NOTHING;

  -- Section Gedung C — Floor 5 (508–520): all DLX
  INSERT INTO rooms (room_number, room_type_id, section, floor)
  VALUES
    ('508', v_dlx, 'C', 5),
    ('509', v_dlx, 'C', 5),
    ('510', v_dlx, 'C', 5),
    ('511', v_dlx, 'C', 5),
    ('512', v_dlx, 'C', 5),
    ('513', v_dlx, 'C', 5),
    ('514', v_dlx, 'C', 5),
    ('515', v_dlx, 'C', 5),
    ('516', v_dlx, 'C', 5),
    ('517', v_dlx, 'C', 5),
    ('518', v_dlx, 'C', 5),
    ('519', v_dlx, 'C', 5),
    ('520', v_dlx, 'C', 5)
  ON CONFLICT (room_number) DO NOTHING;
END$$;

-- ============================================================================
-- 8. Index for fast lookup of GC records per area per date
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_general_cleaning_area_date
  ON general_cleaning(area_id, date);

CREATE INDEX IF NOT EXISTS idx_general_cleaning_room_area_date
  ON general_cleaning(room_id, area_id, date);
