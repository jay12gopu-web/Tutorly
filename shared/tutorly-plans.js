(function (root, factory) {
  const config = factory();
  if (typeof module === "object" && module.exports) module.exports = config;
  if (root) root.TutorlyPlanConfig = config;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const PREMIUM_GOLD = "#D4A017";
  const LEGACY_PLAN_ALIASES = Object.freeze({
    casual: "standard",
    free: "standard",
    prime: "plus",
    premium: "plus"
  });

  const PLANS = Object.freeze({
    standard: Object.freeze({
      id: "standard",
      name: "Standard",
      amountPaise: 0,
      currency: "INR",
      interval: "free",
      premium: false,
      monthlyPremiumCredits: 100,
      trialDays: 0,
      trialCredits: 0,
      features: Object.freeze([
        "AI tutoring chat",
        "Learn, Practice, Tests, and Progress",
        "Math, Markdown, diagrams, charts, and code",
        "100 premium credits each month"
      ])
    }),
    plus: Object.freeze({
      id: "plus",
      name: "Plus",
      amountPaise: 29900,
      currency: "INR",
      interval: "month",
      premium: true,
      recommended: true,
      monthlyPremiumCredits: 500,
      trialDays: 7,
      trialCredits: 150,
      features: Object.freeze([
        "Everything in Standard",
        "500 premium credits each month",
        "Higher premium-tool usage",
        "Priority Tutorly access"
      ])
    }),
    pro: Object.freeze({
      id: "pro",
      name: "Pro",
      amountPaise: 59900,
      currency: "INR",
      interval: "month",
      premium: true,
      monthlyPremiumCredits: 1500,
      trialDays: 7,
      trialCredits: 400,
      features: Object.freeze([
        "Everything in Plus",
        "1,500 premium credits each month",
        "Highest premium-tool usage",
        "Highest priority Tutorly access"
      ])
    })
  });

  const CREDIT_COSTS = Object.freeze({
    homeworkPhoto: Object.freeze({ label: "Homework photo analysis", credits: 2, available: true }),
    additionalQuestionImage: Object.freeze({ label: "Additional image in the same question", credits: 1, available: true }),
    illustratedDiagram: Object.freeze({ label: "AI-generated illustrated diagram", credits: 8, available: false }),
    educationalImage: Object.freeze({ label: "AI-generated educational image", credits: 8, available: false }),
    deepSolve: Object.freeze({ label: "Deep Solve", credits: 5, available: true }),
    premiumModel: Object.freeze({ label: "Premium-model response", credits: 3, available: true }),
    practiceSet: Object.freeze({ label: "AI-generated practice set", credits: 2, available: false }),
    generatedTest: Object.freeze({ label: "AI-generated test", credits: 3, available: false }),
    shortDocument: Object.freeze({ label: "Short document/PDF analysis", credits: 3, available: false }),
    largeDocument: Object.freeze({ label: "Large document/PDF analysis", minCredits: 5, maxCredits: 10, available: false }),
    fullVoiceChat: Object.freeze({ label: "Full Voice Chat", credits: 1, perMinutes: 2, available: true })
  });

  function normalizePlanId(value) {
    const raw = String(value || "").trim().toLowerCase();
    const normalized = LEGACY_PLAN_ALIASES[raw] || raw;
    return Object.prototype.hasOwnProperty.call(PLANS, normalized) ? normalized : "standard";
  }

  function getPlan(value) {
    return PLANS[normalizePlanId(value)];
  }

  function listPlans() {
    return Object.values(PLANS);
  }

  function formatCredits(value) {
    return Math.max(0, Number(value) || 0).toLocaleString("en-IN");
  }

  function nextMonthlyReset(from = new Date()) {
    const reset = new Date(from);
    reset.setMonth(reset.getMonth() + 1);
    return reset;
  }

  return Object.freeze({
    PREMIUM_GOLD,
    LEGACY_PLAN_ALIASES,
    PLANS,
    CREDIT_COSTS,
    normalizePlanId,
    getPlan,
    listPlans,
    formatCredits,
    nextMonthlyReset
  });
});
