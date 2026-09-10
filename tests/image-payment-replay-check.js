// No payment provider or MongoDB is contacted. Exercise the linked-account replay guard.
const assert = require("node:assert/strict");
const Subscription = require("../backend/models/Subscription");
const controller = require("../backend/controllers/paymentController");
const { getPlan } = require("../payments/plans");

async function main() {
  const originalFind = Subscription.findOne;
  const originalUpdate = Subscription.findOneAndUpdate;
  let state;
  let updates = 0;
  const reset = () => {
    state = { _id: "existing-subscription", authUserId: "12", userId: "legacy-billing-id", currentPlan: "plus", premiumCreditsRemaining: 428, sessionCredits: 0 };
    updates = 0;
  };
  Subscription.findOne = async () => structuredClone(state);
  Subscription.findOneAndUpdate = async (filter, change, options) => {
    assert.equal(filter._id, state._id);
    assert.equal(filter.authUserId, state.authUserId);
    assert.equal(options.upsert, undefined, "A replay guard must never create another account");
    const order = filter.appliedCreditOrderIds.$ne;
    if ((state.appliedCreditOrderIds || []).includes(order)) return null;
    // This represents the atomic conditional update used by MongoDB.
    updates += 1;
    Object.assign(state, change.$set || {});
    for (const [key, value] of Object.entries(change.$inc || {})) state[key] = (state[key] || 0) + value;
    state.appliedCreditOrderIds ||= [];
    state.appliedCreditOrderIds.push(change.$addToSet.appliedCreditOrderIds);
    return structuredClone(state);
  };
  const payment = (orderId = "order-current") => ({ userId: "legacy-billing-id", orderId, paymentId: "payment-verified" });
  try {
    reset();
    state.orderId = "order-current";
    await controller.applySuccessfulPayment(payment(), getPlan("plus"));
    assert.equal(state.premiumCreditsRemaining, 428);
    assert.equal(updates, 0);
    console.log("PASS current paid order replay does not refill consumed credits");

    reset();
    await controller.applySuccessfulPayment({ ...payment("old-order"), subscriptionStart: new Date("2029-01-01") }, getPlan("plus"));
    assert.equal(state.premiumCreditsRemaining, 428);
    assert.equal(updates, 0);
    console.log("PASS previously applied historical payment does not refill credits after linking");

    reset();
    const firstPayment = payment("new-order");
    await controller.applySuccessfulPayment(firstPayment, getPlan("plus"));
    assert.equal(state.premiumCreditsRemaining, getPlan("plus").monthlyPremiumCredits);
    state.premiumCreditsRemaining -= 8;
    // Even if saving the separate Payment document failed, the atomic receipt is durable on Subscription.
    await controller.applySuccessfulPayment(payment("new-order"), getPlan("plus"));
    assert.equal(state.premiumCreditsRemaining, getPlan("plus").monthlyPremiumCredits - 8);
    assert.equal(updates, 1);
    console.log("PASS first valid payment applies normally; retry after payment-save failure cannot refill it");

    reset();
    await Promise.all([
      controller.applySuccessfulPayment(payment("concurrent-order"), getPlan("plus")),
      controller.applySuccessfulPayment(payment("concurrent-order"), getPlan("plus"))
    ]);
    assert.equal(updates, 1);
    assert.deepEqual(state.appliedCreditOrderIds, ["concurrent-order"]);
    console.log("PASS simultaneous verification and webhook callbacks apply one allowance");

    reset();
    await controller.applySuccessfulPayment(payment("session-order"), getPlan("session-1"));
    await controller.applySuccessfulPayment(payment("session-order"), getPlan("session-1"));
    assert.equal(state.sessionCredits, 1);
    assert.equal(state.premiumCreditsRemaining, 428);
    console.log("PASS session purchase remains separate and cannot be replayed for extra usage");

    reset();
    const response = { statusCode: 0, status(code) { this.statusCode = code; return this; }, json(value) { return value; } };
    const request = { body: { userId: state.userId, planId: "plus" } };
    await controller.startTrial(request, response, (error) => { throw error; });
    assert.equal(response.statusCode, 409);
    response.statusCode = 0;
    await controller.cancelSubscription(request, response, (error) => { throw error; });
    assert.equal(response.statusCode, 409);
    assert.equal(updates, 0);
    assert.equal(state.premiumCreditsRemaining, 428);
    console.log("PASS legacy unauthenticated trial/cancel cannot refill linked credit accounts");
  } finally {
    Subscription.findOne = originalFind;
    Subscription.findOneAndUpdate = originalUpdate;
  }
  console.log("6 isolated linked-payment replay checks passed (no real payment or database exercised).");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
