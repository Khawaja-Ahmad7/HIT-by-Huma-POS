# HIT BY HUMA - Point of Sale System

A comprehensive, industry-ready Point of Sale (POS) system built for retail stores with features like product matrix management, multi-location inventory, hardware integration, CRM, and shift management.

## 🚀 Features

### Core Modules

#### 1. Product Management (Product Matrix)
- Parent/Child product relationships for variants (Size, Color, etc.)
- SKU and barcode generation
- Price propagation across variants
- Category management
- Bulk product import/export

#### 2. Inventory Management
- Multi-location stock tracking
- Stock transfers between locations
- Stock adjustments with audit trail
- Low stock alerts
- Real-time inventory sync

#### 3. POS Terminal
- Fast product search and barcode scanning
- Cart management with quantity adjustments
- Customer linking
- Discount application (percentage/fixed)
- Suspend and resume carts
- Multiple payment methods (Cash, Card, Split, Store Credit)
- Receipt printing

#### 4. Customer Relationship Management (CRM)
- Customer profiles with purchase history
- Store wallet/credit system
- Loyalty points tracking
- SMS notifications (via Twilio)
- Customer notes and preferences

#### 5. Shift Management & EOD
- Clock in/out functionality
- Opening cash drawer count
- End-of-day reconciliation
- Cash variance tracking
- Z-Report generation

#### 6. Reports & Analytics
- Sales reports (daily, weekly, monthly, custom)
- Top selling products
- Category breakdown
- Hourly sales analysis
- Employee performance
- Payment method summary
- Export to CSV/PDF

### Hardware Integration
- **Receipt Printer**: Epson TM-T88V (ESC/POS)
- **Barcode Scanner**: Zebra DS2208 (USB HID)
- **Cash Drawer**: Via printer kick pulse
- **Customer Display**: VFD pole display

## 🛠 Tech Stack

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: SQL Server
- **Queue**: Bull (Redis-based)
- **SMS**: Twilio
- **Logging**: Winston

### Frontend
- **Framework**: React 18
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **State**: Zustand
- **Data Fetching**: React Query (TanStack Query)
- **Routing**: React Router v6
- **Real-time**: Socket.io

## 📦 Installation

### Prerequisites
- Node.js 18 or higher
- SQL Server 2019+
- Redis (for job queue)
- Git

### Database Setup

1. Create a new SQL Server database:
```sql
CREATE DATABASE HitByHumaPOS;
```

2. Run the schema script:
```bash
sqlcmd -S localhost -d HitByHumaPOS -i server/src/database/schema.sql
```

### Backend Setup

1. Navigate to the server directory:
```bash
cd server
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.example .env
```

4. Configure your `.env` file:
```env
# Server
PORT=3001
NODE_ENV=development

# Database
DB_SERVER=localhost
DB_DATABASE=HitByHumaPOS
DB_USER=sa
DB_PASSWORD=your_password
DB_ENCRYPT=true
DB_TRUST_SERVER_CERTIFICATE=true

# Authentication
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=8h

# Redis (for job queue)
REDIS_URL=redis://localhost:6379

# Twilio (for SMS)
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# Printer (optional)
PRINTER_IP=192.168.1.100
PRINTER_PORT=9100
```

5. Start the server:
```bash
# Development
npm run dev

# Production
npm start
```

### Frontend Setup

1. Navigate to the client directory:
```bash
cd client
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser to `http://localhost:5173`

### Running Both Together

From the root directory:
```bash
npm run dev
```

## 🗄 Database Schema

### Core Tables

| Table | Description |
|-------|-------------|
| `Categories` | Product categories |
| `Products` | Parent products |
| `ProductVariants` | Product variants (size, color) |
| `ProductAttributes` | Variant attributes |
| `Locations` | Store locations |
| `Inventory` | Stock levels per location |
| `Customers` | Customer profiles |
| `Employees` | Staff accounts |
| `Shifts` | Shift records |
| `SalesTransactions` | Sales headers |
| `SaleItems` | Sales line items |
| `DiscountRules` | Discount configurations |
| `StoreWallet` | Customer credit transactions |

## 🔌 API Endpoints

### Authentication
```
POST   /api/auth/login          - Employee login
POST   /api/auth/register       - Create employee (admin only)
POST   /api/auth/refresh        - Refresh JWT token
POST   /api/auth/logout         - Logout
```

