const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const { connectDatabase } = require("./config/database");
const { port, appOrigin, nodeEnv } = require("./config/env");
const paymentRoutes = require("./routes/payments");
const paymentController = require("./controllers/paymentController");

const app = express();
const projectRoot = path.join(__dirname, "..");

app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(cors({
  origin: nodeEnv === "production" ? appOrigin : true,
  credentials: true
}));
app.use(morgan(nodeEnv === "production" ? "combined" : "dev"));

// Razorpay requires webhook signature verification against the exact raw body.
app.post("/webhook", express.raw({ type: "application/json" }), paymentController.handleWebhook);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "tutorly-payments" });
});

app.use("/", paymentRoutes);
app.use("/api/payments", paymentRoutes);
app.use(express.static(projectRoot));

app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

app.use((error, _req, res, _next) => {
  const status = error.statusCode || error.status || 500;
  const message = status >= 500 && nodeEnv === "production"
    ? "Payment service error"
    : error.message || "Payment service error";
  if (status >= 500) {
    console.error(error);
  }
  res.status(status).json({ error: message });
});

async function start() {
  await connectDatabase();
  app.listen(port, () => {
    console.log(`Tutorly payment server running on http://127.0.0.1:${port}`);
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error("Payment server failed to start:", error);
    process.exit(1);
  });
}

module.exports = app;
