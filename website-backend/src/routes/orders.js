const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');

const router = express.Router();

// Create order from website
router.post('/', [
    body('customerName').notEmpty().trim().withMessage('Name is required'),
    body('customerPhone').notEmpty().trim().withMessage('Phone is required'),
    body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
    body('items.*.variantId').isInt().withMessage('Invalid product variant'),
    body('items.*.quantity').isInt({ min: 1 }).withMessage('Invalid quantity'),
], async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstError = errors.array()[0];
            return res.status(400).json({
                error: `Validation failed: ${firstError.msg} (${firstError.path})`,
                details: errors.array()
            });
        }

        const {
            customerName,
            customerPhone,
            customerEmail,
            customerAddress,
            customerCity,
            items,
            notes
        } = req.body;

        const pool = db.getPool();

        // Validate all products exist, are active, and get prices from DB
        const validatedItems = [];

        for (const item of items) {
            const [rows] = await pool.query(
                `SELECT 
          pv.variant_id,
          pv.variant_name,
          pv.price,
          p.product_id,
          p.product_name,
          p.is_active as product_active, 
          pv.is_active as variant_active
         FROM product_variants pv
         INNER JOIN products p ON pv.product_id = p.product_id
         WHERE pv.variant_id = ?`,
                [item.variantId]
            );

            if (rows.length === 0) {
                return res.status(400).json({
                    error: `Product not found`,
                    variantId: item.variantId
                });
            }

            const product = rows[0];

            if (!product.product_active || !product.variant_active) {
                return res.status(400).json({
                    error: `"${product.product_name}" is no longer available`
                });
            }

            // Use price from database (don't trust client)
            const unitPrice = parseFloat(product.price);
            validatedItems.push({
                variantId: item.variantId,
                productName: product.product_name,
                variantName: product.variant_name,
                quantity: parseInt(item.quantity),
                unitPrice: unitPrice,
                lineTotal: unitPrice * parseInt(item.quantity)
            });
        }

        // Calculate totals
        const subtotal = validatedItems.reduce((sum, item) => sum + item.lineTotal, 0);
        const totalAmount = subtotal; // Can add delivery fee here later

        // Generate order number
        const orderNumber = `WEB-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

        // Get a connection for transaction
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            // Insert order
            const [orderResult] = await connection.query(
                `INSERT INTO online_orders 
         (order_number, source, customer_name, customer_phone, customer_email, customer_address, customer_city, subtotal, total_amount, notes)
         VALUES (?, 'WEBSITE', ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    orderNumber,
                    customerName,
                    customerPhone,
                    customerEmail || null,
                    customerAddress || null,
                    customerCity || null,
                    subtotal,
                    totalAmount,
                    notes || null
                ]
            );

            const orderId = orderResult.insertId;

            // Insert order items
            for (const item of validatedItems) {
                await connection.query(
                    `INSERT INTO order_items (order_id, variant_id, product_name, variant_name, quantity, unit_price, line_total)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        orderId,
                        item.variantId,
                        item.productName,
                        item.variantName,
                        item.quantity,
                        item.unitPrice,
                        item.lineTotal
                    ]
                );
            }

            await connection.commit();

            res.status(201).json({
                success: true,
                orderNumber,
                orderId,
                total: totalAmount,
                itemCount: validatedItems.length,
                message: 'Order placed successfully! We will contact you shortly to confirm.'
            });

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

    } catch (error) {
        next(error);
    }
});

// Get order status (for customer tracking - limited info)
router.get('/:orderNumber/status', async (req, res, next) => {
    try {
        const { orderNumber } = req.params;
        const pool = db.getPool();

        const [rows] = await pool.query(
            `SELECT 
        order_number as orderNumber,
        status,
        total_amount as total,
        created_at as createdAt
       FROM online_orders 
       WHERE order_number = ?`,
            [orderNumber]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        res.json(rows[0]);
    } catch (error) {
        next(error);
    }
});

module.exports = router;
