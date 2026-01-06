# 🚨 SIMPLEST FIX - Deploy Backend to Render (10 Minutes)

The "Request failed" error is happening because **your backend server is not running anywhere**.

Here's the **fastest way** to fix it:

## Step-by-Step Fix (10 minutes)

### 1. Go to Render.com
- Visit: https://render.com
- Click "Get Started for Free"
- Sign up with GitHub (easiest) or email

### 2. Create a New Web Service
- Click "New +" button (top right)
- Select "Web Service"

### 3. Connect Your Code

**Option A: If you have GitHub**
- Click "Connect GitHub"
- Select your repository
- Click "Connect"

**Option B: No GitHub (Manual)**
- Select "Public Git repository"
- Enter: `https://github.com/yourusername/vending-machine-finder`
- OR just upload your code as a ZIP

### 4. Configure the Service

Fill in these settings:

```
Name: vending-machine-api
Region: Oregon (US West) or closest to you
Branch: main
Root Directory: (leave blank)
Environment: Node
Build Command: npm install
Start Command: node server.js
```

### 5. Select Free Plan
- Click "Free" plan
- Click "Create Web Service"

### 6. Add Environment Variables

Click "Environment" tab, then add these (copy from your `.env` file):

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
APP_URL=https://your-netlify-site.netlify.app
JWT_SECRET=<your-jwt-secret>
OWNER_EMAIL=your@email.com
OWNER_PASSWORD_HASH=<your-hash>
NODE_ENV=production
PORT=4242
NOMINATIM_CONTACT=support@vendingmachinefinder.app
```

**IMPORTANT:** Set `APP_URL` to your Netlify site URL!

### 7. Wait for Deploy
- Render will automatically deploy (takes 2-3 minutes)
- You'll see "Live" with a green dot when ready
- Copy your backend URL (e.g., `https://vending-machine-api.onrender.com`)

### 8. Update Netlify

- Go to Netlify dashboard
- Click your site → Site settings → Environment variables
- Click "Add a variable"
- Add:
  ```
  Key: VITE_API_BASE_URL
  Value: https://vending-machine-api.onrender.com
  ```
- Click "Save"

### 9. Redeploy Netlify

- Go to Deploys tab
- Click "Trigger deploy" → "Deploy site"
- Wait for deployment (1-2 minutes)

### 10. Test!

- Visit your Netlify site
- Enter a location (e.g., "New York")
- Click Search
- ✅ **IT SHOULD WORK NOW!**

---

## Quick Test

After deploying backend, test it:

```bash
curl https://your-backend-url.onrender.com/api/session
```

Should return:
```json
{"active":false}
```

---

## Troubleshooting

**Backend deploy failed?**
- Check Render logs for errors
- Make sure all environment variables are set
- Verify `node server.js` starts successfully locally

**Still getting "Request failed"?**
- Check browser console for the actual error
- Verify `VITE_API_BASE_URL` is set in Netlify
- Make sure you redeployed Netlify after adding the env var
- Check CORS: `APP_URL` in backend must match your Netlify URL

**Backend is slow/sleeping?**
- Free tier on Render sleeps after 15 min of inactivity
- First request after sleep takes 30-60 seconds
- Upgrade to paid plan ($7/month) for always-on

---

## Why This Works

- ✅ Render hosts your Node.js backend (free tier available)
- ✅ Netlify hosts your frontend (free)
- ✅ Frontend connects to backend via `VITE_API_BASE_URL`
- ✅ Everything works together

---

**This is the FASTEST way to fix the "Request failed" error. Follow these steps and it will work!**
