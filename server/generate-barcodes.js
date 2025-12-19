// Generate barcodes for existing products without barcodes
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

function generateBarcodeFromSKU(sku) {
  // Generate a numeric barcode: timestamp component + hash of SKU
  // This creates a unique 13-digit EAN-like barcode
  const timestamp = Date.now().toString().slice(-7);
  let hash = 0;
  for (let i = 0; i < sku.length; i++) {
    hash = ((hash << 5) - hash) + sku.charCodeAt(i);
    hash = hash & hash;
  }
  const hashStr = Math.abs(hash).toString().padStart(6, '0').slice(0, 6);
  return timestamp + hashStr;
}

async function generateBarcodes() {
  try {
    console.log('Connecting to database...');
    
    // Get all product variants without barcodes
    const result = await pool.query(`
      SELECT pv.variant_id, pv.sku, pv.barcode, p.product_name
      FROM product_variants pv
      INNER JOIN products p ON pv.product_id = p.product_id
      WHERE pv.barcode IS NULL OR pv.barcode = ''
    `);
    
    console.log(`Found ${result.rows.length} products without barcodes\n`);
    
    if (result.rows.length === 0) {
      console.log('All products already have barcodes!');
      
      // Show existing barcodes
      const existing = await pool.query(`
        SELECT pv.variant_id, pv.sku, pv.barcode, p.product_name
        FROM product_variants pv
        INNER JOIN products p ON pv.product_id = p.product_id
        ORDER BY pv.variant_id
      `);
      console.log('\nExisting barcodes:');
      existing.rows.forEach(row => {
        console.log(`  ${row.product_name} (${row.sku}): ${row.barcode}`);
      });
      
      await pool.end();
      return;
    }
    
    // Generate and update barcodes
    let updated = 0;
    for (const row of result.rows) {
      const sku = row.sku || `VAR${row.variant_id}`;
      const newBarcode = generateBarcodeFromSKU(sku);
      
      await pool.query(
        'UPDATE product_variants SET barcode = $1 WHERE variant_id = $2',
        [newBarcode, row.variant_id]
      );
      
      console.log(`✓ ${row.product_name} (${sku}): ${newBarcode}`);
      updated++;
    }
    
    console.log(`\n✅ Generated barcodes for ${updated} products!`);
    
    // Show all barcodes now
    const allProducts = await pool.query(`
      SELECT pv.variant_id, pv.sku, pv.barcode, p.product_name
      FROM product_variants pv
      INNER JOIN products p ON pv.product_id = p.product_id
      ORDER BY pv.variant_id
    `);
    
    console.log('\n📦 All Product Barcodes:');
    console.log('─'.repeat(60));
    allProducts.rows.forEach(row => {
      console.log(`  ${row.product_name.padEnd(25)} | SKU: ${(row.sku || 'N/A').padEnd(15)} | Barcode: ${row.barcode}`);
    });
    console.log('─'.repeat(60));
    
    await pool.end();
    console.log('\nDone!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

generateBarcodes();
