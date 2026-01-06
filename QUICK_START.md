# Quick Start Guide

Get the Vending Machine Finder up and running in minutes.

## Prerequisites

- Node.js 18+ and npm
- Stripe account (for card payments)
- Bitcoin address (for Bitcoin payments, optional)

## Setup Steps

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp env.sample .env
```

Edit `.env` and fill in:

**Required:**
- `STRIPE_SECRET_KEY` - From Stripe Dashboard → Developers → API keys
- `STRIPE_PRICE_ID` - Create a product/price in Stripe Dashboard
- `STRIPE_WEBHOOK_SECRET` - From `stripe listen` command (see below)
- `JWT_SECRET` - Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `OWNER_EMAIL` - Your admin email (must match exactly, case-insensitive)
- `OWNER_PASSWORD_HASH` - Generate using: `npm run generate-hash` (or provide password as argument: `npm run generate-hash yourpassword`)

**Optional:**
- `BITCOIN_ADDRESS` - Your Bitcoin receiving address
- `BITCOIN_MIN_SATS` - Minimum payment (e.g., 50000 = ~$50)
- `ACCESS_CODE_HASHES` - Format: `label1:hash1,label2:hash2`

### 3. Start Development Servers

```bash
npm run dev
```

This starts:
- Frontend (Vite) on http://localhost:5173
- Backend (Express) on http://localhost:4242

### 4. Set Up Stripe Webhooks (for local testing)

In a separate terminal:

```bash
stripe listen --forward-to localhost:4242/api/webhooks/stripe
```

Copy the webhook signing secret and add it to `.env` as `STRIPE_WEBHOOK_SECRET`.

### 5. Test the Application

1. Open http://localhost:5173
2. Try a free search (enter location + email)
3. Test payment flow (click "Unlock Access")
4. Test login with access code
5. Test promo code redemption

## Common Issues

### "Missing environment variables" warning
- Check that `.env` file exists and has all required variables
- Restart the server after changing `.env`

### Stripe checkout fails
- Verify `STRIPE_SECRET_KEY` and `STRIPE_PRICE_ID` are correct
- Check webhook is running: `stripe listen --forward-to localhost:4242/api/webhooks/stripe`

### Bitcoin verification fails
- Ensure `BITCOIN_ADDRESS` and `BITCOIN_MIN_SATS` are set
- Check transaction ID format (64 hex characters)
- Verify transaction exists on blockchain

### Search returns no results
- Check Nominatim API is accessible (may be rate-limited)
- Try a different location query
- Check server logs for errors

### Owner login shows "Invalid access code"
- **Verify email matches exactly**: The email you enter must match `OWNER_EMAIL` in your `.env` file (case-insensitive, but must match after normalization)
- **Check password hash**: Make sure `OWNER_PASSWORD_HASH` is set correctly. Generate a new hash with: `npm run generate-hash yourpassword`
- **Restart server**: After changing `.env`, restart the server for changes to take effect
- **Check server logs**: In development mode, the server logs which email is being used for login attempts
- **Common issues**:
  - Email has extra spaces or different casing
  - Password hash was copied incorrectly (must include the full `$2a$10$...` prefix)
  - `.env` file not being loaded (check file exists and server was restarted)

## Next Steps

- Read [README.md](README.md) for full documentation
- Check [DEPLOYMENT.md](DEPLOYMENT.md) for production deployment
- Run tests: `npm test`
- Run linter: `npm run lint`





