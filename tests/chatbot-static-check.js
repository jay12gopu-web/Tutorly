const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");

const scripts = [
  "js/chatbot/chatbot-core.js",
  "js/chatbot/mode-registry.js",
  "js/chatbot/chat-history-store.js",
  "js/chatbot/chat-memory.js",
  "js/chatbot/learning-tools.js",
  "js/chatbot/math-renderer.js",
  "js/chatbot/advanced-math-engine.js",
  "js/chatbot/geography-visuals.js",
  "js/chatbot/english-engine.js",
  "js/chatbot/adaptive-intelligence.js",
  "js/response-engine.js",
  "js/gpt.js",
  "js/chatbot/response-contract.js",
  "js/chatbot/math-response-contract.js",
  "js/app.js"
];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

scripts.forEach((relativePath) => {
  const absolutePath = path.join(root, relativePath);
  assert.ok(fs.existsSync(absolutePath), `${relativePath} should exist`);
  execFileSync(process.execPath, ["--check", absolutePath], { stdio: "pipe" });
});

const html = read("maths_gpt.html");
const expectedOrder = scripts.map((script) => `src="${script.replace(/\\/g, "/")}"`);
let lastIndex = -1;
expectedOrder.forEach((needle) => {
  const index = html.indexOf(needle);
  assert.ok(index >= 0, `maths_gpt.html should load ${needle}`);
  assert.ok(index > lastIndex, `${needle} should load after previous chatbot script`);
  lastIndex = index;
});

["spark", "prime", "lens", "deep", "research", "creative", "study"].forEach((mode) => {
  assert.ok(html.includes(`data-model="${mode}"`), `model option ${mode} should exist`);
});
assert.ok(!html.includes(`data-model="coding"`), "coding model option should not exist");

const gpt = read("js/gpt.js");
[
  "window.TutorlyGPT",
  "createRequestPayload",
  "createReply",
  "recordUserMessage",
  "recordAssistantMessage",
  "listConversations",
  "clearMemory"
].forEach((needle) => {
  assert.ok(gpt.includes(needle), `gpt.js should expose ${needle}`);
});

const mathRenderer = read("js/chatbot/math-renderer.js");
[
  "window.TutorlyMathRenderer",
  "createSparkMarkdown",
  "renderPanel",
  "parseFractionExpression",
  "renderVerticalArithmetic",
  "renderDivision"
].forEach((needle) => {
  assert.ok(mathRenderer.includes(needle), `math-renderer.js should include ${needle}`);
});

const mathContext = { window: {} };
vm.createContext(mathContext);
vm.runInContext(mathRenderer, mathContext);
const addition = mathContext.window.TutorlyMathRenderer.analyze("64 + 88", { model: "spark" });
assert.ok(addition, "math renderer should detect addition");
assert.strictEqual(addition.answer, "152", "64 + 88 should equal 152");
assert.ok(
  mathContext.window.TutorlyMathRenderer.renderPanel(addition).includes("math-carry"),
  "addition panel should render carry indicators"
);
const schoolAddition = mathContext.window.TutorlyMathRenderer.analyze("35 + 39", { model: "spark" });
const schoolAdditionPanel = mathContext.window.TutorlyMathRenderer.renderPanel(schoolAddition);
assert.ok(schoolAdditionPanel.includes("grid-template-columns"), "column arithmetic should use one shared grid");
assert.ok(
  /data-place="tens"[^>]*>1<\/span>/.test(schoolAdditionPanel),
  "35 + 39 carry should sit in the tens column"
);
const algebra = mathContext.window.TutorlyMathRenderer.analyze("solve 21x + 5 = 10", { model: "spark" });
assert.ok(algebra, "math renderer should detect algebra");
assert.strictEqual(algebra.answer, "5/21", "21x + 5 = 10 should solve to 5/21");
assert.ok(
  mathContext.window.TutorlyMathRenderer.createSparkMarkdown("64 + 88").includes("Answer"),
  "Spark math markdown should include final answer"
);

