const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "app.js"), "utf8");
const requestStart = source.indexOf("  function getChatFailureMessage(");
const requestEnd = source.indexOf("  function abortActiveChatRequest(", requestStart);
const replyStart = source.indexOf("  async function getBotReply(");
const replyEnd = source.indexOf("  async function sendMessage(", replyStart);
assert.ok(requestStart >= 0 && requestEnd > requestStart && replyStart >= 0 && replyEnd > replyStart);

function makeHarness(fetch) {
  let timeoutCallback;
  let timersCleared = 0;
  const sandbox = {
    AbortController,
    fetch,
    console: { warn() {} },
    window: {
      setTimeout(callback) { timeoutCallback = callback; return 1; },
      clearTimeout() { timersCleared += 1; }
    },
    getChatEndpoint: () => "/api/chat",
    getLegacyChatEndpoint: () => "/chat",
    createBackendChatRequest: (message) => ({ message }),
    createLegacyChatRequest: (message) => ({ message }),
    normalizeBackendDiagnostics: (value) => value,
    updateDeveloperDiagnosticsPanel() {},
    normalizeModelId: (value) => value,
    normalizeReplyForRender: (value) => value,
    TeachingActions: null,
    selectedModel: "prime"
  };
  vm.createContext(sandbox);
  vm.runInContext("let activeChatController = null;\n" + source.slice(requestStart, requestEnd) + source.slice(replyStart, replyEnd), sandbox);
  return {
    ...sandbox,
    expire: () => timeoutCallback(),
    cancel: () => vm.runInContext("activeChatController.abort()", sandbox),
    cleanedUp: () => timersCleared > 0 && vm.runInContext("activeChatController === null", sandbox)
  };
}

function response(status, payload = {}, retryAfter = null) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => retryAfter },
    json: async () => payload
  };
}

function waitingForAbort(_endpoint, options) {
  return new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    }, { once: true });
  });
}

async function main() {
  let requests = 0;
  const busy = makeHarness(async () => { requests += 1; return response(429, {}, "2.2"); });
  await assert.rejects(busy.getBotReply("hi"), (error) => {
    assert.equal(error.status, 429);
    assert.equal(error.retryAfterSeconds, 2.2);
    assert.match(busy.getChatFailureMessage(error), /try again in 3 seconds/);
    return true;
  });
  assert.equal(requests, 1, "rate limits must not retry through a compatibility endpoint");
  assert.ok(busy.cleanedUp());

  const auth = makeHarness(async () => response(401));
  await assert.rejects(auth.getBotReply("hi"), (error) => {
    assert.match(auth.getChatFailureMessage(error), /sign in again/i);
    return error.status === 401;
  });

  const timeout = makeHarness(waitingForAbort);
  const timedReply = timeout.getBotReply("hi");
  timeout.expire();
  await assert.rejects(timedReply, (error) => {
    assert.equal(error.name, "TimeoutError");
    assert.match(timeout.getChatFailureMessage(error), /ran out of time/);
    return true;
  });
  assert.ok(timeout.cleanedUp());

  const cancelled = makeHarness(waitingForAbort);
  const cancelledReply = cancelled.getBotReply("hi");
  cancelled.cancel();
  await assert.rejects(cancelledReply, (error) => error.name === "AbortError");
  assert.ok(cancelled.cleanedUp(), "deliberate cancellation must still clean up without becoming a failure reply");

  for (const status of [404, 405]) {
    const endpoints = [];
    const compatibility = makeHarness(async (endpoint) => {
      endpoints.push(endpoint);
      return endpoint === "/api/chat" ? response(status) : response(200, { answer: "Hi! How's your day going?" });
    });
    assert.equal(await compatibility.getBotReply("hi"), "Hi! How's your day going?");
    assert.deepEqual(endpoints, ["/api/chat", "/chat"]);
  }

  for (const payload of [{ error: true, message: "private backend detail" }, { answer: "" }]) {
    const failed = makeHarness(async () => response(200, payload));
    await assert.rejects(failed.getBotReply("hi"), (error) => {
      const message = failed.getChatFailureMessage(error);
      assert.match(message, /having trouble replying/);
      assert.ok(!message.includes("private backend detail"));
      return true;
    });
  }
  assert.ok(!source.includes("I couldn't process that question properly"));
  console.log("Tutorly friendly chat failure, retry timing, compatibility fallback, and cancellation checks passed.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
