-- Add unique constraint to category_name in categories table
ALTER TABLE categories ADD CONSTRAINT categories_category_name_unique UNIQUE (category_name);