const englishEngine = read("js/chatbot/english-engine.js");
[
  "window.TutorlyEnglishEngine",
  "CATEGORY_DEFINITIONS",
  "literatureSolver",
  "grammarSolver",
  "writingSolver",
  "renderPrime",
  "renderSpark",
  "MIN_LOCAL_CONFIDENCE"
].forEach((needle) => {
  assert.ok(englishEngine.includes(needle), `english-engine.js should include ${needle}`);
});

const englishContext = { window: {} };
vm.createContext(englishContext);
vm.runInContext(englishEngine, englishContext);
const english = englishContext.window.TutorlyEnglishEngine;
assert.ok(english.classify("summarize this passage").category === "summary", "English engine should classify summary prompts");
assert.ok(english.classify("identify the tense of this sentence").category === "tense", "English engine should classify tense prompts");
assert.ok(english.classify("write a formal letter to the principal").category === "writing", "English engine should classify writing prompts");
const primeEnglish = english.getConfidentReply("Explain the theme of the poem", "prime");
assert.ok(primeEnglish.includes("Topic: English"), "Prime English should render the topic");
assert.ok(primeEnglish.includes("Understand the Question"), "Prime English should include teacher structure");
assert.ok(primeEnglish.includes("Identify Given Information"), "Prime English should identify given information");
assert.ok(primeEnglish.includes("Concept or Rule"), "Prime English should explain the rule");
assert.ok(primeEnglish.includes("Common Mistakes"), "Prime English should include common mistakes");
const sparkEnglish = english.getConfidentReply("Give a synonym of brave", "spark");
assert.ok(sparkEnglish.includes("Quick Steps"), "Spark English should render compact teacher steps");
assert.ok(!/undefined|null|\{\}/i.test(primeEnglish + sparkEnglish), "English replies should not leak undefined, null, or raw structures");

const advancedMath = read("js/chatbot/advanced-math-engine.js");
[
  "window.TutorlyAdvancedMath",
  "solveQuadratic",
  "solveCalculus",
  "solveProbability",
  "solveFinancial",
  "solveSystem",
  "solveInequality",
  "solveCoordinateGeometry",
  "solveComplex",
  "solvePowersRootsAndExponents",
  "solveWordProblem",
  "Word Problem Solver",
  "Step 1: Understand the Story",
  "Advanced Math Solution",
  "Verification"
].forEach((needle) => {
  assert.ok(advancedMath.includes(needle), `advanced-math-engine.js should include ${needle}`);
});

