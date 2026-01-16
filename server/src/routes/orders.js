const express = require('express');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Get all online orders with filters
router.get('/', async (req, res, next) => {
    try {
        const { status, source, startDate, endDate, page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE 1=1';
        const params = [];
        let paramIndex = 1;

        if (status) {
            whereClause += ` AND o.status = $${paramIndex++}`;
            params.push(status);
        }

        if (source) {
            whereClause += ` AND o.source = $${paramIndex++}`;
            params.push(source);
        }

        if (startDate) {
            whereClause += ` AND o.created_at >= $${paramIndex++}`;
            params.push(startDate);
        }

        if (endDate) {
            whereClause += ` AND o.created_at <= $${paramIndex++}`;
            params.push(endDate);
        }

        params.push(parseInt(limit), offset);

        const result = await db.query(
            `SELECT o.*, 
        (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.order_id) as item_count
       FROM online_orders o
       ${whereClause}
       ORDER BY 
         CASE o.status 
           WHEN 'pending' THEN 1 
           WHEN 'confirmed' THEN 2 
           WHEN 'processing' THEN 3 
           WHEN 'ready' THEN 4 
           ELSE 5 
         END,
         o.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
            params
        );

        // Get counts by status
        const countsResult = await db.query(`
      SELECT status, COUNT(*) as count 
      FROM online_orders 
      GROUP BY status
    `);

        const statusCounts = {};
        countsResult.recordset.forEach(row => {
            statusCounts[row.status] = parseInt(row.count);
        });

        res.json({
            orders: result.recordset,
            statusCounts,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        next(error);
    }
});

// Get order details
router.get('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;

        const orderResult = await db.query(
            `SELECT o.*, u.first_name as processed_by_name
       FROM online_orders o
       LEFT JOIN users u ON o.processed_by = u.user_id
       WHERE o.order_id = $1`,
            [parseInt(id)]
        );

        if (orderResult.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const itemsResult = await db.query(
            `SELECT oi.*, 
        p.product_name, pv.variant_name, pv.sku, p.image_url
       FROM order_items oi
       LEFT JOIN product_variants pv ON oi.variant_id = pv.variant_id
       LEFT JOIN products p ON pv.product_id = p.product_id
       WHERE oi.order_id = $1`,
            [parseInt(id)]
        );

        res.json({
            order: orderResult.rows[0],
            items: itemsResult.rows
        });
    } catch (error) {
        next(error);
    }
});

// Update order status
router.patch('/:id/status', authorize('admin', 'manager', 'cashier'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const userId = req.user.user_id;

        const validStatuses = ['pending', 'confirmed', 'processing', 'ready', 'completed', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const updateFields = ['status = $1', 'updated_at = CURRENT_TIMESTAMP'];
        const params = [status];
        let paramIndex = 2;

        // Mark as processed when moving beyond pending
        if (status !== 'pending' && status !== 'cancelled') {
            updateFields.push(`processed_by = $${paramIndex++}`);
            updateFields.push(`processed_at = CURRENT_TIMESTAMP`);
            params.push(userId);
        }

        params.push(parseInt(id));

        await db.query(
            `UPDATE online_orders 
       SET ${updateFields.join(', ')}
       WHERE order_id = $${paramIndex}`,
            params
        );

        const result = await db.query('SELECT * FROM online_orders WHERE order_id = ?', [parseInt(id)]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        // Emit real-time update
        const io = req.app.get('io');
        if (io) {
            io.emit('online-order-updated', {
                orderId: parseInt(id),
                status,
                updatedAt: result.rows[0].updated_at
            });
        }

        res.json(result.rows[0]);
    } catch (error) {
        next(error);
    }
});

// Process order (deduct inventory and mark as completed)
router.post('/:id/process', authorize('admin', 'manager', 'cashier'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { locationId } = req.body;
        const userId = req.user.user_id;

        if (!locationId) {
            return res.status(400).json({ error: 'Location ID is required' });
        }

        // Get order and validate status
        const orderResult = await db.query(
            `SELECT * FROM online_orders WHERE order_id = $1`,
            [parseInt(id)]
        );

        if (orderResult.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const order = orderResult.rows[0];

        if (order.status === 'completed') {
            return res.status(400).json({ error: 'Order is already completed' });
        }

        if (order.status === 'cancelled') {
            return res.status(400).json({ error: 'Cannot process a cancelled order' });
        }

        // Get order items
        const itemsResult = await db.query(
            `SELECT * FROM order_items WHERE order_id = $1`,
            [parseInt(id)]
        );

        // Start transaction for inventory deduction
        await db.transaction(async (client) => {
            // Deduct inventory for each item
            for (const item of itemsResult.rows) {
                // Update or insert inventory
                let invResult = await client.query(
                    `UPDATE inventory 
           SET quantity_on_hand = quantity_on_hand - $1, updated_at = CURRENT_TIMESTAMP
           WHERE variant_id = $2 AND location_id = $3`,
                    [item.quantity, item.variant_id, locationId]
                );

                // Fetch updated quantity
                invResult = await client.query(
                    'SELECT quantity_on_hand FROM inventory WHERE variant_id = ? AND location_id = ?',
                    [item.variant_id, locationId]
                );

                if (invResult.rows.length === 0) {
                    // Create inventory record with negative stock if it doesn't exist
                    await client.query(
                        `INSERT INTO inventory (variant_id, location_id, quantity_on_hand, quantity_reserved, reorder_level, reorder_quantity)
             VALUES ($1, $2, -$3, 0, 10, 10)`,
                        [item.variant_id, locationId, item.quantity]
                    );
                }

                // Log inventory transaction
                await client.query(
                    `INSERT INTO inventory_transactions 
           (variant_id, location_id, transaction_type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, user_id, notes)
           VALUES ($1, $2, 'ONLINE_SALE', -$3, 
             COALESCE((SELECT quantity_on_hand + $3 FROM inventory WHERE variant_id = $1 AND location_id = $2), 0),
             COALESCE((SELECT quantity_on_hand FROM inventory WHERE variant_id = $1 AND location_id = $2), -$3),
             'ONLINE_ORDER', $4, $5, $6)`,
                    [item.variant_id, locationId, item.quantity, parseInt(id), userId, `Online order ${order.order_number}`]
                );
            }

            // Mark order as completed
            await client.query(
                `UPDATE online_orders 
         SET status = 'completed', processed_by = $1, processed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE order_id = $2`,
                [userId, parseInt(id)]
            );

            // Emit real-time update
            const io = req.app.get('io');
            if (io) {
                io.emit('online-order-completed', { orderId: parseInt(id), orderNumber: order.order_number });
                io.to(`location-${locationId}`).emit('inventory-updated', { source: 'online-order' });
            }

            res.json({ success: true, message: 'Order processed successfully' });
        });

    } catch (error) {
        next(error);
    }
});

module.exports = router;
