-- Admin User Insert for HIT by Huma POS
-- Run this query after creating the database schema

-- First, make sure a default location exists
INSERT INTO locations (location_name, location_code, is_active, is_default)
VALUES ('Main Store', 'MAIN', TRUE, TRUE)
ON CONFLICT (location_code) DO NOTHING;

-- Insert admin user
-- Password: admin123 (bcrypt hashed)
INSERT INTO users (
    username,
    email,
    password_hash,
    first_name,
    last_name,
    role,
    is_active,
    location_id
)
VALUES (
    'admin',
    'admin@hitbyhuma.com',
    '$2a$10$rQnM1v5JX8qVZx1xH9h5D.3Nx6VxmxHxL5q3k1ZvX1JhL5q3k1ZvX',
    'Admin',
    'User',
    'admin',
    TRUE,
    (SELECT location_id FROM locations WHERE is_default = TRUE LIMIT 1)
)
ON CONFLICT (username) DO NOTHING;

-- If you want to set a specific password, use this format:
-- Password will be: admin123
-- You can change it after logging in

-- Alternative: Update password for existing admin (if needed)
-- UPDATE users SET password_hash = '$2a$10$rQnM1v5JX8qVZx1xH9h5D.3Nx6VxmxHxL5q3k1ZvX1JhL5q3k1ZvX' WHERE username = 'admin';
