const Payment = require("../models/Payment");
const Subscription = require("../models/Subscription");
const WebhookEvent = require("../models/WebhookEvent");
const {
  getRazorpayInstance,
  getRazorpayKeyId,
  getRazorpaySecret,
  getRazorpayWebhookSecret
} = require("../config/razorpay");
const {
  getPlan,
  getPublicPlan,
  listPublicPlans,
  createSubscriptionExpiry,
  CREDIT_COSTS
} = require("../../payments/plans");
const sharedPlanConfig = require("../../shared/tutorly-plans");
const {
  verifyRazorpayPaymentSignature,
  verifyRazorpayWebhookSignature
} = require("../utils/security");

function normalizeUserId(userId) {
  return String(userId || "").trim();
}

function publicSubscription(subscription) {
  if (!subscription) {
    const standardPlan = getPlan("standard");
    return {
      currentPlan: "standard",
      status: "free",
      paymentStatus: "free",
      sessionCredits: 0,
      creditAllowance: standardPlan.monthlyPremiumCredits,
      premiumCreditsRemaining: standardPlan.monthlyPremiumCredits,
      creditsResetAt: sharedPlanConfig.nextMonthlyReset(),
      trialActive: false,
      trialEligible: true,
      subscriptionStart: null,
      subscriptionExpiry: null
    };
  }

  const currentPlan = sharedPlanConfig.normalizePlanId(subscription.currentPlan);
  const plan = getPlan(currentPlan);
  const now = Date.now();
  const expiryTime = subscription.subscriptionExpiry?.getTime?.() || 0;
  const expired = currentPlan !== "standard" && expiryTime > 0 && expiryTime <= now;
  const trialActive = subscription.paymentStatus === "trial" && !expired;
  const allowance = Number(subscription.creditAllowance) >= 0
    ? Number(subscription.creditAllowance)
    : plan.monthlyPremiumCredits;
  const creditsRemaining = Number(subscription.premiumCreditsRemaining) >= 0
    ? Math.min(Number(subscription.premiumCreditsRemaining), allowance)
    : allowance;

  return {
    userId: subscription.userId,
    currentPlan,
    status: expired ? "expired" : subscription.status,
    paymentStatus: subscription.paymentStatus,
    paymentId: subscription.paymentId || null,
    orderId: subscription.orderId || null,
    sessionCredits: subscription.sessionCredits || 0,
    creditAllowance: allowance,
    premiumCreditsRemaining: creditsRemaining,
    creditsResetAt: subscription.creditsResetAt || subscription.subscriptionExpiry || null,
    trialActive,
    trialEligible: !subscription.trialUsedAt,
    trialPlan: subscription.trialPlan || null,
    trialStartedAt: subscription.trialStartedAt || null,
    trialEndsAt: subscription.trialEndsAt || null,
    subscriptionStart: subscription.subscriptionStart || null,
    subscriptionExpiry: subscription.subscriptionExpiry || null,
    premiumActive: subscription.isPremiumActive(),
    updatedAt: subscription.updatedAt
  };
}

function getReceipt(userId, planId) {
  const safeUser = userId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 10) || "user";
  return `mt_${safeUser}_${planId}_${Date.now()}`.slice(0, 40);
}

