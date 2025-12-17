const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate, authorize, verifyManagerPIN } = require('../middleware/auth');
const { ValidationError, NotFoundError, ForbiddenError } = require('../middleware/errorHandler');
const { addToSMSQueue } = require('../services/notificationService');

const router = express.Router();

// Get sales list
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { locationId, status, startDate, endDate, customerId, userId, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE 1=1';
    const params = { offset, limit: parseInt(limit) };
    
    if (locationId) {
      whereClause += ' AND s.LocationID = @locationId';
      params.locationId = parseInt(locationId);
    }
    
    if (status) {
      whereClause += ' AND s.Status = @status';
      params.status = status;
    }
    
    if (startDate) {
      whereClause += ' AND s.CreatedAt >= @startDate';
      params.startDate = new Date(startDate);
    }
    
    if (endDate) {
      whereClause += ' AND s.CreatedAt <= @endDate';
      params.endDate = new Date(endDate);
    }
    
    if (customerId) {
      whereClause += ' AND s.CustomerID = @customerId';
      params.customerId = parseInt(customerId);
    }
    
    if (userId) {
      whereClause += ' AND s.UserID = @userId';
      params.userId = parseInt(userId);
    }
    
    const result = await db.query(
      `SELECT 
        s.SaleID, s.SaleNumber, s.SubTotal, s.DiscountAmount, s.TaxAmount, s.TotalAmount,
        s.Status, s.IsParked, s.ParkedNotes, s.CreatedAt,
        l.LocationCode, l.LocationName,
        c.CustomerID, c.FirstName AS CustomerFirstName, c.LastName AS CustomerLastName, c.Phone AS CustomerPhone,
        u.FirstName AS CashierFirstName, u.LastName AS CashierLastName
       FROM Sales s
       INNER JOIN Locations l ON s.LocationID = l.LocationID
       LEFT JOIN Customers c ON s.CustomerID = c.CustomerID
       INNER JOIN Users u ON s.UserID = u.UserID
       ${whereClause}
       ORDER BY s.CreatedAt DESC
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
      params
    );
    
    res.json({ sales: result.recordset });
  } catch (error) {
    next(error);
  }
});

// Get sale details
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const saleResult = await db.query(
      `SELECT s.*, 
        l.LocationCode, l.LocationName,
        c.FirstName AS CustomerFirstName, c.LastName AS CustomerLastName, c.Phone AS CustomerPhone,
        u.FirstName AS CashierFirstName, u.LastName AS CashierLastName
       FROM Sales s
       INNER JOIN Locations l ON s.LocationID = l.LocationID
       LEFT JOIN Customers c ON s.CustomerID = c.CustomerID
       INNER JOIN Users u ON s.UserID = u.UserID
       WHERE s.SaleID = @id`,
      { id: parseInt(id) }
    );
    
    if (saleResult.recordset.length === 0) {
      throw new NotFoundError('Sale');
    }
    
    const sale = saleResult.recordset[0];
    
    // Get items
    const itemsResult = await db.query(
      `SELECT si.*, 
        pv.SKU, pv.Barcode, pv.VariantName,
        p.ProductName, p.ImageURL
       FROM SaleItems si
       INNER JOIN ProductVariants pv ON si.VariantID = pv.VariantID
       INNER JOIN Products p ON pv.ProductID = p.ProductID
       WHERE si.SaleID = @id`,
      { id: parseInt(id) }
    );
    
    // Get payments
    const paymentsResult = await db.query(
      `SELECT sp.*, pm.MethodName, pm.MethodType
       FROM SalePayments sp
       INNER JOIN PaymentMethods pm ON sp.PaymentMethodID = pm.PaymentMethodID
       WHERE sp.SaleID = @id`,
      { id: parseInt(id) }
    );
    
    res.json({
      sale: {
        ...sale,
        items: itemsResult.recordset,
        payments: paymentsResult.recordset,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Create sale (Checkout)
router.post('/', authenticate, authorize('pos.sale'), [
  body('locationId').isInt(),
  body('items').isArray().notEmpty(),
  body('items.*.variantId').isInt(),
  body('items.*.quantity').isInt({ min: 1 }),
  body('items.*.price').isNumeric(),
  body('payments').isArray().notEmpty(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }
    
    const {
      locationId, customerId, shiftId, items, payments,
      discountAmount = 0, discountType, discountReason, notes
    } = req.body;
    
    // Calculate totals
    let subTotal = 0;
    items.forEach(item => {
      subTotal += item.price * item.quantity;
    });
    
    const taxAmount = 0; // Implement tax calculation if needed
    const totalAmount = subTotal - discountAmount + taxAmount;
    
    // Validate payment total
    const paymentTotal = payments.reduce((sum, p) => sum + p.amount, 0);
    if (paymentTotal < totalAmount) {
      throw new ValidationError('Payment amount is less than total');
    }
    
    // Generate sale number
    const locationResult = await db.query(
      'SELECT LocationCode FROM Locations WHERE LocationID = @locationId',
      { locationId }
    );
    const locationCode = locationResult.recordset[0]?.LocationCode || 'POS';
    
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const countResult = await db.query(
      `SELECT COUNT(*) + 1 AS seq FROM Sales 
       WHERE LocationID = @locationId AND CAST(CreatedAt AS DATE) = CAST(GETDATE() AS DATE)`,
      { locationId }
    );
    const sequence = String(countResult.recordset[0].seq).padStart(4, '0');
    const saleNumber = `${locationCode}-${today}-${sequence}`;
    
    const result = await db.transaction(async (transaction) => {
      // Create sale
      const saleResult = await transaction.request()
        .input('saleNumber', saleNumber)
        .input('locationId', locationId)
        .input('shiftId', shiftId || null)
        .input('customerId', customerId || null)
        .input('userId', req.user.UserID)
        .input('subTotal', subTotal)
        .input('discountAmount', discountAmount)
        .input('discountType', discountType || null)
        .input('discountReason', discountReason || null)
        .input('taxAmount', taxAmount)
        .input('totalAmount', totalAmount)
        .input('notes', notes || null)
        .query(`
          INSERT INTO Sales (
            SaleNumber, LocationID, ShiftID, CustomerID, UserID,
            SubTotal, DiscountAmount, DiscountType, DiscountReason,
            TaxAmount, TotalAmount, Status, Notes
          )
          OUTPUT INSERTED.SaleID
          VALUES (
            @saleNumber, @locationId, @shiftId, @customerId, @userId,
            @subTotal, @discountAmount, @discountType, @discountReason,
            @taxAmount, @totalAmount, 'COMPLETED', @notes
          )
        `);
      
      const saleId = saleResult.recordset[0].SaleID;
      
      // Add sale items and update inventory
      for (const item of items) {
        // Insert sale item
        await transaction.request()
          .input('saleId', saleId)
          .input('variantId', item.variantId)
          .input('quantity', item.quantity)
          .input('unitPrice', item.price)
          .input('originalPrice', item.originalPrice || item.price)
          .input('discountAmount', item.discountAmount || 0)
          .input('lineTotal', item.price * item.quantity - (item.discountAmount || 0))
          .input('priceOverrideBy', item.priceOverrideBy || null)
          .query(`
            INSERT INTO SaleItems (
              SaleID, VariantID, Quantity, UnitPrice, OriginalPrice,
              DiscountAmount, LineTotal, PriceOverrideBy
            ) VALUES (
              @saleId, @variantId, @quantity, @unitPrice, @originalPrice,
              @discountAmount, @lineTotal, @priceOverrideBy
            )
          `);
        
        // Update inventory
        const invResult = await transaction.request()
          .input('variantId', item.variantId)
          .input('locationId', locationId)
          .query(`
            SELECT InventoryID, QuantityOnHand FROM Inventory
            WHERE VariantID = @variantId AND LocationID = @locationId
          `);
        
        if (invResult.recordset.length > 0) {
          const quantityBefore = invResult.recordset[0].QuantityOnHand;
          const quantityAfter = quantityBefore - item.quantity;
          
          await transaction.request()
            .input('quantity', quantityAfter)
            .input('variantId', item.variantId)
            .input('locationId', locationId)
            .query(`
              UPDATE Inventory SET QuantityOnHand = @quantity, UpdatedAt = GETDATE()
              WHERE VariantID = @variantId AND LocationID = @locationId
            `);
          
          // Log inventory transaction
          await transaction.request()
            .input('variantId', item.variantId)
            .input('locationId', locationId)
            .input('quantity', -item.quantity)
            .input('quantityBefore', quantityBefore)
            .input('quantityAfter', quantityAfter)
            .input('saleId', saleId)
            .input('userId', req.user.UserID)
            .query(`
              INSERT INTO InventoryTransactions (
                VariantID, LocationID, TransactionType, QuantityChange,
                QuantityBefore, QuantityAfter, ReferenceType, ReferenceID, CreatedBy
              ) VALUES (
                @variantId, @locationId, 'SALE', @quantity,
                @quantityBefore, @quantityAfter, 'SALE', @saleId, @userId
              )
            `);
        }
      }
      
      // Add payments
      for (const payment of payments) {
        await transaction.request()
          .input('saleId', saleId)
          .input('paymentMethodId', payment.methodId)
          .input('amount', payment.amount)
          .input('tenderedAmount', payment.tenderedAmount || null)
          .input('changeAmount', payment.changeAmount || null)
          .input('referenceNumber', payment.referenceNumber || null)
          .query(`
            INSERT INTO SalePayments (
              SaleID, PaymentMethodID, Amount, TenderedAmount, ChangeAmount, ReferenceNumber
            ) VALUES (
              @saleId, @paymentMethodId, @amount, @tenderedAmount, @changeAmount, @referenceNumber
            )
          `);
      }
      
      // Update customer totals if customer attached
      if (customerId) {
        await transaction.request()
          .input('customerId', customerId)
          .input('amount', totalAmount)
          .query(`
            UPDATE Customers SET 
              TotalSpend = TotalSpend + @amount,
              TotalVisits = TotalVisits + 1,
              LastVisitAt = GETDATE(),
              UpdatedAt = GETDATE()
            WHERE CustomerID = @customerId
          `);
      }
      
      return { saleId, saleNumber };
    });
    
    // Send SMS notification asynchronously
    if (customerId) {
      const customer = await db.query(
        'SELECT Phone, FirstName, OptInSMS FROM Customers WHERE CustomerID = @id',
        { id: customerId }
      );
      
      if (customer.recordset[0]?.OptInSMS && customer.recordset[0]?.Phone) {
        await addToSMSQueue({
          phone: customer.recordset[0].Phone,
          message: `Dear ${customer.recordset[0].FirstName}, Thank you for shopping at HIT BY HUMA! Your purchase of PKR ${totalAmount.toLocaleString()} is complete. Receipt: ${saleNumber}`,
          referenceType: 'SALE',
          referenceId: result.saleId,
        });
      }
    }
    
    // Emit real-time updates
    const io = req.app.get('io');
    io.to(`location-${locationId}`).emit('sale-completed', {
      saleId: result.saleId,
      saleNumber: result.saleNumber,
      totalAmount,
    });
    
    res.status(201).json({
      success: true,
      saleId: result.saleId,
      saleNumber: result.saleNumber,
      totalAmount,
      message: 'Sale completed successfully',
    });
  } catch (error) {
    next(error);
  }
});

// Park a sale
router.post('/park', authenticate, authorize('pos.park'), [
  body('locationId').isInt(),
  body('items').isArray().notEmpty(),
], async (req, res, next) => {
  try {
    const { locationId, customerId, items, notes } = req.body;
    
    let subTotal = 0;
    items.forEach(item => {
      subTotal += item.price * item.quantity;
    });
    
    // Generate parked sale number
    const saleNumber = `PARK-${Date.now()}`;
    
    const result = await db.transaction(async (transaction) => {
      const saleResult = await transaction.request()
        .input('saleNumber', saleNumber)
        .input('locationId', locationId)
        .input('customerId', customerId || null)
        .input('userId', req.user.UserID)
        .input('subTotal', subTotal)
        .input('totalAmount', subTotal)
        .input('notes', notes || null)
        .query(`
          INSERT INTO Sales (
            SaleNumber, LocationID, CustomerID, UserID,
            SubTotal, TotalAmount, Status, IsParked, ParkedAt, ParkedNotes
          )
          OUTPUT INSERTED.SaleID
          VALUES (
            @saleNumber, @locationId, @customerId, @userId,
            @subTotal, @totalAmount, 'PARKED', 1, GETDATE(), @notes
          )
        `);
      
      const saleId = saleResult.recordset[0].SaleID;
      
      for (const item of items) {
        await transaction.request()
          .input('saleId', saleId)
          .input('variantId', item.variantId)
          .input('quantity', item.quantity)
          .input('unitPrice', item.price)
          .input('originalPrice', item.originalPrice || item.price)
          .input('lineTotal', item.price * item.quantity)
          .query(`
            INSERT INTO SaleItems (SaleID, VariantID, Quantity, UnitPrice, OriginalPrice, LineTotal)
            VALUES (@saleId, @variantId, @quantity, @unitPrice, @originalPrice, @lineTotal)
          `);
      }
      
      return saleId;
    });
    
    res.status(201).json({
      success: true,
      saleId: result,
      saleNumber,
      message: 'Sale parked successfully',
    });
  } catch (error) {
    next(error);
  }
});

// Get parked sales
router.get('/parked/list', authenticate, async (req, res, next) => {
  try {
    const { locationId } = req.query;
    
    const result = await db.query(
      `SELECT s.SaleID, s.SaleNumber, s.SubTotal, s.ParkedAt, s.ParkedNotes,
        c.FirstName AS CustomerName, c.Phone AS CustomerPhone,
        u.FirstName AS CashierName,
        (SELECT COUNT(*) FROM SaleItems WHERE SaleID = s.SaleID) AS ItemCount
       FROM Sales s
       LEFT JOIN Customers c ON s.CustomerID = c.CustomerID
       INNER JOIN Users u ON s.UserID = u.UserID
       WHERE s.IsParked = 1 AND s.Status = 'PARKED'
         AND (@locationId IS NULL OR s.LocationID = @locationId)
       ORDER BY s.ParkedAt DESC`,
      { locationId: locationId ? parseInt(locationId) : null }
    );
    
    res.json({ parkedSales: result.recordset });
  } catch (error) {
    next(error);
  }
});

// Retrieve parked sale
router.get('/parked/:id', authenticate, authorize('pos.retrieve'), async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const saleResult = await db.query(
      `SELECT s.*, c.FirstName, c.LastName, c.Phone
       FROM Sales s
       LEFT JOIN Customers c ON s.CustomerID = c.CustomerID
       WHERE s.SaleID = @id AND s.IsParked = 1`,
      { id: parseInt(id) }
    );
    
    if (saleResult.recordset.length === 0) {
      throw new NotFoundError('Parked sale');
    }
    
    const itemsResult = await db.query(
      `SELECT si.*, pv.SKU, pv.Barcode, pv.VariantName, p.ProductName, p.ImageURL
       FROM SaleItems si
       INNER JOIN ProductVariants pv ON si.VariantID = pv.VariantID
       INNER JOIN Products p ON pv.ProductID = p.ProductID
       WHERE si.SaleID = @id`,
      { id: parseInt(id) }
    );
    
    res.json({
      sale: saleResult.recordset[0],
      items: itemsResult.recordset,
    });
  } catch (error) {
    next(error);
  }
});

// Delete parked sale
router.delete('/parked/:id', authenticate, authorize('pos.park'), async (req, res, next) => {
  try {
    const { id } = req.params;
    
    await db.query(
      `DELETE FROM Sales WHERE SaleID = @id AND IsParked = 1`,
      { id: parseInt(id) }
    );
    
    res.json({ success: true, message: 'Parked sale deleted' });
  } catch (error) {
    next(error);
  }
});

// Void sale (requires manager approval)
router.post('/:id/void', authenticate, authorize('pos.void'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { managerPIN, reason } = req.body;
    
    // Verify manager PIN
    const managerResult = await db.query(
      `SELECT UserID, FirstName, LastName FROM Users 
       WHERE ManagerPIN = @pin AND IsActive = 1`,
      { pin: managerPIN }
    );
    
    if (managerResult.recordset.length === 0) {
      throw new ForbiddenError('Invalid manager PIN');
    }
    
    const sale = await db.query(
      'SELECT SaleID, Status, LocationID FROM Sales WHERE SaleID = @id',
      { id: parseInt(id) }
    );
    
    if (sale.recordset.length === 0) {
      throw new NotFoundError('Sale');
    }
    
    if (sale.recordset[0].Status !== 'COMPLETED') {
      throw new ValidationError('Only completed sales can be voided');
    }
    
    await db.transaction(async (transaction) => {
      // Update sale status
      await transaction.request()
        .input('id', parseInt(id))
        .input('reason', reason)
        .query(`
          UPDATE Sales SET Status = 'VOIDED', Notes = @reason, UpdatedAt = GETDATE()
          WHERE SaleID = @id
        `);
      
      // Restore inventory
      const items = await transaction.request()
        .input('saleId', parseInt(id))
        .query(`
          SELECT VariantID, Quantity FROM SaleItems WHERE SaleID = @saleId
        `);
      
      for (const item of items.recordset) {
        await transaction.request()
          .input('variantId', item.VariantID)
          .input('locationId', sale.recordset[0].LocationID)
          .input('quantity', item.Quantity)
          .query(`
            UPDATE Inventory SET QuantityOnHand = QuantityOnHand + @quantity
            WHERE VariantID = @variantId AND LocationID = @locationId
          `);
      }
    });
    
    res.json({ success: true, message: 'Sale voided successfully' });
  } catch (error) {
    next(error);
  }
});

// Get payment methods
router.get('/payment-methods/list', authenticate, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT PaymentMethodID, MethodName, MethodType, RequiresReference, OpensCashDrawer
       FROM PaymentMethods WHERE IsActive = 1 ORDER BY SortOrder`
    );
    
    res.json({ paymentMethods: result.recordset });
  } catch (error) {
    next(error);
  }
});

