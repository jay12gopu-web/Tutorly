const Razorpay = require("razorpay");
const { getEnv, requireEnv } = require("./env");

let razorpayInstance = null;

function getRazorpayKeyId() {
  return requireEnv("RAZORPAY_KEY_ID");
}

function getRazorpaySecret() {
  return requireEnv("RAZORPAY_SECRET");
}

function getRazorpayWebhookSecret() {
  return getEnv("RAZORPAY_WEBHOOK_SECRET");
}

function getRazorpayInstance() {
  if (!razorpayInstance) {
    razorpayInstance = new Razorpay({
      key_id: getRazorpayKeyId(),
      key_secret: getRazorpaySecret()
    });
  }
  return razorpayInstance;
}

module.exports = {
  getRazorpayInstance,
  getRazorpayKeyId,
  getRazorpaySecret,
  getRazorpayWebhookSecret
};
