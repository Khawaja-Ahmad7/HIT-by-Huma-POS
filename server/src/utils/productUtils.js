const { v4: uuidv4 } = require('uuid');

/**
 * Generate SKU for product variant
 * Format: PRODUCTCODE-ATTR1-ATTR2-RANDOM
 */
const generateSKU = (productCode, attributes = {}) => {
  const attrPart = Object.values(attributes)
    .map(v => String(v).substring(0, 3).toUpperCase())
    .join('-');
  
  const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
  
  if (attrPart) {
    return `${productCode}-${attrPart}-${randomPart}`;
  }
  return `${productCode}-${randomPart}`;
};

/**
 * Generate unique barcode (EAN-13 compatible format)
 */
const generateBarcode = () => {
  // Generate 12 digits + check digit
  const prefix = '200'; // Internal use prefix
  const random = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
  const code = prefix + random;
  
  // Calculate check digit (EAN-13)
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(code[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  
  return code + checkDigit;
};

/**
 * Generate variant name from product name and attributes
 */
const generateVariantName = (productName, attributeValues = []) => {
  if (attributeValues.length === 0) {
    return productName;
  }
  return `${productName} - ${attributeValues.join(' / ')}`;
};

/**
 * Format price with currency
 */
const formatPrice = (amount, currency = 'PKR') => {
  return `${currency} ${parseFloat(amount).toLocaleString('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
};

module.exports = {
  generateSKU,
  generateBarcode,
  generateVariantName,
  formatPrice,
};
