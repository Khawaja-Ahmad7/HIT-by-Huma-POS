const express = require('express');
const { body, query, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');
const { generateSKU, generateBarcode } = require('../utils/productUtils');

const router = express.Router();

// Get all products with variants
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { categoryId, search, active, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE 1=1';
    const params = {};
    
    if (categoryId) {
      whereClause += ' AND p.CategoryID = @categoryId';
      params.categoryId = parseInt(categoryId);
    }
    
    if (search) {
      whereClause += ` AND (p.ProductName LIKE @search OR p.ProductCode LIKE @search 
                       OR pv.SKU LIKE @search OR pv.Barcode LIKE @search)`;
      params.search = `%${search}%`;
    }
    
    if (active !== undefined) {
      whereClause += ' AND p.IsActive = @active';
      params.active = active === 'true';
    }
    
    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(DISTINCT p.ProductID) as total
       FROM Products p
       LEFT JOIN ProductVariants pv ON p.ProductID = pv.ProductID
       ${whereClause}`,
      params
    );
    
    // Get products with variants and stock
    const result = await db.query(
      `SELECT 
        p.ProductID, p.ProductCode, p.ProductName, p.Description,
        p.BasePrice, p.CostPrice, p.TaxRate, p.HasVariants, p.PropagatePrice,
        p.ImageURL, p.Tags, p.IsActive,
        c.CategoryID, c.CategoryName,
        pv.VariantID, pv.SKU, pv.Barcode, pv.VariantName, 
        pv.Price AS VariantPrice, pv.IsDefault, pv.IsActive AS VariantActive,
        ISNULL(SUM(i.QuantityOnHand), 0) AS VariantStock
       FROM Products p
       LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
       LEFT JOIN ProductVariants pv ON p.ProductID = pv.ProductID
       LEFT JOIN Inventory i ON pv.VariantID = i.VariantID
       ${whereClause}
       GROUP BY p.ProductID, p.ProductCode, p.ProductName, p.Description,
        p.BasePrice, p.CostPrice, p.TaxRate, p.HasVariants, p.PropagatePrice,
        p.ImageURL, p.Tags, p.IsActive,
        c.CategoryID, c.CategoryName,
        pv.VariantID, pv.SKU, pv.Barcode, pv.VariantName, 
        pv.Price, pv.IsDefault, pv.IsActive
       ORDER BY p.ProductName, pv.VariantName
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
      { ...params, offset, limit: parseInt(limit) }
    );
    
    // Group variants under products
    const productsMap = new Map();
    result.recordset.forEach(row => {
      if (!productsMap.has(row.ProductID)) {
        productsMap.set(row.ProductID, {
          id: row.ProductID,
          code: row.ProductCode,
          name: row.ProductName,
          description: row.Description,
          basePrice: row.BasePrice,
          costPrice: row.CostPrice,
          taxRate: row.TaxRate,
          hasVariants: row.HasVariants,
          propagatePrice: row.PropagatePrice,
          imageUrl: row.ImageURL,
          tags: row.Tags,
          isActive: row.IsActive,
          totalStock: 0, // Initialize totalStock to 0
          category: row.CategoryID ? {
            id: row.CategoryID,
            name: row.CategoryName,
          } : null,
          variants: [],
        });
      }
      
      if (row.VariantID) {
        productsMap.get(row.ProductID).variants.push({
          id: row.VariantID,
          sku: row.SKU,
          barcode: row.Barcode,
          name: row.VariantName,
          price: row.VariantPrice,
          isDefault: row.IsDefault,
          isActive: row.VariantActive,
          stock: row.VariantStock || 0,
        });
        // Add to total stock
        productsMap.get(row.ProductID).totalStock = 
          (productsMap.get(row.ProductID).totalStock || 0) + (row.VariantStock || 0);
      }
    });
    
    res.json({
      products: Array.from(productsMap.values()),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult.recordset[0].total,
        pages: Math.ceil(countResult.recordset[0].total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get single product with full details
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const productResult = await db.query(
      `SELECT p.*, c.CategoryName
       FROM Products p
       LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
       WHERE p.ProductID = @id`,
      { id: parseInt(id) }
    );
    
    if (productResult.recordset.length === 0) {
      throw new NotFoundError('Product');
    }
    
    const product = productResult.recordset[0];
    
    // Get variants with attributes
    const variantsResult = await db.query(
      `SELECT pv.*, 
        (SELECT va.AttributeID, a.AttributeName, va.AttributeValueID, av.Value, av.ColorHex
         FROM VariantAttributes va
         INNER JOIN Attributes a ON va.AttributeID = a.AttributeID
         INNER JOIN AttributeValues av ON va.AttributeValueID = av.AttributeValueID
         WHERE va.VariantID = pv.VariantID
         FOR JSON PATH) AS Attributes
       FROM ProductVariants pv
       WHERE pv.ProductID = @id
       ORDER BY pv.VariantName`,
      { id: parseInt(id) }
    );
    
    // Get product attributes
    const attributesResult = await db.query(
      `SELECT pa.*, a.AttributeName, a.AttributeType,
        (SELECT av.AttributeValueID, av.Value, av.ColorHex, av.SortOrder
         FROM AttributeValues av
         WHERE av.AttributeID = pa.AttributeID AND av.IsActive = 1
         ORDER BY av.SortOrder
         FOR JSON PATH) AS Values
       FROM ProductAttributes pa
       INNER JOIN Attributes a ON pa.AttributeID = a.AttributeID
       WHERE pa.ProductID = @id
       ORDER BY pa.SortOrder`,
      { id: parseInt(id) }
    );
    
    res.json({
      id: product.ProductID,
      code: product.ProductCode,
      name: product.ProductName,
      description: product.Description,
      basePrice: product.BasePrice,
      costPrice: product.CostPrice,
      taxRate: product.TaxRate,
      hasVariants: product.HasVariants,
      propagatePrice: product.PropagatePrice,
      imageUrl: product.ImageURL,
      tags: product.Tags,
      isActive: product.IsActive,
      category: product.CategoryID ? {
        id: product.CategoryID,
        name: product.CategoryName,
      } : null,
      attributes: attributesResult.recordset.map(attr => ({
        id: attr.AttributeID,
        name: attr.AttributeName,
        type: attr.AttributeType,
        isRequired: attr.IsRequired,
        values: JSON.parse(attr.Values || '[]'),
      })),
      variants: variantsResult.recordset.map(v => ({
        id: v.VariantID,
        sku: v.SKU,
        barcode: v.Barcode,
        name: v.VariantName,
        price: v.Price,
        costPrice: v.CostPrice,
        isDefault: v.IsDefault,
        isActive: v.IsActive,
        attributes: JSON.parse(v.Attributes || '[]'),
      })),
    });
  } catch (error) {
    next(error);
  }
});

// Create product with variants
router.post('/', authenticate, authorize('products.create'), [
  body('name').notEmpty().trim(),
  body('code').notEmpty().trim(),
  body('basePrice').isNumeric(),
  body('categoryId').optional().isInt(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }
    
    const {
      code, name, description, categoryId, basePrice, costPrice = 0,
      taxRate = 0, hasVariants = false, propagatePrice = true,
      imageUrl, tags, attributes = [], variants = []
    } = req.body;
    
    // Check if code exists
    const existingCode = await db.query(
      'SELECT ProductID FROM Products WHERE ProductCode = @code',
      { code }
    );
    
    if (existingCode.recordset.length > 0) {
      throw new ValidationError('Product code already exists');
    }
    
    // Start transaction
    const result = await db.transaction(async (transaction) => {
      const request = transaction.request();
      
      // Insert product
      const productResult = await request
        .input('code', code)
        .input('name', name)
        .input('description', description || null)
        .input('categoryId', categoryId || null)
        .input('basePrice', basePrice)
        .input('costPrice', costPrice)
        .input('taxRate', taxRate)
        .input('hasVariants', hasVariants)
        .input('propagatePrice', propagatePrice)
        .input('imageUrl', imageUrl || null)
        .input('tags', tags || null)
        .input('createdBy', req.user.UserID)
        .query(`
          INSERT INTO Products (
            ProductCode, ProductName, Description, CategoryID, BasePrice, CostPrice,
            TaxRate, HasVariants, PropagatePrice, ImageURL, Tags, CreatedBy
          )
          OUTPUT INSERTED.ProductID
          VALUES (
            @code, @name, @description, @categoryId, @basePrice, @costPrice,
            @taxRate, @hasVariants, @propagatePrice, @imageUrl, @tags, @createdBy
          )
        `);
      
      const productId = productResult.recordset[0].ProductID;
      
      // Insert product attributes
      for (const attr of attributes) {
        await transaction.request()
          .input('productId', productId)
          .input('attributeId', attr.attributeId)
          .input('isRequired', attr.isRequired || true)
          .input('sortOrder', attr.sortOrder || 0)
          .query(`
            INSERT INTO ProductAttributes (ProductID, AttributeID, IsRequired, SortOrder)
            VALUES (@productId, @attributeId, @isRequired, @sortOrder)
          `);
      }
      
      // Insert variants
      if (hasVariants && variants.length > 0) {
        for (const variant of variants) {
          const sku = variant.sku || generateSKU(code, variant.attributes);
          const barcode = variant.barcode || generateBarcode();
          
          const variantResult = await transaction.request()
            .input('productId', productId)
            .input('sku', sku)
            .input('barcode', barcode)
            .input('variantName', variant.name || `${name} - ${Object.values(variant.attributes || {}).join(' - ')}`)
            .input('price', variant.price || basePrice)
            .input('costPrice', variant.costPrice || costPrice)
            .input('isDefault', variant.isDefault || false)
            .query(`
              INSERT INTO ProductVariants (ProductID, SKU, Barcode, VariantName, Price, CostPrice, IsDefault)
              OUTPUT INSERTED.VariantID
              VALUES (@productId, @sku, @barcode, @variantName, @price, @costPrice, @isDefault)
            `);
          
          const variantId = variantResult.recordset[0].VariantID;
          
          // Insert variant attributes
          if (variant.attributes) {
            for (const [attrId, valueId] of Object.entries(variant.attributes)) {
              await transaction.request()
                .input('variantId', variantId)
                .input('attributeId', parseInt(attrId))
                .input('valueId', parseInt(valueId))
                .query(`
                  INSERT INTO VariantAttributes (VariantID, AttributeID, AttributeValueID)
                  VALUES (@variantId, @attributeId, @valueId)
                `);
            }
          }
        }
      } else {
        // Create default variant for non-variant products
        const sku = generateSKU(code, {});
        const barcode = generateBarcode();
        
        await transaction.request()
          .input('productId', productId)
          .input('sku', sku)
          .input('barcode', barcode)
          .input('variantName', name)
          .input('price', basePrice)
          .input('costPrice', costPrice)
          .query(`
            INSERT INTO ProductVariants (ProductID, SKU, Barcode, VariantName, Price, CostPrice, IsDefault)
            VALUES (@productId, @sku, @barcode, @variantName, @price, @costPrice, 1)
          `);
      }
      
      return productId;
    });
    
    res.status(201).json({
      success: true,
      productId: result,
      message: 'Product created successfully',
    });
  } catch (error) {
    next(error);
  }
});

