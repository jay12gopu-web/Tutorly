const crypto = require("crypto");

function hmacSha256(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function safeCompare(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function verifyRazorpayPaymentSignature({ orderId, paymentId, signature, secret }) {
  const expectedSignature = hmacSha256(`${orderId}|${paymentId}`, secret);
  return safeCompare(expectedSignature, signature);
}

function verifyRazorpayWebhookSignature(rawBody, signature, secret) {
  const expectedSignature = hmacSha256(rawBody, secret);
  return safeCompare(expectedSignature, signature);
}

module.exports = {
  hmacSha256,
  safeCompare,
  verifyRazorpayPaymentSignature,
  verifyRazorpayWebhookSignature
};
