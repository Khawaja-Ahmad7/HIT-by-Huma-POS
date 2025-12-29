const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate, authorize, verifyManagerPIN } = require('../middleware/auth');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticate);

// Get all sales
router.get('/', async (req, res, next) => {
  try {
    const { locationId, startDate, endDate, status, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    const queryParams = [];
    let paramIndex = 1;

    if (locationId) {
      whereClause += ` AND s.location_id = $${paramIndex++}`;
      queryParams.push(parseInt(locationId));
    }

    if (startDate) {
      whereClause += ` AND s.created_at >= $${paramIndex++}`;
      queryParams.push(startDate);
    }

    if (endDate) {
      whereClause += ` AND s.created_at <= $${paramIndex++}`;
      queryParams.push(endDate);
    }

    if (status) {
      whereClause += ` AND s.status = $${paramIndex++}`;
      queryParams.push(status);
    }

    queryParams.push(parseInt(limit));
    queryParams.push(offset);

    const pool = db.getPool();
    const result = await pool.query(
      `SELECT s.*, u.first_name as cashier_first_name, u.last_name as cashier_last_name,
              c.first_name as customer_first_name, c.last_name as customer_last_name, c.phone as customer_phone,
              l.location_name
       FROM sales s
       INNER JOIN users u ON s.user_id = u.user_id
       LEFT JOIN customers c ON s.customer_id = c.customer_id
       INNER JOIN locations l ON s.location_id = l.location_id
       ${whereClause}
       ORDER BY s.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      queryParams
    );

    res.json({ sales: result.rows });
  } catch (error) {
    next(error);
  }
});

// Get payment methods - MUST be before /:id route
router.get('/payment-methods/list', async (req, res, next) => {
  try {
    const pool = db.getPool();
    const result = await pool.query(
      `SELECT * FROM payment_methods WHERE is_active = true ORDER BY sort_order`
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// Get parked sales - MUST be before /:id route
router.get('/parked/list', async (req, res, next) => {
  try {
    const { locationId } = req.query;
    const pool = db.getPool();

    const result = await pool.query(
      `SELECT ps.*, u.first_name, u.last_name, c.phone as customer_phone
       FROM parked_sales ps
       LEFT JOIN users u ON ps.user_id = u.user_id
       LEFT JOIN customers c ON ps.customer_id = c.customer_id
       WHERE ps.location_id = $1
       ORDER BY ps.created_at DESC`,
      [parseInt(locationId)]
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// Get sale by ID
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const pool = db.getPool();

    const saleResult = await pool.query(
      `SELECT s.*, u.first_name as cashier_first_name, u.last_name as cashier_last_name,
              c.first_name as customer_first_name, c.last_name as customer_last_name, c.phone as customer_phone,
              l.location_name, l.address as location_address, l.phone as location_phone
       FROM sales s
       INNER JOIN users u ON s.user_id = u.user_id
       LEFT JOIN customers c ON s.customer_id = c.customer_id
       INNER JOIN locations l ON s.location_id = l.location_id
       WHERE s.sale_id = $1`,
      [parseInt(id)]
    );

    if (saleResult.rows.length === 0) {
      throw new NotFoundError('Sale not found');
    }

    const itemsResult = await pool.query(
      `SELECT si.*, pv.sku, pv.variant_name, p.product_name
       FROM sale_items si
       INNER JOIN product_variants pv ON si.variant_id = pv.variant_id
       INNER JOIN products p ON pv.product_id = p.product_id
       WHERE si.sale_id = $1`,
      [parseInt(id)]
    );

    const paymentsResult = await pool.query(
      `SELECT sp.*, pm.method_name
       FROM sale_payments sp
       INNER JOIN payment_methods pm ON sp.payment_method_id = pm.payment_method_id
       WHERE sp.sale_id = $1`,
      [parseInt(id)]
    );

    res.json({
      sale: saleResult.rows[0],
      items: itemsResult.rows,
      payments: paymentsResult.rows
    });
  } catch (error) {
    next(error);
  }
});

// Create sale
router.post('/', [
  body('items').isArray({ min: 1 }),
  body('payments').isArray({ min: 1 }),
  body('locationId').isInt(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    const { items, payments, locationId, customerId, discountAmount, discountType, discountReason, notes, shiftId } = req.body;

    // Calculate totals
    let subtotal = 0;
    let taxAmount = 0;

    for (const item of items) {
      const lineTotal = item.unitPrice * item.quantity;
      subtotal += lineTotal;
      taxAmount += item.taxAmount || 0;
    }

    const totalAmount = subtotal + taxAmount - (discountAmount || 0);

    // Generate sale number
    const saleNumber = `S-${Date.now()}`;

    // Use pool directly for PostgreSQL
    const pool = db.getPool();

    // Validate stock for all items
    for (const item of items) {
      if (item.quantity > 0) {
        const invCheck = await pool.query(
          `SELECT quantity_on_hand FROM inventory WHERE variant_id = $1 AND location_id = $2`,
          [item.variantId, locationId]
        );

        const currentStock = invCheck.rows.length > 0 ? invCheck.rows[0].quantity_on_hand : 0;

        if (currentStock < item.quantity) {
          // Get product name for better error message
          const prodNameRes = await pool.query(
            `SELECT p.product_name, pv.variant_name 
              FROM product_variants pv 
              JOIN products p ON pv.product_id = p.product_id 
              WHERE pv.variant_id = $1`,
            [item.variantId]
          );
          const prodName = prodNameRes.rows[0]
            ? `${prodNameRes.rows[0].product_name} (${prodNameRes.rows[0].variant_name})`
            : `Variant ${item.variantId}`;

          throw new ValidationError(`Insufficient stock for ${prodName}. Available: ${currentStock}, Requested: ${item.quantity}`);
        }
      }
    }

    // Insert sale
    const saleResult = await pool.query(
      `INSERT INTO sales (sale_number, location_id, shift_id, user_id, customer_id, subtotal, tax_amount, discount_amount, discount_type, discount_reason, total_amount, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING sale_id`,
      [saleNumber, locationId, shiftId || null, req.user.user_id, customerId || null, subtotal, taxAmount, discountAmount || 0, discountType || null, discountReason || null, totalAmount, notes || null]
    );

    const saleId = saleResult.rows[0].sale_id;

    // Insert sale items and update inventory
    for (const item of items) {
      console.log(`Processing sale item: variantId=${item.variantId}, quantity=${item.quantity}, locationId=${locationId}`);

      await pool.query(
        `INSERT INTO sale_items (sale_id, variant_id, quantity, unit_price, discount_amount, tax_amount, line_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [saleId, item.variantId, item.quantity, item.unitPrice, item.discountAmount || 0, item.taxAmount || 0, item.unitPrice * item.quantity]
      );

      // Check if inventory record exists
      const invCheck = await pool.query(
        `SELECT inventory_id, quantity_on_hand FROM inventory WHERE variant_id = $1 AND location_id = $2`,
        [item.variantId, locationId]
      );

      if (invCheck.rows.length === 0) {
        // Create inventory record with negative stock (will need adjustment)
        console.log(`No inventory record found for variant ${item.variantId} at location ${locationId}, creating one`);
        await pool.query(
          `INSERT INTO inventory (variant_id, location_id, quantity_on_hand, quantity_reserved, reorder_level, reorder_quantity)
           VALUES ($1, $2, -$3, 0, 10, 10)`,
          [item.variantId, locationId, item.quantity]
        );
      } else {
        const currentStock = invCheck.rows[0].quantity_on_hand;
        console.log(`Current stock for variant ${item.variantId}: ${currentStock}, deducting ${item.quantity}`);

        // Update inventory
        const updateResult = await pool.query(
          `UPDATE inventory SET quantity_on_hand = quantity_on_hand - $1, updated_at = CURRENT_TIMESTAMP
           WHERE variant_id = $2 AND location_id = $3
           RETURNING quantity_on_hand`,
          [item.quantity, item.variantId, locationId]
        );

        console.log(`New stock for variant ${item.variantId}: ${updateResult.rows[0]?.quantity_on_hand}`);
      }

      // Log inventory transaction
      await pool.query(
        `INSERT INTO inventory_transactions (variant_id, location_id, transaction_type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, user_id)
         SELECT $1, $2, 'SALE', $3, COALESCE(quantity_on_hand, 0) + $4, COALESCE(quantity_on_hand, 0), 'SALE', $5, $6
         FROM inventory WHERE variant_id = $1 AND location_id = $2`,
        [item.variantId, locationId, -item.quantity, item.quantity, saleId, req.user.user_id]
      );
    }

    // Insert payments
    for (const payment of payments) {
      await pool.query(
        `INSERT INTO sale_payments (sale_id, payment_method_id, amount, reference_number)
         VALUES ($1, $2, $3, $4)`,
        [saleId, payment.paymentMethodId, payment.amount, payment.referenceNumber || null]
      );
    }

    // Update customer stats if customer is attached
    if (customerId) {
      await pool.query(
        `UPDATE customers 
         SET total_purchases = COALESCE(total_purchases, 0) + $1, 
             visit_count = COALESCE(visit_count, 0) + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE customer_id = $2`,
        [totalAmount, customerId]
      );
    }

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`location-${locationId}`).emit('sale-completed', { saleId, saleNumber, totalAmount });
    }

    res.status(201).json({
      success: true,
      saleId,
      saleNumber,
      totalAmount
    });
  } catch (error) {
    console.error('Sale error:', error);
    next(error);
  }
});

