const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function printReceipt(data, printerInterface, companyName) {
    try {
        const { sale, items, payments } = data;
        const printerName = (printerInterface || 'printer:FIT FP-510 Raster').replace('printer:', '');

        // --- WINDOWS POWERSHELL RICH PRINTING (JSON) ---
        const lines = [];

        // 1. Logo Path
        // Assuming server/src/services structure, climb up to client/public
        // POS/server/src/services -> ../../../ -> POS
        const logoPath = path.resolve(__dirname, '../../../client/public/logo.png');

        // 2. Build Lines

        // Store Header - Big and Bold
        lines.push({ text: companyName || 'HIT BY HUMA', font: 'Arial', size: 14, bold: true, align: 'center' });
        if (sale.LocationName) lines.push({ text: sale.LocationName, align: 'center' });
        if (sale.LocationAddress) lines.push({ text: sale.LocationAddress, align: 'center' });
        if (sale.LocationPhone) lines.push({ text: sale.LocationPhone, align: 'center' });

        // Items Headers
        const width = 38; // Character width for content
        const separatorWidth = 48; // Wider for full-width lines
        const separator = '-'.repeat(separatorWidth);
        const pad = (str, len) => (str || '').toString().padEnd(len).substring(0, len);
        const padLeft = (str, len) => (str || '').toString().padStart(len).substring(0, len);

        lines.push({ text: separator, align: 'center', font: 'Consolas', size: 8 });

        // Sale Info
        lines.push({ text: `Receipt No: ${sale.SaleNumber}`, align: 'left' });
        lines.push({ text: `Date: ${new Date(sale.CreatedAt).toLocaleString()}`, align: 'left' });
        lines.push({ text: `Cashier: ${sale.CashierFirstName} ${sale.CashierLastName}`, align: 'left' });
        lines.push({ text: separator, align: 'center', font: 'Consolas', size: 8 });

        // Items Header with Discount column
        lines.push({ text: 'ITEM                QTY  PRICE   DISC.  TOTAL', font: 'Consolas', size: 8, bold: true });
        lines.push({ text: separator, font: 'Consolas', size: 8 });

        items.forEach(item => {
            // Extract variant info (size/color) from variant name
            const productName = item.ProductName || 'Item';
            const variantInfo = item.VariantName || '';
            const qty = String(item.Quantity);
            const price = String(item.UnitPrice);
            const discount = item.DiscountAmount > 0 ? String(item.DiscountAmount) : '-';
            const total = String(item.LineTotal);

            // Line 1: Item name in larger font
            lines.push({ text: productName, font: 'Arial', size: 10, bold: true });

            // Line 2: Size/Color in smaller font (if variant exists)
            if (variantInfo) {
                lines.push({ text: `  ${variantInfo}`, font: 'Consolas', size: 7 });
            }

            // Line 3: Qty, Price, Discount, Total
            const detailLine = pad('', 16) + ' ' + pad(qty, 3) + ' ' + padLeft(price, 6) + ' ' + padLeft(discount, 6) + ' ' + padLeft(total, 7);
            lines.push({ text: detailLine, font: 'Consolas', size: 8 });
        });
        lines.push({ text: separator, font: 'Consolas', size: 8 });

        // Totals helper
        const pair = (label, val) => {
            const space = width - label.length - val.length;
            return label + ' '.repeat(Math.max(1, space)) + val;
        };

        lines.push({ text: pair('Subtotal:', String(sale.SubTotal)), font: 'Consolas', size: 9 });
        if (sale.DiscountAmount > 0) lines.push({ text: pair('Discount:', '-' + String(sale.DiscountAmount)), font: 'Consolas', size: 9 });
        if (sale.TaxAmount > 0) lines.push({ text: pair('Tax:', String(sale.TaxAmount)), font: 'Consolas', size: 9 });

        lines.push({ text: separator, font: 'Consolas', size: 8 });
        // Use smaller width for TOTAL to prevent cutoff with bold font
        const totalPair = (label, val) => {
            const space = 35 - label.length - val.length; // Reduced from 38 to 35 for safety
            return label + ' '.repeat(Math.max(1, space)) + val;
        };
        lines.push({ text: totalPair('TOTAL:', String(sale.TotalAmount)), font: 'Consolas', size: 10, bold: true });
        lines.push({ text: separator, font: 'Consolas', size: 8 });

        // Payments
        if (payments && payments.length > 0) {
            // Map payment method names to user-friendly labels
            const getPaymentLabel = (methodName) => {
                if (!methodName) return 'Cash';

                // Normalize the method name
                const normalized = methodName.trim().toLowerCase();

                // Exact matches first
                if (normalized === 'cash') return 'Cash';
                if (normalized === 'bank transfer') return 'Bank Transfer';
                if (normalized === 'credit card') return 'Card';
                if (normalized === 'debit card') return 'Card';

                // Partial matches for flexibility
                if (normalized.includes('cash')) return 'Cash';
                if (normalized.includes('bank') || normalized.includes('transfer')) return 'Bank Transfer';
                if (normalized.includes('credit') || normalized.includes('debit') || normalized.includes('card')) return 'Card';
                if (normalized.includes('jazz') || normalized.includes('easypaisa')) return 'Mobile Money';
                if (normalized.includes('store credit') || normalized.includes('wallet')) return 'Store Credit';

                // Return original if no match
                return methodName;
            };

            if (payments.length === 1) {
                // Single payment
                const p = payments[0];
                const label = getPaymentLabel(p.MethodName);
                lines.push({ text: pair(`Paid (${label}):`, String(p.Amount)), font: 'Consolas', size: 9 });

                if (p.TenderedAmount > p.Amount) {
                    lines.push({ text: pair('Tendered:', String(p.TenderedAmount)), font: 'Consolas', size: 9 });
                    lines.push({ text: pair('Change:', String(p.ChangeAmount)), font: 'Consolas', size: 9 });
                }
            } else {
                // Split payment
                const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.Amount || 0), 0);
                lines.push({ text: pair('Paid (Split):', String(totalPaid.toFixed(2))), font: 'Consolas', size: 9, bold: true });

                // Show breakdown
                payments.forEach(p => {
                    const label = getPaymentLabel(p.MethodName);
                    lines.push({ text: `  ${label}: ${p.Amount}`, font: 'Consolas', size: 8 });
                });
            }

            lines.push({ text: separator, font: 'Consolas', size: 8 });
        }

        // Footer
        lines.push({ text: 'Thank you for shopping!', align: 'center', font: 'Arial', size: 10, bold: true });
        lines.push({ text: 'Please visit again', align: 'center', size: 9 });

        // 3. Execution (JSON file)
        const os = require('os');
        const receiptsDir = os.tmpdir();
        // No need to mkdir for system temp

        const receiptData = {
            logoPath: logoPath,
            lines: lines
        };

        const fileName = `receipt_json_${Date.now()}.json`;
        const filePath = path.join(receiptsDir, fileName);

        await fs.writeFile(filePath, JSON.stringify(receiptData, null, 2), 'utf8');

        // Call Script
        const scriptPath = path.join(__dirname, '../../print-receipt-json.ps1');
        const cmd = `powershell -ExecutionPolicy Bypass -File "${scriptPath}" -PrinterName "${printerName}" -JsonPath "${filePath}"`;

        console.log(`Sending rich receipt to: ${printerName}`);

        await execPromise(cmd);

        // Cleanup
        setTimeout(() => fs.unlink(filePath).catch(() => { }), 5000);

        return { printed: true, message: 'Printed Rich Receipt via Windows Spooler' };

    } catch (err) {
        console.error('Rich Print Failed:', err);
        throw new Error('Windows Print Failed: ' + err.message);
    }
}

module.exports = { printReceipt };
