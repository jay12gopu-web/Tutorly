const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const rootDir = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(rootDir, file), "utf8");

function assertIncludes(source, value, label) {
  assert(source.includes(value), `${label} missing: ${value}`);
}

async function main() {
  const app = read("js/app.js");
  const tools = read("more-tools.html");
  const page = read("live-board.html");
  const chatPage = read("maths_gpt.html");
  const css = read("css/live-board.css");
  const scripts = [
    "js/live-board/schema.js",
    "js/live-board/graph-engine.js",
    "js/live-board/geometry-engine.js",
    "js/live-board/mock-provider.js",
    "js/live-board/provider.js"
  ];

  assertIncludes(app, "\"live-board.html\": \"Live Board\"", "Tutorly route title");
  assertIncludes(app, "tutorly_live_board_context_v1", "chat context handoff");
  assertIncludes(app, "data-action=\"live-board\"", "chat Live Board action");
  assertIncludes(app, "window.TutorlyLiveBoardPanel", "integrated chat panel reference");
  assertIncludes(app, "panel?.open", "integrated chat panel trigger");
  assertIncludes(app, "requestPayload.liveBoard", "shared Live Board chat context");
  assertIncludes(app, "routeSupportsLiveBoard", "semantic visual guard");
  assertIncludes(tools, "href=\"live-board.html\"", "More Tools Live Board card");
  assertIncludes(chatPage, "id=\"chatLiveBoardPanel\"", "integrated chat Live Board panel");
  assertIncludes(chatPage, "id=\"chatLiveBoardStage\"", "integrated chat Live Board stage");
  assertIncludes(chatPage, "js/live-board/chat-panel.js", "integrated panel controller");
  assertIncludes(css, "body.live-board-open .main-area", "desktop split panel layout");
  assertIncludes(css, ".chat-live-board-mobile-banner", "mobile View Live Board entry");
  assertIncludes(page, "id=\"liveBoardStage\"", "Live Board canvas");
  assertIncludes(page, "id=\"studentTools\"", "Student tool layer");
  assertIncludes(page, "js/live-board/board-engine.js", "Board engine script");
  assertIncludes(page, "js/live-board/provider.js", "Provider boundary script");
  assert(!page.includes("id=\"liveBoardInput\""), "secondary Live Board page must not include a separate chat input");
  assert(!page.includes("id=\"liveBoardChatLog\""), "secondary Live Board page must not include a separate chat log");

  const unsafePatterns = [/\beval\s*\(/, /new\s+Function\s*\(/, /VITE_[A-Z0-9_]*KEY/, /OPENAI_API_KEY/];
  for (const file of scripts.concat(["js/live-board/board-engine.js", "js/live-board/app.js", "js/live-board/chat-panel.js"])) {
    const source = read(file);
    for (const pattern of unsafePatterns) {
      assert(!pattern.test(source), `${file} contains unsafe pattern ${pattern}`);
    }
  }

  const sandbox = {
    window: { setTimeout },
    console
  };
  sandbox.window.window = sandbox.window;
  for (const file of scripts) {
    vm.runInNewContext(read(file), sandbox, { filename: file });
  }

  const LB = sandbox.window.TutorlyLiveBoard;
  assert(LB, "TutorlyLiveBoard namespace not created");
  assert.strictEqual(LB.validateCommand({ type: "runJavascript", code: "alert(1)" }).ok, false);
  assert.strictEqual(LB.validateLesson({ title: "Bad visual", visualMode: "diagram", steps: [] }).ok, false);

  const graph = LB.GraphEngine.parseExpression("y = x² - 4");
  assert(graph && graph.kind === "quadratic", "quadratic superscript graph was not parsed");
  assert.strictEqual(LB.GraphEngine.parseExpression("sin(x)"), null, "unsupported expression should not be silently replaced");

  const graphLesson = await LB.generateLesson({ prompt: "Graph y = x² - 4" });
  assert.strictEqual(graphLesson.visualMode, "graph");
  assert(LB.validateLesson(graphLesson).ok, "graph lesson invalid");

  const geometryLesson = await LB.generateLesson({ prompt: "Construct a perpendicular bisector" });
  assert.strictEqual(geometryLesson.visualMode, "geometry");
  assert(LB.validateLesson(geometryLesson).ok, "geometry lesson invalid");

  const diagramLesson = await LB.generateLesson({ prompt: "Show forces acting on a block on a table" });
  assert.strictEqual(diagramLesson.visualMode, "diagram");
  assert(LB.validateLesson(diagramLesson).ok, "diagram lesson invalid");

  const noVisual = await LB.generateLesson({ prompt: "What is 5 + 7?" });
  assert.strictEqual(noVisual.visualMode, "none");
  assert(LB.validateLesson(noVisual).ok, "fallback text lesson invalid");

  const followUp = await LB.generateLesson({
    prompt: "Highlight the vertex",
    currentLesson: graphLesson,
    compactBoardState: { stepIndex: 1 },
    followUp: true
  });
  assert.strictEqual(followUp.visualMode, "graph");
  assert(followUp.steps.some((step) => step.title === "Follow-up focus"), "follow-up did not preserve the existing lesson");

  console.log("Live Board checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
