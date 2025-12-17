const sql = require('mssql');
const logger = require('../utils/logger');

// Cloud deployment uses SQL Server Authentication only
// Windows Authentication (msnodesqlv8) is not available on Linux servers
const config = {
  server: process.env.DB_SERVER || 'localhost',
  port: parseInt(process.env.DB_PORT) || 1433,
  database: process.env.DB_NAME || 'HitByHumaPOS',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || '',
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE !== 'false',
    enableArithAbort: true,
  },
  pool: {
    max: 20,
    min: 5,
    idleTimeoutMillis: 30000,
    acquireTimeoutMillis: 30000,
  },
};

let pool = null;

const connect = async () => {
  try {
    pool = await sql.connect(config);
    logger.info('Connected to SQL Server database');
    return pool;
  } catch (error) {
    logger.error('Database connection failed:', error);
    throw error;
  }
};

const close = async () => {
  try {
    if (pool) {
      await pool.close();
      logger.info('Database connection closed');
    }
  } catch (error) {
    logger.error('Error closing database connection:', error);
    throw error;
  }
};

const getPool = () => {
  if (!pool) {
    throw new Error('Database not connected. Call connect() first.');
  }
  return pool;
};

// Transaction helper
const transaction = async (callback) => {
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const result = await callback(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

// Query helper with automatic parameter binding
const query = async (queryString, params = {}) => {
  const request = pool.request();
  
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      request.input(key, sql.NVarChar, null);
    } else if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        request.input(key, sql.Int, value);
      } else {
        request.input(key, sql.Decimal(18, 2), value);
      }
    } else if (typeof value === 'boolean') {
      request.input(key, sql.Bit, value);
    } else if (value instanceof Date) {
      request.input(key, sql.DateTime2, value);
    } else {
      request.input(key, sql.NVarChar, value);
    }
  });
  
  return request.query(queryString);
};

module.exports = {
  sql,
  pool: { request: () => pool?.request() },
  connect,
  close,
  getPool,
  transaction,
  query,
};
