-- ============================================================================
-- Migration: Reseed inventory_aset_area dengan 27 items + 25 locations baru
-- Sesuai dengan sheet "Inventory Aset Area TEMPLATE" yang sudah diupdate user
-- ============================================================================

-- Hapus semua existing aset_area records (akan di-reseed)
DELETE FROM inventory_aset_area;

-- Insert 27 items × first location ('Loby') untuk current period
-- User akan input data per location via web app
INSERT INTO inventory_aset_area (item_name, location, count, period_month, period_year)
SELECT item.item_name, 'Loby', NULL, EXTRACT(MONTH FROM NOW())::INTEGER, EXTRACT(YEAR FROM NOW())::INTEGER
FROM (VALUES
  ('dusbin restroom'),
  ('dispenser shoap'),
  ('Hand Drayer'),
  ('tisu box'),
  ('tanaman restroom'),
  ('tanaman sintetis gd a'),
  ('tanaman sintetis gd c'),
  ('dusbin coridor c'),
  ('dusbin coridor a'),
  ('dusbin area'),
  ('rubbermate area'),
  ('meja konsole lobby'),
  ('meja konsole gd c'),
  ('meja konsole gd a'),
  ('rubbermate alrestroom area'),
  ('tanaman pembatas lobby'),
  ('tanaman pembatas santan'),
  ('sofa ballroom'),
  ('tanaman area sakeca'),
  ('tanaman area lobby'),
  ('tanaman meja sakeca'),
  ('tanaman coridor c'),
  ('tanaman coridor a'),
  ('tanaman santan and foye'),
  ('tanaman meja kecil santan'),
  ('goong lobby'),
  ('selang air')
) AS item(item_name)
ON CONFLICT (item_name, location, period_month, period_year) DO NOTHING;

NOTIFY pgrst, 'reload schema';
