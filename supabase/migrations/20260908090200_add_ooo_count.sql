-- ============================================================================
-- Migration: Add ooo_count column to inventory tables for tracking Out Of Order
-- ============================================================================

ALTER TABLE inventory_linen ADD COLUMN IF NOT EXISTS ooo_count INTEGER;
ALTER TABLE inventory_aset_room ADD COLUMN IF NOT EXISTS ooo_count INTEGER;
ALTER TABLE inventory_aset_area ADD COLUMN IF NOT EXISTS ooo_count INTEGER;

NOTIFY pgrst, 'reload schema';
