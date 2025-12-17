const express = require('express');
const bwipjs = require('bwip-js');
const { authenticate, authorize } = require('../middleware/auth');
const printerService = require('../services/printerService');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Hardware Interface Layer (HAL) Routes
 * Handles thermal printing, cash drawer, barcode generation, and label printing
 */

// Test printer connection
router.get('/printer/test', authenticate, async (req, res, next) => {
  try {
    const result = await printerService.testConnection();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Print receipt
router.post('/printer/receipt', authenticate, async (req, res, next) => {
  try {
    const { saleId, saleData } = req.body;
    
    let data = saleData;
    
    // If saleId provided, fetch from database
    if (saleId && !saleData) {
      const db = require('../config/database');
      
      const saleResult = await db.query(
        `SELECT s.*, 
          l.LocationName, l.Address AS LocationAddress, l.Phone AS LocationPhone,
          c.FirstName AS CustomerFirstName, c.LastName AS CustomerLastName, c.Phone AS CustomerPhone,
          u.FirstName AS CashierFirstName, u.LastName AS CashierLastName
         FROM Sales s
         INNER JOIN Locations l ON s.LocationID = l.LocationID
         LEFT JOIN Customers c ON s.CustomerID = c.CustomerID
         INNER JOIN Users u ON s.UserID = u.UserID
         WHERE s.SaleID = @saleId`,
        { saleId }
      );
      
      if (saleResult.recordset.length === 0) {
        return res.status(404).json({ error: 'Sale not found' });
      }
      
      const itemsResult = await db.query(
        `SELECT si.*, pv.SKU, pv.VariantName, p.ProductName
         FROM SaleItems si
         INNER JOIN ProductVariants pv ON si.VariantID = pv.VariantID
         INNER JOIN Products p ON pv.ProductID = p.ProductID
         WHERE si.SaleID = @saleId`,
        { saleId }
      );
      
      const paymentsResult = await db.query(
        `SELECT sp.*, pm.MethodName
         FROM SalePayments sp
         INNER JOIN PaymentMethods pm ON sp.PaymentMethodID = pm.PaymentMethodID
         WHERE sp.SaleID = @saleId`,
        { saleId }
      );
      
      data = {
        sale: saleResult.recordset[0],
        items: itemsResult.recordset,
        payments: paymentsResult.recordset,
      };
    }
    
    await printerService.printReceipt(data);
    
    // Update sale record
    if (saleId) {
      const db = require('../config/database');
      await db.query(
        'UPDATE Sales SET ReceiptPrinted = 1 WHERE SaleID = @saleId',
        { saleId }
      );
    }
    
    res.json({ success: true, message: 'Receipt printed successfully' });
  } catch (error) {
    logger.error('Receipt printing failed:', error);
    next(error);
  }
});

// Open cash drawer
router.post('/cash-drawer/open', authenticate, async (req, res, next) => {
  try {
    await printerService.openCashDrawer();
    res.json({ success: true, message: 'Cash drawer opened' });
  } catch (error) {
    logger.error('Cash drawer open failed:', error);
    next(error);
  }
});

// Generate barcode image
router.get('/barcode/:code', async (req, res, next) => {
  try {
    const { code } = req.params;
    const { type = 'code128', width = 2, height = 50 } = req.query;
    
    const png = await bwipjs.toBuffer({
      bcid: type,
      text: code,
      scale: 3,
      width: parseInt(width),
      height: parseInt(height),
      includetext: true,
      textxalign: 'center',
    });
    
    res.set('Content-Type', 'image/png');
    res.send(png);
  } catch (error) {
    next(error);
  }
});

// Generate and print product label
router.post('/label/print', authenticate, authorize('inventory.*'), async (req, res, next) => {
  try {
    const { variantId, quantity = 1 } = req.body;
    
    const db = require('../config/database');
    
    const result = await db.query(
      `SELECT pv.SKU, pv.Barcode, pv.VariantName, pv.Price,
        p.ProductName
       FROM ProductVariants pv
       INNER JOIN Products p ON pv.ProductID = p.ProductID
       WHERE pv.VariantID = @variantId`,
      { variantId }
    );
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Product variant not found' });
    }
    
    const product = result.recordset[0];
    
    await printerService.printLabel({
      sku: product.SKU,
      barcode: product.Barcode,
      name: product.VariantName || product.ProductName,
      price: product.Price,
      quantity,
    });
    
    res.json({ success: true, message: `${quantity} label(s) printed` });
  } catch (error) {
    logger.error('Label printing failed:', error);
    next(error);
  }
});

// Batch print labels
router.post('/label/batch', authenticate, authorize('inventory.*'), async (req, res, next) => {
  try {
    const { items } = req.body; // Array of { variantId, quantity }
    
    const db = require('../config/database');
    let printedCount = 0;
    
    for (const item of items) {
      const result = await db.query(
        `SELECT pv.SKU, pv.Barcode, pv.VariantName, pv.Price, p.ProductName
         FROM ProductVariants pv
         INNER JOIN Products p ON pv.ProductID = p.ProductID
         WHERE pv.VariantID = @variantId`,
        { variantId: item.variantId }
      );
      
      if (result.recordset.length > 0) {
        const product = result.recordset[0];
        await printerService.printLabel({
          sku: product.SKU,
          barcode: product.Barcode,
          name: product.VariantName || product.ProductName,
          price: product.Price,
          quantity: item.quantity || 1,
        });
        printedCount += item.quantity || 1;
      }
    }
    
    res.json({ success: true, printedCount, message: `${printedCount} labels printed` });
  } catch (error) {
    logger.error('Batch label printing failed:', error);
    next(error);
  }
});

// Get label preview (HTML format for preview)
router.post('/label/preview', authenticate, async (req, res, next) => {
  try {
    const { variantId } = req.body;
    
    const db = require('../config/database');
    
    const result = await db.query(
      `SELECT pv.SKU, pv.Barcode, pv.VariantName, pv.Price, p.ProductName
       FROM ProductVariants pv
       INNER JOIN Products p ON pv.ProductID = p.ProductID
       WHERE pv.VariantID = @variantId`,
      { variantId }
    );
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Product variant not found' });
    }
    
    const product = result.recordset[0];
    
    // Generate barcode as base64
    const barcodeBuffer = await bwipjs.toBuffer({
      bcid: 'code128',
      text: product.Barcode || product.SKU,
      scale: 3,
      height: 10,
      includetext: true,
      textxalign: 'center',
    });
    
    const barcodeBase64 = barcodeBuffer.toString('base64');
    
    res.json({
      label: {
        companyName: 'HIT BY HUMA',
        productName: product.VariantName || product.ProductName,
        sku: product.SKU,
        price: product.Price,
        barcodeImage: `data:image/png;base64,${barcodeBase64}`,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Customer Facing Display - Get current cart state
router.get('/cfd/state/:terminalId', async (req, res, next) => {
  try {
    const { terminalId } = req.params;
    
    // This would typically be stored in Redis or memory
    // For now, return idle state
    res.json({
      state: 'idle', // 'idle' or 'active'
      cart: null,
      companyName: 'HIT BY HUMA',
      logoUrl: '/logo.png',
    });
  } catch (error) {
    next(error);
  }
});

// Update CFD cart state (called from POS terminal)
router.post('/cfd/update/:terminalId', authenticate, async (req, res, next) => {
  try {
    const { terminalId } = req.params;
    const { state, cart } = req.body;
    
    // Emit to CFD via Socket.IO
    const io = req.app.get('io');
    io.to(`cfd-${terminalId}`).emit('cart-update', {
      state,
      cart,
      updatedAt: new Date().toISOString(),
    });
    
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Barcode scanner simulation (for testing)
router.post('/scanner/simulate', authenticate, async (req, res, next) => {
  try {
    const { barcode } = req.body;
    
    // Emit scanned barcode event
    const io = req.app.get('io');
    io.emit('barcode-scanned', { barcode });
    
    res.json({ success: true, barcode });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
