const express = require('express');
const db = require('../config/database');

const router = express.Router();

// Get all active products for website (NO stock info exposed)
router.get('/', async (req, res, next) => {
    try {
        const { categoryId, search, page = 1, limit = 50 } = req.query;
        // Security: Cap limit to max 100 to prevent DoS
        const safeLimit = Math.min(parseInt(limit), 100);
        const offset = (page - 1) * safeLimit;

        let whereClause = 'WHERE p.is_active = 1';
        const params = [];

        if (categoryId) {
            whereClause += ' AND p.category_id = ?';
            params.push(parseInt(categoryId));
        }

        if (search) {
            whereClause += ' AND (p.product_name LIKE ? OR p.description LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }

        const pool = db.getPool();

        // Get products with their variants
        const [products] = await pool.query(
            `SELECT 
        p.product_id as id,
        p.product_name as name,
        p.description,
        p.base_price as price,
        p.image_url as imageUrl,
        c.category_id as categoryId,
        c.category_name as categoryName
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.category_id AND c.is_active = 1
       ${whereClause}
       ORDER BY p.product_name
       LIMIT ? OFFSET ?`,
            [...params, parseInt(limit), offset]
        );

        // Get variants for each product
        for (const product of products) {
            const [variants] = await pool.query(
                `SELECT 
          variant_id as id,
          variant_name as name,
          sku,
          price
         FROM product_variants 
         WHERE product_id = ? AND is_active = 1
         ORDER BY is_default DESC, variant_id`,
                [product.id]
            );
            product.variants = variants;
        }

        // Get total count
        const [countResult] = await pool.query(
            `SELECT COUNT(*) as total FROM products p ${whereClause}`,
            params
        );

        res.json({
            products,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: countResult[0]?.total || 0
            }
        });
    } catch (error) {
        next(error);
    }
});

// Get product by ID
router.get('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const pool = db.getPool();

        const [products] = await pool.query(
            `SELECT 
        p.product_id as id,
        p.product_name as name,
        p.description,
        p.base_price as price,
        p.image_url as imageUrl,
        c.category_name as categoryName
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.category_id
       WHERE p.product_id = ? AND p.is_active = 1`,
            [parseInt(id)]
        );

        if (products.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const product = products[0];

        // Get variants
        const [variants] = await pool.query(
            `SELECT 
        variant_id as id,
        variant_name as name,
        sku,
        price
       FROM product_variants 
       WHERE product_id = ? AND is_active = 1
       ORDER BY is_default DESC, variant_id`,
            [parseInt(id)]
        );

        product.variants = variants;

        res.json(product);
    } catch (error) {
        next(error);
    }
});

// Get active categories
router.get('/categories/list', async (req, res, next) => {
    try {
        const pool = db.getPool();
        const [categories] = await pool.query(
            `SELECT 
        category_id as id, 
        category_name as name,
        description
       FROM categories 
       WHERE is_active = 1 
       ORDER BY sort_order, category_name`
        );
        res.json(categories);
    } catch (error) {
        next(error);
    }
});

module.exports = router;
