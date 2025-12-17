const sql = require('mssql');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const config = {
  server: process.env.DB_SERVER,
  port: parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: { encrypt: false, trustServerCertificate: true }
};

async function updatePassword() {
  try {
    const hash = await bcrypt.hash('admin123', 10);
    console.log('New hash generated:', hash);
    
    const pool = await sql.connect(config);
    
    await pool.request()
      .input('hash', sql.NVarChar, hash)
      .input('code', sql.NVarChar, 'ADMIN001')
      .query('UPDATE Users SET PasswordHash = @hash WHERE EmployeeCode = @code');
    
    console.log('Password updated in database!');
    
    // Verify
    const result = await pool.request()
      .input('code', sql.NVarChar, 'ADMIN001')
      .query('SELECT PasswordHash FROM Users WHERE EmployeeCode = @code');
    
    const storedHash = result.recordset[0].PasswordHash;
    const isValid = await bcrypt.compare('admin123', storedHash);
    console.log('Verification - Password "admin123" matches:', isValid);
    
    if (isValid) {
      console.log('\n✅ SUCCESS! You can now login with:');
      console.log('   Employee Code: ADMIN001');
      console.log('   Password: admin123');
    }
    
    await sql.close();
  } catch (err) {
    console.error('Error:', err);
  }
}

updatePassword();
