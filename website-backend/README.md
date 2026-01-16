# HIT BY HUMA - Website Backend

E-commerce website backend for HIT BY HUMA POS system. This service connects to the shared Neon PostgreSQL database and provides APIs for the customer-facing website.

## Features

- **Products API**: Read-only access to active products (no stock exposure)
- **Orders API**: Create orders from website, track order status
- **Rate Limiting**: Protection against abuse
- **Security**: Helmet, CORS, input validation

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and update with your values:

```bash
cp .env.example .env
```

Required environment variables:
- `DATABASE_URL`: Neon PostgreSQL connection string
- `FRONTEND_URL`: Your Vercel frontend URL (for CORS)

### 3. Run Development Server

```bash
npm run dev
```

Server runs on `http://localhost:4000`

## API Endpoints

### Products

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/products` | List active products |
| GET | `/api/products/:id` | Get product details |
| GET | `/api/products/categories/list` | List categories |

### Orders

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/orders` | Create new order |
| GET | `/api/orders/:orderNumber/status` | Check order status |

## Deployment (Oracle Cloud)

1. Create Oracle Cloud free tier VM (Ampere A1)
2. Install Node.js 18+
3. Clone this repository
4. Configure `.env` with production values
5. Use PM2 for process management:
   ```bash
   npm install -g pm2
   pm2 start src/index.js --name "hitbyhuma-api"
   pm2 save
   pm2 startup
   ```
6. Configure Nginx as reverse proxy with SSL

## Health Check

```bash
curl http://localhost:4000/health
```