// Update product
router.put('/:id', authenticate, authorize('products.update'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name, description, categoryId, basePrice, costPrice,
      taxRate, propagatePrice, imageUrl, tags, isActive
    } = req.body;
    
    const product = await db.query(
      'SELECT ProductID, PropagatePrice FROM Products WHERE ProductID = @id',
      { id: parseInt(id) }
    );
    
    if (product.recordset.length === 0) {
      throw new NotFoundError('Product');
    }
    
    await db.query(
      `UPDATE Products SET
        ProductName = COALESCE(@name, ProductName),
        Description = COALESCE(@description, Description),
        CategoryID = COALESCE(@categoryId, CategoryID),
        BasePrice = COALESCE(@basePrice, BasePrice),
        CostPrice = COALESCE(@costPrice, CostPrice),
        TaxRate = COALESCE(@taxRate, TaxRate),
        PropagatePrice = COALESCE(@propagatePrice, PropagatePrice),
        ImageURL = COALESCE(@imageUrl, ImageURL),
        Tags = COALESCE(@tags, Tags),
        IsActive = COALESCE(@isActive, IsActive),
        UpdatedAt = GETDATE()
       WHERE ProductID = @id`,
      {
        id: parseInt(id),
        name, description, categoryId, basePrice, costPrice,
        taxRate, propagatePrice, imageUrl, tags, isActive
      }
    );
    
    // Propagate price to variants if enabled
    if (basePrice && propagatePrice !== false && product.recordset[0].PropagatePrice) {
      await db.query(
        `UPDATE ProductVariants SET Price = @basePrice, UpdatedAt = GETDATE()
         WHERE ProductID = @id`,
        { id: parseInt(id), basePrice }
      );
    }
    
    res.json({ success: true, message: 'Product updated successfully' });
  } catch (error) {
    next(error);
  }
});

