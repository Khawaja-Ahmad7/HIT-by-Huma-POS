const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');

const router = express.Router();

// Get inventory for location
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { locationId, lowStock, search, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE 1=1';
    const params = { offset, limit: parseInt(limit) };
    
    if (locationId) {
      whereClause += ' AND i.LocationID = @locationId';
      params.locationId = parseInt(locationId);
    }
    
    if (lowStock === 'true') {
      whereClause += ' AND i.QuantityOnHand <= i.ReorderLevel';
    }
    
    if (search) {
      whereClause += ` AND (pv.SKU LIKE @search OR pv.Barcode LIKE @search 
                       OR p.ProductName LIKE @search OR pv.VariantName LIKE @search)`;
      params.search = `%${search}%`;
    }
    
    const result = await db.query(
      `SELECT 
        i.InventoryID, i.QuantityOnHand, i.QuantityReserved, i.ReorderLevel, 
        i.ReorderQuantity, i.BinLocation, i.LastStockCheck,
        pv.VariantID, pv.SKU, pv.Barcode, pv.VariantName, pv.Price,
        p.ProductID, p.ProductName, p.ProductCode, p.ImageURL,
        c.CategoryName,
        l.LocationID, l.LocationCode, l.LocationName,
        (i.QuantityOnHand - i.QuantityReserved) AS AvailableQuantity
       FROM Inventory i
       INNER JOIN ProductVariants pv ON i.VariantID = pv.VariantID
       INNER JOIN Products p ON pv.ProductID = p.ProductID
       LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
       INNER JOIN Locations l ON i.LocationID = l.LocationID
       ${whereClause}
       ORDER BY p.ProductName, pv.VariantName
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
      params
    );
    
    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM Inventory i
       INNER JOIN ProductVariants pv ON i.VariantID = pv.VariantID
       INNER JOIN Products p ON pv.ProductID = p.ProductID
       ${whereClause}`,
      params
    );
    
    res.json({
      inventory: result.recordset.map(item => ({
        id: item.InventoryID,
        quantity: item.QuantityOnHand,
        reserved: item.QuantityReserved,
        available: item.AvailableQuantity,
        reorderLevel: item.ReorderLevel,
        reorderQuantity: item.ReorderQuantity,
        binLocation: item.BinLocation,
        lastStockCheck: item.LastStockCheck,
        variant: {
          id: item.VariantID,
          sku: item.SKU,
          barcode: item.Barcode,
          name: item.VariantName,
          price: item.Price,
        },
        product: {
          id: item.ProductID,
          code: item.ProductCode,
          name: item.ProductName,
          imageUrl: item.ImageURL,
          category: item.CategoryName,
        },
        location: {
          id: item.LocationID,
          code: item.LocationCode,
          name: item.LocationName,
        },
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult.recordset[0].total,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get inventory alerts (low stock and out of stock)
router.get('/alerts', authenticate, async (req, res, next) => {
  try {
    const { locationId } = req.query;
    
    let whereClause = 'WHERE i.QuantityOnHand <= i.ReorderLevel AND pv.IsActive = 1';
    const params = {};
    
    if (locationId) {
      whereClause += ' AND i.LocationID = @locationId';
      params.locationId = parseInt(locationId);
    }
    
    const result = await db.query(
      `SELECT TOP 20
        pv.VariantID AS id,
        p.ProductName + ISNULL(' - ' + pv.VariantName, '') AS name,
        pv.SKU AS sku,
        i.QuantityOnHand AS quantity,
        i.ReorderLevel AS reorderLevel,
        l.LocationName AS location
       FROM Inventory i
       INNER JOIN ProductVariants pv ON i.VariantID = pv.VariantID
       INNER JOIN Products p ON pv.ProductID = p.ProductID
       INNER JOIN Locations l ON i.LocationID = l.LocationID
       ${whereClause}
       ORDER BY i.QuantityOnHand ASC, p.ProductName`,
      params
    );
    
    res.json(result.recordset);
  } catch (error) {
    next(error);
  }
});

// Check stock at other locations
router.get('/check-other-locations/:variantId', authenticate, async (req, res, next) => {
  try {
    const { variantId } = req.params;
    const { currentLocationId } = req.query;
    
    const result = await db.query(
      `SELECT 
        l.LocationID, l.LocationCode, l.LocationName, l.Phone, l.Address,
        i.QuantityOnHand, i.QuantityReserved,
        (i.QuantityOnHand - i.QuantityReserved) AS Available
       FROM Inventory i
       INNER JOIN Locations l ON i.LocationID = l.LocationID
       WHERE i.VariantID = @variantId
         AND i.LocationID != @currentLocationId
         AND l.IsActive = 1
         AND i.QuantityOnHand > 0
       ORDER BY i.QuantityOnHand DESC`,
      { 
        variantId: parseInt(variantId), 
        currentLocationId: parseInt(currentLocationId) || 0 
      }
    );
    
    res.json({
      locations: result.recordset.map(loc => ({
        id: loc.LocationID,
        code: loc.LocationCode,
        name: loc.LocationName,
        phone: loc.Phone,
        address: loc.Address,
        quantity: loc.QuantityOnHand,
        reserved: loc.QuantityReserved,
        available: loc.Available,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// Adjust inventory
router.post('/adjust', authenticate, authorize('inventory.adjust'), [
  body('variantId').isInt(),
  body('locationId').isInt(),
  body('adjustment').isInt(),
  body('reason').notEmpty(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }
    
    const { variantId, locationId, adjustment, reason, notes } = req.body;
    
    // Get current inventory
    let inventory = await db.query(
      `SELECT InventoryID, QuantityOnHand FROM Inventory 
       WHERE VariantID = @variantId AND LocationID = @locationId`,
      { variantId, locationId }
    );
    
    let quantityBefore = 0;
    
    if (inventory.recordset.length === 0) {
      // Create inventory record
      await db.query(
        `INSERT INTO Inventory (VariantID, LocationID, QuantityOnHand)
         VALUES (@variantId, @locationId, 0)`,
        { variantId, locationId }
      );
    } else {
      quantityBefore = inventory.recordset[0].QuantityOnHand;
    }
    
    const quantityAfter = quantityBefore + adjustment;
    
    if (quantityAfter < 0) {
      throw new ValidationError('Adjustment would result in negative inventory');
    }
    
    // Update inventory
    await db.query(
      `UPDATE Inventory SET QuantityOnHand = @quantity, UpdatedAt = GETDATE()
       WHERE VariantID = @variantId AND LocationID = @locationId`,
      { quantity: quantityAfter, variantId, locationId }
    );
    
    // Log transaction
    await db.query(
      `INSERT INTO InventoryTransactions (
        VariantID, LocationID, TransactionType, QuantityChange,
        QuantityBefore, QuantityAfter, ReferenceType, Notes, CreatedBy
       ) VALUES (
        @variantId, @locationId, 'ADJUSTMENT', @adjustment,
        @quantityBefore, @quantityAfter, @reason, @notes, @userId
       )`,
      { 
        variantId, locationId, adjustment, quantityBefore, quantityAfter,
        reason, notes: notes || null, userId: req.user.UserID
      }
    );
    
    // Emit real-time update
    const io = req.app.get('io');
    io.to(`location-${locationId}`).emit('inventory-updated', {
      variantId,
      locationId,
      quantity: quantityAfter,
    });
    
    res.json({
      success: true,
      message: 'Inventory adjusted successfully',
      newQuantity: quantityAfter,
    });
  } catch (error) {
    next(error);
  }
});

// Receive stock
router.post('/receive', authenticate, authorize('inventory.receive'), [
  body('items').isArray().notEmpty(),
  body('items.*.variantId').isInt(),
  body('items.*.quantity').isInt({ min: 1 }),
  body('locationId').isInt(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }
    
    const { items, locationId, referenceNumber, notes } = req.body;
    
    await db.transaction(async (transaction) => {
      for (const item of items) {
        const request = transaction.request();
        
        // Get current inventory
        const inventory = await request
          .input('variantId', item.variantId)
          .input('locationId', locationId)
          .query(`
            SELECT QuantityOnHand FROM Inventory 
            WHERE VariantID = @variantId AND LocationID = @locationId
          `);
        
        let quantityBefore = 0;
        
        if (inventory.recordset.length === 0) {
          await transaction.request()
            .input('variantId', item.variantId)
            .input('locationId', locationId)
            .input('quantity', item.quantity)
            .query(`
              INSERT INTO Inventory (VariantID, LocationID, QuantityOnHand)
              VALUES (@variantId, @locationId, @quantity)
            `);
        } else {
          quantityBefore = inventory.recordset[0].QuantityOnHand;
          await transaction.request()
            .input('variantId', item.variantId)
            .input('locationId', locationId)
            .input('quantity', quantityBefore + item.quantity)
            .query(`
              UPDATE Inventory SET QuantityOnHand = @quantity, UpdatedAt = GETDATE()
              WHERE VariantID = @variantId AND LocationID = @locationId
            `);
        }
        
        // Log transaction
        await transaction.request()
          .input('variantId', item.variantId)
          .input('locationId', locationId)
          .input('quantity', item.quantity)
          .input('quantityBefore', quantityBefore)
          .input('quantityAfter', quantityBefore + item.quantity)
          .input('reference', referenceNumber || null)
          .input('notes', notes || null)
          .input('userId', req.user.UserID)
          .query(`
            INSERT INTO InventoryTransactions (
              VariantID, LocationID, TransactionType, QuantityChange,
              QuantityBefore, QuantityAfter, ReferenceType, Notes, CreatedBy
            ) VALUES (
              @variantId, @locationId, 'RECEIVE', @quantity,
              @quantityBefore, @quantityAfter, @reference, @notes, @userId
            )
          `);
      }
    });
    
    // Emit real-time update
    const io = req.app.get('io');
    io.to(`location-${locationId}`).emit('inventory-received', { items, locationId });
    
    res.json({ success: true, message: 'Stock received successfully' });
  } catch (error) {
    next(error);
  }
});

// Get inventory transactions history
router.get('/transactions', authenticate, async (req, res, next) => {
  try {
    const { variantId, locationId, type, startDate, endDate, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE 1=1';
    const params = { offset, limit: parseInt(limit) };
    
    if (variantId) {
      whereClause += ' AND it.VariantID = @variantId';
      params.variantId = parseInt(variantId);
    }
    
    if (locationId) {
      whereClause += ' AND it.LocationID = @locationId';
      params.locationId = parseInt(locationId);
    }
    
    if (type) {
      whereClause += ' AND it.TransactionType = @type';
      params.type = type;
    }
    
    if (startDate) {
      whereClause += ' AND it.CreatedAt >= @startDate';
      params.startDate = new Date(startDate);
    }
    
    if (endDate) {
      whereClause += ' AND it.CreatedAt <= @endDate';
      params.endDate = new Date(endDate);
    }
    
    const result = await db.query(
      `SELECT 
        it.*,
        pv.SKU, pv.VariantName,
        p.ProductName,
        l.LocationCode, l.LocationName,
        u.FirstName + ' ' + u.LastName AS UserName
       FROM InventoryTransactions it
       INNER JOIN ProductVariants pv ON it.VariantID = pv.VariantID
       INNER JOIN Products p ON pv.ProductID = p.ProductID
       INNER JOIN Locations l ON it.LocationID = l.LocationID
       LEFT JOIN Users u ON it.CreatedBy = u.UserID
       ${whereClause}
       ORDER BY it.CreatedAt DESC
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
      params
    );
    
    res.json({ transactions: result.recordset });
  } catch (error) {
    next(error);
  }
});

// Get locations
router.get('/locations', authenticate, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT LocationID, LocationCode, LocationName, Address, City, Phone, Email, IsHeadquarters
       FROM Locations WHERE IsActive = 1 ORDER BY SortOrder, LocationName`
    );
    
    res.json({ locations: result.recordset });
  } catch (error) {
    next(error);
  }
});

// Create stock transfer
router.post('/transfers', authenticate, authorize('inventory.transfer'), [
  body('fromLocationId').isInt(),
  body('toLocationId').isInt(),
  body('items').isArray().notEmpty(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }
    
    const { fromLocationId, toLocationId, items, notes } = req.body;
    
    if (fromLocationId === toLocationId) {
      throw new ValidationError('Cannot transfer to same location');
    }
    
    // Generate transfer number
    const transferNumber = `TR-${Date.now()}`;
    
    const result = await db.transaction(async (transaction) => {
      // Create transfer
      const transferResult = await transaction.request()
        .input('transferNumber', transferNumber)
        .input('fromLocationId', fromLocationId)
        .input('toLocationId', toLocationId)
        .input('notes', notes || null)
        .input('requestedBy', req.user.UserID)
        .query(`
          INSERT INTO StockTransfers (TransferNumber, FromLocationID, ToLocationID, Notes, RequestedBy)
          OUTPUT INSERTED.TransferID
          VALUES (@transferNumber, @fromLocationId, @toLocationId, @notes, @requestedBy)
        `);
      
      const transferId = transferResult.recordset[0].TransferID;
      
      // Add transfer items
      for (const item of items) {
        await transaction.request()
          .input('transferId', transferId)
          .input('variantId', item.variantId)
          .input('quantity', item.quantity)
          .query(`
            INSERT INTO StockTransferItems (TransferID, VariantID, QuantityRequested)
            VALUES (@transferId, @variantId, @quantity)
          `);
      }
      
      return transferId;
    });
    
    res.status(201).json({
      success: true,
      transferId: result,
      transferNumber,
      message: 'Stock transfer created successfully',
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