async function applySuccessfulPayment(payment, plan) {
  if (!plan) {
    const error = new Error("Payment plan is no longer available");
    error.statusCode = 400;
    throw error;
  }

  const now = new Date();

  if (plan.type === "session") {
    const subscription = await Subscription.findOneAndUpdate(
      { userId: payment.userId },
      {
        $setOnInsert: {
          currentPlan: "standard",
          status: "free",
          paymentStatus: "free",
          creditAllowance: getPlan("standard").monthlyPremiumCredits,
          premiumCreditsRemaining: getPlan("standard").monthlyPremiumCredits,
          creditsResetAt: sharedPlanConfig.nextMonthlyReset(now)
        },
        $inc: { sessionCredits: 1 },
        $set: {
          lastPaymentAt: now
        }
      },
      { new: true, upsert: true }
    );
    return subscription;
  }

  const subscriptionStart = now;
  const subscriptionExpiry = createSubscriptionExpiry(plan, now);

  payment.subscriptionStart = subscriptionStart;
  payment.subscriptionExpiry = subscriptionExpiry;

  return Subscription.findOneAndUpdate(
    { userId: payment.userId },
    {
      currentPlan: plan.id,
      paymentId: payment.paymentId,
      orderId: payment.orderId,
      subscriptionStart,
      subscriptionExpiry,
      creditAllowance: plan.monthlyPremiumCredits,
      premiumCreditsRemaining: plan.monthlyPremiumCredits,
      creditsResetAt: subscriptionExpiry,
      paymentStatus: "captured",
      status: "active",
      trialPlan: null,
      trialStartedAt: null,
      trialEndsAt: null,
      cancelledAt: null,
      lastPaymentAt: now
    },
    { new: true, upsert: true }
  );
}

async function startTrial(req, res, next) {
  try {
    const userId = normalizeUserId(req.body.userId);
    const plan = getPlan(req.body.planId);
    if (!userId) return res.status(400).json({ error: "userId is required" });
    if (!plan || !plan.premium || !plan.trialDays) {
      return res.status(400).json({ error: "This plan does not include a trial" });
    }

    const existing = await Subscription.findOne({ userId });
    if (existing?.trialUsedAt) {
      return res.status(409).json({ error: "This account has already used its Tutorly trial" });
    }
    if (existing?.isPremiumActive?.()) {
      return res.status(409).json({ error: "This account already has an active premium plan" });
    }

    const now = new Date();
    const trialEndsAt = new Date(now);
    trialEndsAt.setDate(trialEndsAt.getDate() + plan.trialDays);
    const subscription = await Subscription.findOneAndUpdate(
      { userId, $or: [{ trialUsedAt: { $exists: false } }, { trialUsedAt: null }] },
      {
        $set: {
          currentPlan: plan.id,
          status: "active",
          paymentStatus: "trial",
          subscriptionStart: now,
          subscriptionExpiry: trialEndsAt,
          creditAllowance: plan.trialCredits,
          premiumCreditsRemaining: plan.trialCredits,
          creditsResetAt: trialEndsAt,
          trialPlan: plan.id,
          trialStartedAt: now,
          trialEndsAt,
          trialUsedAt: now,
          cancelledAt: null
        }
      },
      { new: true, upsert: true, runValidators: true }
    );
    if (!subscription) {
      return res.status(409).json({ error: "This account is not eligible for another trial" });
    }
    return res.status(201).json({ ok: true, subscription: publicSubscription(subscription) });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: "This account is not eligible for another trial" });
    }
    return next(error);
  }
}

async function createOrder(req, res, next) {
  try {
    const userId = normalizeUserId(req.body.userId);
    const plan = getPlan(req.body.planId);

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }
    if (!plan) {
      return res.status(400).json({ error: "Unknown plan selected" });
    }
    if (plan.amountPaise <= 0) {
      return res.status(400).json({ error: "Standard plan does not need a Razorpay order" });
    }

    const razorpay = getRazorpayInstance();
    const receipt = getReceipt(userId, plan.id);
    const user = req.body.user || {};
    const order = await razorpay.orders.create({
      amount: plan.amountPaise,
      currency: plan.currency,
      receipt,
      notes: {
        userId,
        planId: plan.id,
        planName: plan.name,
        productType: plan.type
      }
    });

    await Payment.create({
      userId,
      planId: plan.id,
      planName: plan.name,
      productType: plan.type,
      amount: plan.amountPaise,
      currency: plan.currency,
      orderId: order.id,
      receipt,
      paymentStatus: "created",
      razorpayStatus: order.status,
      userSnapshot: {
        name: String(user.name || "").trim(),
        email: String(user.email || "").trim(),
        phone: String(user.phone || "").trim()
      },
      notes: order.notes || {}
    });

    return res.status(201).json({
      keyId: getRazorpayKeyId(),
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt
      },
      plan: getPublicPlan(plan)
    });
  } catch (error) {
    return next(error);
  }
}

