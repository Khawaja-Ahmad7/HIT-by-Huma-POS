-- Migration: Allow NULL variant_id for manual sale items
-- Date: 2026-01-02

-- Drop the NOT NULL constraint on variant_id to allow manual items
ALTER TABLE sale_items 
ALTER COLUMN variant_id DROP NOT NULL;

-- Drop the foreign key constraint temporarily
ALTER TABLE sale_items 
DROP CONSTRAINT IF EXISTS sale_items_variant_id_fkey;

-- Re-add the foreign key constraint but allow NULL values
ALTER TABLE sale_items 
ADD CONSTRAINT sale_items_variant_id_fkey 
FOREIGN KEY (variant_id) REFERENCES product_variants(variant_id);
