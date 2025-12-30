/**
 * Windows Label Printer Service - Image-based labels with barcodes
 * Uses Windows Print Spooler for label printing
 */

const { exec } = require('child_process');
const util = require('util');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

const execPromise = util.promisify(exec);

// Image and barcode generation libraries
let Canvas, bwipjs;
try {
    const canvas = require('canvas');
    Canvas = canvas;
    bwipjs = require('bwip-js');
    logger.info('Canvas and bwip-js loaded successfully');
} catch (e) {
    logger.warn('Canvas or bwip-js not available - image labels disabled');
}

class WindowsLabelPrinter {
    constructor() {
        this.printerName = process.env.LABEL_PRINTER_NAME || 'LABEL_Printer';
        this.tempDir = path.join(__dirname, '../../temp');

        // Label dimensions - 6cm x 4cm label
        // 6cm x 4cm at 200 DPI = 472x315 pixels
        this.labelWidth = 472;
        this.labelHeight = 315;

        // Content area: 5cm x 3cm (with ~0.5cm margins)
        // Margins: ~39px on each side
        this.marginX = 39;
        this.marginY = 39;
    }

    /**
     * Set printer name at runtime
     */
    setPrinterName(name) {
        if (name) {
            this.printerName = name;
            return true;
        }
        return false;
    }

    /**
     * Ensure temp directory exists
     */
    async ensureTempDir() {
        try {
            await fs.mkdir(this.tempDir, { recursive: true });
        } catch (error) {
            // Directory might already exist
        }
    }

    /**
     * Print product label
     */
    async printLabel(product, quantity = 1) {
        try {
            await this.ensureTempDir();

            const { sku, barcode, name, price, color, size } = product;

            // Generate label image - pass both SKU and barcode separately
            const imagePath = await this.generateLabelImage({
                name,
                sku: sku || 'N/A', // SKU is the product code
                barcode: barcode || sku, // Barcode number (fallback to SKU if not set)
                price: this.formatPrice(price),
                color: color || null,
                size: size || null,
            });

            logger.info(`Created label image: ${imagePath}`);

            // Print image using external PowerShell script (avoids escaping issues)
            const printScriptPath = path.join(__dirname, '../../print-image.ps1');

            for (let i = 0; i < quantity; i++) {
                const cmd = `powershell -ExecutionPolicy Bypass -File "${printScriptPath}" -ImagePath "${imagePath}" -PrinterName "${this.printerName}"`;

                await execPromise(cmd, { timeout: 15000 });

                logger.info(`Label ${i + 1}/${quantity} sent to printer`);

                // Wait between labels
                if (i < quantity - 1) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }

            // Clean up
            setTimeout(async () => {
                try {
                    await fs.unlink(imagePath);
                    logger.info('Cleaned up temp files');
                } catch (e) {
                    logger.warn(`Could not delete temp files: ${e.message}`);
                }
            }, 10000);

            return {
                success: true,
                printed: quantity,
                printer: this.printerName,
            };

        } catch (error) {
            logger.error('Label printing failed:', error);
            // Include stdout/stderr if available from exec error
            if (error.stdout) logger.error('stdout:', error.stdout);
            if (error.stderr) logger.error('stderr:', error.stderr);

            throw new Error(`Label printing failed: ${error.stderr || error.message}`);
        }
    }

    /**
         * Generate label image - Updated layout with Color (left) and Size (right)
         */
    async generateLabelImage(data) {
        if (!Canvas || !bwipjs) {
            throw new Error('Canvas or bwip-js not available');
        }

        const { name, sku, barcode, price, color, size } = data;

        // 1. Setup Canvas
        const canvas = Canvas.createCanvas(this.labelWidth, this.labelHeight);
        const ctx = canvas.getContext('2d');

        // 2. White Background
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, this.labelWidth, this.labelHeight);
        ctx.fillStyle = '#000000';
        ctx.antialias = 'none';



        const centerX = this.labelWidth / 2;
        const leftX = this.marginX + 10;
        const rightX = this.labelWidth - this.marginX - 10;

        // --- ROW 1: Product Name (Centered, BIGGER) ---
        ctx.font = 'bold 28px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(name.substring(0, 22), centerX, 35);

        // --- ROW 2: SKU (Centered) ---
        ctx.font = 'bold 16px Arial';
        ctx.fillText(`SKU: ${sku || 'N/A'}`, centerX, 60);

        // --- ROW 3: BARCODE (Centered & Stretched) ---
        let barcodeEndY = 150;
        if (barcode) {
            try {
                const barcodeBuffer = await bwipjs.toBuffer({
                    bcid: 'code128',
                    text: barcode,
                    scale: 1,
                    height: 8,
                    includetext: true,
                    textxalign: 'center',
                    textsize: 9,
                });

                const barcodeImage = await Canvas.loadImage(barcodeBuffer);

                // Make it wide (70% of label) but not touching edges
                const targetWidth = this.labelWidth * 0.7;
                const targetHeight = 70;

                const drawX = (this.labelWidth - targetWidth) / 2;
                const drawY = 75;

                ctx.drawImage(barcodeImage, drawX, drawY, targetWidth, targetHeight);
                barcodeEndY = drawY + targetHeight + 5;

            } catch (err) {
                ctx.fillText("INVALID BARCODE", centerX, 110);
            }
        }

        // --- ROW 4: COLOR (Left) and SIZE (Right) below barcode ---
        const attrY = 185;
        ctx.font = 'bold 18px Arial';

        if (color) {
            ctx.textAlign = 'left';
            ctx.fillText(`Color: ${color}`, leftX, attrY);
        }

        if (size) {
            ctx.textAlign = 'right';
            ctx.fillText(`Size: ${size}`, rightX, attrY);
        }

        // --- ROW 5: PRICE (Centered & Huge) ---
        // Position depends on whether color/size are shown
        const priceY = (color || size) ? 260 : 220;
        ctx.font = 'bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(price, centerX, priceY);

        // 4. Save
        const timestamp = Date.now();
        const imagePath = path.join(this.tempDir, `label_${timestamp}.png`);
        await fs.writeFile(imagePath, canvas.toBuffer('image/png'));

        return imagePath;
    }

    /**
     * Format price
     */
    formatPrice(amount) {
        const currency = process.env.CURRENCY_SYMBOL || 'PKR';
        return `${currency} ${parseFloat(amount || 0).toLocaleString('en-PK', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        })}`;
    }

    /**
     * Test printer connection
     */
    async testPrinter() {
        try {
            // Check if printer exists
            const checkCommand = `Get-Printer -Name "${this.printerName}" | Select-Object Name, PrinterStatus`;
            const { stdout } = await execPromise(`powershell -Command "${checkCommand}"`, {
                timeout: 5000
            });

            logger.info('Printer status:', stdout);

            // Print test label
            await this.printLabel({
                name: 'TEST LABEL - SCANNABLE',
                sku: 'TEST001',
                barcode: '1234567890123',
                price: 1500,
            }, 1);

            return {
                connected: true,
                printer: this.printerName,
                status: 'OK',
            };
        } catch (error) {
            logger.error('Printer test failed:', error);
            return {
                connected: false,
                error: error.message,
            };
        }
    }
}

module.exports = new WindowsLabelPrinter();