const advancedMathContext = { window: {}, Intl };
vm.createContext(advancedMathContext);
vm.runInContext(advancedMath, advancedMathContext);
const quadratic = advancedMathContext.window.TutorlyAdvancedMath.analyze("solve x^2-5x+6=0");
assert.ok(quadratic, "advanced math engine should solve quadratic equations");
assert.strictEqual(quadratic.subtopic, "Quadratic Equation", "quadratic should be classified correctly");
assert.ok(quadratic.finalAnswer.includes("2") && quadratic.finalAnswer.includes("3"), "quadratic roots should include 2 and 3");
const statsReply = advancedMathContext.window.TutorlyAdvancedMath.createResponse("find mean of 2 4 6 8");
assert.ok(statsReply.includes("📚 Topic: Statistics"), "statistics response should include topic section");
assert.ok(statsReply.includes("✅ Verification"), "advanced math response should include verification");
const interest = advancedMathContext.window.TutorlyAdvancedMath.analyze("simple interest 1000 5 2");
assert.ok(interest, "advanced math engine should solve simple interest");
assert.ok(interest.finalAnswer.includes("100"), "simple interest should be 100");
const system = advancedMathContext.window.TutorlyAdvancedMath.analyze("solve 2x+3y=7 and x-y=1");
assert.ok(system, "advanced math engine should solve 2x2 systems");
assert.ok(system.finalAnswer.includes("x = 2") && system.finalAnswer.includes("y = 1"), "system solution should be x=2 y=1");
const inequality = advancedMathContext.window.TutorlyAdvancedMath.analyze("2x + 4 < 10");
assert.ok(inequality, "advanced math engine should solve inequalities");
assert.ok(inequality.finalAnswer.includes("x < 3"), "inequality should solve to x < 3");
const distance = advancedMathContext.window.TutorlyAdvancedMath.analyze("distance between (0,0) and (3,4)");
assert.ok(distance, "advanced math engine should solve coordinate distance");
assert.ok(distance.finalAnswer.includes("5"), "distance should be 5");
const logarithm = advancedMathContext.window.TutorlyAdvancedMath.analyze("log base 2 of 8");
assert.ok(logarithm, "advanced math engine should solve logs");
assert.ok(logarithm.finalAnswer.includes("3"), "log base 2 of 8 should be 3");
const square = advancedMathContext.window.TutorlyAdvancedMath.analyze("square of 12");
assert.ok(square, "advanced math engine should solve squares");
assert.strictEqual(square.subtopic, "Squares", "square should be classified correctly");
assert.ok(square.finalAnswer.includes("144"), "square of 12 should be 144");
const squareRoot = advancedMathContext.window.TutorlyAdvancedMath.analyze("square root of 144");
assert.ok(squareRoot, "advanced math engine should solve square roots");
assert.strictEqual(squareRoot.subtopic, "Square Roots", "square root should be classified correctly");
assert.ok(squareRoot.finalAnswer.includes("12"), "square root of 144 should be 12");
const cube = advancedMathContext.window.TutorlyAdvancedMath.analyze("cube of 5");
assert.ok(cube, "advanced math engine should solve cubes");
assert.strictEqual(cube.subtopic, "Cubes", "cube should be classified correctly");
assert.ok(cube.finalAnswer.includes("125"), "cube of 5 should be 125");
const cubeRoot = advancedMathContext.window.TutorlyAdvancedMath.analyze("cube root of 27");
assert.ok(cubeRoot, "advanced math engine should solve cube roots");
assert.strictEqual(cubeRoot.subtopic, "Cube Roots", "cube root should be classified correctly");
assert.ok(cubeRoot.finalAnswer.includes("3"), "cube root of 27 should be 3");
const exponent = advancedMathContext.window.TutorlyAdvancedMath.analyze("2^5");
assert.ok(exponent, "advanced math engine should solve exponents");
assert.strictEqual(exponent.subtopic, "Exponents", "exponent should be classified correctly");
assert.ok(exponent.finalAnswer.includes("32"), "2^5 should be 32");
const complex = advancedMathContext.window.TutorlyAdvancedMath.analyze("(2+3i)+(4-5i)");
assert.ok(complex, "advanced math engine should simplify complex numbers");
assert.ok(complex.finalAnswer.includes("6 - 2i"), "complex addition should be 6 - 2i");
const speedWord = advancedMathContext.window.TutorlyAdvancedMath.createResponse("A train travels 120 km in 2 hours. What is its speed?");
assert.ok(speedWord.includes("Word Problem Solver"), "word problems should use the story-solving format");
assert.ok(speedWord.includes("speed is 60") || speedWord.includes("Speed = 60"), "speed word problem should solve to 60");
const ratioWord = advancedMathContext.window.TutorlyAdvancedMath.analyze("The ratio of boys to girls is 2:3. There are 50 students in total. Find boys and girls.");
assert.ok(ratioWord, "advanced math engine should solve ratio word problems");
assert.ok(ratioWord.isWordProblem, "ratio story should be marked as a word problem");
assert.ok(ratioWord.finalAnswer.includes("20") && ratioWord.finalAnswer.includes("30"), "ratio split should be 20 and 30");
const discountWord = advancedMathContext.window.TutorlyAdvancedMath.analyze("A shirt has price 1000 and a 20% discount. Find the sale price.");
assert.ok(discountWord, "advanced math engine should solve discount word problems");
assert.ok(discountWord.isWordProblem, "discount story should be marked as a word problem");
assert.ok(discountWord.finalAnswer.includes("800"), "discount sale price should be 800");
const workWord = advancedMathContext.window.TutorlyAdvancedMath.analyze("A can finish work in 6 days and B can finish it in 3 days. How long together?");
assert.ok(workWord, "advanced math engine should solve work word problems");
assert.ok(workWord.finalAnswer.includes("2"), "work problem should solve to 2 days");
const sarahTom = advancedMathContext.window.TutorlyAdvancedMath.analyze("Sarah has three times as many pencils as Tom. Together they have 48 pencils. How many pencils does each person have?");
assert.ok(sarahTom, "advanced math engine should solve multiplicative comparison word problems");
assert.strictEqual(sarahTom.topic, "Math Word Problem", "multiplicative comparison should use Math Word Problem category");
assert.strictEqual(sarahTom.subtopic, "Algebra Word Problem", "Sarah/Tom should be classified as an algebra word problem");
assert.ok(sarahTom.finalAnswer.includes("Tom = 12") && sarahTom.finalAnswer.includes("Sarah = 36"), "Sarah/Tom answer should be Tom=12 and Sarah=36");
assert.ok(Number(sarahTom.confidence) >= 0.9, "clean algebra word problem should be high-confidence local solve");
const gardenQuadratic = advancedMathContext.window.TutorlyAdvancedMath.analyze("A rectangular garden has a length that is 5 meters longer than its width. The area of the garden is 84 square meters. Find the length and width of the garden.");
assert.ok(gardenQuadratic, "rectangular garden area story should route to a geometry word-problem result");
assert.strictEqual(gardenQuadratic.topic, "Math Word Problem", "rectangular garden story should be a math word problem");
assert.strictEqual(gardenQuadratic.subtopic, "Geometry Word Problem", "rectangular garden story should be a geometry word problem");
assert.strictEqual(gardenQuadratic.difficulty, "Quadratic Equation", "rectangular garden story should use quadratic-equation intent");
assert.ok(gardenQuadratic.model.some((line) => line.includes("w^2")), "rectangular garden story should build a quadratic equation");
assert.ok(gardenQuadratic.finalAnswer.includes("Width = 7") && gardenQuadratic.finalAnswer.includes("Length = 12"), "rectangular garden answer should be width 7 and length 12");
assert.notStrictEqual(gardenQuadratic.subtopic, "Squares", "square meters should not route to the Squares solver");

