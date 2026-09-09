-- ============================================================================
-- Migration: Inventory Pillow Protector
-- Tracks Pillow Protector cleaning status per room per period.
-- Structure matches "Pillow Protector TEMPLATE" sheet:
-- 1 row per room, with Date / Status / Done by columns.
-- ============================================================================

CREATE TABLE IF NOT EXISTS inventory_pillow_protector (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'done', 'issue')),
  done_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  done_at TIMESTAMPTZ,
  notes TEXT,
  period_month INTEGER NOT NULL DEFAULT EXTRACT(MONTH FROM NOW())::INTEGER,
  period_year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM NOW())::INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE (room_id, period_month, period_year)
);

ALTER TABLE inventory_pillow_protector ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read inventory_pillow_protector"
  ON inventory_pillow_protector FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin & supervisor can write inventory_pillow_protector"
  ON inventory_pillow_protector FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')));

CREATE INDEX idx_pillow_protector_period ON inventory_pillow_protector(period_month, period_year);
CREATE INDEX idx_pillow_protector_room ON inventory_pillow_protector(room_id);

CREATE OR REPLACE FUNCTION update_pillow_protector_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_pillow_protector_updated ON inventory_pillow_protector;
CREATE TRIGGER trigger_pillow_protector_updated
  BEFORE UPDATE ON inventory_pillow_protector
  FOR EACH ROW
  EXECUTE FUNCTION update_pillow_protector_updated_at();

NOTIFY pgrst, 'reload schema';
