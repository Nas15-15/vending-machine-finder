# Coinbase Commerce Integration Guide

This guide will walk you through integrating Coinbase Commerce as a secure cryptocurrency payment option for your Vending Machine Finder application.

## Why Coinbase Commerce?

Coinbase Commerce provides a secure, automated cryptocurrency payment solution that:
- ✅ **Prevents transaction ID reuse** - Each payment gets a unique address
- ✅ **Supports multiple cryptocurrencies** - Bitcoin, Ethereum, Litecoin, Bitcoin Cash, USD Coin, DAI
- ✅ **Automated verification** - Webhooks handle payment confirmation automatically
- ✅ **Professional checkout** - Hosted payment page with Coinbase branding
- ✅ **Low fees** - Only ~1% transaction fee
- ✅ **Easy integration** - Simple API with good documentation

## Prerequisites

- Node.js 18+ installed
- A Coinbase account (or create one at [coinbase.com](https://coinbase.com))
- Your backend server running (Express.js)

## Step 1: Set Up Coinbase Commerce Account

1. **Create/Login to Coinbase Commerce**
   - Go to [commerce.coinbase.com](https://commerce.coinbase.com)
   - Sign up or log in with your Coinbase account
   - If you don't have a Coinbase account, create one first

2. **Create a Commerce Account**
   - Follow the setup wizard
   - Complete any required verification steps
   - Accept terms and conditions

3. **Get Your API Keys**
   - Navigate to **Settings** → **API Keys**
   - Click **Create API Key**
   - Give it a name (e.g., "Vending Machine Finder")
   - Copy your **API Key** (you'll need this for `.env`)
   - Copy your **Shared Secret** (for webhook verification)

4. **Set Up Webhook** (for production)
   - Go to **Settings** → **Webhooks**
   - Click **Add Webhook**
   - Enter your webhook URL: `https://your-backend-url.com/api/webhooks/coinbase`
   - Select these events:
     - `charge:confirmed`
     - `charge:resolved`
     - `charge:failed`
   - Copy the **Webhook Secret** (different from Shared Secret)

## Step 2: Install Dependencies

Install the Coinbase Commerce SDK:

```bash
npm install @coinbase/commerce-sdk
```

## Step 3: Update Environment Variables

Add these variables to your `.env` file:

```env
# Coinbase Commerce Configuration
COINBASE_COMMERCE_API_KEY=your_api_key_here
COINBASE_COMMERCE_WEBHOOK_SECRET=your_webhook_secret_here
COINBASE_COMMERCE_PRICE_AMOUNT=9.99
COINBASE_COMMERCE_PRICE_CURRENCY=USD
```

**Important Notes:**
- `COINBASE_COMMERCE_API_KEY`: Your API key from Step 1
- `COINBASE_COMMERCE_WEBHOOK_SECRET`: The webhook secret from Step 1
- `COINBASE_COMMERCE_PRICE_AMOUNT`: The price in your chosen currency
- `COINBASE_COMMERCE_PRICE_CURRENCY`: Currency code (USD, EUR, etc.)

## Step 4: Create Coinbase Commerce Service File

Create a new file: `lib/coinbaseCommerce.js`

```javascript
import { CommerceAPI } from '@coinbase/commerce-sdk';

const apiKey = process.env.COINBASE_COMMERCE_API_KEY || '';
const commerceAPI = new CommerceAPI(apiKey);

export async function createCharge({ name, description, pricing_type, local_price, metadata = {} }) {
  if (!apiKey) {
    throw new Error('Coinbase Commerce API key not configured');
  }

  try {
    const charge = await commerceAPI.createCharge({
      name,
      description,
      pricing_type, // 'fixed_price' or 'no_price'
      local_price: {
        amount: local_price.amount,
        currency: local_price.currency
      },
      metadata
    });

    return charge.data;
  } catch (error) {
    console.error('Failed to create Coinbase Commerce charge:', error);
    throw new Error(`Failed to create charge: ${error.message}`);
  }
}

export async function getCharge(chargeId) {
  if (!apiKey) {
    throw new Error('Coinbase Commerce API key not configured');
  }

  try {
    const charge = await commerceAPI.showCharge(chargeId);
    return charge.data;
  } catch (error) {
    console.error('Failed to get Coinbase Commerce charge:', error);
    throw new Error(`Failed to get charge: ${error.message}`);
  }
}

export function verifyWebhookSignature(payload, signature, secret) {
  const crypto = require('crypto');
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(payload));
  const expectedSignature = hmac.digest('hex');
  return expectedSignature === signature;
}
```

## Step 5: Update Server Routes

Add these routes to your `server.js` file:

### Import the Coinbase Commerce functions at the top:

```javascript
import { createCharge, getCharge, verifyWebhookSignature } from './lib/coinbaseCommerce.js';
```

### Add these routes after your existing payment routes:

```javascript
// Create Coinbase Commerce charge
app.post('/api/coinbase/create-charge', async (req, res) => {
  const { email } = req.body || {};
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const amount = process.env.COINBASE_COMMERCE_PRICE_AMOUNT || '9.99';
  const currency = process.env.COINBASE_COMMERCE_PRICE_CURRENCY || 'USD';

  try {
    const charge = await createCharge({
      name: 'Vending Machine Finder Access',
      description: 'Full access to search locations',
      pricing_type: 'fixed_price',
      local_price: {
        amount,
        currency
      },
      metadata: {
        email: normalizedEmail
      }
    });

    res.json({
      id: charge.id,
      hosted_url: charge.hosted_url,
      code: charge.code,
      expires_at: charge.expires_at
    });
  } catch (error) {
    console.error('Failed to create Coinbase charge', error);
    res.status(500).json({ error: 'Failed to create payment charge' });
  }
});

// Get charge status
app.get('/api/coinbase/charge-status', async (req, res) => {
  const { chargeId } = req.query;
  if (!chargeId) {
    return res.status(400).json({ error: 'chargeId is required' });
  }

  try {
    const charge = await getCharge(chargeId);
    const email = charge.metadata?.email;
    
    if (charge.timeline && charge.timeline.length > 0) {
      const latestStatus = charge.timeline[charge.timeline.length - 1];
      const isPaid = latestStatus.status === 'COMPLETED' || latestStatus.status === 'RESOLVED';
      
      if (isPaid && email) {
        await markPaidAccess(email, 'coinbase_commerce', {
          chargeId: charge.id,
          code: charge.code,
          amount: charge.pricing?.local?.amount,
          currency: charge.pricing?.local?.currency
        });
      }
    }

    res.json({
      id: charge.id,
      status: charge.timeline?.[charge.timeline.length - 1]?.status || 'NEW',
      hosted_url: charge.hosted_url,
      email: email
    });
  } catch (error) {
    console.error('Failed to get charge status', error);
    res.status(500).json({ error: 'Failed to get charge status' });
  }
});

// Coinbase Commerce webhook handler
app.post('/api/webhooks/coinbase', express.json(), async (req, res) => {
  const signature = req.headers['x-cc-webhook-signature'];
  const webhookSecret = process.env.COINBASE_COMMERCE_WEBHOOK_SECRET || '';

  if (!signature || !webhookSecret) {
    return res.status(400).json({ error: 'Missing webhook signature or secret' });
  }

  try {
    // Verify webhook signature
    const isValid = verifyWebhookSignature(req.body, signature, webhookSecret);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    const event = req.body.event;
    const charge = event.data;

    // Handle charge completion
    if (event.type === 'charge:confirmed' || event.type === 'charge:resolved') {
      const email = charge.metadata?.email;
      if (email) {
        await markPaidAccess(email, 'coinbase_commerce', {
          chargeId: charge.id,
          code: charge.code,
          amount: charge.pricing?.local?.amount,
          currency: charge.pricing?.local?.currency,
          timeline: charge.timeline
        });
        console.log(`Access granted to ${email} via Coinbase Commerce charge ${charge.id}`);
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Coinbase webhook error', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});
```

**Important:** Make sure the webhook route uses `express.json()` middleware (not `express.raw()` like Stripe).

## Step 6: Update Frontend Paywall

Update `src/ui/paywall.js` to add Coinbase Commerce handler:

### Add this function after `handleBitcoinSubmit`:

```javascript
async function handleCoinbaseCommerce(event) {
  event.preventDefault();
  const emailInput = document.getElementById('checkoutEmail');
  const status = document.getElementById('coinbaseStatus');
  const btn = event.currentTarget;
  const email = sanitizeEmail(emailInput?.value || getStoredEmail());
  
  if (!email) {
    if (status) {
      status.textContent = 'Enter a valid email.';
      status.className = 'coinbase-status error';
    }
    emailInput?.focus();
    return;
  }

  if (status) {
    status.textContent = 'Creating payment link…';
    status.className = 'coinbase-status progress';
  }
  btn.disabled = true;

  try {
    const result = await apiPost('/api/coinbase/create-charge', { email });
    setStoredEmail(email);
    
    // Redirect to Coinbase Commerce hosted checkout page
    if (result.hosted_url) {
      window.location.href = result.hosted_url;
    } else {
      throw new Error('Failed to create payment link');
    }
  } catch (error) {
    if (status) {
      status.textContent = error.message || 'Failed to create payment link.';
      status.className = 'coinbase-status error';
    }
    btn.disabled = false;
  }
}
```

### Update `initPaywallControls` function:

```javascript
export function initPaywallControls () {
  const cardBtn = document.getElementById('cardCheckoutBtn');
  const promoBtn = document.getElementById('promoSubmitBtn');
  const bitcoinBtn = document.getElementById('bitcoinVerifyBtn');
  const coinbaseBtn = document.getElementById('coinbaseCommerceBtn'); // Add this
  const copyBtn = document.getElementById('btcCopyBtn');
  const closeBtn = document.querySelector('.close-paywall');
  const overlayBackground = document.getElementById('paywallOverlay');
  
  if (cardBtn) {
    cardBtn.addEventListener('click', handleCheckout);
  }
  if (promoBtn) {
    promoBtn.addEventListener('click', handlePromoSubmit);
  }
  if (bitcoinBtn) {
    bitcoinBtn.addEventListener('click', handleBitcoinSubmit);
  }
  if (coinbaseBtn) { // Add this
    coinbaseBtn.addEventListener('click', handleCoinbaseCommerce);
  }
  // ... rest of existing code
}
```

## Step 7: Update HTML Paywall UI

Add Coinbase Commerce option to your paywall in `index.html`. Find the payment options section and add:

```html
<!-- Add this section after your Bitcoin payment option -->

<div class="payment-option">
    <h3>Pay with Cryptocurrency</h3>
    <p class="payment-description">Secure payment via Coinbase Commerce. Supports Bitcoin, Ethereum, Litecoin, and more.</p>
    
    <div class="coinbase-payment">
        <div id="coinbaseStatus" class="coinbase-status hidden"></div>
        <button class="coinbase-btn" id="coinbaseCommerceBtn" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 2v20M2 12h20"></path>
            </svg>
            Pay with Crypto (Coinbase Commerce)
        </button>
        <p class="coinbase-note">You'll be redirected to Coinbase Commerce to complete payment securely.</p>
    </div>
</div>
```

## Step 8: Handle Payment Success Redirect

Update `src/pages/pay-success.js` to handle Coinbase Commerce redirects:

```javascript
// Add this function to check Coinbase payments
async function checkCoinbasePayment() {
  const urlParams = new URLSearchParams(window.location.search);
  const chargeId = urlParams.get('charge_id');
  
  if (chargeId) {
    try {
      const result = await apiGet(`/api/coinbase/charge-status?chargeId=${chargeId}`);
      if (result.status === 'COMPLETED' || result.status === 'RESOLVED') {
        showToast('Payment successful! Access unlocked.', 'success');
        // Invalidate cache and refresh access
        const email = result.email || getStoredEmail();
        if (email) {
          invalidateAccessCache(email);
        }
        setTimeout(() => {
          window.location.href = 'index.html';
        }, 2000);
      } else {
        showToast('Payment is still processing...', 'info');
      }
    } catch (error) {
      console.error('Failed to check Coinbase payment', error);
    }
  }
}

// Call on page load
document.addEventListener('DOMContentLoaded', () => {
  checkCoinbasePayment();
  // ... existing code
});
```

## Step 9: Update Success URL in Charge Creation

Make sure Coinbase Commerce redirects back to your success page. Update the `createCharge` call in `server.js`:

```javascript
const charge = await createCharge({
  name: 'Vending Machine Finder Access',
  description: 'Full access to search locations',
  pricing_type: 'fixed_price',
  local_price: {
    amount,
    currency
  },
  metadata: {
    email: normalizedEmail
  },
  redirect_url: `${process.env.APP_URL}/pay-success.html`,
  cancel_url: `${process.env.APP_URL}/index.html`
});
```

## Step 10: Testing

### Local Testing

1. **Start your servers:**
   ```bash
   npm run dev
   ```

2. **Test the flow:**
   - Open your app in browser
   - Click "Unlock Access"
   - Click "Pay with Crypto (Coinbase Commerce)"
   - You'll be redirected to Coinbase Commerce checkout
   - Use test mode or real crypto to complete payment
   - You'll be redirected back to your success page

### Production Testing

1. **Set up webhook forwarding** (for local testing):
   - Use a service like [ngrok](https://ngrok.com) to expose your local server
   - Update webhook URL in Coinbase Commerce dashboard
   - Or use Coinbase Commerce's test mode first

2. **Verify webhook:**
   - Complete a test payment
   - Check your server logs for webhook events
   - Verify access is granted automatically

## Troubleshooting

### Issue: "API key not configured"
- **Solution:** Make sure `COINBASE_COMMERCE_API_KEY` is set in your `.env` file

### Issue: Webhook not firing
- **Solution:** 
  - Verify webhook URL is correct and accessible
  - Check webhook secret matches in `.env`
  - Ensure webhook events are selected in Coinbase dashboard
  - Check server logs for errors

### Issue: Payment not unlocking access
- **Solution:**
  - Check webhook is receiving events
  - Verify email is included in charge metadata
  - Check server logs for errors in `markPaidAccess`
  - Manually check charge status via `/api/coinbase/charge-status`

### Issue: "Invalid webhook signature"
- **Solution:**
  - Verify `COINBASE_COMMERCE_WEBHOOK_SECRET` matches the secret from Coinbase dashboard
  - Ensure webhook route uses `express.json()` middleware
  - Check that signature header is `x-cc-webhook-signature`

## Security Best Practices

1. **Never commit API keys** - Keep `.env` file in `.gitignore`
2. **Use HTTPS** - Required for webhooks in production
3. **Verify webhook signatures** - Always validate webhook requests
4. **Store secrets securely** - Use environment variables, not hardcoded values
5. **Monitor webhook logs** - Check for suspicious activity

## API Routes Summary

After integration, you'll have these new routes:

- `POST /api/coinbase/create-charge` - Create a new payment charge
- `GET /api/coinbase/charge-status?chargeId=...` - Check charge status
- `POST /api/webhooks/coinbase` - Webhook handler for payment events

## Benefits Over Manual Bitcoin Verification

| Feature | Manual Bitcoin | Coinbase Commerce |
|---------|---------------|-------------------|
| Security | ⚠️ Transaction ID reuse possible | ✅ Unique addresses per payment |
| Automation | ❌ Manual verification | ✅ Automatic via webhooks |
| Cryptocurrencies | ✅ Bitcoin only | ✅ Multiple (BTC, ETH, LTC, etc.) |
| User Experience | ⚠️ Requires TXID entry | ✅ Professional checkout page |
| Setup Complexity | ✅ Simple | ⚠️ Moderate |
| Fees | ✅ Network fees only | ⚠️ ~1% + network fees |

## Next Steps

1. Complete all steps above
2. Test locally with Coinbase Commerce test mode
3. Deploy to production
4. Set up production webhook
5. Monitor first few payments
6. Consider migrating existing Bitcoin users to Coinbase Commerce

## Additional Resources

- [Coinbase Commerce Documentation](https://docs.commerce.coinbase.com/)
- [Coinbase Commerce API Reference](https://docs.commerce.coinbase.com/api-reference)
- [Coinbase Commerce Support](https://support.coinbase.com/)

## Support

If you encounter issues:
1. Check Coinbase Commerce dashboard for charge status
2. Review server logs for errors
3. Verify all environment variables are set correctly
4. Test webhook endpoint manually
5. Check Coinbase Commerce status page for service issues

---

**Note:** This integration adds Coinbase Commerce alongside your existing payment methods. Users can choose between Stripe (cards), manual Bitcoin verification, or Coinbase Commerce (automated crypto).



