[
  ["age older", "A is 4 years older than B. Their total age is 30 years.", "Age Problems", ["17", "13"]],
  ["age multiplier", "father is 3 times son. Their total age is 48 years.", "Age Problems", ["36", "12"]],
  ["ratio total", "The ratio of boys to girls is 2:3. There are 50 students in total.", "Ratio Problems", ["20", "30"]],
  ["ratio marbles", "The ratio of red to blue is 3:4. There are 56 marbles in total.", "Ratio Problems", ["24", "32"]],
  ["train speed", "A train travels 120 km in 2 hours. What is its speed?", "Speed, Distance, and Time", ["60"]],
  ["car distance", "A car moves at 50 kmph for 4 hours. Find the distance.", "Speed, Distance, and Time", ["200"]],
  ["journey time", "A bus covers 240 km at 80 kmph. Find the time.", "Speed, Distance, and Time", ["3"]],
  ["work rate", "A can finish work in 6 days and B can finish it in 3 days. How long together?", "Work Problems", ["2"]],
  ["work pipes", "One pipe fills a tank in 4 hours and another pipe fills it in 6 hours. How long together?", "Work Problems", ["2.4"]],
  ["profit", "An item is bought for 500 and sold for 650. Find the profit percentage.", "Profit and Loss", ["150", "30"]],
  ["loss", "An item is bought for 800 and sold for 600. Find the loss percentage.", "Profit and Loss", ["200", "25"]],
  ["discount", "A shirt has price 1000 and a 20% discount. Find the sale price.", "Discount Problems", ["800"]],
  ["rectangle area", "A rectangle has length 12 and width 7. Find the area.", "Geometry Word Problems", ["84"]],
  ["rectangle perimeter", "A rectangle has length 10 and width 5. Find the perimeter.", "Geometry Word Problems", ["30"]],
  ["circle area", "A circle has radius 7. Find the area.", "Geometry Word Problems", ["153.938"]],
  ["triangle area", "A triangle has base 10 and height 8. Find the area.", "Geometry Word Problems", ["40"]],
  ["algebra twice", "Twice a number plus 5 is 21. Find the number.", "Algebraic Word Problems", ["8"]],
  ["algebra comparison", "Maya has twice as many books as Ravi. Together they have 45 books. How many books does each person have?", "Algebra Word Problem", ["Ravi = 15", "Maya = 30"]],
  ["probability", "A bag has 4 red balls and 6 blue balls. Find the probability of red.", "Probability Word Problems", ["2/5", "0.4"]],
  ["simple interest", "Principal 5000 rate 6% time 3 years. Find simple interest.", "Simple Interest", ["900", "5,900"]]
].forEach(([label, question, subtopic, needles]) => {
  const result = advancedMathContext.window.TutorlyAdvancedMath.analyze(question);
  assert.ok(result, `${label} should produce a word-problem result`);
  assert.ok(result.isWordProblem, `${label} should be marked as a word problem`);
  assert.strictEqual(result.subtopic, subtopic, `${label} should classify as ${subtopic}`);
  needles.forEach((needle) => {
    assert.ok(result.finalAnswer.includes(needle), `${label} final answer should include ${needle}`);
  });
});

