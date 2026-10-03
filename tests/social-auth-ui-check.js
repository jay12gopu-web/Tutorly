const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const login = read("login.html");
const signup = read("sign_up.html");
const socialUi = read("js/social-auth-ui.js");
const authClient = read("js/auth-client.js");
const socialCss = read("css/auth-social.css");

for (const [name, html, flow] of [["login", login, "login"]]) {
  if (!html.includes(`data-social-auth="${flow}"`)) throw new Error(`${name} is missing its social auth host`);
  if (!html.includes("css/auth-social.css")) throw new Error(`${name} is missing social auth styles`);
  if (!html.includes("js/social-auth-ui.js")) throw new Error(`${name} is missing social auth behavior`);
}
if (!signup.includes("window.location.replace('login.html' + window.location.search")) throw new Error("Signup alias must preserve OAuth callback parameters");
if (!socialUi.includes('social-auth-heading">Continue with</p>')) throw new Error("Continue with must be centered below OR");
if (!socialUi.includes('${provider.label}</span>')) throw new Error("Each icon must sit beside the company name");
if (!login.includes('data-auth-provider="google"') || !login.includes('data-social-providers="google"') || !login.includes('data-social-only="true"')) throw new Error("Entry must offer only Google");
if (!login.includes('id="authTitle">Welcome Back</h1>')) throw new Error("Entry must say Welcome Back");
if (!/id="emailForm"[^>]*hidden/.test(login)) throw new Error("Email entry must be hidden before JavaScript loads");
if (!socialUi.includes('allowedProviders.includes(provider.id)') || !socialUi.includes('socialOnly ? "" :')) throw new Error("Google-only mode must filter providers and omit OR");
if (!socialUi.includes('aria-disabled=') || !socialUi.includes('item.enabled === true')) throw new Error("Unconfigured providers must not start OAuth");

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

// Execute provider UI against a small DOM double: no network or real identities.
const vm = require("vm");
const assert = require("node:assert/strict");
async function googleEntry(options = {}) {
  const element = () => ({
    dataset: {}, handlers: {}, disabled: false, textContent: "",
    classList: { toggle() {} }, setAttribute() {},
    addEventListener(name, handler) { this.handlers[name] = handler; }
  });
  let providers = options.providers || [{ id: "google", enabled: true }, { id: "apple", enabled: true }, { id: "microsoft", enabled: true }];
  let fail = options.fail;
  let redirected;
  let profileResolutions = 0;
  const host = element();
  host.dataset = { socialAuth: "login", socialProviders: "google", socialOnly: "true" };
  Object.defineProperty(host, "innerHTML", {
    set(html) {
      this.html = html;
      this.retry = null;
      this.status = element();
      this.buttons = [...html.matchAll(/data-social-provider="(\w+)"[^>]*aria-disabled="(true|false)"/g)].map(match => {
        const button = element();
        button.dataset.socialProvider = match[1];
        button.textContent = "Continue with Google";
        button.getAttribute = () => match[2];
        return button;
      });
    }
  });
  host.querySelector = selector => selector === "[data-social-retry]" ? host.retry : host.status;
  host.querySelectorAll = () => host.buttons || [];
  host.append = node => { if (node.dataset.socialRetry) host.retry = node; else host.status = node; };
  const events = {};
  const window = {
    TutorlyAuth: {
      async getProviders() { if (fail) throw Error("offline"); return { providers }; },
      socialStartUrl(provider, flow) { assert.equal(flow, "login"); return `/api/auth/oauth/${provider}/start`; },
      async completeOAuth() {}, getSessionToken: () => options.expired ? "" : "session"
    },
    TutorlyAuthUI: { async resolveProfile() { profileResolutions++; return !options.expired; } },
    location: { search: options.search || "", pathname: "/login.html", assign(url) { redirected = url; } },
    addEventListener(name, handler) { events[name] = handler; }, dispatchEvent() {}
  };
  vm.runInNewContext(socialUi, {
    window, document: { querySelector: () => host, createElement: element },
    history: { replaceState() {} }, URLSearchParams,
    CustomEvent: class { constructor(type, init) { Object.assign(this, {type}, init); } }
  });
  await new Promise(setImmediate);
  return { host, events, get redirected() { return redirected; }, get profileResolutions() { return profileResolutions; }, recover() { fail = false; providers = [{ id: "google", enabled: true }]; } };
}

(async () => {
  const enabled = await googleEntry();
  assert.deepEqual(enabled.host.buttons.map(button => button.dataset.socialProvider), ["google"]);
  assert(!enabled.host.html.includes("social-auth-divider"));
  enabled.host.buttons[0].handlers.click();
  assert.equal(enabled.redirected, "/api/auth/oauth/google/start");
  const disabled = await googleEntry({ providers: [{ id: "google", enabled: false }] });
  disabled.host.buttons[0].handlers.click();
  assert.equal(disabled.redirected, undefined);
  assert.match(disabled.host.status.textContent, /isn’t available/);
  assert(!disabled.host.status.textContent.includes("email"));
  const offline = await googleEntry({ fail: true });
  assert.match(offline.host.status.textContent, /couldn’t reach/);
  offline.recover();
  await offline.host.retry.handlers.click();
  assert.equal(offline.host.buttons[0].getAttribute("aria-disabled"), "false");
  const cancelled = await googleEntry({ search: "?oauth_error=cancelled" });
  assert.equal(cancelled.host.status.textContent, "Sign-in cancelled.");
  const callback = await googleEntry({ search: "?oauth_result=test-one-time-code" });
  assert.equal(callback.profileResolutions, 1);
  const expired = await googleEntry({ search: "?oauth_result=test-one-time-code", expired: true });
  assert.equal(expired.host.buttons.length, 1);
  assert.match(expired.host.status.textContent, /session expired/);
  console.log("Google-only rendering, OAuth start, unavailable/retry, cancellation, profile resolution and expired-session checks passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
