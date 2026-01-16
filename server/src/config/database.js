const mysql = require('mysql2/promise');
const logger = require('../utils/logger');

// MySQL Configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'hitbyhuma_pos',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // Keep connection alive
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
};

let pool = null;

const connect = async () => {
  try {
    logger.info('Connecting to MySQL database...', {
      host: dbConfig.host,
      database: dbConfig.database
    });

    pool = mysql.createPool(dbConfig);

    // Test connection
    const [rows] = await pool.query('SELECT 1');

    logger.info('Connected to MySQL database');
    return pool;
  } catch (error) {
    logger.error('Database connection failed:', error);
    throw error;
  }
};

const close = async () => {
  try {
    if (pool) {
      await pool.end();
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
  const connection = await pool.getConnection();

  // Wrap the connection to intercept query calls for param conversion
  const wrappedConnection = {
    ...connection,
    query: async (queryString, params) => {
      // Reuse the conversion logic from the main query function
      // Only simpler because we know we have a connection

      let convertedQuery = queryString;
      const paramValues = [];

      if (params && typeof params === 'object' && !Array.isArray(params)) {
        convertedQuery = queryString.replace(/@([a-zA-Z0-9_]+)/g, (match, paramName) => {
          if (params[paramName] === undefined) {
            return match;
          }
          paramValues.push(params[paramName]);
          return '?';
        });
      } else if (Array.isArray(params)) {
        if (convertedQuery.match(/\$[0-9]+/)) {
          const newParams = [];
          convertedQuery = convertedQuery.replace(/\$([0-9]+)/g, (match, index) => {
            const arrayIndex = parseInt(index) - 1;
            if (arrayIndex >= 0 && arrayIndex < params.length) {
              newParams.push(params[arrayIndex]);
              return '?';
            }
            return match;
          });
          paramValues.push(...newParams);
        } else {
          paramValues.push(...params);
        }
      }

      const [rows, fields] = await connection.query(convertedQuery, paramValues);
      return {
        recordset: rows,
        recordsets: [rows],
        rowsAffected: [rows.affectedRows || (Array.isArray(rows) ? rows.length : 0)],
        rows // Expose original rows as well for access methods that expect it
      };
    },
    // Proxy other methods (commit, rollback, release)
    commit: () => connection.commit(),
    rollback: () => connection.rollback(),
    release: () => connection.release(),
  };

  try {
    await connection.beginTransaction();
    const result = await callback(wrappedConnection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// Query helper - converts @param syntax to ? for MySQL
// This maintains compatibility with existing code that uses named parameters
const query = async (queryString, params = {}) => {
  if (!pool) await connect();

  let convertedQuery = queryString;
  const paramValues = [];

  // If params is an object (named parameters), convert to positional (?)
  if (params && typeof params === 'object' && !Array.isArray(params)) {
    // Find all @param matches
    const matches = queryString.match(/@[a-zA-Z0-9_]+/g) || [];

    // Remove duplicates and keep order
    // Actually, we need to replace each occurrence with ? and push corresponding value

    // Better strategy: Replace matches iteratively
    // Note: This simple regex might be fragile if @param is inside string literals,
    // but for this codebase's specific usage it should be fine.

    // We need to process the query and replace @key with ? AND build the values array in order
    // But the previous implementation assumed specific parameter replacement order? 
    // No, Postgres uses $1, $2, so order mattered there too.

    // Let's look at how the previous code did it:
    // It iterated over Object.keys(params) and replaced @name with $index.
    // For MySQL, we need strictly positional placeholders `?`.
    // So we need to:
    // 1. Identify all unique parameters used in the query.
    // 2. OR, more robustly: Parse string, finding @param, replace with ?, push params[param] to array.

    convertedQuery = queryString.replace(/@([a-zA-Z0-9_]+)/g, (match, paramName) => {
      if (params[paramName] === undefined) {
        logger.warn(`Parameter @${paramName} found in query but missing in params object`);
        return match; // Leave it if missing (will likely error in SQL)
      }
      paramValues.push(params[paramName]);
      return '?';
    });

  } else if (Array.isArray(params)) {
    // Check for Postgres style $1, $2 placeholders
    if (convertedQuery.match(/\$[0-9]+/)) {
      const newParams = [];
      // Replace $1, $2 with ? and reorder params
      convertedQuery = convertedQuery.replace(/\$([0-9]+)/g, (match, index) => {
        // $1 is index 0 in the array
        const arrayIndex = parseInt(index) - 1;
        if (arrayIndex >= 0 && arrayIndex < params.length) {
          newParams.push(params[arrayIndex]);
          return '?';
        }
        return match; // Leave invalid placeholders (will likely error)
      });
      // Replace paramValues handling
      paramValues.push(...newParams);
    } else {
      // Already positional and using ? (or no params)
      paramValues.push(...params);
    }
  }

  try {
    const [rows, fields] = await pool.query(convertedQuery, paramValues);

    // Return in format expected by existing code (mssql/pg wrapper style)
    // recordset: array of rows
    // rowsAffected: array containing affectedRows count
    return {
      recordset: rows,
      recordsets: [rows],
      rowsAffected: [rows.affectedRows || (Array.isArray(rows) ? rows.length : 0)],
      // Compatibility aliases
      rows: Array.isArray(rows) ? rows : [],
      rowCount: Array.isArray(rows) ? rows.length : rows.affectedRows || 0,
      insertId: rows.insertId // For MySQL INSERTs
    };
  } catch (error) {
    logger.error('Query failed:', { query: convertedQuery, error: error.message });
    throw error;
  }
};

// Compatibility layer for mssql-style pool.request()
const request = () => {
  const inputs = {};

  const req = {
    input: function (name, typeOrValue, value) {
      inputs[name] = value !== undefined ? value : typeOrValue;
      return req;
    },
    query: async function (queryString) {
      return query(queryString, inputs);
    },
  };

  return req;
};

module.exports = {
  pool: {
    request,
    query: (q, p) => query(q, p),
  },
  connect,
  close,
  getPool,
  transaction,
  query,
};
