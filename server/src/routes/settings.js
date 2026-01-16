const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticate);

// Get all settings
router.get('/', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT * FROM settings ORDER BY setting_key`
    );

    // Convert to key-value object
    const settings = {};
    const rows = result.rows || result.recordset || [];
    rows.forEach(s => {
      settings[s.setting_key] = {
        value: s.setting_value,
        type: s.setting_type,
        description: s.description,
        isPublic: s.is_public
      };
    });

    res.json(settings);
  } catch (error) {
    next(error);
  }
});

// Get all locations (MUST be before /:key to prevent interception)
router.get('/locations/all', async (req, res, next) => {
  try {
    const pool = db;
    const result = await pool.query(
      `SELECT * FROM locations ORDER BY location_name`
    );
    res.json(result.rows || []);
  } catch (error) {
    next(error);
  }
});

// Create location (MUST be before /:key)
router.post('/locations', authorize('settings'), async (req, res, next) => {
  try {
    const { locationCode, locationName, address, city, phone, email } = req.body;

    if (!locationCode || !locationName) {
      return res.status(400).json({ error: 'Location code and name are required' });
    }

    const pool = db;
    const result = await pool.query(
      `INSERT INTO locations (location_code, location_name, address, city, phone, email)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [locationCode, locationName, address || null, city || null, phone || null, email || null]
    );

    const newLocation = await pool.query('SELECT * FROM locations WHERE location_id = ?', [result.insertId]);
    res.status(201).json(newLocation.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Update location (MUST be before /:key)
router.put('/locations/:id', authorize('settings'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { locationCode, locationName, address, city, phone, email, isActive } = req.body;

    if (!locationCode || !locationName) {
      return res.status(400).json({ error: 'Location code and name are required' });
    }

    const pool = db;
    const result = await pool.query(
      `UPDATE locations 
       SET location_code = $1, location_name = $2, address = $3, city = $4, phone = $5, email = $6, 
           is_active = COALESCE($7, is_active), updated_at = CURRENT_TIMESTAMP
       WHERE location_id = $8`,
      [locationCode, locationName, address || null, city || null, phone || null, email || null, isActive, parseInt(id)]
    );

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }

    const updated = await pool.query('SELECT * FROM locations WHERE location_id = ?', [parseInt(id)]);
    res.json(updated.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Get setting by key
router.get('/:key', async (req, res, next) => {
  try {
    const { key } = req.params;

    // Use pool directly for positional parameters
    const pool = db;
    const result = await pool.query(
      `SELECT * FROM settings WHERE setting_key = $1`,
      [key]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Setting not found');
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Update setting
router.put('/:key', authorize('settings'), async (req, res, next) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    // Use pool directly for positional parameters
    const pool = db;

    // Try to update first
    const updateResult = await pool.query(
      `UPDATE settings SET setting_value = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP
       WHERE setting_key = $3`,
      [String(value), req.user.user_id, key]
    );

    if (updateResult.rowsAffected[0] === 0) {
      // Insert if not exists
      await pool.query(
        `INSERT INTO settings (setting_key, setting_value, updated_by) VALUES ($1, $2, $3)`,
        [key, String(value), req.user.user_id]
      );
    }

    console.log('Setting updated:', { key, value, userId: req.user.user_id });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Get all users
router.get('/users/all', authorize('settings'), async (req, res, next) => {
  try {
    const pool = db;
    const result = await pool.query(
      `SELECT u.user_id, u.employee_code, u.email, u.first_name, u.last_name, u.phone, 
              u.is_active, u.last_login, u.created_at,
              r.role_name, l.location_name
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.role_id
       LEFT JOIN locations l ON u.default_location_id = l.location_id
       ORDER BY u.first_name`
    );
    console.log('Users found:', result.rows?.length || 0);
    res.json(result.rows || []);
  } catch (error) {
    console.error('Get users error:', error);
    next(error);
  }
});

// Create user
router.post('/users', authorize('settings'), [
  body('employeeCode').notEmpty(),
  body('firstName').notEmpty(),
  body('password').isLength({ min: 6 }),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    const { employeeCode, email, password, firstName, lastName, phone, roleId, locationId } = req.body;

    // Check if employee code already exists
    const existing = await db.query(
      `SELECT user_id FROM users WHERE employee_code = $1`,
      [employeeCode]
    );

    const existingRows = existing.rows || existing.recordset || [];
    if (existingRows.length > 0) {
      throw new ValidationError('Employee code already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const result = await db.query(
      `INSERT INTO users (employee_code, email, password_hash, first_name, last_name, phone, role_id, default_location_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [employeeCode, email || null, hashedPassword, firstName, lastName || null, phone || null, roleId || 3, locationId || 1]
    );

    const newUser = await db.query('SELECT user_id, employee_code, email, first_name, last_name FROM users WHERE user_id = ?', [result.insertId]);
    res.status(201).json(newUser.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Get all roles
router.get('/roles/all', async (req, res, next) => {
  try {
    const pool = db;
    const result = await pool.query(
      `SELECT role_id, role_name, description, permissions FROM roles WHERE is_active = true ORDER BY role_name`
    );
    res.json(result.rows || []);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
