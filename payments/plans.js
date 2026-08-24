const sharedConfig = require("../shared/tutorly-plans");

const PLAN_CATALOG = Object.freeze({
  ...Object.fromEntries(sharedConfig.listPlans().map((plan) => [plan.id, {
    ...plan,
    type: "subscription",
    features: [...plan.features]
  }])),
  "session-1": {
    id: "session-1",
    name: "1 Tutoring Session",
    type: "session",
    amountPaise: 29900,
    currency: "INR",
    interval: "one_time",
    premium: false,
    features: [
      "One pay-per-session credit",
      "Use when you need focused help",
      "Does not change your subscription"
    ]
  }
});

function getPlan(planId) {
  const rawId = String(planId || "").toLowerCase();
  const normalizedId = rawId === "session-1" ? rawId : sharedConfig.normalizePlanId(rawId);
  return PLAN_CATALOG[normalizedId] || null;
}

function getPublicPlan(plan) {
  if (!plan) return null;
  return {
    id: plan.id,
    name: plan.name,
    type: plan.type,
    amountPaise: plan.amountPaise,
    amount: plan.amountPaise / 100,
    currency: plan.currency,
    interval: plan.interval,
    premium: plan.premium,
    monthlyPremiumCredits: plan.monthlyPremiumCredits || 0,
    trialDays: plan.trialDays || 0,
    trialCredits: plan.trialCredits || 0,
    recommended: !!plan.recommended,
    productLine: plan.productLine || null,
    campus: !!plan.campus,
    features: plan.features
  };
}

function listPublicPlans() {
  return Object.values(PLAN_CATALOG).map(getPublicPlan);
}

function createSubscriptionExpiry(plan, startDate = new Date()) {
  if (!plan || plan.type !== "subscription" || plan.amountPaise === 0) return null;
  const expiry = new Date(startDate);
  if (plan.interval === "month") {
    expiry.setMonth(expiry.getMonth() + 1);
  }
  return expiry;
}

module.exports = {
  PLAN_CATALOG,
  getPlan,
  getPublicPlan,
  listPublicPlans,
  createSubscriptionExpiry,
  CREDIT_COSTS: sharedConfig.CREDIT_COSTS
};
