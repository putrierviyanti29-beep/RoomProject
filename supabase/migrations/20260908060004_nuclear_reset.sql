-- ============================================================================
-- 🎯 NUCLEAR FIX — Run this ONE file to fix EVERYTHING
-- This will DROP and RECREATE the schema cleanly.
-- All existing cleaning records will be lost (acceptable — fresh start).
-- ============================================================================

-- Safety: only run if we can drop everything cleanly
BEGIN;

-- 1. Drop all tables that depend on each other (cascade handles order)
DROP TABLE IF EXISTS special_cleaning CASCADE;
DROP TABLE IF EXISTS special_checklists CASCADE;
DROP TABLE IF EXISTS special_projects CASCADE;
DROP TABLE IF EXISTS general_cleaning CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;
DROP TABLE IF EXISTS room_types CASCADE;
DROP TABLE IF EXISTS inspection_areas CASCADE;
-- profiles table is linked to auth.users, keep it (don't drop)

COMMIT;

-- 2. Recreate everything from scratch
BEGIN;

-- ---- room_types ----
CREATE TABLE room_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE room_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_room_types" ON room_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "write_room_types" ON room_types FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ---- rooms (with section & floor) ----
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_number TEXT NOT NULL UNIQUE,
  room_type_id UUID REFERENCES room_types(id) ON DELETE SET NULL,
  section TEXT,
  floor INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_rooms" ON rooms FOR SELECT TO authenticated USING (true);
CREATE POLICY "write_rooms" ON rooms FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_rooms_section_floor ON rooms(section, floor);

-- ---- inspection_areas (4 default items) ----
CREATE TABLE inspection_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE inspection_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_inspection_areas" ON inspection_areas FOR SELECT TO authenticated USING (true);
CREATE POLICY "write_inspection_areas" ON inspection_areas FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ---- general_cleaning (SIMPLIFIED: 1 row per room per day + done_type) ----
CREATE TABLE general_cleaning (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'issue')),
  done_type TEXT CHECK (done_type IS NULL OR done_type IN ('housekeeping', 'engineering')),
  completed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  date DATE NOT NULL DEFAULT CURRENT_DATE
);
ALTER TABLE general_cleaning ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_gc" ON general_cleaning FOR SELECT TO authenticated USING (true);
CREATE POLICY "write_gc" ON general_cleaning FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_gc_date ON general_cleaning(date);
CREATE INDEX idx_gc_room ON general_cleaning(room_id);

-- ---- special_projects ----
CREATE TABLE special_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_name TEXT NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE special_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_sp" ON special_projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "write_sp" ON special_projects FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_sp_month_year ON special_projects(month, year);