const geography = read("js/chatbot/geography-visuals.js");
[
  "window.TutorlyGeography",
  "registerProvider",
  "openstreetmap",
  "educationalSvg",
  "buildLearningLevels",
  "renderPanel",
  "hydrate"
].forEach((needle) => {
  assert.ok(geography.includes(needle), `geography-visuals.js should include ${needle}`);
});

const geographyContext = {
  window: {},
  localStorage: {
    getItem() {
      return null;
    },
    setItem() {}
  }
};
vm.createContext(geographyContext);
vm.runInContext(geography, geographyContext);
const hyderabad = geographyContext.window.TutorlyGeography.analyze("Where is Hyderabad located?", { model: "prime" });
assert.ok(hyderabad, "geography module should detect Hyderabad");
assert.ok(hyderabad.hierarchy.includes("Telangana"), "Hyderabad hierarchy should include Telangana");
assert.strictEqual(hyderabad.levels[0].label, "Telangana", "city maps should start at state/local close-up level");
assert.ok(hyderabad.levels[0].span <= 4.5, "Hyderabad first map should be close enough for Telangana");
const pune = geographyContext.window.TutorlyGeography.analyze("Where is Pune located?", { model: "prime" });
assert.ok(pune, "geography module should detect Pune");
assert.strictEqual(pune.levels[0].label, "Maharashtra", "Pune should start at Maharashtra close-up level");
const vizag = geographyContext.window.TutorlyGeography.analyze("Where is Vizag located?", { model: "prime" });
assert.ok(vizag, "geography module should detect Vizag alias");
assert.strictEqual(vizag.place.name, "Visakhapatnam", "Vizag should resolve to Visakhapatnam");
assert.strictEqual(vizag.levels[0].label, "Andhra Pradesh", "Vizag should start at Andhra Pradesh close-up level");
const bhubaneswar = geographyContext.window.TutorlyGeography.analyze("Where is bubenaeshwar located?", { model: "prime" });
assert.ok(bhubaneswar, "geography module should tolerate Bhubaneswar misspelling");
assert.strictEqual(bhubaneswar.levels[0].label, "Odisha", "Bhubaneswar should start at Odisha close-up level");
const telangana = geographyContext.window.TutorlyGeography.analyze("Where is Telangana located?", { model: "prime" });
assert.ok(telangana, "geography module should detect Telangana");
assert.strictEqual(telangana.levels[0].label, "India", "state maps should start at country level");
const maharashtra = geographyContext.window.TutorlyGeography.analyze("Where is Maharashtra located?", { model: "prime" });
assert.ok(maharashtra, "geography module should detect Maharashtra");
assert.strictEqual(maharashtra.place.type, "state", "Maharashtra should resolve as a state");
assert.strictEqual(maharashtra.levels[0].label, "India", "Maharashtra map should start at India level");
assert.strictEqual(maharashtra.levels[1].label, "Maharashtra", "Maharashtra map should zoom into the state second");
const odisha = geographyContext.window.TutorlyGeography.analyze("Where is Orissa located?", { model: "prime" });
assert.ok(odisha, "geography module should detect Odisha alias Orissa");
assert.strictEqual(odisha.place.name, "Odisha", "Orissa should resolve to Odisha");
const uttarPradesh = geographyContext.window.TutorlyGeography.analyze("Where is Uttar Pradesh located?", { model: "prime" });
assert.ok(uttarPradesh, "geography module should detect Uttar Pradesh");
assert.strictEqual(uttarPradesh.levels[0].label, "India", "Uttar Pradesh map should start at India level");
const brazil = geographyContext.window.TutorlyGeography.analyze("Which continent is Brazil in?", { model: "spark" });
assert.ok(brazil, "geography module should detect Brazil");
assert.strictEqual(brazil.place.continent, "South America", "Brazil should resolve to South America");
assert.strictEqual(brazil.levels[0].label, "World", "country maps should still start at world level");
const hyderabadPanel = geographyContext.window.TutorlyGeography.renderPanel(hyderabad);
assert.ok(!hyderabadPanel.includes("geo-map-toolbar"), "geography panel should not render map control chips");
assert.ok(!hyderabadPanel.includes("Key Facts"), "geography panel should not render Key Facts");

