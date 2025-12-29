const express = require('express');
const { body, query, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// Get all products with variants
router.get('/', async (req, res, next) => {
  try {
    const { categoryId, search, page = 1, limit = 50, includeInactive } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (!includeInactive) {
      whereClause += ' AND p.is_active = true';
    }

    if (categoryId) {
      whereClause += ` AND p.category_id = $${paramIndex++}`;
      params.push(parseInt(categoryId));
    }

    if (search) {
      whereClause += ` AND (p.product_name ILIKE $${paramIndex} OR p.product_code ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    const pool = db.getPool();

    // Get products with pagination and default variant info
    const result = await pool.query(
      `SELECT p.*, c.category_name,
        (SELECT COUNT(*) FROM product_variants pv WHERE pv.product_id = p.product_id AND pv.is_active = true) as variant_count,
        (SELECT COALESCE(SUM(i.quantity_on_hand), 0) FROM product_variants pv2 
         LEFT JOIN inventory i ON pv2.variant_id = i.variant_id 
         WHERE pv2.product_id = p.product_id) as total_stock,
        (SELECT pv3.variant_id FROM product_variants pv3 WHERE pv3.product_id = p.product_id AND pv3.is_active = true LIMIT 1) as default_variant_id,
        (SELECT pv4.sku FROM product_variants pv4 WHERE pv4.product_id = p.product_id AND pv4.is_active = true LIMIT 1) as default_sku,
        (SELECT pv5.barcode FROM product_variants pv5 WHERE pv5.product_id = p.product_id AND pv5.is_active = true LIMIT 1) as default_barcode
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.category_id
       ${whereClause}
       ORDER BY p.product_name
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...params, parseInt(limit), offset]
    );

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM products p ${whereClause}`,
      params
    );

    // Transform to camelCase for frontend
    const products = result.rows.map(p => ({
      id: p.product_id,
      code: p.product_code,
      name: p.product_name,
      categoryId: p.category_id,
      category: { id: p.category_id, name: p.category_name },
      description: p.description,
      basePrice: parseFloat(p.base_price) || 0,
      costPrice: parseFloat(p.cost_price) || 0,
      taxRate: parseFloat(p.tax_rate) || 0,
      hasVariants: p.has_variants,
      isActive: p.is_active,
      variantCount: parseInt(p.variant_count) || 0,
      totalStock: parseInt(p.total_stock) || 0,
      variantId: p.default_variant_id,  // Include default variant ID for POS
      sku: p.default_sku,
      barcode: p.default_barcode,
      createdAt: p.created_at,
      updatedAt: p.updated_at
    }));

    res.json({
      products,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0]?.total || 0),
        pages: Math.ceil((countResult.rows[0]?.total || 0) / limit)
      }
    });
  } catch (error) {
    next(error);
  }
});

// Quick search for POS
router.get('/search/quick', async (req, res, next) => {
  try {
    const { q, locationId } = req.query;

    if (!q || q.length < 2) {
      return res.json({ products: [] });
    }

    const pool = db.getPool();
    // Only include products from active categories (or no category)
    const result = await pool.query(
      `SELECT pv.variant_id, pv.sku, pv.barcode, pv.variant_name, pv.price,
              p.product_name, p.product_code, p.product_id,
              COALESCE(i.quantity_on_hand, 0) as stock
       FROM product_variants pv
       INNER JOIN products p ON pv.product_id = p.product_id
       LEFT JOIN categories c ON p.category_id = c.category_id
       LEFT JOIN inventory i ON pv.variant_id = i.variant_id AND i.location_id = $1
       WHERE pv.is_active = true AND p.is_active = true
         AND (c.is_active = true OR p.category_id IS NULL)
         AND (pv.sku ILIKE $2 OR pv.barcode = $3 
              OR p.product_name ILIKE $2 OR pv.variant_name ILIKE $2)
       LIMIT 20`,
      [parseInt(locationId) || 1, `%${q}%`, q]
    );

    res.json({ products: result.rows });
  } catch (error) {
    next(error);
  }
});

// Lookup product by barcode (for barcode scanner)
router.get('/barcode/:barcode', async (req, res, next) => {
  try {
    const { barcode } = req.params;
    const locationId = req.query.locationId || 1;

    const pool = db.getPool();

    // First try to find by barcode (exact match), then fallback to SKU
    // Also check if category is active
    const result = await pool.query(
      `SELECT pv.variant_id as "variantId", pv.sku, pv.barcode, pv.variant_name as "variantName", pv.price,
              p.product_id as "productId", p.product_name as "productName", p.product_code as "productCode",
              p.image_url as "imageUrl", p.category_id,
              c.is_active as "categoryActive", c.category_name as "categoryName",
              COALESCE(i.quantity_on_hand, 0) as stock
       FROM product_variants pv
       INNER JOIN products p ON pv.product_id = p.product_id
       LEFT JOIN categories c ON p.category_id = c.category_id
       LEFT JOIN inventory i ON pv.variant_id = i.variant_id AND i.location_id = $1
       WHERE pv.is_active = true AND p.is_active = true
         AND (pv.barcode = $2 OR (pv.barcode IS NULL AND pv.sku = $2))
       ORDER BY CASE WHEN pv.barcode = $2 THEN 0 ELSE 1 END
       LIMIT 1`,
      [parseInt(locationId), barcode]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found', barcode });
    }

    const product = result.rows[0];

    // Check if category is inactive
    if (product.category_id && product.categoryActive === false) {
      return res.status(400).json({
        error: 'Currently not for sale',
        message: `This product (${product.productName}) is currently not available for sale.`,
        barcode
      });
    }

    res.json({
      variantId: product.variantId,
      productId: product.productId,
      productName: product.productName,
      variantName: product.variantName,
      sku: product.sku,
      barcode: product.barcode,
      price: parseFloat(product.price),
      imageUrl: product.imageUrl,
      stock: parseInt(product.stock)
    });
  } catch (error) {
    next(error);
  }
});

// Get categories (MUST be before /:id route!)
router.get('/categories/list', async (req, res, next) => {
  try {
    const pool = db.getPool();
    const result = await pool.query(
      `SELECT * FROM categories WHERE is_active = true ORDER BY sort_order, category_name`
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// Get all categories (including inactive) for management
router.get('/categories', async (req, res, next) => {
  try {
    const pool = db.getPool();
    const result = await pool.query(
      `SELECT * FROM categories ORDER BY sort_order, category_name`
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// Get product by ID with variants (MUST be AFTER specific routes like /categories)
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate that id is a number
    if (isNaN(parseInt(id))) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    const pool = db.getPool();
    const productResult = await pool.query(
      `SELECT p.*, c.category_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.category_id
       WHERE p.product_id = $1`,
      [parseInt(id)]
    );

    if (productResult.rows.length === 0) {
      throw new NotFoundError('Product not found');
    }

    const variantsResult = await pool.query(
      `SELECT * FROM product_variants WHERE product_id = $1 ORDER BY variant_name`,
      [parseInt(id)]
    );

    res.json({
      ...productResult.rows[0],
      variants: variantsResult.rows
    });
  } catch (error) {
    next(error);
  }
});

// Create category
router.post('/categories', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const { category_name, description, sort_order = 0 } = req.body;

    if (!category_name) {
      throw new ValidationError('Category name is required');
    }

    const pool = db.getPool();

    // Check if category already exists
    const existing = await pool.query(
      `SELECT category_id FROM categories WHERE LOWER(category_name) = LOWER($1)`,
      [category_name]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        error: 'Category already exists',
        message: `A category named "${category_name}" already exists`
      });
    }

    const result = await pool.query(
      `INSERT INTO categories (category_name, description, sort_order, is_active)
       VALUES ($1, $2, $3, true)
       RETURNING *`,
      [category_name, description || null, sort_order]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    // Handle unique constraint violation
    if (error.code === '23505') {
      return res.status(400).json({
        error: 'Category already exists',
        message: `A category with this name already exists`
      });
    }
    next(error);
  }
});

// Update category
router.put('/categories/:id', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { category_name, description, sort_order, is_active } = req.body;

    if (!category_name) {
      throw new ValidationError('Category name is required');
    }

    const pool = db.getPool();
    const result = await pool.query(
      `UPDATE categories 
       SET category_name = $1, description = $2, sort_order = $3, is_active = $4
       WHERE category_id = $5
       RETURNING *`,
      [category_name, description || null, sort_order || 0, is_active !== false, id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Category not found');
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Toggle category active status (deactivate/activate)
router.patch('/categories/:id/toggle-active', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const pool = db.getPool();

    const result = await pool.query(
      `UPDATE categories SET is_active = NOT is_active WHERE category_id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Category not found');
    }

    const category = result.rows[0];
    res.json({
      success: true,
      message: category.is_active ? 'Category activated' : 'Category deactivated',
      category
    });
  } catch (error) {
    next(error);
  }
});

