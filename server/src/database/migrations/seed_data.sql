-- =============================================
-- HIT BY HUMA POS - Data Migration Script
-- Run this on the TARGET database after running schema.postgres.sql
-- =============================================

-- Step 1: Insert Roles
INSERT INTO roles (role_name, description, permissions, is_active) VALUES
('admin', 'System Administrator', '{"all": true}', true),
('manager', 'Store Manager', '{"sales": true, "inventory": true, "reports": true, "customers": true, "discounts": true, "void": true}', true),
('cashier', 'Cashier', '{"sales": true, "customers": true}', true)
ON CONFLICT (role_name) DO NOTHING;

-- Step 2: Insert Locations
INSERT INTO locations (location_code, location_name, is_headquarters, is_active) VALUES
('MAIN', 'Main Store', TRUE, TRUE)
ON CONFLICT (location_code) DO NOTHING;

-- Step 3: Insert Payment Methods
INSERT INTO payment_methods (method_name, method_type, is_active, requires_reference, sort_order) VALUES
('Cash', 'cash', TRUE, FALSE, 1),
('Credit Card', 'card', TRUE, FALSE, 2),
('Debit Card', 'card', TRUE, FALSE, 3),
('Bank Transfer', 'bank', TRUE, TRUE, 4),
('JazzCash', 'mobile', TRUE, FALSE, 5),
('EasyPaisa', 'mobile', TRUE, FALSE, 6)
ON CONFLICT (method_name) DO NOTHING;

-- Step 4: Insert Admin User (Password: admin123)
INSERT INTO users (employee_code, email, password_hash, first_name, last_name, role_id, default_location_id, is_active)
SELECT 'ADMIN001', 'admin@hitbyhuma.com', '$2a$10$rQnM1TmKxKVRlFKNz.YHcOVB3Q.3kZQxPNxjh8K.P9xJvZlQ5VjTi', 'Admin', 'User',
       (SELECT role_id FROM roles WHERE role_name = 'admin'),
       (SELECT location_id FROM locations WHERE location_code = 'MAIN'),
       true
WHERE NOT EXISTS (SELECT 1 FROM users WHERE employee_code = 'ADMIN001');

-- Step 5: Insert Attributes
INSERT INTO attributes (attribute_name, attribute_type, sort_order, is_active) VALUES
('Size', 'select', 1, true),
('Color', 'color', 2, true)
ON CONFLICT (attribute_name) DO NOTHING;

-- Step 6: Insert Attribute Values (Sizes)
INSERT INTO attribute_values (attribute_id, value, sort_order, is_active)
SELECT a.attribute_id, v.value, v.sort_order, true
FROM attributes a
CROSS JOIN (VALUES ('XS', 1), ('S', 2), ('M', 3), ('L', 4), ('XL', 5), ('XXL', 6)) AS v(value, sort_order)
WHERE a.attribute_name = 'Size'
ON CONFLICT (attribute_id, value) DO NOTHING;

-- Step 7: Insert Default Settings
INSERT INTO settings (setting_key, setting_value, setting_type, description, is_public) VALUES
('company_name', 'HIT BY HUMA', 'string', 'Company name displayed on receipts', TRUE),
('currency_symbol', 'PKR', 'string', 'Currency symbol', TRUE),
('tax_rate', '0', 'number', 'Default tax rate percentage', TRUE),
('receipt_footer', 'Thank you for shopping with us!', 'string', 'Receipt footer message', TRUE),
('allow_negative_inventory', 'false', 'boolean', 'Allow sales when stock is zero', FALSE),
('max_discount_without_approval', '10', 'number', 'Maximum discount percentage without manager approval', FALSE)
ON CONFLICT (setting_key) DO NOTHING;

-- =============================================
-- ADMIN LOGIN CREDENTIALS:
-- Employee Code: ADMIN001
-- Password: admin123
-- =============================================
