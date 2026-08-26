const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const login = read("login.html");
const signup = read("sign_up.html");
const socialUi = read("js/social-auth-ui.js");
const authClient = read("js/auth-client.js");
const socialCss = read("css/auth-social.css");

for (const [name, html, flow] of [["login", login, "login"], ["signup", signup, "signup"]]) {
  if (!html.includes(`data-social-auth="${flow}"`)) throw new Error(`${name} is missing its social auth host`);
  if (!html.includes("css/auth-social.css")) throw new Error(`${name} is missing social auth styles`);
  if (!html.includes("js/social-auth-ui.js")) throw new Error(`${name} is missing social auth behavior`);
}

for (const provider of ["Google", "Microsoft", "Apple"]) {
  if (!socialUi.includes(`Continue with ${"${provider.label}"}`) && !socialUi.includes(provider.toLowerCase())) {
    throw new Error(`Social UI is missing ${provider}`);
  }
}

if (!socialUi.includes("<svg") || /[🔐🍎🪟]/u.test(socialUi)) throw new Error("Provider buttons must use SVG icons, not emoji");
if (!authClient.includes("/api/auth/oauth/complete")) throw new Error("Frontend does not redeem the one-time OAuth result");
if (!authClient.includes("/api/auth/providers")) throw new Error("Frontend does not use server-derived provider configuration");
if (!socialCss.includes("@media (max-width: 520px)")) throw new Error("Social auth has no mobile layout rule");
if (!socialCss.includes(":focus-visible")) throw new Error("Social auth has no visible keyboard focus state");
if (/CLIENT_SECRET|PRIVATE_KEY|access_token|refresh_token/.test(authClient + socialUi)) {
  throw new Error("Frontend social auth contains a credential/token implementation detail");
}

console.log("Tutorly login/signup social-auth UI, accessibility, mobile, and secret-isolation checks passed.");
