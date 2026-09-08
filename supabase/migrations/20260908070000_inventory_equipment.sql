-- ============================================================================
-- Migration: Inventory Equipment table
-- Simple table matching the Equipment TEMPLATE spreadsheet structure.
-- ============================================================================

CREATE TABLE IF NOT EXISTS inventory_equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  no INTEGER NOT NULL,
  item_name TEXT NOT NULL,
  previous_balance INTEGER NOT NULL DEFAULT 0,
  new_purchase INTEGER NOT NULL DEFAULT 0,
  condition_good INTEGER NOT NULL DEFAULT 0,
  condition_broken INTEGER NOT NULL DEFAULT 0,
  closing_inventory INTEGER NOT NULL DEFAULT 0,
  need_to_purchase INTEGER NOT NULL DEFAULT 0,
  price_per_unit NUMERIC(12, 2) NOT NULL DEFAULT 0,
  -- total_price is computed: need_to_purchase * price_per_unit
  -- we store it as a column for easy sync to spreadsheet, but update it on save
  total_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

ALTER TABLE inventory_equipment ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read
CREATE POLICY "Authenticated can read inventory_equipment"
  ON inventory_equipment FOR SELECT TO authenticated USING (true);

-- Only admin & supervisor can write
CREATE POLICY "Admin & supervisor can write inventory_equipment"
  ON inventory_equipment FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
    )
  );

CREATE INDEX idx_inventory_equipment_no ON inventory_equipment(no);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_inventory_equipment_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  -- Also recompute total_price = need_to_purchase * price_per_unit
  NEW.total_price = NEW.need_to_purchase * NEW.price_per_unit;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_inventory_equipment_updated ON inventory_equipment;
CREATE TRIGGER trigger_inventory_equipment_updated
  BEFORE UPDATE ON inventory_equipment
  FOR EACH ROW
  EXECUTE FUNCTION update_inventory_equipment_updated_at();

-- Also recompute total_price on INSERT
CREATE OR REPLACE FUNCTION set_inventory_equipment_total_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  NEW.total_price = NEW.need_to_purchase * NEW.price_per_unit;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_inventory_equipment_insert ON inventory_equipment;
CREATE TRIGGER trigger_inventory_equipment_insert
  BEFORE INSERT ON inventory_equipment
  FOR EACH ROW
  EXECUTE FUNCTION set_inventory_equipment_total_on_insert();

-- ============================================================================
-- Seed default equipment items (matching the template's first 6 rows)
-- ============================================================================
INSERT INTO inventory_equipment (no, item_name) VALUES
  (1, 'Vacum Cleaner ( Dry )'),
  (2, 'Vacum Cleaner ( Wet&Dry )'),
  (3, 'Blower'),
  (4, 'Polisher Machine'),
  (5, 'Trolley Room'),
  (6, 'Broom')
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
