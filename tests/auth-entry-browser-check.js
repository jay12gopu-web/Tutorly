"use strict";
// Run against `python tests/auth_entry_server.py`; this uses only captured test mail.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.TUTORLY_PLAYWRIGHT_PATH || "playwright");
const base = "http://127.0.0.1:8765";

(async () => {
  const browser = await chromium.launch({ channel: process.env.TUTORLY_TEST_BROWSER || "msedge", headless: true });
  const context = await browser.newContext();
  await context.addInitScript(origin => { window.TUTORLY_BACKEND_ORIGIN = origin; }, base);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => { if (page.url().includes("login.html")) errors.push(error.message); });
  const output = path.resolve(__dirname, "../.test-deps/auth-review");
  fs.mkdirSync(output, { recursive: true });
  try {
    for (const width of [1440, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${base}/login.html`);
      await page.getByRole("button", { name: "Continue with Google", exact: true }).waitFor();
      assert.equal(await page.locator(".social-auth-heading").textContent(), "Continue with");
      assert.equal(await page.locator(".social-auth-button svg").count(), 3);
      assert.equal(await page.locator(".auth-story").isVisible(), width > 760);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px overflow`);
      await page.screenshot({ path: path.join(output, `login-${width}.png`), fullPage: true, animations: "disabled" });
    }
    await page.getByRole("button", { name: "Continue with Apple" }).click({ force: true });
    await page.getByText(/Apple sign-in isn’t available yet/).waitFor();
    await page.locator("#email").fill("invalid");
    await page.locator("#emailContinue").click();
    assert.equal(await page.locator("#email").getAttribute("aria-invalid"), "true");

    await page.locator("#email").fill("new-login-ui@example.test");
    await page.locator("#emailContinue").click();
    await page.getByText("Code sent to new-login-ui@example.test.").waitFor();
    assert(await page.locator("#resendCode").isDisabled());
    const code = (await (await context.request.get(`${base}/__test__/mail?email=new-login-ui@example.test`)).json()).code;
    await page.locator("#verificationCode").fill(code === "000000" ? "111111" : "000000");
    await page.locator("#verifyCode").click();
    await page.getByText(/That code is incorrect/).waitFor();
    await page.locator("#verificationCode").fill(code);
    await page.locator("#verifyCode").click();
    await page.waitForURL("**/info.html");
    assert(await page.evaluate(() => !!localStorage.getItem("tutorly_session_token")));

    // Existing account seeded through the unchanged legacy API; email UI never probes existence.
    const account = await context.request.post(`${base}/api/auth/register`, { data: {
      full_name: "Returning Student", email: "returning-ui@example.test", password: "test-password-123"
    } });
    assert.equal(account.status(), 200);
    const session = (await account.json()).session_token;
    const profile = await context.request.post(`${base}/api/auth/profile`, { headers: { Authorization: `Bearer ${session}` }, data: { grade: "9", board: "CBSE", school: "" } });
    assert.equal(profile.status(), 200);
    await page.goto(`${base}/login.html`);
    await page.locator("#email").fill("returning-ui@example.test");
    await page.locator("#emailContinue").click();
    await page.getByText("Code sent to returning-ui@example.test.").waitFor();
    await page.locator("#usePassword").click();
    await page.locator("#password").fill("wrong-password");
    await page.locator("#passwordContinue").click();
    await page.getByText(/We couldn’t sign you in with those details/).waitFor();
    await page.locator("#password").fill("test-password-123");
    await page.locator("#togglePassword").click();
    assert.equal(await page.locator("#password").getAttribute("type"), "text");
    await page.locator("#passwordContinue").click();
    await page.waitForURL("**/maths_gpt.html");

    await page.goto(`${base}/sign_up.html?oauth_error=cancelled&provider=google`);
    await page.waitForURL("**/login.html?oauth_error=cancelled&provider=google");
    await page.getByText("Sign-in cancelled.").waitFor();
    await page.goto(`${base}/login.html?oauth_result=expired-test-result`);
    await page.getByText("That sign-in link is invalid or expired.").waitFor();
    assert(!(await page.locator("#emailContinue").isDisabled()));
    await page.route("**/api/auth/request-otp", route => route.abort());
    await page.locator("#email").fill("offline@example.test");
    await page.locator("#emailContinue").click();
    await page.getByText(/We couldn’t reach the sign-in service/).waitFor();
    assert(!(await page.locator("#resendCode").isDisabled()));
    await page.locator("#authBack").click();
    assert.equal(await page.locator("#email").inputValue(), "offline@example.test");
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(await page.locator("#emailContinue").evaluate(node => getComputedStyle(node).animationName), "none");
    assert.deepEqual(errors, []);
    console.log("PASS: 1440/1024/768/390 layouts; original image; centered social icons; invalid/email-code/password/returning/new login; cancellation/expired OAuth; offline recovery; reduced motion. SMTP captured, OAuth not live-verified.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
