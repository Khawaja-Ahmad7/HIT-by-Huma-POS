const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');

const router = express.Router();

// Search customers
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { search, type, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE 1=1';
    const params = { offset, limit: parseInt(limit) };
    
    if (search) {
      whereClause += ` AND (Phone LIKE @search OR FirstName LIKE @search 
                       OR LastName LIKE @search OR Email LIKE @search)`;
      params.search = `%${search}%`;
    }
    
    if (type) {
      whereClause += ' AND CustomerType = @type';
      params.type = type;
    }
    
    const result = await db.query(
      `SELECT CustomerID, Phone, FirstName, LastName, Email, CustomerType,
        TotalSpend, TotalVisits, LastVisitAt, WalletBalance, LoyaltyPoints
       FROM Customers
       ${whereClause}
       ORDER BY LastVisitAt DESC
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
      params
    );
    
    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM Customers ${whereClause}`,
      params
    );
    
    res.json({
      customers: result.recordset,
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

// Quick lookup by phone (for POS)
router.get('/lookup/:phone', authenticate, async (req, res, next) => {
  try {
    const { phone } = req.params;
    
    const result = await db.query(
      `SELECT CustomerID, Phone, FirstName, LastName, Email, CustomerType,
        TotalSpend, TotalVisits, LastVisitAt, WalletBalance, LoyaltyPoints
       FROM Customers
       WHERE Phone = @phone`,
      { phone }
    );
    
    if (result.recordset.length === 0) {
      return res.json({ found: false });
    }
    
    res.json({
      found: true,
      customer: result.recordset[0],
    });
  } catch (error) {
    next(error);
  }
});

// Get customer details with purchase history
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const customerResult = await db.query(
      `SELECT * FROM Customers WHERE CustomerID = @id`,
      { id: parseInt(id) }
    );
    
    if (customerResult.recordset.length === 0) {
      throw new NotFoundError('Customer');
    }
    
    // Get recent purchases
    const purchasesResult = await db.query(
      `SELECT TOP 20 s.SaleID, s.SaleNumber, s.TotalAmount, s.Status, s.CreatedAt,
        l.LocationName,
        (SELECT COUNT(*) FROM SaleItems WHERE SaleID = s.SaleID) AS ItemCount
       FROM Sales s
       INNER JOIN Locations l ON s.LocationID = l.LocationID
       WHERE s.CustomerID = @id AND s.Status = 'COMPLETED'
       ORDER BY s.CreatedAt DESC`,
      { id: parseInt(id) }
    );
    
    // Get wallet transactions
    const walletResult = await db.query(
      `SELECT TOP 10 * FROM WalletTransactions 
       WHERE CustomerID = @id
       ORDER BY CreatedAt DESC`,
      { id: parseInt(id) }
    );
    
    res.json({
      customer: customerResult.recordset[0],
      purchases: purchasesResult.recordset,
      walletTransactions: walletResult.recordset,
    });
  } catch (error) {
    next(error);
  }
});

// Create customer
router.post('/', authenticate, authorize('customers.create'), [
  body('phone').notEmpty().trim(),
  body('firstName').optional().trim(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }
    
    const {
      phone, firstName, lastName, email, dateOfBirth,
      gender, address, city, customerType = 'REGULAR', notes
    } = req.body;
    
    // Check if phone exists
    const existing = await db.query(
      'SELECT CustomerID FROM Customers WHERE Phone = @phone',
      { phone }
    );
    
    if (existing.recordset.length > 0) {
      throw new ValidationError('Customer with this phone already exists');
    }
    
    const result = await db.query(
      `INSERT INTO Customers (
        Phone, FirstName, LastName, Email, DateOfBirth,
        Gender, Address, City, CustomerType, Notes
       )
       OUTPUT INSERTED.CustomerID
       VALUES (
        @phone, @firstName, @lastName, @email, @dateOfBirth,
        @gender, @address, @city, @customerType, @notes
       )`,
      {
        phone, 
        firstName: firstName || null, 
        lastName: lastName || null, 
        email: email || null,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        gender: gender || null, 
        address: address || null, 
        city: city || null,
        customerType, 
        notes: notes || null
      }
    );
    
    res.status(201).json({
      success: true,
      customerId: result.recordset[0].CustomerID,
      message: 'Customer created successfully',
    });
  } catch (error) {
    next(error);
  }
});

// Update customer
router.put('/:id', authenticate, authorize('customers.update'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      firstName, lastName, email, dateOfBirth,
      gender, address, city, customerType, notes, optInSMS, optInEmail
    } = req.body;
    
    const customer = await db.query(
      'SELECT CustomerID FROM Customers WHERE CustomerID = @id',
      { id: parseInt(id) }
    );
    
    if (customer.recordset.length === 0) {
      throw new NotFoundError('Customer');
    }
    
    await db.query(
      `UPDATE Customers SET
        FirstName = COALESCE(@firstName, FirstName),
        LastName = COALESCE(@lastName, LastName),
        Email = COALESCE(@email, Email),
        DateOfBirth = COALESCE(@dateOfBirth, DateOfBirth),
        Gender = COALESCE(@gender, Gender),
        Address = COALESCE(@address, Address),
        City = COALESCE(@city, City),
        CustomerType = COALESCE(@customerType, CustomerType),
        Notes = COALESCE(@notes, Notes),
        OptInSMS = COALESCE(@optInSMS, OptInSMS),
        OptInEmail = COALESCE(@optInEmail, OptInEmail),
        UpdatedAt = GETDATE()
       WHERE CustomerID = @id`,
      {
        id: parseInt(id),
        firstName, lastName, email,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        gender, address, city, customerType, notes, optInSMS, optInEmail
      }
    );
    
    res.json({ success: true, message: 'Customer updated successfully' });
  } catch (error) {
    next(error);
  }
});

