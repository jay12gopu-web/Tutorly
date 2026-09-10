const crypto = require("crypto");
const express = require("express");
const { execute, CreditError } = require("../services/premiumCreditService");
const router = express.Router();

function verifySignature(body, timestamp, signature, secret, operation, now = Date.now()) {
  if (!secret || secret.length < 32 || !/^\d{10}$/.test(timestamp || "") ||
      Math.abs(now / 1000 - Number(timestamp)) > 60 || !/^[a-f0-9]{64}$/.test(signature || "")) return false;
  if (!["reserve", "complete", "release", "status"].includes(operation)) return false;
  const expected = crypto.createHmac("sha256", secret).update(timestamp + "\n" + operation + "\n").update(body).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

router.post("/:operation", express.raw({ type: "application/json", limit: "8kb" }), async (req, res) => {
  res.set("Cache-Control", "no-store");
  const secret = process.env.TUTORLY_CREDIT_SERVICE_SECRET || "";
  if (!secret || secret.length < 32) return res.status(503).json({ code: "credit_service_unavailable" });
  if (!Buffer.isBuffer(req.body) || !verifySignature(req.body, req.get("x-tutorly-timestamp"), req.get("x-tutorly-signature"), secret, req.params.operation)) {
    return res.status(401).json({ code: "unauthorized" });
  }
  try {
    const input = JSON.parse(req.body.toString("utf8"));
    if (!input || typeof input !== "object" || Array.isArray(input)) return res.status(400).json({ code: "invalid_request" });
    return res.json(await execute(req.params.operation, input));
  } catch (error) {
    if (error instanceof CreditError) return res.status(error.status).json({ code: error.code, remaining: error.remaining });
    if (error instanceof SyntaxError) return res.status(400).json({ code: "invalid_request" });
    // Do not log signed requests, account details, prompts, tokens or connection strings.
    console.error("Tutorly credit transaction failed", { category: error?.code === 11000 ? "concurrent_action" : "transaction_unavailable" });
    return res.status(503).json({ code: "credit_service_unavailable" });
  }
});

module.exports = router;
module.exports.verifySignature = verifySignature;
