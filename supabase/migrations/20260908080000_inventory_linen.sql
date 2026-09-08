-- ============================================================================
-- Migration: Inventory Linen — matrix per item × room
-- Tracks linen count (e.g. Bath Towel) per room (e.g. 301) per period.
-- ============================================================================

CREATE TABLE IF NOT EXISTS inventory_linen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name TEXT NOT NULL,
  -- 'location' can be a room number (e.g. '301') or a storage name (e.g. 'Linen Room', 'Gudang 3C')
  location TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  -- Period tracking (for monthly snapshots)
  period_month INTEGER NOT NULL DEFAULT EXTRACT(MONTH FROM NOW())::INTEGER,
  period_year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM NOW())::INTEGER,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- Unique constraint: 1 row per (item, location, period)
  UNIQUE (item_name, location, period_month, period_year)
);

ALTER TABLE inventory_linen ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read
CREATE POLICY "Authenticated can read inventory_linen"
  ON inventory_linen FOR SELECT TO authenticated USING (true);

-- Only admin & supervisor can write
CREATE POLICY "Admin & supervisor can write inventory_linen"
  ON inventory_linen FOR ALL TO authenticated
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

CREATE INDEX idx_inventory_linen_item ON inventory_linen(item_name);
CREATE INDEX idx_inventory_linen_location ON inventory_linen(location);
CREATE INDEX idx_inventory_linen_period ON inventory_linen(period_month, period_year);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_inventory_linen_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_inventory_linen_updated ON inventory_linen;
CREATE TRIGGER trigger_inventory_linen_updated
  BEFORE UPDATE ON inventory_linen
  FOR EACH ROW
  EXECUTE FUNCTION update_inventory_linen_updated_at();

-- ============================================================================
-- Seed default linen items at Linen Room storage (matching template rows 6-12+)
-- ============================================================================
INSERT INTO inventory_linen (item_name, location, count, period_month, period_year) VALUES
  ('Bath Towel', 'Linen Room', 0, EXTRACT(MONTH FROM NOW())::INTEGER, EXTRACT(YEAR FROM NOW())::INTEGER),
  ('Bath Mat', 'Linen Room', 0, EXTRACT(MONTH FROM NOW())::INTEGER, EXTRACT(YEAR FROM NOW())::INTEGER),
  ('Bed Sheet twin A', 'Linen Room', 0, EXTRACT(MONTH FROM NOW())::INTEGER, EXTRACT(YEAR FROM NOW())::INTEGER),
  ('Bed Sheet twin C', 'Linen Room', 0, EXTRACT(MONTH FROM NOW())::INTEGER, EXTRACT(YEAR FROM NOW())::INTEGER),
  ('Bed sheet Karet', 'Linen Room', 0, EXTRACT(MONTH FROM NOW())::INTEGER, EXTRACT(YEAR FROM NOW())::INTEGER),
  ('Bed Sheet King', 'Linen Room', 0, EXTRACT(MONTH FROM NOW())::INTEGER, EXTRACT(YEAR FROM NOW())::INTEGER),
  ('Pillow case', 'Linen Room', 0, EXTRACT(MONTH FROM NOW())::INTEGER, EXTRACT(YEAR FROM NOW())::INTEGER)
ON CONFLICT (item_name, location, period_month, period_year) DO NOTHING;

NOTIFY pgrst, 'reload schema';
