# HIT BY HUMA POS - Deployment Guide

This guide will help you deploy the POS system so your client can access it online.

## 🏗️ Architecture Overview

| Component | Deployment Platform | Purpose |
|-----------|---------------------|---------|
| Frontend (React) | **Vercel** | User Interface |
| Backend (Express) | **Railway** or **Render** | API Server |
| Database | **Azure SQL** or **Remote SQL Server** | Data Storage |

---

## 📋 Prerequisites

1. **GitHub Account** - Push your code to GitHub first
2. **Vercel Account** - Free at [vercel.com](https://vercel.com)
3. **Railway Account** - Free at [railway.app](https://railway.app) (or Render at [render.com](https://render.com))
4. **Database Access** - Your SQL Server must be accessible from the internet

---

## 🗄️ Step 1: Database Setup

Your backend uses **MS SQL Server**. You have two options:

### Option A: Azure SQL (Recommended for Production)
1. Go to [Azure Portal](https://portal.azure.com)
2. Create a new **Azure SQL Database**
3. Configure firewall rules to allow connections
4. Run your `schema.sql` to create tables
5. Note your connection details

### Option B: Expose Existing SQL Server
1. Configure your SQL Server for remote connections
2. Open port 1433 on your firewall/router
3. Use SQL Server Authentication (not Windows Auth)

---

## 🖥️ Step 2: Deploy Backend to Railway

### 2.1 Push Code to GitHub
```bash
cd server
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/pos-server.git
git push -u origin main
```

### 2.2 Deploy on Railway
1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Select your `pos-server` repository
4. Railway will auto-detect Node.js

### 2.3 Configure Environment Variables
In Railway dashboard, go to **Variables** and add:

```
PORT=5000
NODE_ENV=production
CLIENT_URL=https://your-app.vercel.app

# Database (Use SQL Server Auth, NOT Windows Auth)
DB_SERVER=your-server.database.windows.net
DB_PORT=1433
DB_NAME=HitByHumaPOS
DB_USER=your-username
DB_PASSWORD=your-password
DB_ENCRYPT=true
DB_TRUST_SERVER_CERTIFICATE=false
DB_TRUSTED_CONNECTION=false

# JWT
JWT_SECRET=your-super-secret-key-min-32-chars
JWT_EXPIRES_IN=1d
JWT_REFRESH_EXPIRES_IN=7d

# API
API_PREFIX=/api/v1
```

### 2.4 Get Your Backend URL
After deployment, Railway will give you a URL like:
`https://pos-server-production.up.railway.app`

**Save this URL - you'll need it for the frontend!**

---

## 🌐 Step 3: Deploy Frontend to Vercel

### 3.1 Push Client to GitHub
```bash
cd client
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/pos-client.git
git push -u origin main
```

### 3.2 Deploy on Vercel
1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **"Add New"** → **"Project"**
3. Import your `pos-client` repository
4. Vercel will auto-detect Vite

### 3.3 Configure Environment Variables
In Vercel dashboard, go to **Settings** → **Environment Variables** and add:

```
VITE_API_URL=https://pos-server-production.up.railway.app
VITE_SOCKET_URL=https://pos-server-production.up.railway.app
```

*(Replace with your actual Railway backend URL)*

### 3.4 Redeploy
After adding environment variables, trigger a new deployment:
- Go to **Deployments** → Click the **...** menu → **Redeploy**

---

## 4️⃣ Step 4: Update CORS Settings

After deploying the frontend, update the backend's `CLIENT_URL` environment variable in Railway:

```
CLIENT_URL=https://your-app.vercel.app
```

---

## ✅ Step 5: Verify Deployment

1. **Test Backend Health**
   ```
   curl https://your-backend.up.railway.app/health
   ```
   Should return: `{"status":"healthy","database":"connected"}`

2. **Test Frontend**
   - Visit your Vercel URL
   - Try logging in with your credentials

---

## 🔧 Troubleshooting

### CORS Errors
- Make sure `CLIENT_URL` in Railway matches your Vercel URL exactly
- Check for trailing slashes (don't include them)

### Database Connection Failed
- Ensure SQL Server allows remote connections
- Check firewall rules allow Railway's IPs
- Use SQL Server Authentication, not Windows Auth

### Socket.IO Not Connecting
- Verify `VITE_SOCKET_URL` is set correctly
- Check Railway logs for connection errors

### Build Failed on Vercel
- Check that all dependencies are in `package.json`
- Review build logs for specific errors

---

## 💰 Cost Overview

| Service | Free Tier |
|---------|-----------|
| Vercel | 100GB bandwidth/month |
| Railway | $5 credit/month (enough for small apps) |
| Azure SQL | Free tier available (5GB) |

---

## 📱 Share With Client

Once deployed, share these URLs with your client:

- **App URL**: `https://your-app.vercel.app`
- **Login Credentials**: (whatever you set up)

---

## 🔄 Updating the App

When you make changes:

1. **Frontend**: Push to GitHub → Vercel auto-deploys
2. **Backend**: Push to GitHub → Railway auto-deploys

```bash
git add .
git commit -m "Your changes"
git push
```

---

## 📞 Need Help?

- [Vercel Docs](https://vercel.com/docs)
- [Railway Docs](https://docs.railway.app)
- [Azure SQL Docs](https://docs.microsoft.com/azure/azure-sql)
