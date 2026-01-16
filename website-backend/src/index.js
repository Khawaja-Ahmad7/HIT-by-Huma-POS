require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const db = require('./config/database');
const productsRoutes = require('./routes/products');
const ordersRoutes = require('./routes/orders');

const app = express();

// Security middleware
app.use(helmet());
app.use(express.json());

// CORS - Allow frontend
// CORS - Allow frontend
const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://hitbyhuma.com',
    'https://www.hitbyhuma.com',
    process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin) || origin.endsWith('hitbyhuma.com')) {
            callback(null, true);
        } else {
            callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
    },
    credentials: true
}));

// Rate limiting
// Main Router to handle base path issues
const router = express.Router();

// API Routes attached to router (removed /api prefix as we will mount the router at /api)
router.use('/products', productsRoutes);
router.use('/orders', ordersRoutes);

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: { error: 'Too many requests' },
    standardHeaders: true,
    legacyHeaders: false,
});
router.use('/', limiter);

// Health check
router.get('/health', async (req, res) => {
    let dbStatus = 'unknown';
    try {
        const pool = db.getPool();
        await pool.query('SELECT 1');
        dbStatus = 'connected';
    } catch (error) {
        dbStatus = 'disconnected: ' + error.message;
    }

    res.json({
        status: 'running',
        timestamp: new Date().toISOString(),
        database: dbStatus
    });
});

// Mount the router at /api (standard) and /website_api (legacy/cpanel)
// This ensures that /api/health and /api/products work correctly
app.use('/api', router);
app.use('/website_api', router);

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Error:', err.message);
    res.status(err.status || 500).json({
        error: err.message || 'Internal server error'
    });
});

// Start server
const PORT = process.env.PORT || 4000;

const startServer = async () => {
    try {
        await db.connect();

        app.listen(PORT, () => {
            console.log(`🚀 Website Backend running on port ${PORT}`);
            console.log(`📡 API available at http://localhost:${PORT}/api`);
        });
    } catch (error) {
        console.error('Failed to start server:', error.message);
        process.exit(1);
    }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received. Shutting down...');
    await db.close();
    process.exit(0);
});

startServer();
