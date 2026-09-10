const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  authUserId: { type: String, required: true },
  subscriptionId: { type: mongoose.Schema.Types.ObjectId, required: true },
  idempotencyKey: { type: String, required: true },
  requestHash: { type: String, required: true },
  action: { type: String, required: true },
  credits: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ["reserved", "completed", "released"], required: true },
  reservationToken: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  resetAt: { type: String, default: "" },
  resultUrl: { type: String, default: "" }
}, { timestamps: true });
schema.index({ authUserId: 1, idempotencyKey: 1 }, { unique: true });
schema.index({ authUserId: 1, status: 1, expiresAt: 1 });

module.exports = mongoose.model("PremiumCreditAction", schema);
