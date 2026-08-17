const PLAN_CATALOG = Object.freeze({
  casual: {
    id: "casual",
    name: "Casual",
    type: "subscription",
    amountPaise: 0,
    currency: "INR",
    interval: "free",
    premium: false,
    features: [
      "Basic workspace access",
      "Limited AI help",
      "Free learning tools"
    ]
  },
  plus: {
    id: "plus",
    name: "Tutorly",
    type: "subscription",
    amountPaise: 49900,
    currency: "INR",
    interval: "month",
    premium: true,
    productLine: "core",
    features: [
      "AI Tutor, lessons, notes, flashcards, and practice quizzes",
      "Chapter tests, mock exams, rapid fire, and report cards",
      "Memory tests, concentration tests, and general learning",
      "School content, intermediate content, college subjects, engineering, medical, commerce, and computer science"
    ]
  },
  pro: {
    id: "pro",
    name: "Tutorly Campus",
    type: "subscription",
    amountPaise: 99900,
    currency: "INR",
    interval: "month",
    premium: true,
    productLine: "campus",
    campus: true,
    features: [
      "Everything in Tutorly",
      "College workspace with semester workspace, credits, attendance, assignments, exams, projects, and labs",
      "Assignment, project, practical, lab, research, coding, and placement preparation assistants",
      "CGPA tracker, campus calendar, productivity tools, internship hub, career guidance, and advanced analytics"
    ]
  },
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
  return PLAN_CATALOG[String(planId || "").toLowerCase()] || null;
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
  createSubscriptionExpiry
};
