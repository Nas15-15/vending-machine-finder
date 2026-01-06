# Netlify Deployment Setup Guide

This guide walks you through deploying the Vending Machine Finder to Netlify (frontend) and a backend hosting service.

## 🎯 Overview

Your app has two parts:
1. **Frontend** (HTML, CSS, JavaScript) → Deploy to **Netlify**
2. **Backend** (Node.js Express API) → Deploy to **Render/Railway/Fly.io**

## 📋 Prerequisites

- [ ] GitHub account (optional but recommended)
- [ ] Netlify account (free at [netlify.com](https://netlify.com))
- [ ] Backend hosting account (Render.com recommended - free tier available)
- [ ] All environment variables ready (see `.env` file)

## Part 1: Deploy Backend (Required First!)

### Option A: Deploy to Render.com (Recommended - Free Tier)

1. **Sign up at [render.com](https://render.com)**

2. **Create a new Web Service**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository OR upload code manually
   
3. **Configure the service:**
   ```
   Name: vending-machine-api
   Environment: Node
   Build Command: npm install
   Start Command: node server.js
   ```

4. **Add Environment Variables** (in Render dashboard):
   ```
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PRICE_ID=price_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   APP_URL=https://your-netlify-site.netlify.app
   JWT_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
   OWNER_EMAIL=your@email.com
   OWNER_PASSWORD_HASH=<generate with bcrypt>
   ACCESS_CODE_HASHES=member:$2a$10$...
   BITCOIN_ADDRESS=bc1q...
   BITCOIN_MIN_SATS=50000
   BITCOIN_REQUIRED_CONFIRMATIONS=1
   NOMINATIM_CONTACT=support@vendingmachinefinder.app
   NODE_ENV=production
   PORT=4242
   ```

5. **Deploy!** Render will give you a URL like: `https://vending-machine-api.onrender.com`

6. **Test the backend:**
   ```bash
   curl https://your-backend-url.onrender.com/api/session
   # Should return: {"active":false}
   ```

### Option B: Deploy to Railway.app

1. Sign up at [railway.app](https://railway.app)
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository
4. Add environment variables (same as Render)
5. Railway will auto-deploy and give you a URL

### Option C: Deploy to Fly.io

1. Install Fly CLI: `npm install -g flyctl`
2. Sign up: `fly auth signup`
3. Launch app: `fly launch`
4. Set secrets: `fly secrets set STRIPE_SECRET_KEY=sk_test_...`
5. Deploy: `fly deploy`

## Part 2: Deploy Frontend to Netlify

### Method 1: Netlify UI (Easiest)

1. **Build the frontend locally:**
   ```bash
   npm run build
   ```
   This creates a `dist/` folder with your production files.

2. **Go to [app.netlify.com](https://app.netlify.com)**

3. **Drag and drop the `dist/` folder** onto the Netlify dashboard

4. **Configure Environment Variables:**
   - Go to Site settings → Environment variables
   - Add these variables:
     ```
     VITE_API_BASE_URL=https://your-backend-url.onrender.com
     VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
     ```

5. **Redeploy** (since you added env vars):
   - Go to Deploys → Trigger deploy → Deploy site

6. **Your site is live!** 🎉
   - URL will be like: `https://random-name-123.netlify.app`
   - You can customize this in Site settings → Domain management

### Method 2: Netlify CLI

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login
netlify login

# Initialize (first time only)
netlify init

# Set environment variables
netlify env:set VITE_API_BASE_URL "https://your-backend-url.onrender.com"
netlify env:set VITE_STRIPE_PUBLISHABLE_KEY "pk_test_..."

# Build and deploy
npm run build
netlify deploy --prod
```

### Method 3: GitHub Auto-Deploy (Best for Continuous Deployment)

1. **Push your code to GitHub**

2. **In Netlify:**
   - Click "Add new site" → "Import an existing project"
   - Choose GitHub and select your repository
   - Build settings:
     ```
     Build command: npm run build
     Publish directory: dist
     ```

3. **Add environment variables** (same as Method 1)

4. **Deploy!** Now every push to `main` branch auto-deploys

## Part 3: Configure Stripe Webhooks

1. **Go to [Stripe Dashboard](https://dashboard.stripe.com/webhooks)**

2. **Add endpoint:**
   ```
   URL: https://your-backend-url.onrender.com/api/webhooks/stripe
   Events: checkout.session.completed
   ```

3. **Copy the webhook secret** and update `STRIPE_WEBHOOK_SECRET` in your backend environment variables

4. **Redeploy backend** if needed

## Part 4: Test Everything

### Test Checklist

- [ ] **Frontend loads:** Visit your Netlify URL
- [ ] **Search works:** Enter a location and click search
- [ ] **Results display:** Verify locations appear on map
- [ ] **Signup works:** Create a test account
- [ ] **Free searches work:** Use your 25 free searches
- [ ] **Payment flow works:** Test Stripe checkout (use test card: 4242 4242 4242 4242)
- [ ] **Access unlocks:** Verify paid access works after payment
- [ ] **Mobile works:** Test on your phone

### Troubleshooting

**"Request failed" error when searching:**
- ✅ Check browser console for errors
- ✅ Verify `VITE_API_BASE_URL` is set correctly in Netlify
- ✅ Verify backend is running (visit backend URL directly)
- ✅ Check CORS settings in backend (APP_URL should match frontend URL)

**Backend not responding:**
- ✅ Check backend logs in Render/Railway dashboard
- ✅ Verify all environment variables are set
- ✅ Ensure backend service is running (not sleeping)

**Payment not working:**
- ✅ Verify Stripe webhook is configured
- ✅ Check Stripe webhook logs for errors
- ✅ Ensure `STRIPE_WEBHOOK_SECRET` matches Stripe dashboard

## Part 5: Custom Domain (Optional)

### Add Custom Domain to Netlify

1. **Buy a domain** (Namecheap, GoDaddy, etc.)

2. **In Netlify:**
   - Site settings → Domain management → Add custom domain
   - Enter your domain (e.g., `vendingmachinefinder.com`)

3. **Configure DNS** (in your domain registrar):
   - Add CNAME record: `www` → `your-site.netlify.app`
   - Add A record: `@` → Netlify's IP (shown in Netlify dashboard)

4. **Enable HTTPS** (automatic in Netlify)

5. **Update environment variables:**
   - Update `APP_URL` in backend to your custom domain
   - Redeploy backend

## 🔒 Security Checklist

- [ ] All environment variables set (no defaults in production)
- [ ] HTTPS enabled (automatic on Netlify)
- [ ] Strong JWT_SECRET (32+ random bytes)
- [ ] Owner password hashed with bcrypt
- [ ] Stripe webhook secret configured
- [ ] CORS configured correctly (APP_URL matches frontend)
- [ ] No `.env` file committed to git

## 📊 Monitoring

### Check Backend Status
```bash
curl https://your-backend-url.onrender.com/api/session
```

### View Netlify Logs
- Netlify dashboard → Deploys → View logs

### View Backend Logs
- Render dashboard → Your service → Logs
- Railway dashboard → Your project → Logs

## 🆘 Need Help?

- **Netlify Docs:** [docs.netlify.com](https://docs.netlify.com)
- **Render Docs:** [render.com/docs](https://render.com/docs)
- **Railway Docs:** [docs.railway.app](https://docs.railway.app)

## Quick Reference

### Environment Variables Summary

**Backend (Render/Railway):**
- `STRIPE_SECRET_KEY` - Stripe secret key
- `STRIPE_PRICE_ID` - Stripe price ID
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook secret
- `APP_URL` - Your Netlify frontend URL
- `JWT_SECRET` - Random 32+ byte string
- `OWNER_EMAIL` - Your email
- `OWNER_PASSWORD_HASH` - Bcrypt hash of your password
- `NODE_ENV=production`

**Frontend (Netlify):**
- `VITE_API_BASE_URL` - Your backend URL (e.g., https://your-api.onrender.com)
- `VITE_STRIPE_PUBLISHABLE_KEY` - Stripe publishable key

### Useful Commands

```bash
# Build frontend
npm run build

# Test backend locally
node server.js

# Deploy to Netlify
netlify deploy --prod

# View Netlify logs
netlify logs

# Generate JWT secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Hash password
node -e "const bcrypt=require('bcryptjs');bcrypt.hash('yourpassword',10).then(h=>console.log(h))"
```

---

**You're all set!** 🚀 Your vending machine finder is now live and accessible to users worldwide.