const responseContract = read("js/chatbot/response-contract.js");
[
  "window.TutorlyResponseContract",
  "normalizeTutorResponse",
  "isValidTutorResponse",
  "fallbackToPrime",
  "fromAdvancedMathResult",
  "fromMarkdown",
  "inferGivenInfo",
  "inferConceptRule",
  "inferCommonMistakes",
  "toSpark",
  "renderTutorResponse",
  "createTutorResponseMarkdown"
].forEach((needle) => {
  assert.ok(responseContract.includes(needle), `response-contract.js should include ${needle}`);
});

const contractContext = { window: {} };
vm.createContext(contractContext);
vm.runInContext(responseContract, contractContext);
const contract = contractContext.window.TutorlyResponseContract;
const normalizedMissing = contract.normalizeTutorResponse({
  mode: "spark",
  topic: "Math",
  understanding: "Solve the expression.",
  solution: "4",
  finalAnswer: "4",
  confidence: 1
});
assert.ok(Array.isArray(normalizedMissing.steps), "normalizer should safely create a steps array");
assert.strictEqual(normalizedMissing.steps.length, 0, "normalizer should safely create an empty steps array");
assert.ok(Array.isArray(normalizedMissing.equations), "normalizer should safely create an equations array");
assert.strictEqual(normalizedMissing.equations.length, 0, "normalizer should safely create an empty equations array");
assert.strictEqual(contract.isValidTutorResponse(normalizedMissing), false, "missing steps should fail validation");
const recovered = contract.fallbackToPrime(normalizedMissing, "2 + 2 = 4");
assert.ok(contract.isValidTutorResponse(recovered), "fallbackToPrime should recover a render-safe response");
const contractMath = contract.fromAdvancedMathResult(sarahTom, { mode: "prime" });
assert.ok(contract.isValidTutorResponse(contractMath), "advanced math results should convert to valid TutorResponse objects");
assert.ok(contractMath.finalAnswer.includes("Tom = 12"), "contract should preserve math final answers");
const sparkMarkdown = contract.createTutorResponseMarkdown(
  {
    mode: "prime",
    topic: "Math",
    understanding: "Use the shortest clean method.",
    steps: ["Set the variable.", "Build the equation.", "Solve it.", "Check it."],
    equations: ["x + 3x = 48"],
    solution: "x = 12, 3x = 36",
    finalAnswer: "Tom = 12, Sarah = 36",
    confidence: 0.96
  },
  { mode: "spark" }
);
assert.ok(sparkMarkdown.includes("Final answer"), "contract renderer should include the final answer");
assert.ok(sparkMarkdown.includes("Understand the Question"), "contract renderer should include teacher structure");
assert.ok(sparkMarkdown.includes("Identify Given Information"), "contract renderer should identify given information");
assert.ok(sparkMarkdown.includes("Concept or Rule"), "contract renderer should explain the concept or rule");
assert.ok(sparkMarkdown.includes("Common Mistakes"), "contract renderer should include common mistakes");
assert.ok((sparkMarkdown.match(/^\d+\./gm) || []).length <= 3, "Spark contract output should use at most 3 steps");

