const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');

const router = express.Router();

// Dashboard summary
router.get('/dashboard', authenticate, async (req, res, next) => {
  try {
    const { locationId } = req.query;
    const today = new Date().toISOString().split('T')[0];
    
    let locationFilter = '';
    const params = { today };
    
    if (locationId) {
      locationFilter = ' AND LocationID = @locationId';
      params.locationId = parseInt(locationId);
    }
    
    // Today's sales
    const todaySales = await db.query(
      `SELECT 
        COUNT(*) AS TransactionCount,
        COALESCE(SUM(TotalAmount), 0) AS TotalSales,
        COALESCE(SUM(DiscountAmount), 0) AS TotalDiscounts,
        COALESCE(AVG(TotalAmount), 0) AS AverageTransaction
       FROM Sales
       WHERE CAST(CreatedAt AS DATE) = @today 
         AND Status = 'COMPLETED' ${locationFilter}`,
      params
    );
    
    // Yesterday comparison
    const yesterdaySales = await db.query(
      `SELECT COALESCE(SUM(TotalAmount), 0) AS TotalSales
       FROM Sales
       WHERE CAST(CreatedAt AS DATE) = DATEADD(day, -1, @today) 
         AND Status = 'COMPLETED' ${locationFilter}`,
      params
    );
    
    // This week sales
    const weekSales = await db.query(
      `SELECT COALESCE(SUM(TotalAmount), 0) AS TotalSales
       FROM Sales
       WHERE CreatedAt >= DATEADD(day, -7, @today) 
         AND Status = 'COMPLETED' ${locationFilter}`,
      params
    );
    
    // Top selling products today
    const topProducts = await db.query(
      `SELECT TOP 5 
        p.ProductName, pv.VariantName, 
        SUM(si.Quantity) AS QuantitySold,
        SUM(si.LineTotal) AS Revenue
       FROM SaleItems si
       INNER JOIN Sales s ON si.SaleID = s.SaleID
       INNER JOIN ProductVariants pv ON si.VariantID = pv.VariantID
       INNER JOIN Products p ON pv.ProductID = p.ProductID
       WHERE CAST(s.CreatedAt AS DATE) = @today 
         AND s.Status = 'COMPLETED' ${locationFilter}
       GROUP BY p.ProductName, pv.VariantName
       ORDER BY QuantitySold DESC`,
      params
    );
    
    // Low stock alerts (includes products with 0 stock or no inventory records)
    const lowStock = await db.query(
      `SELECT TOP 10 
        pv.SKU, pv.VariantName, p.ProductName,
        ISNULL(i.QuantityOnHand, 0) AS QuantityOnHand, 
        ISNULL(i.ReorderLevel, 5) AS ReorderLevel
       FROM ProductVariants pv
       INNER JOIN Products p ON pv.ProductID = p.ProductID
       LEFT JOIN Inventory i ON pv.VariantID = i.VariantID ${locationId ? ' AND i.LocationID = @locationId' : ''}
       WHERE pv.IsActive = 1 AND p.IsActive = 1
         AND (i.QuantityOnHand IS NULL OR i.QuantityOnHand <= ISNULL(i.ReorderLevel, 5))
       ORDER BY i.QuantityOnHand ASC`,
      params
    );
    
    // Payment breakdown
    const paymentBreakdown = await db.query(
      `SELECT pm.MethodName, pm.MethodType, COALESCE(SUM(sp.Amount), 0) AS Total
       FROM SalePayments sp
       INNER JOIN Sales s ON sp.SaleID = s.SaleID
       INNER JOIN PaymentMethods pm ON sp.PaymentMethodID = pm.PaymentMethodID
       WHERE CAST(s.CreatedAt AS DATE) = @today 
         AND s.Status = 'COMPLETED' ${locationFilter}
       GROUP BY pm.MethodName, pm.MethodType`,
      params
    );
    
    const todayTotal = todaySales.recordset[0]?.TotalSales || 0;
    const yesterdayTotal = yesterdaySales.recordset[0]?.TotalSales || 0;
    const growthPercent = yesterdayTotal > 0 
      ? ((todayTotal - yesterdayTotal) / yesterdayTotal * 100).toFixed(1)
      : 0;
    
    res.json({
      today: {
        ...todaySales.recordset[0],
        growthPercent: parseFloat(growthPercent),
      },
      week: weekSales.recordset[0],
      topProducts: topProducts.recordset,
      lowStock: lowStock.recordset,
      paymentBreakdown: paymentBreakdown.recordset,
    });
  } catch (error) {
    next(error);
  }
});