async function verifyPayment(req, res, next) {
  try {
    const userId = normalizeUserId(req.body.userId);
    const orderId = String(req.body.razorpay_order_id || "");
    const paymentId = String(req.body.razorpay_payment_id || "");
    const signature = String(req.body.razorpay_signature || "");

    if (!userId || !orderId || !paymentId || !signature) {
      return res.status(400).json({ error: "Missing payment verification fields" });
    }

    const payment = await Payment.findOne({ orderId });
    if (!payment) {
      return res.status(404).json({ error: "Order was not created by Tutorly" });
    }
    if (payment.userId !== userId) {
      return res.status(403).json({ error: "This payment does not belong to the current user" });
    }

    const signatureOk = verifyRazorpayPaymentSignature({
      orderId,
      paymentId,
      signature,
      secret: getRazorpaySecret()
    });

    if (!signatureOk) {
      payment.paymentId = paymentId;
      payment.paymentStatus = "signature_failed";
      payment.failureReason = "Razorpay signature verification failed";
      await payment.save();
      return res.status(400).json({ error: "Payment verification failed" });
    }

    const razorpayPayment = await getRazorpayInstance().payments.fetch(paymentId);
    if (razorpayPayment.order_id !== orderId) {
      payment.paymentStatus = "failed";
      payment.failureReason = "Razorpay payment does not match the order";
      await payment.save();
      return res.status(400).json({ error: "Payment/order mismatch" });
    }
    if (razorpayPayment.status !== "captured") {
      payment.paymentId = paymentId;
      payment.paymentStatus = razorpayPayment.status === "authorized" ? "authorized" : "failed";
      payment.razorpayStatus = razorpayPayment.status;
      payment.failureReason = "Payment is not captured yet";
      await payment.save();
      return res.status(409).json({ error: "Payment is not captured yet. Please retry after capture." });
    }

    const plan = getPlan(payment.planId);
    payment.paymentId = paymentId;
    payment.paymentStatus = "captured";
    payment.razorpayStatus = razorpayPayment.status;
    payment.verifiedAt = new Date();
    const subscription = await applySuccessfulPayment(payment, plan);
    await payment.save();

    return res.json({
      ok: true,
      payment: {
        paymentId: payment.paymentId,
        orderId: payment.orderId,
        paymentStatus: payment.paymentStatus,
        planId: payment.planId,
        amount: payment.amount,
        currency: payment.currency
      },
      subscription: publicSubscription(subscription)
    });
  } catch (error) {
    return next(error);
  }
}

