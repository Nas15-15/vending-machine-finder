# 🚨 IMPORTANT: Backend Deployment Required

## Quick Fix for "Request failed" Error

Your app is currently deployed on **Netlify**, which only hosts the frontend (HTML/CSS/JavaScript). The backend API server is **not running**, which is why searches fail.

### What You Need to Do:

1. **Deploy the backend separately** to one of these platforms:
   - ✅ **[Render.com](https://render.com)** (Recommended - Free tier)
   - [Railway.app](https://railway.app)
   - [Fly.io](https://fly.io)

2. **Set the backend URL** in Netlify:
   - Go to Netlify dashboard → Site settings → Environment variables
   - Add: `VITE_API_BASE_URL` = `https://your-backend-url.onrender.com`
   - Redeploy your site

3. **Follow the setup guide**: See [NETLIFY_SETUP.md](./NETLIFY_SETUP.md) for detailed instructions

### Quick Test

Once deployed, test your backend:
```bash
curl https://your-backend-url.onrender.com/api/session
# Should return: {"active":false}
```

---

## Detailed Setup Guide

See **[NETLIFY_SETUP.md](./NETLIFY_SETUP.md)** for complete step-by-step instructions on:
- Deploying backend to Render/Railway
- Configuring Netlify environment variables
- Setting up Stripe webhooks
- Testing the full deployment

---

## Why This Happened

- **Netlify** = Static file hosting (frontend only)
- **Your app** = Frontend + Backend (Node.js Express API)
- **Solution** = Deploy backend separately, connect via `VITE_API_BASE_URL`

The error handling has been improved to show clearer messages when the backend is unreachable.
