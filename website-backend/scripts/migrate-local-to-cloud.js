const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables for LOCAL (Source)
dotenv.config({ path: path.join(__dirname, '../.env') });

// Configuration
const SOURCE_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'hitbyhuma_pos',
    port: process.env.DB_PORT || 3306
};

// Target Config (Cloud cPanel)
const TARGET_CONFIG = {
    host: 'hitbyhuma.com',
    user: 'hitbyhuma_admin',
    password: 'Ahmad@03173643005',
    database: 'hitbyhuma_pos',
    port: 3306,
    multipleStatements: true
};

async function migrate() {
    console.log('🚀 Starting Local MySQL -> Cloud MySQL Migration...');
    console.log('Source (Local):', { ...SOURCE_CONFIG, password: '***' });
    console.log('Target (Cloud):', { ...TARGET_CONFIG, password: '***' });

    let sourceConn, targetConn;

    try {
        // Connect to Source
        sourceConn = await mysql.createConnection(SOURCE_CONFIG);
        console.log('✅ Connected to Local MySQL');

        // Connect to Target
        try {
            targetConn = await mysql.createConnection(TARGET_CONFIG);
            console.log('✅ Connected to Cloud MySQL');
        } catch (e) {
            console.error('❌ Failed to connect to Cloud MySQL. Ensure your IP is allowed in "Remote MySQL" in cPanel.');
            throw e;
        }

        // Start Transaction on Target
        await targetConn.beginTransaction();
        console.log('🔄 Transaction started on Cloud');

        // Disable Foreign Key Checks on Target
        await targetConn.query('SET FOREIGN_KEY_CHECKS = 0');

        const tables = [
            'online_orders', 'order_items', 'sale_payments', 'sale_items', 'sales',
            'inventory_transactions', 'inventory', 'product_attributes', 'variant_attributes',
            'product_variants', 'products', 'attribute_values', 'attributes',
            'categories', 'settings', 'locations'
        ];

        // 1. Clear Target Tables
        for (const table of tables) {
            try {
                await targetConn.query(`DELETE FROM ${table}`);
                console.log(`🗑️  Cleared Cloud table: ${table}`);
            } catch (e) {
                console.warn(`⚠️  Could not clear ${table}: ${e.message}`);
            }
        }

        // 2. Migrate Data
        for (const table of tables) {
            console.log(`📦 Migrating ${table}...`);

            // Read from Source
            const [rows] = await sourceConn.query(`SELECT * FROM ${table}`);

            if (rows.length === 0) {
                console.log(`   - No data in ${table}, skipping.`);
                continue;
            }

            // Write to Target
            // Generate dynamic INSERT statement based on first row keys
            const keys = Object.keys(rows[0]);
            const columns = keys.map(k => `\`${k}\``).join(', ');
            const placeholders = keys.map(() => '?').join(', ');

            const insertQuery = `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`;

            let count = 0;
            for (const row of rows) {
                const values = keys.map(k => row[k]);
                await targetConn.query(insertQuery, values);
                count++;
            }
            console.log(`   ✅ Migrated ${count} rows to ${table}`);
        }

        // Re-enable FK checks
        await targetConn.query('SET FOREIGN_KEY_CHECKS = 1');
        await targetConn.commit();
        console.log('🎉 MIGRATION SUCCESSFUL! Cloud database is now synced.');

    } catch (error) {
        console.error('❌ MIGRATION FAILED:', error);
        if (targetConn) {
            console.log('↺ Rolling back transaction...');
            await targetConn.rollback();
        }
    } finally {
        if (sourceConn) await sourceConn.end();
        if (targetConn) await targetConn.end();
    }
}

migrate();
