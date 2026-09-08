-- ============================================================================
-- Migration: Seed ALL items from spreadsheet (Linen 16 + Equipment 25)
-- Updates DEFAULT_LINEN_ITEMS list and inserts missing equipment items
-- ============================================================================

-- ============================================================================
-- 1. INVENTORY LINEN — insert missing 9 items (already have 7, target 16)
--    Insert at Linen Room storage for current period
-- ============================================================================
INSERT INTO inventory_linen (item_name, location, count, period_month, period_year)
SELECT
  item.item_name,
  'Linen Room',
  0,
  EXTRACT(MONTH FROM NOW())::INTEGER,
  EXTRACT(YEAR FROM NOW())::INTEGER
FROM (VALUES
  ('Duvet Cover twin A'),
  ('Duvet Cover twin C'),
  ('Duvet Twin garis'),
  ('Duvet Cover King'),
  ('Bed Pad twin'),
  ('Bed Pad King'),
  ('Duvet Insert twin'),
  ('Duvet Insert King'),
  ('Hand towel')
) AS item(item_name)
WHERE NOT EXISTS (
  SELECT 1 FROM inventory_linen il
  WHERE il.item_name = item.item_name
    AND il.location = 'Linen Room'
    AND il.period_month = EXTRACT(MONTH FROM NOW())::INTEGER
    AND il.period_year = EXTRACT(YEAR FROM NOW())::INTEGER
)
ON CONFLICT (item_name, location, period_month, period_year) DO NOTHING;

-- ============================================================================
-- 2. INVENTORY EQUIPMENT — insert missing 19 items (already have 6, target 25)
--    Items 1-6 already seeded by migration 20260908070000
-- ============================================================================
INSERT INTO inventory_equipment (no, item_name)
SELECT
  ROW_NUMBER() OVER () + 6,  -- continue numbering from 7
  item.item_name
FROM (VALUES
  ('Dustpan'),
  ('Stick Lobby Duster'),
  ('Cotton Lobby Duster'),
  ('Bucket'),
  ('Floor Squezee'),
  ('Window Washer'),
  ('Window Squezee'),
  ('Warning Sign'),
  ('Plat Mop'),
  ('Mop'),
  ('Cotton Mop'),
  ('Gun Sprayer'),
  ('Toilet Bowl Brush'),
  ('Hand scott brite'),
  ('Hand Brush'),
  ('Micro fiber cloth'),
  ('Caddy carry'),
  ('White Pad'),
  ('Black Pad')
) AS item(item_name)
WHERE NOT EXISTS (
  SELECT 1 FROM inventory_equipment ie WHERE ie.item_name = item.item_name
)
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