// Search products (for POS - fast lookup)
router.get('/search/quick', authenticate, async (req, res, next) => {
  try {
    const { q, locationId } = req.query;
    
    if (!q || q.length < 2) {
      return res.json({ results: [] });
    }
    
    const result = await db.query(
      `SELECT TOP 20
        pv.VariantID, pv.SKU, pv.Barcode, pv.VariantName, pv.Price,
        p.ProductID, p.ProductName, p.ImageURL,
        c.CategoryName,
        COALESCE(i.QuantityOnHand, 0) - COALESCE(i.QuantityReserved, 0) AS AvailableStock
       FROM ProductVariants pv
       INNER JOIN Products p ON pv.ProductID = p.ProductID
       LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
       LEFT JOIN Inventory i ON pv.VariantID = i.VariantID AND i.LocationID = @locationId
       WHERE pv.IsActive = 1 AND p.IsActive = 1
         AND (pv.SKU LIKE @search OR pv.Barcode = @exact OR p.ProductName LIKE @search)
       ORDER BY 
         CASE WHEN pv.Barcode = @exact THEN 0 ELSE 1 END,
         p.ProductName`,
      { 
        search: `%${q}%`, 
        exact: q,
        locationId: parseInt(locationId) || 1
      }
    );
    
    res.json({
      results: result.recordset.map(r => ({
        variantId: r.VariantID,
        sku: r.SKU,
        barcode: r.Barcode,
        variantName: r.VariantName,
        productName: r.ProductName,
        price: r.Price,
        imageUrl: r.ImageURL,
        category: r.CategoryName,
        stock: r.AvailableStock,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// Get categories
router.get('/categories/list', authenticate, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT CategoryID, CategoryName, ParentCategoryID, Description, SortOrder
       FROM Categories
       WHERE IsActive = 1
       ORDER BY SortOrder, CategoryName`
    );
    
    res.json({ categories: result.recordset });
  } catch (error) {
    next(error);
  }
});

// Get attributes
router.get('/attributes/list', authenticate, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT a.AttributeID, a.AttributeName, a.AttributeType, a.SortOrder,
        (SELECT av.AttributeValueID, av.Value, av.ColorHex, av.SortOrder
         FROM AttributeValues av
         WHERE av.AttributeID = a.AttributeID AND av.IsActive = 1
         ORDER BY av.SortOrder
         FOR JSON PATH) AS Values
       FROM Attributes a
       WHERE a.IsActive = 1
       ORDER BY a.SortOrder`
    );
    
    res.json({
      attributes: result.recordset.map(attr => ({
        id: attr.AttributeID,
        name: attr.AttributeName,
        type: attr.AttributeType,
        values: JSON.parse(attr.Values || '[]'),
      })),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