// Apply discount rules
router.post('/apply-discount', authenticate, async (req, res, next) => {
  try {
    const { items, customerId, couponCode } = req.body;
    
    // Get active discount rules
    const rules = await db.query(
      `SELECT * FROM DiscountRules 
       WHERE IsActive = 1 
         AND (StartDate IS NULL OR StartDate <= GETDATE())
         AND (EndDate IS NULL OR EndDate >= GETDATE())
         AND (UsageLimit IS NULL OR UsageCount < UsageLimit)
       ORDER BY Priority DESC`
    );
    
    let appliedDiscounts = [];
    let totalDiscount = 0;
    
    // Apply rules logic here (simplified)
    for (const rule of rules.recordset) {
      const conditions = JSON.parse(rule.Conditions || '{}');
      
      // Check coupon code
      if (rule.RuleType === 'COUPON' && rule.RuleCode !== couponCode) {
        continue;
      }
      
      // Check bundle rules
      if (rule.RuleType === 'BUNDLE' && conditions.products) {
        const itemProductIds = items.map(i => i.productId);
        const hasAllProducts = conditions.products.every(p => itemProductIds.includes(p));
        
        if (hasAllProducts) {
          const discount = rule.DiscountType === 'PERCENTAGE' 
            ? items.reduce((sum, i) => sum + i.price * i.quantity, 0) * (rule.DiscountValue / 100)
            : rule.DiscountValue;
          
          appliedDiscounts.push({
            ruleId: rule.RuleID,
            ruleName: rule.RuleName,
            discountType: rule.DiscountType,
            discountValue: rule.DiscountValue,
            calculatedDiscount: Math.min(discount, rule.MaxDiscountAmount || discount),
          });
          
          totalDiscount += Math.min(discount, rule.MaxDiscountAmount || discount);
          
          if (!rule.IsStackable) break;
        }
      }
    }
    
    res.json({
      appliedDiscounts,
      totalDiscount,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
