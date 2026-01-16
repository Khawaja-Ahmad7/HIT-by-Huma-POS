# HIT BY HUMA - E-Commerce Website

Customer-facing e-commerce website for HIT BY HUMA. Built with Next.js and deployed on Vercel.

## Features

- **Product Catalog**: Browse products with category filtering
- **Product Variants**: Support for size/color variants
- **Shopping Cart**: Persistent cart using localStorage
- **Checkout**: Customer information form and order placement
- **Order Confirmation**: Success page with order number
- **Responsive Design**: Mobile-first, works on all devices
- **Theme**: Matches POS system brand colors

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create `.env.local` with:

```
NEXT_PUBLIC_API_URL=http://localhost:4000/api
```

For production:
```
NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api
```

### 3. Run Development Server

```bash
npm run dev
```

Website runs on `http://localhost:3000`

## Project Structure

```
src/
├── app/
│   ├── layout.tsx          # Root layout with header/footer
│   ├── page.tsx            # Homepage with products
│   ├── cart/page.tsx       # Shopping cart
│   ├── checkout/page.tsx   # Checkout form
│   └── order-success/page.tsx
├── components/
│   ├── Header.tsx          # Navigation with cart icon
│   ├── ProductCard.tsx     # Product display card
│   └── CategoryFilter.tsx  # Category filter buttons
├── context/
│   └── CartContext.tsx     # Cart state management
└── lib/
    └── api.ts              # API client
```

## Deployment (Vercel)

1. Push code to GitHub
2. Import project in Vercel
3. Add environment variable:
   - `NEXT_PUBLIC_API_URL`: Your Oracle Cloud backend URL
4. Deploy!

## Build for Production

```bash
npm run build
npm start
```
