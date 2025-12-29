-- Migration: Make barcode NOT NULL and ensure UNIQUE constraint
-- Run this after ensuring all existing variants have barcodes

-- First, update any NULL barcodes with auto-generated values
UPDATE product_variants 
SET barcode = sku || '-' || variant_id 
WHERE barcode IS NULL;

-- Then alter the column to NOT NULL
ALTER TABLE product_variants 
ALTER COLUMN barcode SET NOT NULL;

-- The UNIQUE constraint already exists (from schema), so we don't need to add it
-- If it doesn't exist, you can add it with:
-- ALTER TABLE product_variants ADD CONSTRAINT product_variants_barcode_unique UNIQUE (barcode);