// Sales by date range
router.get('/sales', authenticate, authorize('reports.*'), async (req, res, next) => {
  try {
    const { startDate, endDate, locationId, groupBy = 'day' } = req.query;
    
    if (!startDate || !endDate) {
      throw new ValidationError('Start date and end date are required');
    }
    
    let dateFormat, groupClause;
    switch (groupBy) {
      case 'hour':
        dateFormat = "FORMAT(CreatedAt, 'yyyy-MM-dd HH:00')";
        groupClause = dateFormat;
        break;
      case 'week':
        dateFormat = "DATEPART(year, CreatedAt) * 100 + DATEPART(week, CreatedAt)";
        groupClause = dateFormat;
        break;
      case 'month':
        dateFormat = "FORMAT(CreatedAt, 'yyyy-MM')";
        groupClause = dateFormat;
        break;
      default:
        dateFormat = "CAST(CreatedAt AS DATE)";
        groupClause = dateFormat;
    }
    
    let whereClause = 'WHERE CreatedAt >= @startDate AND CreatedAt <= @endDate AND Status = \'COMPLETED\'';
    const params = { 
      startDate: new Date(startDate), 
      endDate: new Date(endDate) 
    };
    
    if (locationId) {
      whereClause += ' AND LocationID = @locationId';
      params.locationId = parseInt(locationId);
    }
    
    const result = await db.query(
      `SELECT 
        ${dateFormat} AS Period,
        COUNT(*) AS TransactionCount,
        SUM(TotalAmount) AS TotalSales,
        SUM(DiscountAmount) AS TotalDiscounts,
        SUM(TaxAmount) AS TotalTax,
        AVG(TotalAmount) AS AverageTransaction
       FROM Sales
       ${whereClause}
       GROUP BY ${groupClause}
       ORDER BY Period`,
      params
    );
    
    // Get totals
    const totals = await db.query(
      `SELECT 
        COUNT(*) AS TransactionCount,
        SUM(TotalAmount) AS TotalSales,
        SUM(DiscountAmount) AS TotalDiscounts,
        SUM(TaxAmount) AS TotalTax,
        AVG(TotalAmount) AS AverageTransaction
       FROM Sales
       ${whereClause}`,
      params
    );
    
    res.json({
      data: result.recordset,
      totals: totals.recordset[0],
    });
  } catch (error) {
    next(error);
  }
});

// Sales by category
router.get('/sales-by-category', authenticate, authorize('reports.*'), async (req, res, next) => {
  try {
    const { startDate, endDate, locationId } = req.query;
    
    let whereClause = 'WHERE s.Status = \'COMPLETED\'';
    const params = {};
    
    if (startDate && endDate) {
      whereClause += ' AND s.CreatedAt >= @startDate AND s.CreatedAt <= @endDate';
      params.startDate = new Date(startDate);
      params.endDate = new Date(endDate);
    }
    
    if (locationId) {
      whereClause += ' AND s.LocationID = @locationId';
      params.locationId = parseInt(locationId);
    }
    
    const result = await db.query(
      `SELECT 
        c.CategoryID, c.CategoryName,
        COUNT(DISTINCT s.SaleID) AS TransactionCount,
        SUM(si.Quantity) AS UnitsSold,
        SUM(si.LineTotal) AS Revenue
       FROM SaleItems si
       INNER JOIN Sales s ON si.SaleID = s.SaleID
       INNER JOIN ProductVariants pv ON si.VariantID = pv.VariantID
       INNER JOIN Products p ON pv.ProductID = p.ProductID
       LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
       ${whereClause}
       GROUP BY c.CategoryID, c.CategoryName
       ORDER BY Revenue DESC`,
      params
    );
    
    res.json({ categories: result.recordset });
  } catch (error) {
    next(error);
  }
});