-- ---- special_checklists (existing simple checklist model) ----
CREATE TABLE special_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES special_projects(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  completed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE special_checklists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_sc" ON special_checklists FOR SELECT TO authenticated USING (true);
CREATE POLICY "write_sc" ON special_checklists FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_sc_project ON special_checklists(project_id);

-- ---- special_cleaning (per room per area per project — for future use) ----
CREATE TABLE special_cleaning (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES special_projects(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  area_id UUID NOT NULL REFERENCES inspection_areas(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'issue')),
  done_type TEXT CHECK (done_type IS NULL OR done_type IN ('housekeeping', 'engineering')),
  completed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (project_id, room_id, area_id)
);
ALTER TABLE special_cleaning ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_special_cleaning" ON special_cleaning FOR SELECT TO authenticated USING (true);
CREATE POLICY "write_special_cleaning" ON special_cleaning FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- 3. Seed default inspection areas
INSERT INTO inspection_areas (name, display_order) VALUES
  ('Toilet Bowl', 1),
  ('Shower Glass', 2),
  ('Kettle Jug', 3),
  ('Scrubing Floor', 4);

-- 4. Seed default room types
INSERT INTO room_types (name) VALUES ('JSUIT'), ('DLX');

-- 5. Seed all 79 rooms from spreadsheet
DO $$
DECLARE v_jsuit UUID; v_dlx UUID;
BEGIN
  SELECT id INTO v_jsuit FROM room_types WHERE name = 'JSUIT' LIMIT 1;
  SELECT id INTO v_dlx FROM room_types WHERE name = 'DLX' LIMIT 1;

  INSERT INTO rooms (room_number, room_type_id, section, floor) VALUES
    -- Section A Floor 3
    ('301', v_jsuit, 'A', 3), ('302', v_jsuit, 'A', 3),
    ('303', v_dlx, 'A', 3), ('304', v_dlx, 'A', 3), ('305', v_dlx, 'A', 3),
    ('306', v_dlx, 'A', 3), ('307', v_dlx, 'A', 3), ('308', v_dlx, 'A', 3),
    ('309', v_dlx, 'A', 3), ('310', v_dlx, 'A', 3), ('311', v_dlx, 'A', 3),
    -- Section A Floor 4
    ('401', v_jsuit, 'A', 4), ('402', v_jsuit, 'A', 4),
    ('403', v_dlx, 'A', 4), ('404', v_dlx, 'A', 4), ('405', v_dlx, 'A', 4),
    ('406', v_dlx, 'A', 4), ('407', v_dlx, 'A', 4), ('408', v_dlx, 'A', 4),
    ('409', v_dlx, 'A', 4), ('410', v_dlx, 'A', 4), ('411', v_dlx, 'A', 4),
    -- Section A Floor 5
    ('501', v_dlx, 'A', 5), ('502', v_dlx, 'A', 5), ('503', v_dlx, 'A', 5),
    ('504', v_dlx, 'A', 5), ('505', v_dlx, 'A', 5), ('506', v_dlx, 'A', 5),
    ('507', v_dlx, 'A', 5),
    -- Section C Floor 2
    ('201', v_dlx, 'C', 2), ('202', v_dlx, 'C', 2), ('203', v_dlx, 'C', 2),
    ('204', v_dlx, 'C', 2), ('205', v_dlx, 'C', 2), ('206', v_dlx, 'C', 2),
    ('207', v_dlx, 'C', 2), ('208', v_dlx, 'C', 2), ('209', v_dlx, 'C', 2),
    ('210', v_dlx, 'C', 2), ('211', v_dlx, 'C', 2), ('212', v_dlx, 'C', 2),
    ('213', v_dlx, 'C', 2),
    -- Section C Floor 3
    ('312', v_dlx, 'C', 3), ('313', v_dlx, 'C', 3), ('314', v_dlx, 'C', 3),
    ('315', v_dlx, 'C', 3), ('316', v_dlx, 'C', 3), ('317', v_dlx, 'C', 3),
    ('318', v_dlx, 'C', 3), ('319', v_dlx, 'C', 3), ('320', v_dlx, 'C', 3),
    ('321', v_dlx, 'C', 3), ('322', v_dlx, 'C', 3), ('323', v_dlx, 'C', 3),
    ('324', v_dlx, 'C', 3),
    -- Section C Floor 4
    ('412', v_dlx, 'C', 4), ('413', v_dlx, 'C', 4), ('414', v_dlx, 'C', 4),
    ('415', v_dlx, 'C', 4), ('416', v_dlx, 'C', 4), ('417', v_dlx, 'C', 4),
    ('418', v_dlx, 'C', 4), ('419', v_dlx, 'C', 4), ('420', v_dlx, 'C', 4),
    ('421', v_dlx, 'C', 4), ('422', v_dlx, 'C', 4), ('423', v_dlx, 'C', 4),
    ('424', v_dlx, 'C', 4),
    -- Section C Floor 5
    ('508', v_dlx, 'C', 5), ('509', v_dlx, 'C', 5), ('510', v_dlx, 'C', 5),
    ('511', v_dlx, 'C', 5), ('512', v_dlx, 'C', 5), ('513', v_dlx, 'C', 5),
    ('514', v_dlx, 'C', 5), ('515', v_dlx, 'C', 5), ('516', v_dlx, 'C', 5),
    ('517', v_dlx, 'C', 5), ('518', v_dlx, 'C', 5), ('519', v_dlx, 'C', 5),
    ('520', v_dlx, 'C', 5);
END$$;

-- 6. CRITICAL: Force PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- DONE! Verification queries (run separately if you want to check):
-- ============================================================================
-- SELECT count(*) FROM rooms;            -- Expected: 79
-- SELECT count(*) FROM inspection_areas; -- Expected: 4
-- SELECT count(*) FROM room_types;       -- Expected: 2
-- SELECT to_regclass('general_cleaning'); -- Expected: general_cleaning
-- SELECT to_regclass('special_cleaning'); -- Expected: special_cleaning
