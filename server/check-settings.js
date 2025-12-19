const { Pool } = require('pg');

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL, 
  ssl: { rejectUnauthorized: false } 
});

async function run() {
  try {
    // Get threshold
    const threshold = await pool.query('SELECT setting_value FROM settings WHERE setting_key = $1', ['low_stock_threshold']);
    console.log('Threshold:', threshold.rows[0]?.setting_value);
    
    // Get inventory with threshold applied
    const inv = await pool.query(`
      SELECT p.product_name, i.quantity_on_hand, 
             CASE WHEN i.quantity_on_hand > 0 AND i.quantity_on_hand <= $1 THEN 'Low Stock'
                  WHEN i.quantity_on_hand <= 0 THEN 'Out of Stock'
                  ELSE 'In Stock' END as status
      FROM inventory i
      JOIN product_variants pv ON i.variant_id = pv.variant_id
      JOIN products p ON pv.product_id = p.product_id
    `, [parseInt(threshold.rows[0]?.setting_value) || 10]);
    console.log('Inventory with status:', inv.rows);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

run();
