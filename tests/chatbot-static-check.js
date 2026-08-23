const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const page = read("maths_gpt.html");
const app = read("js/app.js");
const policySource = read("js/chatbot/response-policy.js");
const visuals = read("js/chatbot/educational-visuals.js");

[
  "js/chatbot/chatbot-core.js",
  "js/chatbot/mode-registry.js",
  "js/chatbot/chat-history-store.js",
  "js/chatbot/learning-tools.js",
  "js/chatbot/response-policy.js",
  "js/chatbot/educational-visuals.js",
  "js/chatbot/rich-response-renderer.js",
  "js/chatbot/markdown-renderer.js",
  "js/app.js"
].forEach((script) => {
  assert.ok(page.includes(`src="${script}`), `maths_gpt.html should load ${script}`);
});

[
  "chat-memory.js",
  "adaptive-intelligence.js",
  "response-engine.js",
  "gpt.js",
  "response-contract.js",
  "math-response-contract.js",
  "advanced-math-engine.js",
  "geography-visuals.js",
  "english-engine.js"
].forEach((script) => {
  assert.ok(!page.includes(`src="js/${script}"`) && !page.includes(`src="js/chatbot/${script}"`),
    `${script} must remain disabled on the live chat page`);
});

assert.ok(app.includes('getBackendEndpoint("/api/chat")'), "frontend should call the backend semantic chat endpoint");
assert.ok(app.includes('return "https://tutorly-api.onrender.com"'), "production chat should use the deployed Tutorly API");
assert.ok(app.includes("activity_chat_id"), "frontend should retain the persisted chat id for feedback");
assert.ok(app.includes("semanticRoute"), "frontend should consume validated semantic route metadata");
assert.ok(app.includes("fromSemanticRoute"), "visual rendering should use semantic route output");
assert.ok(app.includes("chatRequestInFlight"), "send button should suppress duplicate in-flight requests");
assert.ok(app.includes("const ENABLE_LEGACY_LOCAL_ROUTER = false"), "legacy local keyword router should be explicitly disabled");
assert.ok(app.includes("placeSemanticVisual"), "frontend should honor semantic visual placement");
assert.ok(app.includes("renderMarkdownNote"), "existing Markdown renderer should be reused");
assert.ok(app.includes("markdown-table-wrap"), "Markdown tables should be supported");
assert.ok(app.includes("<pre${language}><code>"), "fenced code blocks should be supported");
assert.ok(app.includes("renderDisplayMath"), "inline and multiline display math should be supported");
assert.ok(app.includes("RichResponse?.hydrate?.(content)"), "rich response blocks should hydrate inside existing messages");
assert.ok(app.includes("MarkdownRenderer.render(markdown"), "chat should use the shared failure-isolated Markdown renderer");
assert.ok(app.includes("text.match(/[\\s\\S]{1,42}/g)"), "simulated streaming must preserve every response character");

const getBotStart = app.indexOf("async function getBotReply");
const sendStart = app.indexOf("async function sendMessage", getBotStart);
assert.ok(getBotStart >= 0 && sendStart > getBotStart, "semantic reply function should exist");
const activeReplyPath = app.slice(getBotStart, sendStart);
assert.ok(activeReplyPath.includes("requestBackendChat"), "active reply path should always use backend AI service");
assert.ok(!activeReplyPath.includes("SubjectEngine"), "active reply path must not use local subject detection");
assert.ok(!activeReplyPath.includes("getLocalBotReply"), "active reply path must not use local keyword answers");
assert.ok(!activeReplyPath.includes("getConfidentAdvancedMathReply"), "active reply path must not bypass semantic routing");

assert.ok(policySource.includes("route.answer_format"), "response policy should accept LLM-selected answer format");
assert.ok(policySource.includes("route.response_length"), "response policy should accept LLM-selected response length");
assert.ok(!policySource.includes("subjectKeywords"), "response policy should not contain subject keyword lists");
assert.ok(visuals.includes("route?.visual"), "visual selection should come from the semantic route");
assert.ok(!visuals.includes("diagramKeywords"), "visual policy should not contain diagram keyword lists");

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(policySource, sandbox);
const policy = sandbox.window.TutorlyResponsePolicy;
const semanticPlan = policy.analyze("indirectly worded student question", {
  semanticRoute: {
    subject: "biology",
    topic: "cellular respiration",
    intent: "why_question",
    response_type: "explanation",
    answer_format: "why_explanation",
    response_length: "short",
    visual: { needed: true, type: "cell_diagram", placement: "after_intro" },
    tools: { diagram_renderer: true }
  }
});
assert.strictEqual(semanticPlan.subject, "biology");
assert.strictEqual(semanticPlan.kind, "why_explanation");
assert.strictEqual(semanticPlan.responseLength, "short");
assert.strictEqual(semanticPlan.visual.type, "cell_diagram");
assert.ok(!semanticPlan.actions.some((action) => ["quiz_me", "similar_question", "harder_question"].includes(action.id)),
  "default response actions should not append or suggest practice questions");

const visualSandbox = { window: {} };
vm.createContext(visualSandbox);
vm.runInContext(visuals, visualSandbox);
const visualEngine = visualSandbox.window.TutorlyEducationalVisuals;
const quadraticGraph = visualEngine.fromSemanticRoute({
  subject: "mathematics",
  topic: "quadratic function",
  visual: {
    needed: true,
    type: "graph",
    title: "Graph of y = x²",
    elements: ["x-axis", "y-axis", "vertex"],
    placement: "before_summary"
  }
}, "Plot y = x²");
assert.ok(quadraticGraph.svg.includes("<polyline"), "quadratic graph should render an actual curve");
assert.ok(quadraticGraph.title.includes("x²"), "quadratic graph should preserve its equation label");

const frontendFiles = [];
function walk(folder) {
  fs.readdirSync(folder, { withFileTypes: true }).forEach((entry) => {
    const target = path.join(folder, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (/\.(?:js|html)$/i.test(entry.name)) frontendFiles.push(target);
  });
}
walk(path.join(root, "js"));
fs.readdirSync(root).filter((name) => name.endsWith(".html")).forEach((name) => frontendFiles.push(path.join(root, name)));
const frontendText = frontendFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
assert.ok(!frontendText.includes("GROQ_API_KEY"), "Groq key name must not appear in frontend assets");
assert.ok(!frontendText.toLowerCase().includes("api.groq.com"), "frontend must never call Groq directly");

console.log("Tutorly semantic frontend, adaptive formatting, Markdown, visual placement, and key-isolation checks passed.");
