# Tutorly Razorpay Payments Setup

This project now includes a Node.js + Express payment service for Razorpay orders, secure payment verification, webhooks, MongoDB payment history, subscription management, and premium feature locking.

## Files Added

- `backend/server.js` - Express payment server.
- `backend/routes/payments.js` - Payment, subscription, and premium routes.
- `backend/controllers/paymentController.js` - Razorpay order creation, verification, webhook handling, history, cancel logic.
- `backend/models/*` - MongoDB models for payments, subscriptions, and webhook events.
- `backend/middleware/requireSubscription.js` - Premium API middleware.
- `payments/plans.js` - Shared plan catalog.
- `frontend/subscription/*` - Subscription UI scripts, history UI, and premium guard.
- `frontend/payment-success/*` - Payment success/failure screen logic.
- `subscriptions.html`, `payment-success.html`, `payment-history.html` - Payment pages.

## Install

```bash
npm install
```

## Environment

Create `.env` from `.env.example`:

```bash
copy .env.example .env
```

Set these values:

```env
PORT=3001
APP_ORIGIN=http://127.0.0.1:3001
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_SECRET=your_test_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
MONGODB_URI=mongodb://127.0.0.1:27017/tutorly
```

Never put real Razorpay secrets in frontend JavaScript.

## Start MongoDB

Use a local MongoDB server or a hosted MongoDB Atlas URI.

## Start Payments Server

```bash
npm run payments:start
```

Then open:

```text
http://127.0.0.1:3001/subscriptions.html
```

If you open the HTML file directly with `file://`, the frontend will call:

```text
http://127.0.0.1:3001
```

## Razorpay Setup

1. Create or open a Razorpay account.
2. Switch to Test Mode.
3. Copy your Test Mode Key ID and Secret into `.env`.
4. In Razorpay Chat, create a webhook pointing to:

```text
https://your-domain.com/webhook
```

For local testing, expose port `3001` with a tunnel such as ngrok and use:

```text
https://your-ngrok-url/webhook
```

5. Add the same webhook secret in Razorpay and `.env`.
6. Subscribe to useful events like `payment.captured` and `order.paid`.

## Payment Flow

1. User clicks a paid plan in `subscriptions.html`.
2. Frontend calls `POST /create-order`.
3. Backend creates a Razorpay order and stores a pending payment in MongoDB.
4. Razorpay Checkout opens in the browser.
5. On success, frontend sends Razorpay response to `POST /verify-payment`.
6. Backend verifies the HMAC SHA256 signature using `RAZORPAY_SECRET`.
7. Backend fetches the payment from Razorpay and activates the subscription only if the payment is captured.
8. Webhooks also update payment/subscription status safely and idempotently.

## API Routes

```text
POST /create-order
POST /verify-payment
POST /payment-failed
POST /webhook
GET  /subscription/:userId
GET  /history/:userId
POST /cancel-subscription
POST /premium/check
```

The same payment routes are also mounted at:

```text
/api/payments/*
```

## Test Payments

Use Razorpay Test Mode. In Checkout, use Razorpay test payment instruments from the Razorpay workspace/docs. A common test card is:

```text
Card: 4111 1111 1111 1111
Expiry: Any future date
CVV: Any 3 digits
OTP: Any valid-looking OTP when prompted
```

## Premium Locking

`maths_gpt.html` loads:

```html
<script src="frontend/subscription/premium-guard.js"></script>
```

Free users are blocked from premium AI tools such as:

- Image uploads
- Camera doubts
- Voice input

The guard shows a polished upgrade popup and points users to `subscriptions.html`.

## Security Notes

- Razorpay secret keys are used only on the backend.
- Frontend never verifies payments.
- `POST /verify-payment` uses HMAC SHA256 over `order_id|payment_id`.
- `POST /webhook` verifies the raw request body with `RAZORPAY_WEBHOOK_SECRET`.
- Webhook events are stored with unique IDs to prevent duplicate processing.
- The backend checks that a Razorpay payment belongs to the stored order before activating a subscription.
