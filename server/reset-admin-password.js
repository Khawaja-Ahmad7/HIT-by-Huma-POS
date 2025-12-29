const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

(async () => {
    const pool = new Pool({
        host: 'localhost',
        port: 5432,
        database: 'hitbyhuma_pos',
        user: 'postgres',
        password: 'JohnWick.98',
    });

    console.log('🔐 Resetting ADMIN001 password to: admin123');

    // Hash the new password
    const newPasswordHash = await bcrypt.hash('admin123', 10);

    // Update the password
    await pool.query(
        `UPDATE users SET password_hash = $1 WHERE employee_code = $2`,
        [newPasswordHash, 'ADMIN001']
    );

    console.log('✅ Password updated successfully!');
    console.log('\nYou can now login with:');
    console.log('  Employee Code: ADMIN001');
    console.log('  Password: admin123');

    await pool.end();
})();
