const crypto = require("crypto");
const mongoose = require("mongoose");
const Subscription = require("../models/Subscription");
const PremiumCreditAction = require("../models/PremiumCreditAction");
const { CREDIT_COSTS } = require("../../shared/tutorly-plans");

const LEASE_MS = 15 * 60 * 1000;
class CreditError extends Error {
  constructor(code, status = 409, remaining) {
    super(code);
    this.code = code;
    this.status = status;
    this.remaining = remaining;
  }
}

function validateRequest(operation, input) {
  if (!["reserve", "complete", "release", "status"].includes(operation)) throw new CreditError("invalid_request", 400);
  if (!/^[1-9][0-9]{0,18}$/.test(String(input.user_id || "")) ||
      !/^[a-zA-Z0-9:_-]{16,128}$/.test(input.idempotency_key || "") ||
      !/^[a-f0-9]{64}$/.test(input.request_hash || "")) throw new CreditError("invalid_request", 400);
  if (operation === "reserve" && input.action !== "educationalImage") throw new CreditError("invalid_action", 400);
  if (["complete", "release"].includes(operation) && !/^[a-f0-9]{64}$/.test(input.reservation_token || "")) {
    throw new CreditError("invalid_reservation", 400);
  }
  if (operation === "complete" && !/^\/uploads\/generated\/study-[a-f0-9]{32}\.png$/.test(input.result_url || "")) {
    throw new CreditError("invalid_image", 400);
  }
}

const cycleKey = (subscription) => subscription.creditsResetAt?.toISOString?.() || "";
const remaining = (subscription) => Math.max(0, Number(subscription.premiumCreditsRemaining) || 0);
const publicResult = (entry, subscription) => ({
  status: entry.status,
  remaining: remaining(subscription),
  result_url: entry.resultUrl || "",
  reservation_token: entry.reservationToken
});

function ensureUsableAccount(subscription, now) {
  if (!subscription) throw new CreditError("credit_account_unlinked", 503);
  if (!Number.isSafeInteger(subscription.premiumCreditsRemaining) || subscription.premiumCreditsRemaining < 0) {
    throw new CreditError("credit_account_unavailable", 503);
  }
  // Reset/renewal remains the existing billing system's responsibility.
  if (subscription.creditsResetAt && subscription.creditsResetAt.getTime() <= now.getTime()) {
    throw new CreditError("credit_period_expired", 503);
  }
  if (subscription.currentPlan !== "standard" &&
      (!subscription.subscriptionExpiry || subscription.subscriptionExpiry.getTime() <= now.getTime())) {
    throw new CreditError("credit_period_expired", 503);
  }
}

async function mutate(operation, input, session, models = { Subscription, PremiumCreditAction }, now = new Date()) {
  const Account = models.Subscription;
  const Action = models.PremiumCreditAction;
  const authUserId = String(input.user_id);
  const subscription = await Account.findOne({ authUserId }).session(session);
  if (!subscription) throw new CreditError("credit_account_unlinked", 503);
  const query = { authUserId, idempotencyKey: input.idempotency_key };
  let entry = await Action.findOne(query).session(session);
  if (entry && entry.requestHash !== input.request_hash) throw new CreditError("idempotency_conflict", 409);
  if (entry && String(entry.subscriptionId) !== String(subscription._id)) throw new CreditError("credit_account_changed", 409);

  if (operation === "status") {
    if (!entry) throw new CreditError("credit_reservation_missing", 404);
    return publicResult(entry, subscription);
  }
  if (operation === "complete" || operation === "release") {
    if (!entry || entry.reservationToken !== input.reservation_token) throw new CreditError("stale_reservation", 409);
    if (entry.status === "completed") return publicResult(entry, subscription);
    if (operation === "release") {
      if (entry.status === "reserved") {
        if (cycleKey(subscription) === entry.resetAt) subscription.premiumCreditsRemaining += entry.credits;
        entry.status = "released";
        await subscription.save({ session });
        await entry.save({ session });
      }
      return publicResult(entry, subscription);
    }
    if (entry.status !== "reserved" || entry.expiresAt <= now) throw new CreditError("stale_reservation", 409);
    entry.status = "completed";
    entry.resultUrl = input.result_url;
    await entry.save({ session });
    return publicResult(entry, subscription);
  }

  if (entry?.status === "completed") return publicResult(entry, subscription);
  ensureUsableAccount(subscription, now);
  if (entry?.status === "reserved" && entry.expiresAt > now) throw new CreditError("generation_in_progress", 409);
  // Recover abandoned holds atomically with the next reservation. Never add old-cycle credits to a new allowance.
  const abandoned = await Action.find({ authUserId, status: "reserved", expiresAt: { $lte: now } }).session(session);
  for (const stale of abandoned) {
    if (cycleKey(subscription) === stale.resetAt) subscription.premiumCreditsRemaining += stale.credits;
    stale.status = "released";
    await stale.save({ session });
  }
  const cost = CREDIT_COSTS.educationalImage.credits;
  if (remaining(subscription) < cost) throw new CreditError("insufficient_credits", 402, remaining(subscription));
  subscription.premiumCreditsRemaining -= cost;
  const fields = {
    ...query,
    subscriptionId: subscription._id,
    requestHash: input.request_hash,
    action: "educationalImage",
    credits: cost,
    status: "reserved",
    reservationToken: crypto.randomBytes(32).toString("hex"),
    expiresAt: new Date(now.getTime() + LEASE_MS),
    resetAt: cycleKey(subscription),
    resultUrl: ""
  };
  if (entry) Object.assign(entry, fields);
  else entry = new Action(fields);
  await subscription.save({ session });
  await entry.save({ session });
  return publicResult(entry, subscription);
}

async function execute(operation, input) {
  validateRequest(operation, input);
  const session = await mongoose.startSession();
  try {
    let result;
    // Transactions are required. Do not fall back to separate debit/ledger writes on standalone MongoDB.
    await session.withTransaction(async () => { result = await mutate(operation, input, session); });
    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = { execute, validateRequest, mutate, CreditError };