// Sales by employee
router.get('/sales-by-employee', authenticate, authorize('reports.*'), async (req, res, next) => {
  try {
    const { startDate, endDate, locationId } = req.query;
    
    let whereClause = 'WHERE s.Status = \'COMPLETED\'';
    const params = {};
    
    if (startDate && endDate) {
      whereClause += ' AND s.CreatedAt >= @startDate AND s.CreatedAt <= @endDate';
      params.startDate = new Date(startDate);
      params.endDate = new Date(endDate);
    }
    
    if (locationId) {
      whereClause += ' AND s.LocationID = @locationId';
      params.locationId = parseInt(locationId);
    }
    
    const result = await db.query(
      `SELECT 
        u.UserID, u.EmployeeCode, u.FirstName, u.LastName, u.CommissionRate,
        COUNT(*) AS TransactionCount,
        SUM(s.TotalAmount) AS TotalSales,
        SUM(s.TotalAmount) * u.CommissionRate / 100 AS Commission
       FROM Sales s
       INNER JOIN Users u ON s.UserID = u.UserID
       ${whereClause}
       GROUP BY u.UserID, u.EmployeeCode, u.FirstName, u.LastName, u.CommissionRate
       ORDER BY TotalSales DESC`,
      params
    );
    
    res.json({ employees: result.recordset });
  } catch (error) {
    next(error);
  }
});

