# How to Deploy Your Website

This guide will help you get your vending machine finder website online so others can access it.

## 🆓 Free Hosting Options (Recommended for Start)

### Option 1: Netlify (Easiest - Recommended)

**Steps:**
1. Go to [netlify.com](https://www.netlify.com) and sign up (free)
2. Drag and drop your `vending-machine-finder` folder onto the Netlify dashboard
3. Your site will be live in seconds with a URL like `your-site-name.netlify.app`
4. You can customize the domain name in settings

**Pros:**
- Free SSL certificate
- Automatic HTTPS
- Easy custom domain
- Free tier is generous

---

### Option 2: Vercel

**Steps:**
1. Go to [vercel.com](https://vercel.com) and sign up
2. Install Vercel CLI: `npm i -g vercel`
3. In your project folder, run: `vercel`
4. Follow the prompts
5. Your site will be live!

**Pros:**
- Very fast
- Great for static sites
- Free SSL

---

### Option 3: GitHub Pages (Free)

**Steps:**
1. Create a GitHub account at [github.com](https://github.com)
2. Create a new repository
3. Upload your files to the repository
4. Go to Settings → Pages
5. Select "main" branch and "/ (root)" folder
6. Your site will be at `yourusername.github.io/repository-name`

**Pros:**
- Completely free
- Easy to update (just push changes)
- Custom domain support

---

### Option 4: Cloudflare Pages

**Steps:**
1. Go to [pages.cloudflare.com](https://pages.cloudflare.com)
2. Sign up (free)
3. Connect your GitHub repository or upload files
4. Deploy!

**Pros:**
- Fast global CDN
- Free SSL
- Easy setup

---

## 💰 Paid Hosting Options (More Control)

### Option 5: Traditional Web Hosting

**Popular Providers:**
- **Bluehost** (~$3/month)
- **HostGator** (~$3/month)
- **SiteGround** (~$4/month)

**Steps:**
1. Sign up for hosting
2. Use their file manager or FTP to upload your files
3. Your site will be live at your domain

---

### Option 6: AWS S3 + CloudFront

**Steps:**
1. Create AWS account
2. Create S3 bucket
3. Upload files
4. Enable static website hosting
5. Set up CloudFront for CDN

**Pros:**
- Very scalable
- Pay for what you use
- Professional setup

---

## 🚀 Quick Start: Netlify (Recommended)

### Method 1: Drag & Drop (Static Frontend)

1. **Build the frontend bundle**
   - Run `npm run build`
   - This creates a production-ready `dist/` folder managed by Vite
2. **Upload to Netlify**
   - Visit [app.netlify.com](https://app.netlify.com) and sign in
   - Drag-and-drop the `dist/` folder onto the dashboard
3. **Configure the backend**
   - The Express API (`server.js`) must be hosted separately (e.g., Render, Railway, Fly.io)
   - Set `APP_URL` in your backend `.env` to the public frontend URL
   - Update the frontend env (`VITE_API_BASE_URL`) if your API is on a different origin
4. **Confirm**
   - Run a search and a payment flow end-to-end to ensure the frontend is talking to your hosted API

### Method 2: Using Netlify CLI

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Navigate to your project
cd vending-machine-finder

# Deploy
netlify deploy

# For production deployment
netlify deploy --prod
```

---

## 📝 Important Notes

### Before Deploying:

1. **Test Locally First:**
   - Run `npm test` to ensure all tests pass
   - Run `npm run lint` to check code quality
   - Test the full flow: signup → login → search → payment → access unlock
   - Test promo code redemption
   - Test Bitcoin payment verification

2. **Environment Configuration:**
   - Copy `env.sample` to `.env` and fill in all required values
   - Generate secure `JWT_SECRET`: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - Hash owner password: `node -e "const bcrypt=require('bcryptjs');bcrypt.hash('yourpassword',10).then(h=>console.log(h))"`
   - Hash access codes similarly for `ACCESS_CODE_HASHES`
   - Set `NODE_ENV=production` in production

3. **Backend Hosting:**
   - The Express server (`server.js`) must be hosted separately from the frontend
   - Recommended platforms:
     - **Render** (render.com) - Free tier available, easy setup
     - **Railway** (railway.app) - Simple deployment
     - **Fly.io** (fly.io) - Global edge deployment
     - **Heroku** - Traditional option
   - Set environment variables in your hosting platform
   - Configure Stripe webhook URL: `https://your-backend.com/api/webhooks/stripe`

4. **Frontend Hosting:**
   - Build the frontend: `npm run build`
   - Deploy `dist/` folder to Netlify, Vercel, or similar
   - Set `VITE_API_BASE_URL` if API is on different domain
   - Set `VITE_STRIPE_PUBLISHABLE_KEY` for Stripe checkout

5. **Bitcoin Payment:**
   - Configure `BITCOIN_ADDRESS` (your receiving address)
   - Set `BITCOIN_MIN_SATS` (minimum payment amount)
   - Set `BITCOIN_REQUIRED_CONFIRMATIONS` (default: 1)
   - Uses Blockstream API for verification (can be changed via `BITCOIN_API_BASE`)

6. **API Considerations:**
   - OpenStreetMap Nominatim API: Free but rate-limited (1 req/sec)
   - Overpass API: Free but has usage policies
   - Built-in caching and throttling help, but for high traffic consider:
     - Paid geocoding APIs
     - Redis caching layer
     - Database for persistent cache

7. **Data Persistence:**
   - Access records stored in `data/app-store.json`
   - For production, consider migrating to a database (PostgreSQL, MongoDB)
   - Ensure `data/` directory is writable
   - Backup `data/app-store.json` regularly

8. **Custom Domain (Optional):**
   - Buy a domain from Namecheap, GoDaddy, or Google Domains
   - Connect it in your hosting provider's settings
   - Usually costs $10-15/year
   - Update `APP_URL` environment variable

---

## 🔒 Security Considerations

1. **HTTPS:** All modern hosting providers include free SSL certificates - REQUIRED for production
2. **Environment Variables:** Never commit `.env` files or secrets to git
3. **JWT Secret:** Use a strong, random secret (32+ bytes)
4. **Password Hashing:** Owner passwords and access codes must be bcrypt hashes
5. **CORS:** Configure `APP_URL` correctly to restrict origins
6. **Rate Limiting:** Already implemented on search endpoint (6 req/min per IP)
7. **Payment Processing:** 
   - Stripe webhooks verify signatures server-side
   - Bitcoin verification checks blockchain directly
   - Never trust client-side payment data
8. **Session Security:** JWT tokens in httpOnly cookies, secure in production
9. **Input Validation:** All API endpoints validate and sanitize inputs
10. **Owner Routes:** Protected by role checks - never expose owner UI to public

---

## 📊 Recommended Setup for Production

1. **Hosting:** Netlify or Vercel (free, easy)
2. **Domain:** Buy from Namecheap (~$10/year)
3. **Payment:** Integrate BTCPay Server or Coinbase Commerce
4. **Analytics:** Add Google Analytics to track usage
5. **Backup:** Keep your code in GitHub

---

## 🆘 Need Help?

- **Netlify Docs:** [docs.netlify.com](https://docs.netlify.com)
- **Vercel Docs:** [vercel.com/docs](https://vercel.com/docs)
- **GitHub Pages Docs:** [pages.github.com](https://pages.github.com)

---

## Quick Checklist

- [ ] Test site locally
- [ ] Choose hosting provider
- [ ] Deploy site
- [ ] Test on mobile
- [ ] Share your URL!

Good luck! 🚀