async function handleWebhook(req, res, next) {
  try {
    const webhookSecret = getRazorpayWebhookSecret();
    const signature = req.get("x-razorpay-signature");

    if (!webhookSecret) {
      return res.status(503).json({ error: "Webhook secret is not configured" });
    }
    if (!signature || !Buffer.isBuffer(req.body)) {
      return res.status(400).json({ error: "Invalid webhook request" });
    }

    const valid = verifyRazorpayWebhookSignature(req.body, signature, webhookSecret);
    if (!valid) {
      return res.status(400).json({ error: "Invalid webhook signature" });
    }

    const payload = JSON.parse(req.body.toString("utf8"));
    const eventId = payload.event_id || payload.id || `${payload.event}_${Date.now()}`;
    const eventType = payload.event || "unknown";
    const paymentEntity = payload.payload?.payment?.entity;
    const orderEntity = payload.payload?.order?.entity;
    const orderId = paymentEntity?.order_id || orderEntity?.id || null;
    const paymentId = paymentEntity?.id || null;

    const existingEvent = await WebhookEvent.findOne({ eventId });
    if (existingEvent) {
      return res.json({ ok: true, duplicate: true });
    }

    const eventRecord = await WebhookEvent.create({
      eventId,
      eventType,
      orderId,
      paymentId,
      rawPayload: payload
    });

    if (["payment.captured", "order.paid"].includes(eventType) && orderId) {
      const payment = await Payment.findOne({ orderId });
      if (payment) {
        const plan = getPlan(payment.planId);
        payment.paymentId = payment.paymentId || paymentId;
        payment.paymentStatus = "captured";
        payment.razorpayStatus = paymentEntity?.status || orderEntity?.status || "captured";
        payment.verifiedAt = payment.verifiedAt || new Date();
        payment.webhookEvents.push(eventId);
        await applySuccessfulPayment(payment, plan);
        await payment.save();
      }
    }

    eventRecord.processed = true;
    await eventRecord.save();
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
}

async function getSubscription(req, res, next) {
  try {
    const userId = normalizeUserId(req.params.userId || req.query.userId);
    if (!userId) return res.status(400).json({ error: "userId is required" });
    const subscription = await Subscription.findOne({ userId });
    return res.json({
      subscription: publicSubscription(subscription),
      plans: listPublicPlans(),
      creditCosts: CREDIT_COSTS
    });
  } catch (error) {
    return next(error);
  }
}

async function markPaymentFailed(req, res, next) {
  try {
    const orderId = String(req.body.orderId || req.body.razorpay_order_id || "");
    if (!orderId) return res.status(400).json({ error: "orderId is required" });

    const payment = await Payment.findOneAndUpdate(
      { orderId },
      {
        paymentStatus: "failed",
        failureReason: String(req.body.reason || "Payment failed or was cancelled")
      },
      { new: true }
    );

    return res.json({ ok: true, paymentFound: !!payment });
  } catch (error) {
    return next(error);
  }
}

async function getPaymentHistory(req, res, next) {
  try {
    const userId = normalizeUserId(req.params.userId || req.query.userId);
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const payments = await Payment.find({ userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return res.json({
      payments: payments.map((payment) => ({
        planId: payment.planId,
        planName: payment.planName,
        productType: payment.productType,
        amount: payment.amount,
        currency: payment.currency,
        orderId: payment.orderId,
        paymentId: payment.paymentId || null,
        paymentStatus: payment.paymentStatus,
        subscriptionStart: payment.subscriptionStart || null,
        subscriptionExpiry: payment.subscriptionExpiry || null,
        createdAt: payment.createdAt
      }))
    });
  } catch (error) {
    return next(error);
  }
}

async function cancelSubscription(req, res, next) {
  try {
    const userId = normalizeUserId(req.body.userId);
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const subscription = await Subscription.findOneAndUpdate(
      { userId },
      {
        currentPlan: "standard",
        paymentStatus: "free",
        status: "free",
        subscriptionExpiry: new Date(),
        creditAllowance: getPlan("standard").monthlyPremiumCredits,
        premiumCreditsRemaining: getPlan("standard").monthlyPremiumCredits,
        creditsResetAt: sharedPlanConfig.nextMonthlyReset(),
        trialPlan: null,
        trialStartedAt: null,
        trialEndsAt: null,
        cancelledAt: new Date()
      },
      { new: true, upsert: true }
    );

    return res.json({ ok: true, subscription: publicSubscription(subscription) });
  } catch (error) {
    return next(error);
  }
}

async function checkPremium(req, res, next) {
  try {
    const userId = normalizeUserId(req.body.userId || req.query.userId);
    if (!userId) return res.status(400).json({ error: "userId is required" });
    const subscription = await Subscription.findOne({ userId });
    return res.json({
      allowed: !!subscription?.isPremiumActive(),
      subscription: publicSubscription(subscription)
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createOrder,
  verifyPayment,
  handleWebhook,
  getSubscription,
  getPaymentHistory,
  markPaymentFailed,
  cancelSubscription,
  checkPremium,
  startTrial,
  publicSubscription
};
