const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const config = require(path.join(root, "shared/tutorly-plans"));
const paymentPlans = require(path.join(root, "payments/plans"));

assert.deepStrictEqual(config.listPlans().map((plan) => plan.id), ["standard", "plus", "pro"]);
assert.strictEqual(config.PLANS.standard.amountPaise, 0);
assert.strictEqual(config.PLANS.standard.monthlyPremiumCredits, 100);
assert.strictEqual(config.PLANS.plus.amountPaise, 29900);
assert.strictEqual(config.PLANS.plus.monthlyPremiumCredits, 500);
assert.strictEqual(config.PLANS.plus.trialDays, 7);
assert.strictEqual(config.PLANS.plus.trialCredits, 150);
assert.strictEqual(config.PLANS.pro.amountPaise, 59900);
assert.strictEqual(config.PLANS.pro.monthlyPremiumCredits, 1500);
assert.strictEqual(config.PLANS.pro.trialDays, 7);
assert.strictEqual(config.PLANS.pro.trialCredits, 400);
assert.strictEqual(config.normalizePlanId("casual"), "standard", "legacy Casual users should migrate to Standard");
assert.strictEqual(paymentPlans.getPlan("plus").amountPaise, 29900, "backend must use shared plan prices");
assert.strictEqual(paymentPlans.CREDIT_COSTS.homeworkPhoto.credits, 2);
assert.strictEqual(paymentPlans.CREDIT_COSTS.fullVoiceChat.perMinutes, 2);

const accountPage = read("maths_gpt.html");
for (const marker of [
  'id="sidebarPlanAction"',
  'id="personalizationBtn"',
  'href="profile.html"',
  'id="settingsBtn"',
  'id="sidebarHelpBtn"',
  'id="sidebarSignOutBtn"',
  'href="help-center.html"',
  'href="release-notes.html"',
  'href="Terms_Conditions.html"',
  'href="privacy.html"',
  'href="contact.html?topic=bug"'
]) assert(accountPage.includes(marker), `account menu is missing ${marker}`);
assert(!accountPage.includes("Download Apps"), "Download Apps should be omitted without a real install target");
assert(!accountPage.includes("&#9813;") && !accountPage.includes("👑"), "account UI should not use crown glyphs or emoji");
assert(accountPage.includes('src="assets/premium-crown.png"'), "account UI should use the supplied crown artwork");

const crown = fs.readFileSync(path.join(root, "assets/premium-crown.png"));
assert.strictEqual(crown.subarray(1, 4).toString("ascii"), "PNG", "premium crown must be a PNG asset");

const subscriptions = read("subscriptions.html");
for (const copy of ["Standard", "₹0", "100</strong> premium credits / month", "₹299<small>/month</small>", "500</strong> premium credits / month", "₹599<small>/month</small>", "1,500</strong> premium credits / month", "7 days free"]) {
  assert(subscriptions.includes(copy), `plans page is missing ${copy}`);
}
assert((subscriptions.match(/src="assets\/premium-crown.png"/g) || []).length >= 3, "premium plans and trial dialog should use the crown asset");

const controller = read("backend/controllers/paymentController.js");
assert(controller.includes("async function startTrial"), "server-side trial activation is missing");
assert(controller.includes("existing?.trialUsedAt"), "trial eligibility must be enforced server-side");
assert(controller.includes("premiumCreditsRemaining: plan.trialCredits"), "trial credits must be assigned server-side");
assert(controller.includes("premiumCreditsRemaining: plan.monthlyPremiumCredits"), "paid credits must be assigned server-side");
assert(read("backend/routes/payments.js").includes('router.post("/start-trial"'), "trial route is missing");

for (const page of ["billing.html", "help-center.html", "release-notes.html", "privacy.html"]) {
  assert(fs.existsSync(path.join(root, page)), `${page} must exist`);
  assert(read(page).includes('meta charset="UTF-8"'), `${page} must declare UTF-8`);
}
assert(read("contact.html").includes("Bug Report"), "bug-report support topic is missing");
assert(read("js/release-notes.js").includes("textContent"), "release notes should render data safely");

console.log("Tutorly account, Help, Standard/Plus/Pro, trial, credit, and crown-asset checks passed.");