### Products
```
GET    /api/products            - List products
GET    /api/products/:id        - Get product details
POST   /api/products            - Create product
PUT    /api/products/:id        - Update product
DELETE /api/products/:id        - Delete product
GET    /api/products/barcode/:code - Lookup by barcode
POST   /api/products/:id/variants - Add variant
```

### Inventory
```
GET    /api/inventory           - List inventory
GET    /api/inventory/locations - Get locations
POST   /api/inventory/adjust    - Adjust stock
POST   /api/inventory/transfer  - Transfer between locations
GET    /api/inventory/summary   - Stock summary
```

### Sales
```
GET    /api/sales               - List transactions
POST   /api/sales               - Create sale
GET    /api/sales/:id           - Get transaction
POST   /api/sales/:id/refund    - Process refund
POST   /api/sales/suspend       - Suspend cart
GET    /api/sales/suspended     - Get suspended carts
```

### Customers
```
GET    /api/customers           - List customers
GET    /api/customers/:id       - Get customer
POST   /api/customers           - Create customer
PUT    /api/customers/:id       - Update customer
GET    /api/customers/:id/purchases - Purchase history
POST   /api/customers/:id/wallet - Add/remove credit
```

### Shifts
```
GET    /api/shifts/current      - Current shift
POST   /api/shifts/start        - Start shift
POST   /api/shifts/end          - End shift
GET    /api/shifts/history      - Shift history
GET    /api/shifts/:id/z-report - Generate Z-Report
```

### Reports
```
GET    /api/reports/sales-summary    - Sales summary
GET    /api/reports/top-products     - Best sellers
GET    /api/reports/category-breakdown - By category
GET    /api/reports/hourly-sales     - Hourly analysis
GET    /api/reports/employee-performance - By employee
GET    /api/reports/export           - Export data
```

### Hardware
```
GET    /api/hardware/status          - Device status
POST   /api/hardware/print-receipt   - Print receipt
POST   /api/hardware/cash-drawer/open - Open drawer
POST   /api/hardware/test/:device    - Test device
```

## 🔐 User Roles & Permissions

| Role | Permissions |
|------|------------|
| Admin | Full access to all features |
| Manager | All except system settings |
| Cashier | POS, limited reports, customers |

## 📱 Default Login

For development, use:
- **Employee Code**: `ADMIN001`
- **Password**: `password123`

## 🖨 Hardware Setup

### Epson TM-T88V Printer
1. Connect via USB or Ethernet
2. Note the IP address or COM port
3. Configure in Settings > Hardware
4. Test print to verify connection

### Barcode Scanner
1. Configure scanner to USB HID mode
2. Scanner works automatically in POS view
3. Scanned barcodes trigger product lookup

### Cash Drawer
1. Connect to printer's DK port
2. Drawer opens automatically after cash sales
3. Manual open available in Shifts page

## 📂 Project Structure

```
POS/
├── client/                    # React frontend
│   ├── public/
│   ├── src/
│   │   ├── components/        # Reusable components
│   │   ├── pages/             # Page components
│   │   ├── stores/            # Zustand stores
│   │   ├── services/          # API & socket services
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
│
├── server/                    # Node.js backend
│   ├── src/
│   │   ├── config/            # Database config
│   │   ├── database/          # SQL scripts
│   │   ├── middleware/        # Express middleware
│   │   ├── routes/            # API routes
│   │   ├── services/          # Business logic
│   │   ├── utils/             # Utilities
│   │   └── index.js           # Entry point
│   ├── .env.example
│   └── package.json
│
├── package.json               # Root package.json
└── README.md
```

## 🧪 Testing

```bash
# Backend tests
cd server
npm test

# Frontend tests
cd client
npm test
```

## 🚢 Deployment

### Docker (Recommended)
```bash
docker-compose up -d
```

### Manual
1. Build frontend: `cd client && npm run build`
2. Copy `client/dist` to server static folder
3. Set `NODE_ENV=production`
4. Start server: `npm start`

## 📄 License

MIT License - See LICENSE file for details

## 🤝 Support

For support, email support@hitbyhuma.com or open an issue on GitHub.

---

Built with ❤️ by HIT BY HUMA Team
