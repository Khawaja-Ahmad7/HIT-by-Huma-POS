const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');

const router = express.Router();

// Get current open shift for user
router.get('/current', authenticate, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT s.*, l.LocationCode, l.LocationName
       FROM Shifts s
       INNER JOIN Locations l ON s.LocationID = l.LocationID
       WHERE s.UserID = @userId AND s.Status = 'OPEN'`,
      { userId: req.user.UserID }
    );
    
    if (result.recordset.length === 0) {
      return res.json({ hasOpenShift: false });
    }
    
    // Get shift sales summary
    const salesResult = await db.query(
      `SELECT 
        COUNT(*) AS TransactionCount,
        COALESCE(SUM(TotalAmount), 0) AS TotalSales,
        COALESCE(SUM(CASE WHEN sp.MethodType = 'CASH' THEN sp.Amount ELSE 0 END), 0) AS CashTotal,
        COALESCE(SUM(CASE WHEN sp.MethodType = 'CARD' THEN sp.Amount ELSE 0 END), 0) AS CardTotal
       FROM Sales s
       LEFT JOIN SalePayments sp ON s.SaleID = sp.SaleID
       LEFT JOIN PaymentMethods pm ON sp.PaymentMethodID = pm.PaymentMethodID
       WHERE s.ShiftID = @shiftId AND s.Status = 'COMPLETED'`,
      { shiftId: result.recordset[0].ShiftID }
    );
    
    res.json({
      hasOpenShift: true,
      shift: {
        ...result.recordset[0],
        summary: salesResult.recordset[0],
      },
    });
  } catch (error) {
    next(error);
  }
});

// Clock in (Start shift)
router.post('/clock-in', authenticate, [
  body('locationId').isInt(),
  body('openingCash').isNumeric(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }
    
    const { locationId, openingCash, terminalNumber } = req.body;
    
    // Check if user already has open shift
    const existingShift = await db.query(
      `SELECT ShiftID FROM Shifts WHERE UserID = @userId AND Status = 'OPEN'`,
      { userId: req.user.UserID }
    );
    
    if (existingShift.recordset.length > 0) {
      throw new ValidationError('You already have an open shift. Please clock out first.');
    }
    
    const result = await db.query(
      `INSERT INTO Shifts (UserID, LocationID, TerminalNumber, OpeningCash)
       OUTPUT INSERTED.ShiftID
       VALUES (@userId, @locationId, @terminalNumber, @openingCash)`,
      {
        userId: req.user.UserID,
        locationId,
        terminalNumber: terminalNumber || null,
        openingCash,
      }
    );
    
    res.status(201).json({
      success: true,
      shiftId: result.recordset[0].ShiftID,
      message: 'Shift started successfully',
    });
  } catch (error) {
    next(error);
  }
});

// Clock out (End shift)
router.post('/clock-out', authenticate, [
  body('closingCash').isNumeric(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }
    
    const { closingCash, notes } = req.body;
    
    // Get open shift
    const shiftResult = await db.query(
      `SELECT s.*, l.LocationCode FROM Shifts s
       INNER JOIN Locations l ON s.LocationID = l.LocationID
       WHERE s.UserID = @userId AND s.Status = 'OPEN'`,
      { userId: req.user.UserID }
    );
    
    if (shiftResult.recordset.length === 0) {
      throw new NotFoundError('Open shift');
    }
    
    const shift = shiftResult.recordset[0];
    
    // Calculate expected cash
    const salesResult = await db.query(
      `SELECT 
        COALESCE(SUM(CASE WHEN pm.MethodType = 'CASH' THEN sp.Amount ELSE 0 END), 0) AS CashIn,
        COALESCE(SUM(CASE WHEN pm.MethodType = 'CASH' AND sp.ChangeAmount > 0 THEN sp.ChangeAmount ELSE 0 END), 0) AS CashOut
       FROM Sales s
       INNER JOIN SalePayments sp ON s.SaleID = sp.SaleID
       INNER JOIN PaymentMethods pm ON sp.PaymentMethodID = pm.PaymentMethodID
       WHERE s.ShiftID = @shiftId AND s.Status = 'COMPLETED'`,
      { shiftId: shift.ShiftID }
    );
    
    const cashIn = salesResult.recordset[0].CashIn || 0;
    const cashOut = salesResult.recordset[0].CashOut || 0;
    const expectedCash = shift.OpeningCash + cashIn - cashOut;
    const variance = closingCash - expectedCash;
    
    await db.query(
      `UPDATE Shifts SET
        ClosingCash = @closingCash,
        ExpectedCash = @expectedCash,
        CashVariance = @variance,
        Status = 'CLOSED',
        ClockOutAt = GETDATE(),
        Notes = @notes
       WHERE ShiftID = @shiftId`,
      {
        shiftId: shift.ShiftID,
        closingCash,
        expectedCash,
        variance,
        notes: notes || null,
      }
    );
    
    res.json({
      success: true,
      shiftId: shift.ShiftID,
      summary: {
        openingCash: shift.OpeningCash,
        cashIn,
        cashOut,
        expectedCash,
        closingCash,
        variance,
        varianceStatus: Math.abs(variance) <= 500 ? 'OK' : 'FLAGGED',
      },
      message: 'Shift closed successfully',
    });
  } catch (error) {
    next(error);
  }
});

// Get shift history
router.get('/history', authenticate, async (req, res, next) => {
  try {
    const { userId, locationId, startDate, endDate, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE 1=1';
    const params = { offset, limit: parseInt(limit) };
    
    if (userId) {
      whereClause += ' AND s.UserID = @userId';
      params.userId = parseInt(userId);
    }
    
    if (locationId) {
      whereClause += ' AND s.LocationID = @locationId';
      params.locationId = parseInt(locationId);
    }
    
    if (startDate) {
      whereClause += ' AND s.ClockInAt >= @startDate';
      params.startDate = new Date(startDate);
    }
    
    if (endDate) {
      whereClause += ' AND s.ClockInAt <= @endDate';
      params.endDate = new Date(endDate);
    }
    
    const result = await db.query(
      `SELECT s.*, 
        u.FirstName, u.LastName, u.EmployeeCode,
        l.LocationCode, l.LocationName,
        (SELECT COUNT(*) FROM Sales WHERE ShiftID = s.ShiftID AND Status = 'COMPLETED') AS TransactionCount,
        (SELECT COALESCE(SUM(TotalAmount), 0) FROM Sales WHERE ShiftID = s.ShiftID AND Status = 'COMPLETED') AS TotalSales
       FROM Shifts s
       INNER JOIN Users u ON s.UserID = u.UserID
       INNER JOIN Locations l ON s.LocationID = l.LocationID
       ${whereClause}
       ORDER BY s.ClockInAt DESC
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
      params
    );
    
    res.json({ shifts: result.recordset });
  } catch (error) {
    next(error);
  }
});

