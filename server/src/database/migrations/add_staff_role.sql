-- =============================================
-- Add Staff Role Migration
-- Run this to add the staff role to existing database
-- =============================================

-- Insert Staff Role (PostgreSQL version)
INSERT INTO roles (role_name, description, permissions) VALUES
('staff', 'Staff member with POS, Inventory, Products, and Customer access', 
 '{"pos": true, "inventory": true, "products": true, "customers": true, "shifts.own": true}')
ON CONFLICT (role_name) DO UPDATE SET 
  permissions = EXCLUDED.permissions,
  description = EXCLUDED.description;