const mathResponseContract = read("js/chatbot/math-response-contract.js");
[
  "window.TutorlyMathResponseContract",
  "normalizeMathResponse",
  "isValidMathResponse",
  "fallbackToPrime",
  "fromAdvancedMathResult",
  "toSpark",
  "renderMathResponse",
  "createMathResponseMarkdown"
].forEach((needle) => {
  assert.ok(mathResponseContract.includes(needle), `math-response-contract.js should include ${needle}`);
});

const mathContractContext = { window: {} };
vm.createContext(mathContractContext);
vm.runInContext(mathResponseContract, mathContractContext);
const mathContract = mathContractContext.window.TutorlyMathResponseContract;
const incompleteMath = mathContract.normalizeMathResponse({
  final_answer: "Tom = 12",
  confidence: 1
});
assert.strictEqual(incompleteMath.topic, "math_word_problem", "math responses should normalize to the strict word-problem topic");
assert.ok(Array.isArray(incompleteMath.given), "math normalizer should always create given array");
assert.ok(Array.isArray(incompleteMath.unknowns), "math normalizer should always create unknowns array");
assert.ok(Array.isArray(incompleteMath.setup.equations), "math normalizer should always create setup.equations array");
assert.ok(Array.isArray(incompleteMath.solve_steps), "math normalizer should always create solve_steps array");
assert.strictEqual(mathContract.isValidMathResponse(incompleteMath), false, "missing math fields should fail validation");
const mathFallback = mathContract.fallbackToPrime(incompleteMath, "", {
  question: "Sarah has three times as many pencils as Tom. Together they have 48 pencils."
});
assert.ok(mathContract.isValidMathResponse(mathFallback), "fallbackToPrime should recover a render-safe MathResponse");
const structuredSarahTom = mathContract.fromAdvancedMathResult(sarahTom, { confidence: 0.96 });
assert.ok(mathContract.isValidMathResponse(structuredSarahTom), "advanced math word problems should become valid MathResponse objects");
assert.ok(structuredSarahTom.given.length > 0, "MathResponse should preserve given values");
assert.ok(structuredSarahTom.unknowns.length > 0, "MathResponse should preserve unknown values");
assert.ok(structuredSarahTom.setup.equations.length > 0, "MathResponse should preserve equation setup");
assert.ok(structuredSarahTom.final_answer.includes("Tom = 12"), "MathResponse should preserve final answer");
const sparkMath = mathContract.toSpark(structuredSarahTom);
assert.ok(mathContract.isValidMathResponse(sparkMath), "Spark math compression should remain valid");
assert.ok(sparkMath.solve_steps.length <= 3, "Spark math should use max 3 solve steps");
assert.ok(sparkMath.setup.equations.length <= 1, "Spark math should keep a compact equation setup");
const mathMarkdown = mathContract.renderMathResponse(structuredSarahTom);
assert.ok(mathMarkdown.includes("math-learning-flow"), "math renderer should output the interactive learning flow");
assert.ok(mathMarkdown.includes("data-tutorly-math-response"), "math renderer should mark trusted math response HTML");
assert.ok(mathMarkdown.includes("Prime learning mode"), "Prime math should identify learning mode");
assert.ok(mathMarkdown.includes("Understand the Problem"), "Prime math should include an Understand the Problem card");
assert.ok(mathMarkdown.includes("Given Information"), "math renderer should include a Given card");
assert.ok(mathMarkdown.includes("Unknowns"), "math renderer should include an Unknowns card");
assert.ok(mathMarkdown.includes("Equation Setup"), "math renderer should include equation setup cards");
assert.ok(mathMarkdown.includes("Step-by-Step Solution"), "Prime math should render individual step cards");
assert.ok(mathMarkdown.includes("math-equation-line"), "math renderer should render equations as dedicated cards");
assert.ok(mathMarkdown.includes("Practice Challenge"), "math renderer should include a practice challenge card");
assert.ok(mathMarkdown.includes("Learn More"), "Prime math should include a collapsible learn-more card");
assert.ok(mathMarkdown.includes("Final Answer"), "math renderer should include final answer");
const sparkMathMarkup = mathContract.renderMathResponse(sparkMath, { mode: "spark" });
assert.ok(sparkMathMarkup.includes('data-mode="spark"'), "Spark math should render as spark mode");
assert.ok(sparkMathMarkup.includes("Spark fast answer"), "Spark math should identify fast answer mode");
assert.ok(sparkMathMarkup.includes("Quick Solve"), "Spark math should render a quick solve card");
assert.ok(sparkMathMarkup.includes("Mini Check"), "Spark math should include a compact mini-check card");
assert.ok((sparkMathMarkup.match(/math-learn-card/g) || []).length <= 3, "Spark math should render at most 3 learning cards");

