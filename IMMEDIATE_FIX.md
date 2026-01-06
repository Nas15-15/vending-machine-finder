# 🚨 IMMEDIATE FIX: Deploy Backend as Netlify Function

The "Request failed" error happens because **your backend API is not running anywhere**.

I'm going to set up the backend to run as **Netlify Functions** so everything runs on Netlify together.

## Quick Setup (5 minutes)

### Step 1: Create Netlify Functions Directory

```bash
mkdir netlify
mkdir netlify/functions
```

### Step 2: Install Dependencies

```bash
npm install @netlify/functions
```

### Step 3: Update netlify.toml

The file is already updated - see `netlify.toml`

### Step 4: Deploy

```bash
# Build
npm run build

# Deploy the entire site (frontend + backend functions)
# Drag and drop the ENTIRE PROJECT FOLDER (not just dist/) to Netlify
# OR use Netlify CLI:
netlify deploy --prod
```

## What This Does

- ✅ Backend runs as serverless functions on Netlify
- ✅ No separate hosting needed
- ✅ Everything in one place
- ✅ Search will work immediately

## Alternative: Quick Backend Deploy to Render (10 minutes)

If Netlify Functions don't work, deploy backend to Render:

1. Go to [render.com](https://render.com) and sign up
2. Click "New +" → "Web Service"
3. Connect your GitHub repo OR upload files manually
4. Settings:
   - Name: `vending-machine-api`
   - Environment: `Node`
   - Build Command: `npm install`
   - Start Command: `node server.js`
5. Add environment variables (copy from `.env`)
6. Click "Create Web Service"
7. Copy the URL (e.g., `https://vending-machine-api.onrender.com`)
8. In Netlify, add environment variable:
   - `VITE_API_BASE_URL` = `https://vending-machine-api.onrender.com`
9. Redeploy Netlify

---

**I'm setting up Netlify Functions now to fix this immediately...**