// Delete category (HARD delete - removes from database)
router.delete('/categories/:id', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const { id } = req.params;
    console.log('DELETE /categories/:id called with id:', id);
    const pool = db.getPool();

    // Check if category has ACTIVE products (ignore soft-deleted products)
    const productsCheck = await pool.query(
      `SELECT COUNT(*) as count FROM products WHERE category_id = $1 AND is_active = true`,
      [id]
    );

    if (parseInt(productsCheck.rows[0].count) > 0) {
      return res.status(400).json({
        error: 'Cannot delete category',
        message: 'This category has products assigned. Please move or delete products first.'
      });
    }

    // Clear category reference from soft-deleted products (to avoid FK constraint)
    await pool.query(
      `UPDATE products SET category_id = NULL WHERE category_id = $1 AND is_active = false`,
      [id]
    );

    // Hard delete - remove from database
    const result = await pool.query(
      `DELETE FROM categories WHERE category_id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Category not found');
    }

    res.json({ success: true, message: 'Category permanently deleted' });
  } catch (error) {
    next(error);
  }
});

// Get attributes
router.get('/attributes/list', async (req, res, next) => {
  try {
    const attributesResult = await db.query(
      `SELECT * FROM attributes WHERE is_active = true ORDER BY sort_order`
    );

    const valuesResult = await db.query(
      `SELECT * FROM attribute_values WHERE is_active = true ORDER BY sort_order`
    );

    const attributes = attributesResult.recordset.map(attr => ({
      ...attr,
      values: valuesResult.recordset.filter(v => v.attribute_id === attr.attribute_id)
    }));

    res.json(attributes);
  } catch (error) {
    next(error);
  }
});

// Create product
router.post('/', authorize('products'), [
  body('name').optional().notEmpty(),
  body('productName').optional().notEmpty(),
  body('basePrice').isNumeric(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    // Support both frontend field names (name/code) and backend field names (productName/productCode)
    const { productCode, productName, name, code, categoryId, category_id, description, basePrice, costPrice, taxRate, barcode, initialStock, initial_stock, locationId } = req.body;
    const finalName = productName || name;
    const finalCode = productCode || code || `PRD-${Date.now()}`;
    const finalCategoryId = categoryId || category_id || null;
    const finalInitialStock = initialStock || initial_stock || 0;

    console.log('Creating product with barcode:', barcode);

    if (!finalName) {
      throw new ValidationError('Product name is required');
    }

    // Barcode is now required
    if (!barcode || barcode.trim() === '') {
      throw new ValidationError('Barcode is required');
    }

    const pool = db.getPool();

    // Check if barcode already exists
    const existingBarcode = await pool.query(
      `SELECT variant_id FROM product_variants WHERE barcode = $1`,
      [barcode.trim()]
    );

    if (existingBarcode.rows.length > 0) {
      return res.status(400).json({
        error: 'Barcode already exists',
        message: `A product with barcode "${barcode}" already exists. Please use a unique barcode.`
      });
    }

    // Check if SKU already exists
    const existingSku = await pool.query(
      `SELECT variant_id FROM product_variants WHERE sku = $1`,
      [finalCode]
    );

    if (existingSku.rows.length > 0) {
      return res.status(400).json({
        error: 'SKU already exists',
        message: `A product with SKU "${finalCode}" already exists. Please use a unique SKU number.`
      });
    }

    // Create the product
    const result = await pool.query(
      `INSERT INTO products (product_code, product_name, category_id, description, base_price, cost_price, tax_rate, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [finalCode, finalName, finalCategoryId, description || null, basePrice, costPrice || 0, taxRate || 0, req.user.user_id]
    );

    const product = result.rows[0];

    // Check if we have custom variants from the request
    const { variants, hasVariants, color, size } = req.body;
    const createdVariants = [];

    if (hasVariants && variants && variants.length > 0) {
      // Create multiple variants as specified
      for (const v of variants) {
        // Check barcode uniqueness for each variant
        if (v.barcode) {
          const existingVarBarcode = await pool.query(
            `SELECT variant_id FROM product_variants WHERE barcode = $1`,
            [v.barcode.trim()]
          );
          if (existingVarBarcode.rows.length > 0) {
            return res.status(400).json({
              error: 'Barcode already exists',
              message: `A variant with barcode "${v.barcode}" already exists. Please use a unique barcode.`
            });
          }
        }

        // Check SKU uniqueness for each variant
        if (v.sku) {
          const existingVarSku = await pool.query(
            `SELECT variant_id FROM product_variants WHERE sku = $1`,
            [v.sku.trim()]
          );
          if (existingVarSku.rows.length > 0) {
            return res.status(400).json({
              error: 'SKU already exists',
              message: `A variant with SKU "${v.sku}" already exists. Please use a unique SKU.`
            });
          }
        }

        const variantResult = await pool.query(
          `INSERT INTO product_variants (product_id, sku, barcode, variant_name, price, cost_price, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, true)
           RETURNING *`,
          [product.product_id, v.sku || `${finalCode}-V${createdVariants.length + 1}`, v.barcode?.trim() || null, v.variantName || `Variant ${createdVariants.length + 1}`, v.price || basePrice, costPrice || 0]
        );

        const createdVariant = variantResult.rows[0];
        createdVariants.push(createdVariant);

        // If initial stock is provided for this variant, create inventory record
        const variantStock = v.initialStock || v.initial_stock || 0;
        if (variantStock && parseInt(variantStock) > 0) {
          const stockLocationId = locationId || req.user.default_location_id || 1;
          await pool.query(
            `INSERT INTO inventory (variant_id, location_id, quantity_on_hand, updated_at)
             VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
             ON CONFLICT (variant_id, location_id) 
             DO UPDATE SET quantity_on_hand = inventory.quantity_on_hand + $3, updated_at = CURRENT_TIMESTAMP`,
            [createdVariant.variant_id, stockLocationId, parseInt(variantStock)]
          );
        }
      }

      console.log(`Created ${createdVariants.length} variants for product ${product.product_id}`);
    } else {
      // Create a default variant for this product with SEPARATE SKU and barcode
      // Store color and size in variant_name as 'Color / Size' format
      let variantName = 'Default';
      if (color && size) {
        variantName = `${color} / ${size}`;
      } else if (color) {
        variantName = color;
      } else if (size) {
        variantName = `/ ${size}`; // Just size, will be parsed correctly
      }

      const variantResult = await pool.query(
        `INSERT INTO product_variants (product_id, sku, barcode, variant_name, price, cost_price, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, true)
         RETURNING *`,
        [product.product_id, finalCode, barcode.trim(), variantName, basePrice, costPrice || 0]
      );

      const variant = variantResult.rows[0];
      createdVariants.push(variant);
      console.log('Created variant with barcode:', variant.barcode, 'color:', color, 'size:', size);

      // If initial stock is provided, create inventory record for the variant at the specified location
      if (finalInitialStock && parseInt(finalInitialStock) > 0) {
        // Use locationId from request if provided, otherwise fallback to user's default location or 1
        const stockLocationId = locationId || req.user.default_location_id || 1;
        await pool.query(
          `INSERT INTO inventory (variant_id, location_id, quantity_on_hand, updated_at)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
           ON CONFLICT (variant_id, location_id) 
           DO UPDATE SET quantity_on_hand = inventory.quantity_on_hand + $3, updated_at = CURRENT_TIMESTAMP`,
          [variant.variant_id, stockLocationId, parseInt(finalInitialStock)]
        );
      }
    }

    res.status(201).json({
      ...product,
      variants: createdVariants,
      variant: createdVariants[0], // For backwards compatibility
      productId: product.product_id,
      barcode: createdVariants[0]?.barcode,
      color: color || null, // Return color for label printing
      size: size || null // Return size for label printing
    });
  } catch (error) {
    next(error);
  }
});

