const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticate);

// Get all customers
router.get('/', async (req, res, next) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE is_active = true';
    const params = { limit: parseInt(limit), offset };

    if (search) {
      whereClause += ' AND (phone LIKE @search OR first_name LIKE @search OR last_name LIKE @search)';
      params.search = `%${search}%`;
    }

    const result = await db.query(
      `SELECT * FROM customers ${whereClause} ORDER BY first_name LIMIT @limit OFFSET @offset`,
      params
    );

    res.json({ customers: result.recordset });
  } catch (error) {
    next(error);
  }
});

// Lookup customer by phone
router.get('/lookup/:phone', async (req, res, next) => {
  try {
    const { phone } = req.params;

    const result = await db.query(
      `SELECT * FROM customers WHERE phone = @phone AND is_active = true`,
      { phone }
    );

    if (result.recordset.length === 0) {
      return res.json({ found: false });
    }

    res.json({ found: true, customer: result.recordset[0] });
  } catch (error) {
    next(error);
  }
});

// Get customer by ID
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const customerResult = await db.query(
      `SELECT * FROM customers WHERE customer_id = @id`,
      { id: parseInt(id) }
    );

    if (customerResult.recordset.length === 0) {
      throw new NotFoundError('Customer not found');
    }

    // Get recent purchases
    const purchasesResult = await db.query(
      `SELECT s.*, l.location_name
       FROM sales s
       INNER JOIN locations l ON s.location_id = l.location_id
       WHERE s.customer_id = @id AND s.status = 'completed'
       ORDER BY s.created_at DESC
       LIMIT 10`,
      { id: parseInt(id) }
    );

    res.json({
      customer: customerResult.recordset[0],
      recentPurchases: purchasesResult.recordset
    });
  } catch (error) {
    next(error);
  }
});

// Get purchase items
router.get('/:customerId/purchases/:saleId/items', async (req, res, next) => {
  try {
    const { saleId } = req.params;

    const result = await db.query(
      `SELECT si.*, pv.sku, pv.variant_name, p.product_name
       FROM sale_items si
       INNER JOIN product_variants pv ON si.variant_id = pv.variant_id
       INNER JOIN products p ON pv.product_id = p.product_id
       WHERE si.sale_id = @saleId`,
      { saleId: parseInt(saleId) }
    );

    res.json(result.recordset);
  } catch (error) {
    next(error);
  }
});

// Create customer
router.post('/', [
  body('phone').notEmpty(),
  body('firstName').notEmpty(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    const { phone, firstName, lastName, email, address, city, notes } = req.body;

    // Check if phone already exists
    const existing = await db.query(
      `SELECT customer_id FROM customers WHERE phone = @phone`,
      { phone }
    );

    if (existing.recordset.length > 0) {
      throw new ValidationError('Phone number already registered');
    }

    const result = await db.query(
      `INSERT INTO customers (phone, first_name, last_name, email, address, city, notes)
       VALUES (@phone, @firstName, @lastName, @email, @address, @city, @notes)`,
      { phone, firstName, lastName: lastName || null, email: email || null, address: address || null, city: city || null, notes: notes || null }
    );

    // Fetch created customer
    const newCustomer = await db.query('SELECT * FROM customers WHERE customer_id = @id', { id: result.insertId });
    res.status(201).json(newCustomer.recordset[0]);
  } catch (error) {
    next(error);
  }
});

// Update customer
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { phone, firstName, lastName, email, address, city, notes } = req.body;

    const result = await db.query(
      `UPDATE customers SET
        phone = COALESCE(@phone, phone),
        first_name = COALESCE(@firstName, first_name),
        last_name = COALESCE(@lastName, last_name),
        email = COALESCE(@email, email),
        address = COALESCE(@address, address),
        city = COALESCE(@city, city),
        notes = COALESCE(@notes, notes),
        updated_at = CURRENT_TIMESTAMP
       WHERE customer_id = @id`,
      { id: parseInt(id), phone, firstName, lastName, email, address, city, notes }
    );

    if (result.rowsAffected[0] === 0) {
      throw new NotFoundError('Customer not found');
    }

    // Fetch updated customer
    const updated = await db.query('SELECT * FROM customers WHERE customer_id = @id', { id: parseInt(id) });
    res.json(updated.recordset[0]);
  } catch (error) {
    next(error);
  }
});

// Add wallet credit
router.post('/:id/wallet/credit', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { amount, reason } = req.body;

    const result = await db.query(
      `UPDATE customers SET wallet_balance = wallet_balance + @amount, updated_at = CURRENT_TIMESTAMP
       WHERE customer_id = @id`,
      { id: parseInt(id), amount }
    );

    if (result.rowsAffected[0] === 0) {
      throw new NotFoundError('Customer not found');
    }

    const updated = await db.query('SELECT wallet_balance FROM customers WHERE customer_id = @id', { id: parseInt(id) });
    res.json({ success: true, newBalance: updated.recordset[0].wallet_balance });
  } catch (error) {
    next(error);
  }
});

// Use wallet balance
router.post('/:id/wallet/debit', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { amount } = req.body;

    // Check balance first
    const customer = await db.query(
      `SELECT wallet_balance FROM customers WHERE customer_id = @id`,
      { id: parseInt(id) }
    );

    if (customer.recordset.length === 0) {
      throw new NotFoundError('Customer not found');
    }

    if (customer.recordset[0].wallet_balance < amount) {
      throw new ValidationError('Insufficient wallet balance');
    }

    const result = await db.query(
      `UPDATE customers SET wallet_balance = wallet_balance - @amount, updated_at = CURRENT_TIMESTAMP
       WHERE customer_id = @id`,
      { id: parseInt(id), amount }
    );

    const updated = await db.query('SELECT wallet_balance FROM customers WHERE customer_id = @id', { id: parseInt(id) });
    res.json({ success: true, newBalance: updated.recordset[0].wallet_balance });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
