const mongoose = require("mongoose");

const webhookEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    eventType: { type: String, required: true },
    orderId: { type: String, index: true },
    paymentId: { type: String, index: true },
    processed: { type: Boolean, default: false },
    rawPayload: { type: Object, default: {} }
  },
  { timestamps: true }
);

module.exports = mongoose.model("WebhookEvent", webhookEventSchema);
