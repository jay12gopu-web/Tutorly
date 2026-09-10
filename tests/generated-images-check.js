"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const api = require("../js/chatbot/generated-images.js");
const endpoint = "https://backend.example/api/images/generate";
const imagePath = "/uploads/generated/study-0123456789abcdef0123456789abcdef.png";
const spec = {
  requested: true, explicit_request: true, action: "educationalImage",
  topic: "Volcano", description: "An educational volcano eruption scene",
  required_labels: ["Lava"], style: "clean_educational", aspect_ratio: "landscape"
};

assert.equal(api.createState(null), null);
assert.equal(api.createState({ requested: false }), null);
assert.equal(api.imageUrl(imagePath, endpoint), `https://backend.example${imagePath}`);
for (const invalid of ["https://untrusted.example/image.png", "javascript:alert(1)", "//untrusted/image.png", "/uploads/generated/../private.png", `${imagePath}?secret=test`, `${imagePath}#x`, "/uploads/generated/study-not-valid.png"]) {
  assert.equal(api.imageUrl(invalid, endpoint), null, `Reject unsafe image path: ${invalid}`);
}
const state = api.createState(spec);
const restored = JSON.parse(JSON.stringify(state));
assert.equal(api.requestBody(restored).idempotency_key, api.requestBody(state).idempotency_key);
assert.notEqual(api.createState(spec).idempotencyKey, state.idempotencyKey);
assert.equal(api.requestBody(restored).topic, "Volcano");
assert.equal(api.requestBody(restored).action, "educationalImage");
console.log("Generated image request and URL validation checks passed.");

