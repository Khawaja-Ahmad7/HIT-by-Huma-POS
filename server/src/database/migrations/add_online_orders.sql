-- =============================================
-- Online Orders Schema for E-Commerce Integration
-- Version: 1.0.0
-- =============================================

-- Order status enum
DO $$ BEGIN
    CREATE TYPE order_status AS ENUM ('pending', 'confirmed', 'processing', 'ready', 'completed', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Order source enum  
DO $$ BEGIN
    CREATE TYPE order_source AS ENUM ('POS', 'WEBSITE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Online Orders Table
CREATE TABLE IF NOT EXISTS online_orders (
    order_id SERIAL PRIMARY KEY,
    order_number VARCHAR(50) NOT NULL UNIQUE,
    source order_source NOT NULL DEFAULT 'WEBSITE',
    status order_status NOT NULL DEFAULT 'pending',
    
    -- Customer Info (not linked to POS customers table)
    customer_name VARCHAR(100) NOT NULL,
    customer_phone VARCHAR(20) NOT NULL,
    customer_email VARCHAR(100),
    customer_address TEXT,
    customer_city VARCHAR(100),
    
    -- Order Totals
    subtotal DECIMAL(18,2) NOT NULL,
    discount_amount DECIMAL(18,2) DEFAULT 0,
    delivery_fee DECIMAL(18,2) DEFAULT 0,
    total_amount DECIMAL(18,2) NOT NULL,
    
    -- Processing Info
    notes TEXT,
    processed_by INT REFERENCES users(user_id),
    processed_at TIMESTAMP,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Order Items Table
CREATE TABLE IF NOT EXISTS order_items (
    order_item_id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES online_orders(order_id) ON DELETE CASCADE,
    variant_id INT NOT NULL REFERENCES product_variants(variant_id),
    product_name VARCHAR(200) NOT NULL,
    variant_name VARCHAR(200),
    quantity INT NOT NULL,
    unit_price DECIMAL(18,2) NOT NULL,
    line_total DECIMAL(18,2) NOT NULL,
    notes VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_online_orders_status ON online_orders(status);
CREATE INDEX IF NOT EXISTS idx_online_orders_source ON online_orders(source);
CREATE INDEX IF NOT EXISTS idx_online_orders_date ON online_orders(created_at);
CREATE INDEX IF NOT EXISTS idx_online_orders_phone ON online_orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_variant ON order_items(variant_id);
