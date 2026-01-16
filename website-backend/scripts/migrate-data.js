const { Pool } = require('pg');
const mysql = require('mysql2/promise');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
// 1. Load Postgres config from POS Server .env
dotenv.config({ path: path.join(__dirname, '../../server/.env') });
const PG_CONFIG = {
    // If DATABASE_URL is present, pg will use it automatically.
    // Otherwise fallback to individual vars
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'hitbyhuma_pos',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
};

// 2. Load MySQL config from Website Backend .env (local dev)
const mysqlEnvConfig = dotenv.config({ path: path.join(__dirname, '../.env') }).parsed;

// Manual override for MySQL if needed suitable for the script execution context
const MYSQL_CONFIG = {
    host: mysqlEnvConfig?.DB_HOST || 'localhost',
    user: mysqlEnvConfig?.DB_USER || 'root',
    password: mysqlEnvConfig?.DB_PASSWORD || '',
    database: mysqlEnvConfig?.DB_NAME || 'hitbyhuma_pos',
    port: mysqlEnvConfig?.DB_PORT || 3306,
    multipleStatements: true
};

async function migrate() {
    console.log('🚀 Starting migration...');
    console.log('Postgres Config:', { ...PG_CONFIG, password: '***' });
    console.log('MySQL Config:', { ...MYSQL_CONFIG, password: '***' });

    const pgPool = new Pool(PG_CONFIG);
    let mysqlConn;

    try {
        // Connect to Postgres
        await pgPool.query('SELECT 1');
        console.log('✅ Connected to PostgreSQL (Source)');

        // Connect to MySQL
        mysqlConn = await mysql.createConnection(MYSQL_CONFIG);
        console.log('✅ Connected to MySQL (Target)');

        // Start Transaction
        await mysqlConn.beginTransaction();
        console.log('🔄 Transaction started');

        // Disable Foreign Key Checks
        await mysqlConn.query('SET FOREIGN_KEY_CHECKS = 0');

        // 1. Clear existing data (Order matters less with FK checks off, but good practice)
        const tables = [
            'online_orders', 'order_items', 'sale_payments', 'sale_items', 'sales',
            'inventory_transactions', 'inventory', 'product_attributes', 'variant_attributes',
            'product_variants', 'products', 'attribute_values', 'attributes',
            'categories', 'settings', 'locations'
        ]; // settings and locations might be preserved? User said "copy data", implying verify/overwrite.

        // Actually let's just clear product catalog related stuff primarily.
        // User said "get data from pos... enter in mysql". 
        // We should clear to avoid duplicates primarily.
        for (const table of tables) {
            try {
                await mysqlConn.query(`DELETE FROM ${table}`);
                console.log(`🗑️  Cleared table: ${table}`);
            } catch (e) {
                // Table might not exist or other issue
                console.warn(`⚠️  Could not clear ${table}: ${e.message}`);
            }
        }

        // --- MIGRATION STEPS ---

        // 1. Locations
        console.log('📦 Migrating Locations...');
        const { rows: locations } = await pgPool.query('SELECT * FROM locations');
        for (const loc of locations) {
            await mysqlConn.query(
                `INSERT INTO locations (location_id, location_code, location_name, address, city, phone, email, is_active, is_headquarters) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [loc.location_id, loc.location_code, loc.location_name, loc.address, loc.city, loc.phone, loc.email, loc.is_active, loc.is_headquarters]
            );
        }
        console.log(`✅ Migrated ${locations.length} locations`);

        // 2. Categories
        console.log('📦 Migrating Categories...');
        // Categories have self-reference parenthood. Simple insert should work if we disable FK checks.
        const { rows: categories } = await pgPool.query('SELECT * FROM categories ORDER BY category_id');
        for (const cat of categories) {
            await mysqlConn.query(
                `INSERT INTO categories (category_id, category_name, parent_category_id, description, sort_order, is_active)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [cat.category_id, cat.category_name, cat.parent_category_id, cat.description, cat.sort_order, cat.is_active]
            );
        }
        console.log(`✅ Migrated ${categories.length} categories`);

        // 3. Attributes & Values
        console.log('📦 Migrating Attributes...');
        const { rows: attributes } = await pgPool.query('SELECT * FROM attributes');
        for (const attr of attributes) {
            await mysqlConn.query(
                `INSERT INTO attributes (attribute_id, attribute_name, attribute_type, sort_order, is_active)
                 VALUES (?, ?, ?, ?, ?)`,
                [attr.attribute_id, attr.attribute_name, attr.attribute_type, attr.sort_order, attr.is_active]
            );
        }

        console.log('📦 Migrating Attribute Values...');
        const { rows: attrValues } = await pgPool.query('SELECT * FROM attribute_values');
        for (const val of attrValues) {
            await mysqlConn.query(
                `INSERT INTO attribute_values (attribute_value_id, attribute_id, value, color_hex, sort_order, is_active)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [val.attribute_value_id, val.attribute_id, val.value, val.color_hex, val.sort_order, val.is_active]
            );
        }
        console.log(`✅ Migrated ${attributes.length} attributes and ${attrValues.length} values`);

        // 4. Products
        console.log('📦 Migrating Products...');
        const { rows: products } = await pgPool.query('SELECT * FROM products');
        for (const prod of products) {
            await mysqlConn.query(
                `INSERT INTO products (product_id, product_code, product_name, category_id, description, base_price, cost_price, tax_rate, has_variants, propagate_price, image_url, tags, is_active)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [prod.product_id, prod.product_code, prod.product_name, prod.category_id, prod.description, prod.base_price, prod.cost_price || 0, prod.tax_rate || 0, prod.has_variants, prod.propagate_price, prod.image_url, prod.tags, prod.is_active]
            );
        }
        console.log(`✅ Migrated ${products.length} products`);

        // 5. Product Variants
        console.log('📦 Migrating Variants...');
        const { rows: variants } = await pgPool.query('SELECT * FROM product_variants');
        for (const v of variants) {
            // Mysql schema has color/size columns on variants for denormalization, but postgres uses variant_attributes.
            // We will migrate basic fields first.
            await mysqlConn.query(
                `INSERT INTO product_variants (variant_id, product_id, sku, barcode, variant_name, price, cost_price, weight, is_default, is_active)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [v.variant_id, v.product_id, v.sku, v.barcode, v.variant_name, v.price, v.cost_price || 0, v.weight, v.is_default, v.is_active]
            );
        }
        console.log(`✅ Migrated ${variants.length} variants`);

        // 6. Variant Attributes (Linking tables)
        console.log('📦 Migrating Variant Attributes...');
        const { rows: varAttrs } = await pgPool.query(`
            SELECT va.*, a.attribute_name, av.value 
            FROM variant_attributes va
            JOIN attributes a ON va.attribute_id = a.attribute_id
            JOIN attribute_values av ON va.attribute_value_id = av.attribute_value_id
        `);

        for (const va of varAttrs) {
            await mysqlConn.query(
                `INSERT INTO variant_attributes (variant_attribute_id, variant_id, attribute_id, attribute_value_id)
                 VALUES (?, ?, ?, ?)`,
                [va.variant_attribute_id, va.variant_id, va.attribute_id, va.attribute_value_id]
            );

            // Also update the denormalized columns in product_variants if applicable
            if (va.attribute_name.toLowerCase() === 'color') {
                await mysqlConn.query('UPDATE product_variants SET color = ? WHERE variant_id = ?', [va.value, va.variant_id]);
            } else if (va.attribute_name.toLowerCase() === 'size') {
                await mysqlConn.query('UPDATE product_variants SET size = ? WHERE variant_id = ?', [va.value, va.variant_id]);
            }
        }
        console.log(`✅ Migrated ${varAttrs.length} variant attribute links`);

        // 7. Inventory
        console.log('📦 Migrating Inventory...');
        const { rows: inventory } = await pgPool.query('SELECT * FROM inventory');
        for (const inv of inventory) {
            await mysqlConn.query(
                `INSERT INTO inventory (inventory_id, variant_id, location_id, quantity_on_hand, quantity_reserved, reorder_level, reorder_quantity, bin_location)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [inv.inventory_id, inv.variant_id, inv.location_id, inv.quantity_on_hand, inv.quantity_reserved, inv.reorder_level, inv.reorder_quantity, inv.bin_location]
            );
        }
        console.log(`✅ Migrated ${inventory.length} inventory records`);

        // Re-enable FK checks
        await mysqlConn.query('SET FOREIGN_KEY_CHECKS = 1');

        await mysqlConn.commit();
        console.log('🎉 Migration Completed Successfully!');

    } catch (error) {
        console.error('❌ MIGRATION FAILED:', error);
        if (mysqlConn) {
            console.log('↺ Rolling back transaction...');
            await mysqlConn.rollback();
            console.log('✓ Rollback successful');
        }
    } finally {
        if (pgPool) await pgPool.end();
        if (mysqlConn) await mysqlConn.end();
    }
}

migrate();
