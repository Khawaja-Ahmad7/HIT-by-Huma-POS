const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const printerService = require('../services/printerService');

// Get printer status (mock for cloud deployment)
router.get('/printer/status', async (req, res) => {
  try {
    const status = await printerService.testConnection();
    res.json(Object.assign({ message: 'Local hardware status' }, status));
  } catch (err) {
    res.json({ connected: false, message: 'Printer status unknown', error: err.message });
  }
});

// Print receipt
router.post('/printer/receipt', authorize('pos'), async (req, res) => {
  let { sale, saleId } = req.body;

  try {
    console.log('Print receipt requested for saleId:', saleId);

    // If only saleId provided, fetch complete sale data from database
    if (!sale && saleId) {
      const db = require('../config/database');
      const pool = db.getPool();

      // Fetch sale details
      const saleResult = await pool.query(
        `SELECT s.*, 
                l.location_name AS "LocationName", l.address AS "LocationAddress", l.phone AS "LocationPhone",
                u.first_name AS "CashierFirstName", u.last_name AS "CashierLastName",
                c.first_name AS "CustomerFirstName", c.last_name AS "CustomerLastName", c.phone AS "CustomerPhone"
         FROM sales s
         LEFT JOIN locations l ON s.location_id = l.location_id
         LEFT JOIN users u ON s.user_id = u.user_id
         LEFT JOIN customers c ON s.customer_id = c.customer_id
         WHERE s.sale_id = $1`,
        [parseInt(saleId)]
      );

      if (saleResult.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Sale not found' });
      }

      const saleData = saleResult.rows[0];

      // Fetch sale items
      const itemsResult = await pool.query(
        `SELECT si.*, pv.variant_name AS "VariantName", p.product_name AS "ProductName"
         FROM sale_items si
         LEFT JOIN product_variants pv ON si.variant_id = pv.variant_id
         LEFT JOIN products p ON pv.product_id = p.product_id
         WHERE si.sale_id = $1`,
        [parseInt(saleId)]
      );

      // Fetch payments
      const paymentsResult = await pool.query(
        `SELECT sp.*, pm.method_name AS "MethodName"
         FROM sale_payments sp
         LEFT JOIN payment_methods pm ON sp.payment_method_id = pm.payment_method_id
         WHERE sp.sale_id = $1`,
        [parseInt(saleId)]
      );

      // Build sale object for printer service
      sale = {
        sale: {
          SaleNumber: saleData.sale_number,
          CreatedAt: saleData.created_at,
          LocationName: saleData.LocationName,
          LocationAddress: saleData.LocationAddress,
          LocationPhone: saleData.LocationPhone,
          CashierFirstName: saleData.CashierFirstName,
          CashierLastName: saleData.CashierLastName,
          CustomerFirstName: saleData.CustomerFirstName,
          CustomerLastName: saleData.CustomerLastName,
          CustomerPhone: saleData.CustomerPhone,
          SubTotal: saleData.subtotal,
          TaxAmount: saleData.tax_amount,
          DiscountAmount: saleData.discount_amount,
          TotalAmount: saleData.total_amount
        },
        items: itemsResult.rows.map(item => ({
          ProductName: item.ProductName,
          VariantName: item.VariantName,
          Quantity: item.quantity,
          UnitPrice: item.unit_price,
          LineTotal: item.line_total,
          DiscountAmount: item.discount_amount || 0
        })),
        payments: paymentsResult.rows.map(payment => ({
          MethodName: payment.MethodName,
          Amount: payment.amount,
          TenderedAmount: payment.tendered_amount,
          ChangeAmount: payment.change_amount
        }))
      };
    }

    const result = await printerService.printReceipt(sale);
    res.json({
      success: true,
      printed: result === true || result?.printed || false,
      method: result?.isCloudMode ? 'cloud' : 'usb',
      message: result === true || result?.printed ? 'Receipt printed successfully' : 'Cloud mode - use browser print'
    });
  } catch (error) {
    console.error('Receipt print failed:', error);
    res.status(500).json({
      success: false,
      printed: false,
      error: error.message,
      message: 'Receipt printing failed. Please try browser print or check printer connection.'
    });
  }
});


// Print label using Windows Label Printer
router.post('/label/print', authorize('pos'), async (req, res) => {
  const { barcode, productName, price, quantity, sku, color, size } = req.body;

  console.log('Label print requested:', { barcode, productName, quantity, color, size });

  try {
    const windowsLabelPrinter = require('../services/windowsLabelPrinter');

    const result = await windowsLabelPrinter.printLabel({
      sku: sku || barcode || productName,
      barcode,
      name: productName,
      price,
      color: color || null,
      size: size || null
    }, quantity || 1);

    res.json({
      success: true,
      ...result,
      labels: quantity || 1,
      message: `Printed ${quantity || 1} label(s) to ${result.printer}`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      printed: false,
      message: error.message
    });
  }
});

// Test a hardware device (client calls POST /hardware/test/:device)
router.post('/test/:device', authorize('pos'), async (req, res) => {
  const { device } = req.params;
  try {
    if (device === 'printer') {
      const status = await printerService.testConnection();
      res.json({ success: true, device: 'printer', status });
      return;
    }

    // For other devices, return mock/placeholder
    res.json({ success: true, device, message: 'Test executed (mock for this device)' });
  } catch (error) {
    res.status(500).json({ success: false, device, error: error.message });
  }
});

// Set thermal printer interface at runtime
router.post('/printer/interface', authorize('settings'), async (req, res) => {
  const { interface: iface } = req.body;
  try {
    const ok = await printerService.setInterface(iface);
    res.json({ success: !!ok, interface: iface });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Set label printer interface at runtime
router.post('/label/interface', authorize('settings'), async (req, res) => {
  const { interface: iface } = req.body;
  try {
    const windowsLabelPrinter = require('../services/windowsLabelPrinter');
    const ok = windowsLabelPrinter.setPrinterName(iface);
    res.json({ success: !!ok, interface: iface });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get barcode scanner status
router.get('/scanner/status', async (req, res) => {
  res.json({
    connected: false,
    message: 'Barcode scanner operates on client side via keyboard input'
  });
});

// Get all hardware status
router.get('/status', async (req, res) => {
  try {
    // Get actual printer status
    const printerStatus = await printerService.testConnection();

    res.json({
      printer: {
        connected: printerStatus.connected || false,
        interface: printerStatus.interface || 'Not configured',
        type: printerStatus.printerType || 'Thermal Printer'
      },
      receiptPrinter: {
        connected: printerStatus.connected || false,
        type: printerStatus.printerType || 'Fujitsu FP-510'
      },
      labelPrinter: {
        connected: true, // Assumes Windows print spooler is available
        type: 'Windows Label Printer'
      },
      barcodeScanner: {
        mode: 'keyboard',
        connected: true, // Always available via keyboard input
        message: 'Operates via keyboard input'
      }
    });
  } catch (error) {
    // Return offline status on error
    res.json({
      printer: {
        connected: false,
        error: error.message
      },
      receiptPrinter: {
        connected: false,
        type: 'Unknown'
      },
      labelPrinter: {
        connected: true,
        type: 'Windows Label Printer'
      },
      barcodeScanner: {
        mode: 'keyboard',
        connected: true,
        message: 'Operates via keyboard input'
      }
    });
  }
});

module.exports = router;
