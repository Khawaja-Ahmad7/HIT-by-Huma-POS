require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

async function createAdmin() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        // Hash password
        const passwordHash = await bcrypt.hash('admin123', 10);

        // Create admin user
        const result = await pool.query(`
      INSERT INTO employees (employee_code, first_name, last_name, role, password_hash, location_id, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (employee_code) 
      DO UPDATE SET password_hash = $5
      RETURNING employee_id, employee_code, first_name, role
    `, ['admin001', 'Admin', 'User', 'admin', passwordHash, 1, true]);

        console.log('✅ Admin user created/updated:', result.rows[0]);
        console.log('\nYou can now login with:');
        console.log('Employee Code: admin001');
        console.log('Password: admin123');

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

createAdmin();