// Z-Report (End of Day)
router.post('/z-report', authenticate, authorize('reports.zreport'), async (req, res, next) => {
  try {
    const { locationId, reportDate } = req.body;
    
    const date = reportDate ? new Date(reportDate) : new Date();
    const dateStr = date.toISOString().split('T')[0];
    
    // Check if already generated
    const existing = await db.query(
      `SELECT ZReportID FROM ZReports 
       WHERE LocationID = @locationId AND ReportDate = @date`,
      { locationId, date: dateStr }
    );
    
    if (existing.recordset.length > 0) {
      throw new ValidationError('Z-Report already generated for this date');
    }
    
    // Get sales data
    const salesData = await db.query(
      `SELECT 
        COUNT(*) AS SaleCount,
        COALESCE(SUM(TotalAmount), 0) AS GrossSales,
        COALESCE(SUM(DiscountAmount), 0) AS Discounts,
        COALESCE(SUM(TaxAmount), 0) AS TaxCollected,
        (SELECT COUNT(*) FROM Sales WHERE LocationID = @locationId 
          AND CAST(CreatedAt AS DATE) = @date AND Status = 'VOIDED') AS VoidCount
       FROM Sales
       WHERE LocationID = @locationId 
         AND CAST(CreatedAt AS DATE) = @date 
         AND Status = 'COMPLETED'`,
      { locationId, date: dateStr }
    );
    
    // Get returns
    const returnsData = await db.query(
      `SELECT COUNT(*) AS ReturnCount, COALESCE(SUM(TotalRefundAmount), 0) AS Returns
       FROM Returns
       WHERE LocationID = @locationId 
         AND CAST(CreatedAt AS DATE) = @date`,
      { locationId, date: dateStr }
    );
    
    // Get payment breakdown
    const paymentsData = await db.query(
      `SELECT 
        COALESCE(SUM(CASE WHEN pm.MethodType = 'CASH' THEN sp.Amount ELSE 0 END), 0) AS CashTotal,
        COALESCE(SUM(CASE WHEN pm.MethodType = 'CARD' THEN sp.Amount ELSE 0 END), 0) AS CardTotal,
        COALESCE(SUM(CASE WHEN pm.MethodType = 'WALLET' THEN sp.Amount ELSE 0 END), 0) AS WalletTotal
       FROM SalePayments sp
       INNER JOIN Sales s ON sp.SaleID = s.SaleID
       INNER JOIN PaymentMethods pm ON sp.PaymentMethodID = pm.PaymentMethodID
       WHERE s.LocationID = @locationId 
         AND CAST(s.CreatedAt AS DATE) = @date 
         AND s.Status = 'COMPLETED'`,
      { locationId, date: dateStr }
    );
    
    // Get cash from shifts
    const shiftsData = await db.query(
      `SELECT 
        COALESCE(SUM(OpeningCash), 0) AS OpeningCash,
        COALESCE(SUM(ClosingCash), 0) AS ActualCash
       FROM Shifts
       WHERE LocationID = @locationId 
         AND CAST(ClockInAt AS DATE) = @date
         AND Status IN ('CLOSED', 'RECONCILED')`,
      { locationId, date: dateStr }
    );
    
    const sales = salesData.recordset[0];
    const returns = returnsData.recordset[0];
    const payments = paymentsData.recordset[0];
    const shifts = shiftsData.recordset[0];
    
    const netSales = sales.GrossSales - sales.Discounts - returns.Returns;
    const expectedCash = shifts.OpeningCash + payments.CashTotal;
    const variance = shifts.ActualCash - expectedCash;
    
    // Generate report number
    const locationResult = await db.query(
      'SELECT LocationCode FROM Locations WHERE LocationID = @locationId',
      { locationId }
    );
    const locationCode = locationResult.recordset[0]?.LocationCode || 'POS';
    const reportNumber = `Z-${locationCode}-${dateStr.replace(/-/g, '')}`;
    
    // Insert Z-Report
    const result = await db.query(
      `INSERT INTO ZReports (
        ReportNumber, LocationID, ReportDate,
        GrossSales, Discounts, Returns, NetSales, TaxCollected,
        SaleCount, VoidCount, ReturnCount,
        CashTotal, CardTotal, WalletTotal,
        OpeningCash, ExpectedCash, ActualCash, Variance,
        GeneratedBy
       )
       OUTPUT INSERTED.ZReportID
       VALUES (
        @reportNumber, @locationId, @date,
        @grossSales, @discounts, @returns, @netSales, @taxCollected,
        @saleCount, @voidCount, @returnCount,
        @cashTotal, @cardTotal, @walletTotal,
        @openingCash, @expectedCash, @actualCash, @variance,
        @userId
       )`,
      {
        reportNumber,
        locationId,
        date: dateStr,
        grossSales: sales.GrossSales,
        discounts: sales.Discounts,
        returns: returns.Returns,
        netSales,
        taxCollected: sales.TaxCollected,
        saleCount: sales.SaleCount,
        voidCount: sales.VoidCount,
        returnCount: returns.ReturnCount,
        cashTotal: payments.CashTotal,
        cardTotal: payments.CardTotal,
        walletTotal: payments.WalletTotal,
        openingCash: shifts.OpeningCash,
        expectedCash,
        actualCash: shifts.ActualCash,
        variance,
        userId: req.user.UserID,
      }
    );
    
    res.status(201).json({
      success: true,
      reportId: result.recordset[0].ZReportID,
      reportNumber,
      report: {
        grossSales: sales.GrossSales,
        discounts: sales.Discounts,
        returns: returns.Returns,
        netSales,
        taxCollected: sales.TaxCollected,
        saleCount: sales.SaleCount,
        voidCount: sales.VoidCount,
        returnCount: returns.ReturnCount,
        cashTotal: payments.CashTotal,
        cardTotal: payments.CardTotal,
        walletTotal: payments.WalletTotal,
        openingCash: shifts.OpeningCash,
        expectedCash,
        actualCash: shifts.ActualCash,
        variance,
        varianceStatus: Math.abs(variance) <= 500 ? 'OK' : 'FLAGGED',
      },
    });
  } catch (error) {
    next(error);
  }
});