// Get shift details
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const shiftResult = await db.query(
      `SELECT s.*, 
        u.FirstName, u.LastName, u.EmployeeCode,
        l.LocationCode, l.LocationName
       FROM Shifts s
       INNER JOIN Users u ON s.UserID = u.UserID
       INNER JOIN Locations l ON s.LocationID = l.LocationID
       WHERE s.ShiftID = @id`,
      { id: parseInt(id) }
    );
    
    if (shiftResult.recordset.length === 0) {
      throw new NotFoundError('Shift');
    }
    
    // Get sales breakdown
    const salesResult = await db.query(
      `SELECT 
        COUNT(*) AS TransactionCount,
        COALESCE(SUM(TotalAmount), 0) AS TotalSales,
        COALESCE(SUM(DiscountAmount), 0) AS TotalDiscounts,
        (SELECT COUNT(*) FROM Sales WHERE ShiftID = @id AND Status = 'VOIDED') AS VoidCount,
        (SELECT COUNT(*) FROM Returns r INNER JOIN Sales s ON r.OriginalSaleID = s.SaleID WHERE s.ShiftID = @id) AS ReturnCount
       FROM Sales
       WHERE ShiftID = @id AND Status = 'COMPLETED'`,
      { id: parseInt(id) }
    );
    
    // Get payment breakdown
    const paymentsResult = await db.query(
      `SELECT pm.MethodName, pm.MethodType, COALESCE(SUM(sp.Amount), 0) AS Total
       FROM SalePayments sp
       INNER JOIN PaymentMethods pm ON sp.PaymentMethodID = pm.PaymentMethodID
       INNER JOIN Sales s ON sp.SaleID = s.SaleID
       WHERE s.ShiftID = @id AND s.Status = 'COMPLETED'
       GROUP BY pm.MethodName, pm.MethodType`,
      { id: parseInt(id) }
    );
    
    res.json({
      shift: shiftResult.recordset[0],
      salesSummary: salesResult.recordset[0],
      paymentBreakdown: paymentsResult.recordset,
    });
  } catch (error) {
    next(error);
  }
});

// Reconcile shift (Manager only)
router.post('/:id/reconcile', authenticate, authorize('shifts.reconcile'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    
    const shift = await db.query(
      'SELECT ShiftID, Status FROM Shifts WHERE ShiftID = @id',
      { id: parseInt(id) }
    );
    
    if (shift.recordset.length === 0) {
      throw new NotFoundError('Shift');
    }
    
    if (shift.recordset[0].Status !== 'CLOSED') {
      throw new ValidationError('Only closed shifts can be reconciled');
    }
    
    await db.query(
      `UPDATE Shifts SET 
        Status = 'RECONCILED',
        ReconciliationNotes = @notes,
        ReconciliationBy = @userId
       WHERE ShiftID = @id`,
      {
        id: parseInt(id),
        notes: notes || null,
        userId: req.user.UserID,
      }
    );
    
    res.json({ success: true, message: 'Shift reconciled successfully' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