const app = read("js/app.js");
assert.ok(app.includes("window.TutorlyGPT"), "app.js should consume the GPT facade");
assert.ok(app.includes("window.TutorlyResponseContract"), "app.js should consume the TutorResponse contract");
assert.ok(app.includes("window.TutorlyMathResponseContract"), "app.js should consume the MathResponse contract");
assert.ok(app.includes("normalizeReplyForRender"), "app.js should normalize every reply before rendering");
assert.ok(app.includes("normalizeMathReplyForRender"), "app.js should normalize math word-problem replies before rendering");
assert.ok(app.includes("createTutorResponseMarkdown"), "app.js should render through the TutorResponse contract");
assert.ok(app.includes("createMathResponseMarkdown"), "app.js should render math through the MathResponse contract");
assert.ok(app.includes("hydrateMathLearningCards"), "app.js should hydrate interactive math learning cards");
assert.ok(app.includes("data-tutorly-math-response"), "app.js should trust only generated math response HTML");
assert.ok(app.includes("mathWordProblemPattern"), "app.js should include a math word-problem classifier");
assert.ok(app.includes("getMathCategory"), "app.js should expose a dedicated math word-problem category helper");
assert.ok(app.includes("together\\s+(?:they\\s+)?(?:have|has)"), "app.js should route together-have word problems to math");
assert.ok(app.includes("quadratic-word-problem"), "app.js should include a quadratic word-problem intent category");
assert.ok(app.includes("geometry-problem"), "app.js should include a geometry problem intent category");
assert.ok(app.includes("rectangular"), "app.js should route rectangular stories to math word problems");
assert.ok(app.includes("work\\s+rate"), "app.js should route work-rate stories to math word problems");
assert.ok(app.includes("confidenceScore < 0.9"), "app.js should send low-confidence local math to backend fallback");
assert.ok(app.includes("function getChatEndpoint"), "app.js should define a backend chat endpoint helper");
assert.ok(app.includes("async function requestBackendChat"), "app.js should send fallback chat requests to the backend");
assert.ok(app.includes("function getConfidentAdvancedMathReply"), "app.js should use advanced math as a confidence-gated local solver");
assert.ok(app.includes("await getBotReply"), "sendMessage should await async backend/model replies");
assert.ok(!html.includes("js/platform/core.js"), "chatbot page should not depend on unrelated platform scripts");

console.log("Chatbot static checks passed.");
