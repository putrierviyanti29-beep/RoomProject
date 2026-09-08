-- ============================================================================
-- Migration: Inventory Aset Room + Inventory Aset Area
-- Both use same table structure (matrix item × location) but separate tables
-- because items and locations are different.
-- ============================================================================

-- ============================================================================
-- 1. INVENTORY ASET ROOM — items × room/storage locations
-- ============================================================================
CREATE TABLE IF NOT EXISTS inventory_aset_room (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name TEXT NOT NULL,
  -- 'location' can be a room number (e.g. '301') or a storage name (e.g. 'ROOM', 'Gudang 3C')
  location TEXT NOT NULL,
  count INTEGER,  -- nullable: NULL = empty cell, not 0
  period_month INTEGER NOT NULL DEFAULT EXTRACT(MONTH FROM NOW())::INTEGER,
  period_year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM NOW())::INTEGER,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE (item_name, location, period_month, period_year)
);

ALTER TABLE inventory_aset_room ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read inventory_aset_room"
  ON inventory_aset_room FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin & supervisor can write inventory_aset_room"
  ON inventory_aset_room FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')));

CREATE INDEX idx_inventory_aset_room_item ON inventory_aset_room(item_name);
CREATE INDEX idx_inventory_aset_room_location ON inventory_aset_room(location);
CREATE INDEX idx_inventory_aset_room_period ON inventory_aset_room(period_month, period_year);

CREATE OR REPLACE FUNCTION update_inventory_aset_room_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_inventory_aset_room_updated ON inventory_aset_room;
CREATE TRIGGER trigger_inventory_aset_room_updated
  BEFORE UPDATE ON inventory_aset_room
  FOR EACH ROW
  EXECUTE FUNCTION update_inventory_aset_room_updated_at();

-- ============================================================================
-- 2. INVENTORY ASET AREA — area items × area locations
-- ============================================================================
CREATE TABLE IF NOT EXISTS inventory_aset_area (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name TEXT NOT NULL,
  location TEXT NOT NULL,  -- area name (e.g. 'Floor 4', 'Lobby area', 'Restaurant')
  count INTEGER,  -- nullable
  period_month INTEGER NOT NULL DEFAULT EXTRACT(MONTH FROM NOW())::INTEGER,
  period_year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM NOW())::INTEGER,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE (item_name, location, period_month, period_year)
);

ALTER TABLE inventory_aset_area ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read inventory_aset_area"
  ON inventory_aset_area FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin & supervisor can write inventory_aset_area"
  ON inventory_aset_area FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')));

CREATE INDEX idx_inventory_aset_area_item ON inventory_aset_area(item_name);
CREATE INDEX idx_inventory_aset_area_location ON inventory_aset_area(location);
CREATE INDEX idx_inventory_aset_area_period ON inventory_aset_area(period_month, period_year);

CREATE OR REPLACE FUNCTION update_inventory_aset_area_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_inventory_aset_area_updated ON inventory_aset_area;
CREATE TRIGGER trigger_inventory_aset_area_updated
  BEFORE UPDATE ON inventory_aset_area
  FOR EACH ROW
  EXECUTE FUNCTION update_inventory_aset_area_updated_at();

-- ============================================================================
-- 3. Seed default Aset Room items (21 items matching template rows 6-26)
--    Insert at 'ROOM' storage (Block 1 first column) for current period
-- ============================================================================
INSERT INTO inventory_aset_room (item_name, location, count, period_month, period_year)
SELECT item.item_name, 'ROOM', NULL, EXTRACT(MONTH FROM NOW())::INTEGER, EXTRACT(YEAR FROM NOW())::INTEGER
FROM (VALUES
  ('Television'),
  ('Air conditioner'),
  ('Remote TV & AC'),
  ('Telephone'),
  ('Standing lamp'),
  ('Bed Side Lamp'),
  ('Hanger'),
  ('Box Tissue'),
  ('Dust Bin'),
  ('Kettle jug'),
  ('Cofee tray'),
  ('Coffe Set Holder'),
  ('MUG'),
  ('Sofa'),
  ('Dressing chair'),
  ('AKRILIC TV'),
  ('Amenities Tray'),
  ('Tumbler glass'),
  ('Soap dispenser'),
  ('Tissue Holder'),
  ('Dust Bin')
) AS item(item_name)
ON CONFLICT (item_name, location, period_month, period_year) DO NOTHING;

-- ============================================================================
-- 4. Seed default Aset Area items (11 items) at 'Floor 4' (first area)
-- ============================================================================
INSERT INTO inventory_aset_area (item_name, location, count, period_month, period_year)
SELECT item.item_name, 'Floor 4', NULL, EXTRACT(MONTH FROM NOW())::INTEGER, EXTRACT(YEAR FROM NOW())::INTEGER
FROM (VALUES
  ('Stella matic'),
  ('Standing astray'),
  ('box tissue wall'),
  ('Box tissue'),
  ('Soap dispenser'),
  ('Dustbin'),
  ('Sofa small'),
  ('Sofa big'),
  ('Sofa table'),
  ('Cushion'),
  ('Standing AC')
) AS item(item_name)
ON CONFLICT (item_name, location, period_month, period_year) DO NOTHING;

NOTIFY pgrst, 'reload schema';
