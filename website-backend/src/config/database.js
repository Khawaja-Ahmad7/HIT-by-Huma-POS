const mysql = require('mysql2/promise');

// MySQL configuration for cPanel hosting
const config = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    database: process.env.DB_NAME || 'hitbyhuma_pos',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
};

let pool = null;

const connect = async () => {
    try {
        pool = mysql.createPool(config);

        // Test connection
        const connection = await pool.getConnection();
        await connection.query('SELECT 1');
        connection.release();

        console.log('✅ Connected to MySQL database');
        return pool;
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        throw error;
    }
};

const getPool = () => {
    if (!pool) {
        throw new Error('Database not connected. Call connect() first.');
    }
    return pool;
};

const close = async () => {
    if (pool) {
        await pool.end();
        console.log('Database connection closed');
    }
};

// Query helper - compatible with existing code structure
const query = async (sql, params = []) => {
    const [rows] = await pool.query(sql, params);
    return rows;
};

module.exports = {
    connect,
    getPool,
    close,
    query,
};
