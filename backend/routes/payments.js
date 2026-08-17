const express = require("express");
const paymentController = require("../controllers/paymentController");
const { requireActiveSubscription } = require("../middleware/requireSubscription");

const router = express.Router();

router.get("/plans", (_req, res) => {
  const { listPublicPlans } = require("../../payments/plans");
  res.json({ plans: listPublicPlans() });
});

router.post("/create-order", paymentController.createOrder);
router.post("/verify-payment", paymentController.verifyPayment);
router.post("/payment-failed", paymentController.markPaymentFailed);
router.get("/subscription/:userId", paymentController.getSubscription);
router.get("/history/:userId", paymentController.getPaymentHistory);
router.post("/cancel-subscription", paymentController.cancelSubscription);
router.post("/premium/check", paymentController.checkPremium);

// Example protected endpoint for future premium-only APIs.
router.post("/premium/example", requireActiveSubscription(), (_req, res) => {
  res.json({ ok: true, message: "Premium access granted." });
});

module.exports = router;
