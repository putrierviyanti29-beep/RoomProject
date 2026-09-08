-- ============================================================================
-- Migration: Make inventory_equipment numeric columns NULLABLE
-- (was NOT NULL DEFAULT 0, now NULL so cells are empty until user inputs)
-- ============================================================================

-- Drop old constraints (no-op if not exists)
ALTER TABLE inventory_equipment ALTER COLUMN previous_balance DROP NOT NULL;
ALTER TABLE inventory_equipment ALTER COLUMN previous_balance SET DEFAULT NULL;
ALTER TABLE inventory_equipment ALTER COLUMN new_purchase DROP NOT NULL;
ALTER TABLE inventory_equipment ALTER COLUMN new_purchase SET DEFAULT NULL;
ALTER TABLE inventory_equipment ALTER COLUMN condition_good DROP NOT NULL;
ALTER TABLE inventory_equipment ALTER COLUMN condition_good SET DEFAULT NULL;
ALTER TABLE inventory_equipment ALTER COLUMN condition_broken DROP NOT NULL;
ALTER TABLE inventory_equipment ALTER COLUMN condition_broken SET DEFAULT NULL;
ALTER TABLE inventory_equipment ALTER COLUMN closing_inventory DROP NOT NULL;
ALTER TABLE inventory_equipment ALTER COLUMN closing_inventory SET DEFAULT NULL;
ALTER TABLE inventory_equipment ALTER COLUMN need_to_purchase DROP NOT NULL;
ALTER TABLE inventory_equipment ALTER COLUMN need_to_purchase SET DEFAULT NULL;
ALTER TABLE inventory_equipment ALTER COLUMN price_per_unit DROP NOT NULL;
ALTER TABLE inventory_equipment ALTER COLUMN price_per_unit SET DEFAULT NULL;
ALTER TABLE inventory_equipment ALTER COLUMN total_price DROP NOT NULL;
ALTER TABLE inventory_equipment ALTER COLUMN total_price SET DEFAULT NULL;

-- Update existing rows: convert 0 → NULL (so cells become empty in UI)
UPDATE inventory_equipment SET previous_balance = NULL WHERE previous_balance = 0;
UPDATE inventory_equipment SET new_purchase = NULL WHERE new_purchase = 0;
UPDATE inventory_equipment SET condition_good = NULL WHERE condition_good = 0;
UPDATE inventory_equipment SET condition_broken = NULL WHERE condition_broken = 0;
UPDATE inventory_equipment SET closing_inventory = NULL WHERE closing_inventory = 0;
UPDATE inventory_equipment SET need_to_purchase = NULL WHERE need_to_purchase = 0;
UPDATE inventory_equipment SET price_per_unit = NULL WHERE price_per_unit = 0;
UPDATE inventory_equipment SET total_price = NULL WHERE total_price = 0;

-- ============================================================================
-- Update trigger: recompute total_price only when both inputs are non-null
-- ============================================================================
CREATE OR REPLACE FUNCTION update_inventory_equipment_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  -- total_price = need_to_purchase * price_per_unit (NULL if either is NULL)
  IF NEW.need_to_purchase IS NOT NULL AND NEW.price_per_unit IS NOT NULL THEN
    NEW.total_price = NEW.need_to_purchase * NEW.price_per_unit;
  ELSE
    NEW.total_price = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_inventory_equipment_total_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.need_to_purchase IS NOT NULL AND NEW.price_per_unit IS NOT NULL THEN
    NEW.total_price = NEW.need_to_purchase * NEW.price_per_unit;
  ELSE
    NEW.total_price = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