// Update product
router.put('/:id', authorize('products'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { productName, name, code, productCode, categoryId, category_id, description, basePrice, costPrice, taxRate, isActive, barcode, initialStock, initial_stock, stock, color, size } = req.body;

    const finalName = productName || name;
    const finalCategoryId = categoryId || category_id;
    const finalCode = code || productCode;
    const finalStock = stock ?? initialStock ?? initial_stock;

    console.log('PUT /products/:id - Request body:', JSON.stringify(req.body));
    console.log('PUT /products/:id - Parsed values:', { id, finalName, finalCode, basePrice, costPrice, isActive, finalStock, color, size });

    const result = await db.query(
      `UPDATE products 
       SET product_name = COALESCE(@finalName, product_name),
           product_code = COALESCE(@finalCode, product_code),
           category_id = COALESCE(@finalCategoryId, category_id),
           description = COALESCE(@description, description),
           base_price = COALESCE(@basePrice, base_price),
           cost_price = COALESCE(@costPrice, cost_price),
           tax_rate = COALESCE(@taxRate, tax_rate),
           is_active = COALESCE(@isActive, is_active),
           updated_at = CURRENT_TIMESTAMP
       WHERE product_id = @productId
       RETURNING *`,
      { finalName, finalCode, finalCategoryId, description, basePrice, costPrice, taxRate, isActive, productId: parseInt(id) }
    );

    if (result.recordset.length === 0) {
      throw new NotFoundError('Product not found');
    }

    const p = result.recordset[0];

    // Update variant_name with color/size if provided
    if (color !== undefined || size !== undefined) {
      const pool = db.getPool();

      // Build variant_name from color and size
      let variantName = 'Default';
      if (color && size) {
        variantName = `${color} / ${size}`;
      } else if (color) {
        variantName = color;
      } else if (size) {
        variantName = `/ ${size}`;
      }

      // Update the default variant's name
      await pool.query(
        `UPDATE product_variants SET variant_name = $1 WHERE product_id = $2`,
        [variantName, parseInt(id)]
      );
      console.log('Updated variant_name to:', variantName);
    }

    // Update stock if provided
    if (finalStock !== null && finalStock !== undefined) {
      const stockQty = parseInt(finalStock);
      const locationId = req.user?.default_location_id || 1;

      console.log('Stock update requested:', { productId: id, stockQty, locationId });

      // Get the default variant for this product using pool directly
      const pool = db.getPool();
      const variantResult = await pool.query(
        `SELECT variant_id FROM product_variants WHERE product_id = $1 LIMIT 1`,
        [parseInt(id)]
      );

      let variantId;

      if (variantResult.rows.length > 0) {
        variantId = variantResult.rows[0].variant_id;
        console.log('Found existing variant:', variantId);
      } else {
        // Create a default variant if none exists
        console.log('No variant found, creating default variant');
        const newVariantResult = await pool.query(
          `INSERT INTO product_variants (product_id, sku, variant_name, price, cost_price, is_active)
           VALUES ($1, $2, 'Default', $3, $4, true)
           RETURNING variant_id`,
          [parseInt(id), p.product_code, p.base_price, p.cost_price || 0]
        );
        variantId = newVariantResult.rows[0].variant_id;
        console.log('Created new variant:', variantId);
      }

      // Check if inventory record exists
      const existingInventory = await pool.query(
        `SELECT inventory_id FROM inventory WHERE variant_id = $1 AND location_id = $2`,
        [variantId, locationId]
      );

      if (existingInventory.rows.length > 0) {
        // Update existing inventory record
        console.log('Updating existing inventory record');
        await pool.query(
          `UPDATE inventory SET quantity_on_hand = $1, updated_at = CURRENT_TIMESTAMP
           WHERE variant_id = $2 AND location_id = $3`,
          [stockQty, variantId, locationId]
        );
      } else {
        // Insert new inventory record
        console.log('Inserting new inventory record');
        await pool.query(
          `INSERT INTO inventory (variant_id, location_id, quantity_on_hand, updated_at)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
          [variantId, locationId, stockQty]
        );
      }

      console.log('Stock update completed successfully');
    }

    // Get updated total stock
    const pool = db.getPool();
    const stockResult = await pool.query(
      `SELECT COALESCE(SUM(i.quantity_on_hand), 0) as total_stock 
       FROM product_variants pv 
       LEFT JOIN inventory i ON pv.variant_id = i.variant_id 
       WHERE pv.product_id = $1`,
      [parseInt(id)]
    );

    const finalTotalStock = parseInt(stockResult.rows[0]?.total_stock) || 0;
    console.log('Final total stock:', finalTotalStock);

    // Return transformed response matching GET format
    res.json({
      id: p.product_id,
      code: p.product_code,
      name: p.product_name,
      categoryId: p.category_id,
      description: p.description,
      basePrice: p.base_price,
      costPrice: p.cost_price,
      taxRate: p.tax_rate,
      isActive: p.is_active,
      totalStock: finalTotalStock,
      updatedAt: p.updated_at
    });
  } catch (error) {
    next(error);
  }
});

// Toggle product active status (activate/deactivate)
router.patch('/:id/toggle-active', authorize('products'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const pool = db.getPool();

    // Toggle the is_active status
    const result = await pool.query(
      `UPDATE products 
       SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP 
       WHERE product_id = $1 
       RETURNING product_id, product_name, is_active`,
      [parseInt(id)]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Product not found');
    }

    const product = result.rows[0];

    // Also toggle variants
    await pool.query(
      `UPDATE product_variants SET is_active = $1 WHERE product_id = $2`,
      [product.is_active, parseInt(id)]
    );

    const action = product.is_active ? 'activated' : 'deactivated';
    res.json({
      success: true,
      message: `Product ${action} successfully`,
      isActive: product.is_active
    });
  } catch (error) {
    next(error);
  }
});

// Delete product (HARD delete - permanently removes from database)
router.delete('/:id', authorize('products'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const pool = db.getPool();

    // First get all variant IDs for this product
    const variantsResult = await pool.query(
      `SELECT variant_id FROM product_variants WHERE product_id = $1`,
      [parseInt(id)]
    );
    const variantIds = variantsResult.rows.map(v => v.variant_id);

    if (variantIds.length > 0) {
      // Check if this product has any sales history
      const salesCheck = await pool.query(
        `SELECT COUNT(*) as count FROM sale_items WHERE variant_id = ANY($1)`,
        [variantIds]
      );

      if (parseInt(salesCheck.rows[0].count) > 0) {
        return res.status(400).json({
          error: 'Cannot delete product with sales history',
          message: 'This product has been sold before. To remove it from POS, use the Deactivate button instead. This preserves your transaction history.'
        });
      }

      // Delete inventory records that reference these variants
      await pool.query(
        `DELETE FROM inventory WHERE variant_id = ANY($1)`,
        [variantIds]
      );

      // Delete inventory transactions that reference these variants
      await pool.query(
        `DELETE FROM inventory_transactions WHERE variant_id = ANY($1)`,
        [variantIds]
      );
    }

    // Then delete variants
    await pool.query(
      `DELETE FROM product_variants WHERE product_id = $1`,
      [parseInt(id)]
    );

    // Finally delete the product
    const result = await pool.query(
      `DELETE FROM products WHERE product_id = $1 RETURNING *`,
      [parseInt(id)]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Product not found');
    }

    res.json({ message: 'Product permanently deleted' });
  } catch (error) {
    console.error('Delete product error:', error);
    next(error);
  }
});

module.exports = router;
