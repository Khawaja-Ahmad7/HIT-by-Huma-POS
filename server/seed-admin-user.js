// Seed admin user for local development
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

async function seedAdminUser() {
  const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'hitbyhuma_pos',
    user: 'postgres',
    password: 'JohnWick.98',
  });

  try {
    console.log('🌱 Seeding admin user and initial data...');

    // Hash the password and PIN
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const hashedPin = await bcrypt.hash('1234', 10);

    // Make sure location exists with all required columns
    await pool.query(`
      INSERT INTO locations (
        location_id, location_code, location_name, address, city, 
        phone, email, is_active, is_headquarters
      ) VALUES (
        1, 'MAIN', 'Main Store', '123 Main St', 'City',
        '0000000000', 'main@hitbyhuma.com', true, true
      )
      ON CONFLICT (location_id) DO NOTHING
    `);
    console.log('✅ Default location ensured');

    // Make sure admin role exists (role_id 1 is usually admin)
    await pool.query(`
      INSERT INTO roles (role_id, role_name, description)
      VALUES (1, 'Administrator', 'Full system access')
      ON CONFLICT (role_id) DO NOTHING
    `);
    console.log('✅ Admin role ensured');

    // Insert admin user
    const userResult = await pool.query(`
      INSERT INTO users (
        employee_code, first_name, last_name, email, phone, 
        password_hash, pin_hash, role_id, default_location_id, is_active
      ) VALUES (
        'ADMIN001', 'Admin', 'User', 'admin@hitbyhuma.com', '0000000000',
        $1, $2, 1, 1, true
      )
      ON CONFLICT (employee_code) DO NOTHING
      RETURNING user_id
    `, [hashedPassword, hashedPin]);

    if (userResult.rows.length > 0) {
      console.log('✅ Admin user created successfully!');
      console.log('   Employee Code: ADMIN001');
      console.log('   Password: admin123');
      console.log('   PIN: 1234');
    } else {
      console.log('ℹ️  Admin user already exists');
    }

    await pool.end();
    console.log('\n🎉 Seeding complete! You can now login with ADMIN001 / admin123');
  } catch (error) {
    console.error('❌ Error seeding database:', error.message);
    console.error(error);
    process.exit(1);
  }
}

seedAdminUser();
