const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: process.env.ENV_FILE || path.join(__dirname, "../../.env") });

function getEnv(name, fallback = "") {
  return process.env[name] || fallback;
}

function requireEnv(name) {
  const value = getEnv(name);
  if (!value) {
    const error = new Error(`${name} is required. Add it to your .env file.`);
    error.statusCode = 500;
    throw error;
  }
  return value;
}

module.exports = {
  nodeEnv: getEnv("NODE_ENV", "development"),
  port: Number(getEnv("PORT", "3001")),
  appOrigin: getEnv("APP_ORIGIN", "https://mytutor.co.in"),
  mongoUri: getEnv("MONGODB_URI", "mongodb://127.0.0.1:27017/tutorly"),
  getEnv,
  requireEnv
};
