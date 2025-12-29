// Reset staff password to 'password123'
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./src/config/database');

async function resetPassword() {
    try {
        await db.connect();
        const pool = db.getPool();

        const newPassword = 'password123';
        const hashedPassword = await bcrypt.hash(newPassword, 12);

        console.log('\n🔐 Resetting passwords for staff users...\n');

        // Update password for staff users
        const result = await pool.query(`
      UPDATE users 
      SET password_hash = $1,
          employee_code = UPPER(employee_code)
      WHERE employee_code ILIKE 'staff%'
      RETURNING user_id, employee_code, first_name
    `, [hashedPassword]);

        console.log(`✅ Updated ${result.rows.length} users:\n`);
        result.rows.forEach(u => {
            console.log(`  - Employee Code: ${u.employee_code}`);
            console.log(`    Password: ${newPassword}`);
            console.log('');
        });

        // Verify the users
        const users = await pool.query(`
      SELECT u.employee_code, u.first_name, r.role_name, u.is_active
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.role_id
      WHERE u.employee_code ILIKE 'staff%'
    `);

        console.log('📋 Staff users summary:');
        users.rows.forEach(u => {
            console.log(`  ${u.employee_code}: ${u.first_name} (${u.role_name}) - Active: ${u.is_active}`);
        });

        process.exit(0);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

resetPassword();
