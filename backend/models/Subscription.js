const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true, trim: true },
    currentPlan: { type: String, default: "standard", index: true },
    paymentId: { type: String },
    orderId: { type: String },
    subscriptionStart: { type: Date },
    subscriptionExpiry: { type: Date },
    paymentStatus: { type: String, default: "free" },
    status: {
      type: String,
      enum: ["active", "free", "expired", "cancelled"],
      default: "free",
      index: true
    },
    sessionCredits: { type: Number, default: 0 },
    creditAllowance: { type: Number, default: 100, min: 0 },
    premiumCreditsRemaining: { type: Number, default: 100, min: 0 },
    creditsResetAt: { type: Date },
    trialPlan: { type: String, default: null },
    trialStartedAt: { type: Date },
    trialEndsAt: { type: Date },
    trialUsedAt: { type: Date },
    cancelledAt: { type: Date },
    lastPaymentAt: { type: Date }
  },
  { timestamps: true }
);

subscriptionSchema.methods.isPremiumActive = function isPremiumActive() {
  if (this.status !== "active") return false;
  if (!["plus", "pro"].includes(this.currentPlan)) return false;
  return this.subscriptionExpiry && this.subscriptionExpiry.getTime() > Date.now();
};

module.exports = mongoose.model("Subscription", subscriptionSchema);
