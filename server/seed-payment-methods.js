// Seed payment methods for PostgreSQL
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function seedPaymentMethods() {
  try {
    console.log('Connecting to database...');

    // Check if payment_methods table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'payment_methods'
      )
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('Creating payment_methods table...');
      await pool.query(`
        CREATE TABLE payment_methods (
          payment_method_id SERIAL PRIMARY KEY,
          method_name VARCHAR(50) NOT NULL,
          method_type VARCHAR(20) NOT NULL,
          is_active BOOLEAN DEFAULT true,
          requires_reference BOOLEAN DEFAULT false,
          opens_cash_drawer BOOLEAN DEFAULT false,
          sort_order INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }

    // Check if data exists
    const existingCheck = await pool.query('SELECT COUNT(*) FROM payment_methods');

    if (parseInt(existingCheck.rows[0].count) > 0) {
      console.log('Payment methods already exist:', existingCheck.rows[0].count);
      const methods = await pool.query('SELECT * FROM payment_methods ORDER BY sort_order');
      console.log('Current payment methods:', methods.rows);
    } else {
      console.log('Inserting payment methods...');
      await pool.query(`
        INSERT INTO payment_methods (method_name, method_type, is_active, requires_reference, opens_cash_drawer, sort_order) VALUES
        ('Cash', 'CASH', true, false, true, 1),
        ('Credit Card', 'CARD', true, true, false, 2),
        ('Debit Card', 'CARD', true, true, false, 3),
        ('Store Credit', 'WALLET', true, false, false, 4),
        ('JazzCash', 'ONLINE', true, true, false, 5),
        ('EasyPaisa', 'ONLINE', true, true, false, 6)
      `);
      console.log('Payment methods inserted successfully!');

      const methods = await pool.query('SELECT * FROM payment_methods ORDER BY sort_order');
      console.log('Inserted payment methods:', methods.rows);
    }

    await pool.end();
    console.log('Done!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

seedPaymentMethods();