// Full Dashboard Analytics
router.get('/dashboard', authenticate, async (req, res, next) => {
  try {
    const { range = 'today', compare = 'previous' } = req.query;
    
    // Calculate date ranges
    let startDate, endDate, compareStartDate, compareEndDate;
    const now = new Date();
    
    switch (range) {
      case 'week':
        startDate = new Date(now.setDate(now.getDate() - 7));
        endDate = new Date();
        compareStartDate = new Date(new Date().setDate(new Date().getDate() - 14));
        compareEndDate = new Date(new Date().setDate(new Date().getDate() - 7));
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date();
        compareStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        compareEndDate = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date();
        compareStartDate = new Date(now.getFullYear() - 1, 0, 1);
        compareEndDate = new Date(now.getFullYear() - 1, 11, 31);
        break;
      default: // today
        startDate = new Date(new Date().setHours(0, 0, 0, 0));
        endDate = new Date();
        compareStartDate = new Date(new Date().setDate(new Date().getDate() - 1));
        compareStartDate.setHours(0, 0, 0, 0);
        compareEndDate = new Date(new Date().setDate(new Date().getDate() - 1));
        compareEndDate.setHours(23, 59, 59, 999);
    }
    
    const params = {
      startDate,
      endDate,
      compareStart: compareStartDate,
      compareEnd: compareEndDate
    };
    
    // Current period stats
    const currentStats = await db.query(
      `SELECT 
        COUNT(*) AS totalOrders,
        COALESCE(SUM(TotalAmount), 0) AS totalRevenue,
        COALESCE(AVG(TotalAmount), 0) AS avgOrderValue,
        COALESCE(SUM(DiscountAmount), 0) AS totalDiscounts,
        COALESCE(SUM(TaxAmount), 0) AS totalTax,
        COUNT(DISTINCT CustomerID) AS customersServed
       FROM Sales
       WHERE CreatedAt >= @startDate AND CreatedAt <= @endDate
         AND Status = 'COMPLETED'`,
      params
    );
    
    // Previous period stats for comparison
    const prevStats = await db.query(
      `SELECT 
        COUNT(*) AS totalOrders,
        COALESCE(SUM(TotalAmount), 0) AS totalRevenue,
        COALESCE(AVG(TotalAmount), 0) AS avgOrderValue,
        COUNT(DISTINCT CustomerID) AS customersServed
       FROM Sales
       WHERE CreatedAt >= @compareStart AND CreatedAt <= @compareEnd
         AND Status = 'COMPLETED'`,
      params
    );
    
    // Items sold
    const itemsSold = await db.query(
      `SELECT COALESCE(SUM(si.Quantity), 0) AS itemsSold,
              COALESCE(AVG(si.Quantity * 1.0), 0) AS avgItemsPerOrder
       FROM SaleItems si
       INNER JOIN Sales s ON si.SaleID = s.SaleID
       WHERE s.CreatedAt >= @startDate AND s.CreatedAt <= @endDate
         AND s.Status = 'COMPLETED'`,
      params
    );
    
    // Payment breakdown
    const payments = await db.query(
      `SELECT 
        pm.MethodType,
        COALESCE(SUM(sp.Amount), 0) AS Total
       FROM SalePayments sp
       INNER JOIN Sales s ON sp.SaleID = s.SaleID
       INNER JOIN PaymentMethods pm ON sp.PaymentMethodID = pm.PaymentMethodID
       WHERE s.CreatedAt >= @startDate AND s.CreatedAt <= @endDate
         AND s.Status = 'COMPLETED'
       GROUP BY pm.MethodType`,
      params
    );
    
    // Returns count
    const returns = await db.query(
      `SELECT COUNT(*) AS returnCount
       FROM Sales
       WHERE CreatedAt >= @startDate AND CreatedAt <= @endDate
         AND Status = 'REFUNDED'`,
      params
    );
    
    // Peak hour
    const peakHour = await db.query(
      `SELECT TOP 1 
        DATEPART(HOUR, CreatedAt) AS hour,
        COUNT(*) AS orderCount
       FROM Sales
       WHERE CreatedAt >= @startDate AND CreatedAt <= @endDate
         AND Status = 'COMPLETED'
       GROUP BY DATEPART(HOUR, CreatedAt)
       ORDER BY orderCount DESC`,
      params
    );
    
    // Calculate changes
    const curr = currentStats.recordset[0];
    const prev = prevStats.recordset[0];
    
    const calcChange = (current, previous) => {
      if (!previous || previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };
    
    const paymentData = payments.recordset.reduce((acc, p) => {
      if (p.MethodType === 'CASH') acc.cashSales = p.Total;
      if (p.MethodType === 'CARD') acc.cardSales = p.Total;
      return acc;
    }, { cashSales: 0, cardSales: 0 });
    
    res.json({
      totalRevenue: curr.totalRevenue,
      totalOrders: curr.totalOrders,
      avgOrderValue: curr.avgOrderValue,
      customersServed: curr.customersServed,
      totalDiscounts: curr.totalDiscounts,
      itemsSold: itemsSold.recordset[0]?.itemsSold || 0,
      avgItemsPerOrder: itemsSold.recordset[0]?.avgItemsPerOrder || 0,
      returns: returns.recordset[0]?.returnCount || 0,
      cashSales: paymentData.cashSales,
      cardSales: paymentData.cardSales,
      peakHour: peakHour.recordset[0] ? `${peakHour.recordset[0].hour}:00` : '-',
      grossProfit: curr.totalRevenue * 0.35, // Placeholder - would calculate from actual cost
      profitMargin: 35, // Placeholder
      conversionRate: 0, // Would need traffic data
      revenueChange: calcChange(curr.totalRevenue, prev.totalRevenue),
      ordersChange: calcChange(curr.totalOrders, prev.totalOrders),
      avgOrderChange: calcChange(curr.avgOrderValue, prev.avgOrderValue),
      customersChange: calcChange(curr.customersServed, prev.customersServed)
    });
  } catch (error) {
    next(error);
  }
});

// Realtime metrics
router.get('/realtime', authenticate, async (req, res, next) => {
  try {
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    const result = await db.query(
      `SELECT 
        COUNT(*) AS ordersLastHour,
        COALESCE(SUM(TotalAmount), 0) AS salesLastHour
       FROM Sales
       WHERE CreatedAt >= @hourAgo AND Status = 'COMPLETED'`,
      { hourAgo }
    );
    
    res.json(result.recordset[0]);
  } catch (error) {
    next(error);
  }
});

// Top products for dashboard
router.get('/top-products', authenticate, async (req, res, next) => {
  try {
    const { range = 'today', limit = 5 } = req.query;
    
    let startDate;
    const now = new Date();
    
    switch (range) {
      case 'week':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(new Date().setHours(0, 0, 0, 0));
    }
    
    const result = await db.query(
      `SELECT TOP (@limit)
        p.ProductName AS name,
        SUM(si.Quantity) AS quantity,
        SUM(si.LineTotal) AS revenue
       FROM SaleItems si
       INNER JOIN Sales s ON si.SaleID = s.SaleID
       INNER JOIN ProductVariants pv ON si.VariantID = pv.VariantID
       INNER JOIN Products p ON pv.ProductID = p.ProductID
       WHERE s.CreatedAt >= @startDate AND s.Status = 'COMPLETED'
       GROUP BY p.ProductID, p.ProductName
       ORDER BY quantity DESC`,
      { startDate, limit: parseInt(limit) }
    );
    
    res.json(result.recordset);
  } catch (error) {
    next(error);
  }
});

// Hourly sales for chart
router.get('/hourly-sales', authenticate, async (req, res, next) => {
  try {
    const { range = 'today' } = req.query;
    
    let startDate;
    const now = new Date();
    
    switch (range) {
      case 'week':
      case 'month':
      case 'year':
        startDate = new Date(new Date().setHours(0, 0, 0, 0));
        break;
      default:
        startDate = new Date(new Date().setHours(0, 0, 0, 0));
    }
    
    const result = await db.query(
      `SELECT 
        FORMAT(DATEPART(HOUR, CreatedAt), '00') + ':00' AS hour,
        COUNT(*) AS orders,
        COALESCE(SUM(TotalAmount), 0) AS sales
       FROM Sales
       WHERE CreatedAt >= @startDate AND Status = 'COMPLETED'
       GROUP BY DATEPART(HOUR, CreatedAt)
       ORDER BY DATEPART(HOUR, CreatedAt)`,
      { startDate }
    );
    
    res.json(result.recordset);
  } catch (error) {
    next(error);
  }
});

// Category breakdown for dashboard
router.get('/category-breakdown', authenticate, async (req, res, next) => {
  try {
    const { range = 'today' } = req.query;
    
    let startDate;
    const now = new Date();
    
    switch (range) {
      case 'week':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(new Date().setHours(0, 0, 0, 0));
    }
    
    const result = await db.query(
      `SELECT 
        COALESCE(c.CategoryName, 'Uncategorized') AS name,
        SUM(si.Quantity) AS units,
        COALESCE(SUM(si.LineTotal), 0) AS sales
       FROM SaleItems si
       INNER JOIN Sales s ON si.SaleID = s.SaleID
       INNER JOIN ProductVariants pv ON si.VariantID = pv.VariantID
       INNER JOIN Products p ON pv.ProductID = p.ProductID
       LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
       WHERE s.CreatedAt >= @startDate AND s.Status = 'COMPLETED'
       GROUP BY c.CategoryID, c.CategoryName
       ORDER BY sales DESC`,
      { startDate }
    );
    
    res.json(result.recordset);
  } catch (error) {
    next(error);
  }
});

// Employee performance for dashboard
router.get('/employee-performance', authenticate, async (req, res, next) => {
  try {
    const { range = 'today', limit = 5 } = req.query;
    
    let startDate;
    const now = new Date();
    
    switch (range) {
      case 'week':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(new Date().setHours(0, 0, 0, 0));
    }
    
    const result = await db.query(
      `SELECT TOP (@limit)
        u.FirstName + ' ' + u.LastName AS name,
        COUNT(*) AS transactions,
        COALESCE(SUM(s.TotalAmount), 0) AS sales
       FROM Sales s
       INNER JOIN Users u ON s.UserID = u.UserID
       WHERE s.CreatedAt >= @startDate AND s.Status = 'COMPLETED'
       GROUP BY u.UserID, u.FirstName, u.LastName
       ORDER BY sales DESC`,
      { startDate, limit: parseInt(limit) }
    );
    
    res.json(result.recordset);
  } catch (error) {
    next(error);
  }
});

// Get Z-Reports history
router.get('/z-reports', authenticate, authorize('reports.*'), async (req, res, next) => {
  try {
    const { locationId, startDate, endDate, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE 1=1';
    const params = { offset, limit: parseInt(limit) };
    
    if (locationId) {
      whereClause += ' AND z.LocationID = @locationId';
      params.locationId = parseInt(locationId);
    }
    
    if (startDate) {
      whereClause += ' AND z.ReportDate >= @startDate';
      params.startDate = new Date(startDate);
    }
    
    if (endDate) {
      whereClause += ' AND z.ReportDate <= @endDate';
      params.endDate = new Date(endDate);
    }
    
    const result = await db.query(
      `SELECT z.*, l.LocationCode, l.LocationName,
        u.FirstName + ' ' + u.LastName AS GeneratedByName
       FROM ZReports z
       INNER JOIN Locations l ON z.LocationID = l.LocationID
       LEFT JOIN Users u ON z.GeneratedBy = u.UserID
       ${whereClause}
       ORDER BY z.ReportDate DESC
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
      params
    );
    
    res.json({ reports: result.recordset });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
