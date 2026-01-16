require('dotenv').config();
const db = require('../config/database');

async function migrate() {
  console.log('🚀 Starting database migration check...');

  // Since we are switching to MySQL and the database schema is managed 
  // by the Website Backend (which shares the same DB), we will skip 
  // executing the old PostgreSQL schema file.

  try {
    const pool = db.getPool();
    // Simple verification query
    await pool.query('SELECT 1');
    console.log('✅ Connected to Database (Migration skipped for MySQL compatibility)');
  } catch (error) {
    console.error('⚠️ Database check during migration failed:', error.message);
    // Don't throw, let the main connection logic handle it
  }
}

// Run if called directly
if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = migrate;
