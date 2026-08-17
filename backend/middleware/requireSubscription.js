const Subscription = require("../models/Subscription");

function normalizeUserId(req) {
  return String(req.body?.userId || req.query?.userId || req.get("x-user-id") || "").trim();
}

function requireActiveSubscription(options = {}) {
  const allowedPlans = options.allowedPlans || ["plus", "pro"];

  return async function subscriptionGuard(req, res, next) {
    try {
      const userId = normalizeUserId(req);
      if (!userId) {
        return res.status(401).json({ error: "userId is required for premium access" });
      }

      const subscription = await Subscription.findOne({ userId });
      const active = subscription && subscription.status === "active"
        && subscription.subscriptionExpiry
        && subscription.subscriptionExpiry.getTime() > Date.now()
        && allowedPlans.includes(subscription.currentPlan);

      if (!active) {
        return res.status(402).json({
          error: "Premium subscription required",
          upgradeUrl: "/subscriptions.html"
        });
      }

      req.subscription = subscription;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = { requireActiveSubscription };
