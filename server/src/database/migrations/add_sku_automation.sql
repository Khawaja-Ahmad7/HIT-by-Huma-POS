-- =============================================
-- SKU Automation Migration
-- Adds category_code, sku_sizes, and sku_colors tables
-- =============================================

-- Add category_code column to categories table
ALTER TABLE categories 
ADD COLUMN IF NOT EXISTS category_code VARCHAR(10);

-- Create SKU Sizes table for size codes
CREATE TABLE IF NOT EXISTS sku_sizes (
    size_id SERIAL PRIMARY KEY,
    size_name VARCHAR(50) NOT NULL UNIQUE,
    size_code VARCHAR(2) NOT NULL UNIQUE,
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create SKU Colors table for color codes  
CREATE TABLE IF NOT EXISTS sku_colors (
    color_id SERIAL PRIMARY KEY,
    color_name VARCHAR(50) NOT NULL UNIQUE,
    color_code VARCHAR(2) NOT NULL UNIQUE,
    color_hex VARCHAR(7),
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default sizes with codes
INSERT INTO sku_sizes (size_name, size_code, sort_order) VALUES
('Small', '00', 1),
('Medium', '01', 2),
('Large', '02', 3),
('Extra Large', '03', 4),
('Unstitched', '99', 10)
ON CONFLICT (size_name) DO NOTHING;

-- Insert some default colors with codes
INSERT INTO sku_colors (color_name, color_code, color_hex, sort_order) VALUES
('Black', '01', '#000000', 1),
('White', '02', '#FFFFFF', 2),
('Red', '03', '#FF0000', 3),
('Blue', '04', '#0000FF', 4),
('Green', '05', '#00FF00', 5),
('Yellow', '06', '#FFFF00', 6),
('Pink', '07', '#FFC0CB', 7),
('Purple', '08', '#800080', 8),
('Orange', '09', '#FFA500', 9),
('Brown', '10', '#A52A2A', 10),
('Grey', '11', '#808080', 11),
('Beige', '12', '#F5F5DC', 12),
('Navy', '13', '#000080', 13),
('Maroon', '14', '#800000', 14),
('Gold', '15', '#FFD700', 15)
ON CONFLICT (color_name) DO NOTHING;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_sku_sizes_code ON sku_sizes(size_code);
CREATE INDEX IF NOT EXISTS idx_sku_colors_code ON sku_colors(color_code);
CREATE INDEX IF NOT EXISTS idx_categories_code ON categories(category_code);