async function browserChecks() {
  const { chromium } = require(process.env.TUTORLY_PLAYWRIGHT_PATH || "playwright");
  const browser = await chromium.launch({ channel: process.env.TUTORLY_TEST_BROWSER || "msedge", headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://backend.example/uploads/generated/**", (route) => route.fulfill({
    contentType: "image/png",
    body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+lmN0AAAAASUVORK5CYII=", "base64")
  }));
  try {
    await page.setContent('<main class="msg bot" style="width:min(680px,100%);margin:auto"><div class="bot-content"><p id="answer">Volcanoes erupt when magma rises toward the surface.</p></div></main>');
    await page.addStyleTag({ path: path.resolve(__dirname, "../css/chatbot.css") });
    await page.addScriptTag({ path: path.resolve(__dirname, "../js/chatbot/generated-images.js") });
    await page.evaluate(({ endpoint, spec }) => {
      window.requestLog = [];
      window.saved = null;
      window.current = true;
      window.insufficient = 0;
      window.token = "test-session";
      window.reply = null;
      window.fetch = (_url, options) => new Promise((resolve, reject) => {
        requestLog.push({ body: JSON.parse(options.body), headers: options.headers });
        options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        window.reply = (status, data) => resolve({ ok: status >= 200 && status < 300, status, json: async () => data });
      });
      window.manager = TutorlyGeneratedImages.createManager({
        getEndpoint: () => endpoint, getToken: () => token, getCost: () => 8,
        isCurrent: () => current, onInsufficient: () => { insufficient += 1; }
      });
      window.state = TutorlyGeneratedImages.createState(spec);
      window.mount = (autoStart = false) => {
        document.querySelector(".tutorly-generated-image")?.remove();
        manager.mount(document.querySelector(".bot-content"), saved || state, { autoStart, onChange: (next) => { saved = structuredClone(next); } });
      };
      mount(true);
    }, { endpoint, spec });
    await page.getByText("Creating your study illustration…", { exact: true }).waitFor();
    assert.equal(await page.locator(".generated-image-cost").textContent(), "8 premium credits · charged once on success");
    assert.equal(await page.evaluate(() => requestLog[0].headers.Authorization), "Bearer test-session");
    const key = await page.evaluate(() => requestLog[0].body.idempotency_key);
    await page.evaluate(() => reply(502, { detail: "provider failure" }));
    await page.getByRole("button", { name: "Retry · 8 credits" }).waitFor();
    assert.match(await page.locator("#answer").textContent(), /Volcanoes/);
    await page.getByRole("button", { name: "Retry · 8 credits" }).click();
    assert.equal(await page.evaluate(() => requestLog[1].body.idempotency_key), key);
    await page.evaluate((url) => reply(200, { ok: true, image: { url, alt_text: "Volcano illustration" }, credits: { remaining: 92 } }), imagePath);
    await page.getByRole("button", { name: "Enlarge generated study illustration" }).waitFor();
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 820 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `No image overflow at ${width}px`);
      await page.getByRole("button", { name: "Enlarge generated study illustration" }).click();
      await page.getByRole("dialog").waitFor();
      assert.equal(await page.evaluate(() => document.querySelector("dialog").getBoundingClientRect().right <= innerWidth), true);
      await page.keyboard.press("Escape");
      assert.equal(await page.getByRole("dialog").count(), 0);
      assert.equal(await page.getByRole("button", { name: "Enlarge generated study illustration" }).evaluate((node) => node === document.activeElement), true);
    }
    await page.evaluate(() => { document.body.dataset.theme = "dark"; mount(true); });
    assert.equal(await page.evaluate(() => requestLog.length), 2, "History/completed renders must not generate again");
    assert.equal(await page.locator(".tutorly-generated-image").evaluate((node) => getComputedStyle(node).backgroundColor), "rgb(27, 35, 58)");
    // A suggested (not explicitly requested) illustration waits for consent.
    await page.evaluate((spec) => {
      saved = null;
      state = TutorlyGeneratedImages.createState({ ...spec, explicit_request: false });
      mount(true);
    }, spec);
    await page.waitForTimeout(60);
    assert.equal(await page.evaluate(() => requestLog.length), 2);
    await page.getByRole("button", { name: "Generate · 8 credits" }).click();
    await page.evaluate(() => reply(402, { detail: { code: "insufficient_credits", remaining: 1, required: 8 } }));
    await page.getByRole("button", { name: "Retry · 8 credits" }).waitFor();
    assert.equal(await page.evaluate(() => insufficient), 1);
    assert.match(await page.locator("#answer").textContent(), /Volcanoes/);
    await page.getByRole("button", { name: "Retry · 8 credits" }).click();
    const beforeAbort = await page.evaluate(() => requestLog.at(-1).body.idempotency_key);
    await page.evaluate(() => manager.cancelAll());
    await page.getByRole("button", { name: "Resume image" }).waitFor();
    assert.equal(await page.evaluate(() => saved.status), "paused");
    await page.evaluate(() => mount(false));
    await page.getByRole("button", { name: "Resume image" }).click();
    assert.equal(await page.evaluate(() => requestLog.at(-1).body.idempotency_key), beforeAbort);
    await page.evaluate(() => { manager.cancelAll(); current = false; });
    assert.equal(await page.evaluate(() => saved.status), "paused");
    // Stop must also cancel a scheduled auto-start before the next paint.
    const countBeforeQueuedStop = await page.evaluate(() => requestLog.length);
    await page.evaluate((spec) => {
      current = true;
      saved = null;
      state = TutorlyGeneratedImages.createState(spec);
      mount(true);
      manager.cancelAll();
    }, spec);
    await page.waitForTimeout(60);
    assert.equal(await page.evaluate(() => requestLog.length), countBeforeQueuedStop);
    await page.getByRole("button", { name: "Generate · 8 credits" }).click();
    await page.evaluate(() => reply(200, { ok: true, image: { url: "https://untrusted.example/fake.png" } }));
    await page.getByRole("button", { name: "Retry · 8 credits" }).waitFor();
    assert.equal(await page.locator(".generated-image-open img").count(), 0, "Untrusted URLs never render");
    // A response from the former session must never update another account.
    await page.getByRole("button", { name: "Retry · 8 credits" }).click();
    await page.evaluate((url) => {
      token = "different-session";
      reply(200, { ok: true, image: { url }, credits: { remaining: 92 } });
    }, imagePath);
    await page.waitForTimeout(60);
    assert.notEqual(await page.evaluate(() => saved.status), "completed");
    await page.evaluate(() => manager.cancelAll());
    assert.deepEqual(errors, []);
    console.log("Browser checks passed: auto/requested vs suggested, visible cost, authenticated request, failure/text fallback, stable retry/history, 402 guard, stop/resume, enlargement/Escape/focus, dark mode, 1440/768/390px.");
  } finally { await browser.close(); }
}

if (process.argv.includes("--browser")) browserChecks().catch((error) => { console.error(error); process.exitCode = 1; });