// Add store credit to wallet
router.post('/:id/wallet/credit', authenticate, authorize('customers.wallet'), [
  body('amount').isNumeric().custom(v => v > 0),
  body('reason').notEmpty(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }
    
    const { id } = req.params;
    const { amount, reason, referenceType, referenceId, expiresAt } = req.body;
    
    const customer = await db.query(
      'SELECT CustomerID, WalletBalance FROM Customers WHERE CustomerID = @id',
      { id: parseInt(id) }
    );
    
    if (customer.recordset.length === 0) {
      throw new NotFoundError('Customer');
    }
    
    const balanceBefore = customer.recordset[0].WalletBalance;
    const balanceAfter = balanceBefore + amount;
    
    await db.transaction(async (transaction) => {
      // Update wallet balance
      await transaction.request()
        .input('id', parseInt(id))
        .input('balance', balanceAfter)
        .query(`
          UPDATE Customers SET WalletBalance = @balance, UpdatedAt = GETDATE()
          WHERE CustomerID = @id
        `);
      
      // Log transaction
      await transaction.request()
        .input('customerId', parseInt(id))
        .input('amount', amount)
        .input('balanceBefore', balanceBefore)
        .input('balanceAfter', balanceAfter)
        .input('referenceType', referenceType || reason)
        .input('referenceId', referenceId || null)
        .input('notes', reason)
        .input('expiresAt', expiresAt ? new Date(expiresAt) : null)
        .input('userId', req.user.UserID)
        .query(`
          INSERT INTO WalletTransactions (
            CustomerID, TransactionType, Amount, BalanceBefore, BalanceAfter,
            ReferenceType, ReferenceID, Notes, ExpiresAt, CreatedBy
          ) VALUES (
            @customerId, 'CREDIT', @amount, @balanceBefore, @balanceAfter,
            @referenceType, @referenceId, @notes, @expiresAt, @userId
          )
        `);
    });
    
    res.json({
      success: true,
      newBalance: balanceAfter,
      message: 'Store credit added successfully',
    });
  } catch (error) {
    next(error);
  }
});

// Use wallet balance
router.post('/:id/wallet/debit', authenticate, authorize('pos.sale'), [
  body('amount').isNumeric().custom(v => v > 0),
], async (req, res, next) => {
  try {
    const { id } = req.params;
    const { amount, referenceType, referenceId } = req.body;
    
    const customer = await db.query(
      'SELECT CustomerID, WalletBalance FROM Customers WHERE CustomerID = @id',
      { id: parseInt(id) }
    );
    
    if (customer.recordset.length === 0) {
      throw new NotFoundError('Customer');
    }
    
    const balanceBefore = customer.recordset[0].WalletBalance;
    
    if (balanceBefore < amount) {
      throw new ValidationError('Insufficient wallet balance');
    }
    
    const balanceAfter = balanceBefore - amount;
    
    await db.transaction(async (transaction) => {
      await transaction.request()
        .input('id', parseInt(id))
        .input('balance', balanceAfter)
        .query(`
          UPDATE Customers SET WalletBalance = @balance, UpdatedAt = GETDATE()
          WHERE CustomerID = @id
        `);
      
      await transaction.request()
        .input('customerId', parseInt(id))
        .input('amount', amount)
        .input('balanceBefore', balanceBefore)
        .input('balanceAfter', balanceAfter)
        .input('referenceType', referenceType || 'PURCHASE')
        .input('referenceId', referenceId || null)
        .input('userId', req.user.UserID)
        .query(`
          INSERT INTO WalletTransactions (
            CustomerID, TransactionType, Amount, BalanceBefore, BalanceAfter,
            ReferenceType, ReferenceID, CreatedBy
          ) VALUES (
            @customerId, 'DEBIT', @amount, @balanceBefore, @balanceAfter,
            @referenceType, @referenceId, @userId
          )
        `);
    });
    
    res.json({
      success: true,
      newBalance: balanceAfter,
      message: 'Wallet debited successfully',
    });
  } catch (error) {
    next(error);
  }
});

// Get customer purchase history for easy reorder
router.get('/:id/purchases/:saleId/items', authenticate, async (req, res, next) => {
  try {
    const { id, saleId } = req.params;
    
    const result = await db.query(
      `SELECT si.*, pv.SKU, pv.Barcode, pv.VariantName, pv.Price AS CurrentPrice,
        p.ProductName, p.ImageURL,
        COALESCE(inv.QuantityOnHand, 0) AS CurrentStock
       FROM SaleItems si
       INNER JOIN Sales s ON si.SaleID = s.SaleID
       INNER JOIN ProductVariants pv ON si.VariantID = pv.VariantID
       INNER JOIN Products p ON pv.ProductID = p.ProductID
       LEFT JOIN Inventory inv ON pv.VariantID = inv.VariantID
       WHERE s.SaleID = @saleId AND s.CustomerID = @customerId`,
      { saleId: parseInt(saleId), customerId: parseInt(id) }
    );
    
    res.json({ items: result.recordset });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