// Park sale
router.post('/park', async (req, res, next) => {
  try {
    const { locationId, customerId, cartData, notes } = req.body;
    const pool = db.getPool();

    const result = await pool.query(
      `INSERT INTO parked_sales (location_id, user_id, customer_id, cart_data, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING parked_id`,
      [locationId, req.user.user_id, customerId || null, JSON.stringify(cartData), notes || null]
    );

    res.json({ success: true, parkedId: result.rows[0].parked_id });
  } catch (error) {
    next(error);
  }
});

// Get parked sale by ID
router.get('/parked/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const pool = db.getPool();

    const result = await pool.query(
      `SELECT * FROM parked_sales WHERE parked_id = $1`,
      [parseInt(id)]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Parked sale not found');
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Delete parked sale
router.delete('/parked/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const pool = db.getPool();

    await pool.query(`DELETE FROM parked_sales WHERE parked_id = $1`, [parseInt(id)]);

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Void sale
router.post('/:id/void', authorize('void'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { managerPIN, reason } = req.body;
    const pool = db.getPool();

    // Get sale items to restore inventory
    const itemsResult = await pool.query(
      `SELECT si.*, s.location_id FROM sale_items si
       INNER JOIN sales s ON si.sale_id = s.sale_id
       WHERE si.sale_id = $1`,
      [parseInt(id)]
    );

    // Restore inventory
    for (const item of itemsResult.rows) {
      await pool.query(
        `UPDATE inventory SET quantity_on_hand = quantity_on_hand + $1
         WHERE variant_id = $2 AND location_id = $3`,
        [item.quantity, item.variant_id, item.location_id]
      );
    }

    // Update sale status
    await pool.query(
      `UPDATE sales SET status = 'voided', voided_by = $1, voided_at = CURRENT_TIMESTAMP, void_reason = $2
       WHERE sale_id = $3`,
      [req.user.user_id, reason, parseInt(id)]
    );

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Apply discount (for validation)
router.post('/apply-discount', async (req, res, next) => {
  try {
    const { discountPercent, discountAmount, subtotal } = req.body;
    const pool = db.getPool();

    // Get max discount setting
    const settingResult = await pool.query(
      `SELECT setting_value FROM settings WHERE setting_key = 'max_discount_without_approval'`
    );

    const maxDiscount = settingResult.rows.length > 0
      ? parseFloat(settingResult.rows[0].setting_value)
      : 10;

    const actualPercent = discountPercent || (discountAmount / subtotal * 100);

    res.json({
      requiresApproval: actualPercent > maxDiscount,
      maxWithoutApproval: maxDiscount
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
