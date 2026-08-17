const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true, trim: true },
    planId: { type: String, required: true, index: true },
    planName: { type: String, required: true },
    productType: { type: String, enum: ["subscription", "session"], required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    orderId: { type: String, required: true, unique: true, index: true },
    paymentId: { type: String, index: true },
    receipt: { type: String, required: true },
    paymentStatus: {
      type: String,
      enum: ["created", "authorized", "captured", "failed", "signature_failed", "refunded"],
      default: "created",
      index: true
    },
    razorpayStatus: { type: String },
    subscriptionStart: { type: Date },
    subscriptionExpiry: { type: Date },
    userSnapshot: {
      name: String,
      email: String,
      phone: String
    },
    notes: { type: Object, default: {} },
    failureReason: { type: String },
    verifiedAt: { type: Date },
    webhookEvents: [{ type: String }]
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", paymentSchema);
