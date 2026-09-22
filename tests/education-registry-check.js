"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const createRegistry = require("../js/education-registry.js");
const snapshot = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/education-registry.json"), "utf8"));

async function run() {
  let checks = 0;
  function check(label, fn) { fn(); checks += 1; console.log(`PASS ${label}`); }
  const registry = createRegistry({ data: structuredClone(snapshot) });
  assert.throws(() => registry.searchBoards("CBSE"), /Load TutorlyEducation/);
  const data = await registry.load();

  check("central data has 31 boards / programmes and 29 subject preferences", () => {
    assert.equal(data.boards.length, 31);
    assert.equal(data.subjects.length, 29);
  });
  check("all boards have official sources, normalized IDs and distinct curriculum values", () => {
    const ids = new Set();
    const values = new Set();
    data.boards.forEach((board) => {
      assert.match(board.id, /^[a-z][a-z-]+$/);
      assert.ok(!ids.has(board.id)); ids.add(board.id);
      assert.match(board.curriculumValue, /^[A-Z][A-Z_]+$/);
      assert.ok(!values.has(board.curriculumValue)); values.add(board.curriculumValue);
      assert.ok(board.name && board.shortName && board.type && Array.isArray(board.aliases));
      assert.ok(board.sourceUrls.length);
      board.sourceUrls.forEach((url) => assert.equal(new URL(url).protocol, "https:"));
    });
  });
  check("CBSE aliases resolve to existing curriculum value", () => {
    ["CBSE", "cbse", "NCERT", "CBSE / NCERT", "Central Board", "Central Board of Secondary Education"].forEach((alias) => assert.equal(registry.board(alias).curriculumValue, "CBSE"));
  });
  check("ICSE and ISC resolve to CISCE, not duplicate boards", () => {
    ["ICSE", "ISC", "CISCE"].forEach((alias) => assert.equal(registry.board(alias).id, "cisce"));
  });
  check("state aliases and normalized stored values round-trip", () => {
    ["Telangana", "TS", "TG", "Telangana State Board", "TELANGANA"].forEach((alias) => assert.equal(registry.board(alias).id, "telangana"));
    ["Tamil Nadu", "TAMIL_NADU", "tamil-nadu"].forEach((alias) => assert.equal(registry.board(alias).id, "tamil-nadu"));
    assert.equal(registry.board("Kerala").id, "kerala");
  });
  check("search matches abbreviations, official names, states and aliases", () => {
    ["CBSE", "Central Board", "Telangana", "TS", "Andhra", "AP", "Kerala", "Maharashtra", "Karnataka", "Tamil Nadu"].forEach((term) => assert.ok(registry.searchBoards(term).length, term));
    assert.equal(registry.searchBoards("TS")[0].id, "telangana");
    assert.equal(registry.searchBoards("secondary central")[0].id, "cbse");
    assert.equal(registry.searchBoards("  Central   Board  ")[0].id, "cbse");
  });
  check("secondary and intermediate authorities remain distinct", () => {
    assert.deepEqual(registry.searchBoards("Telangana").map((entry) => entry.id).sort(), ["telangana", "telangana-intermediate"]);
    assert.notEqual(registry.board("TSBIE").curriculumValue, registry.board("TS").curriculumValue);
  });
  check("historical aliases map to current Assam and Karnataka names", () => {
    assert.equal(registry.board("KSEEB").shortName, "KSEAB");
    assert.equal(registry.board("AHSEC").shortName, "ASSEB");
    assert.equal(registry.board("SEBA").shortName, "ASSEB");
  });
  check("legacy IB and Cambridge profile choices remain supported", () => {
    assert.equal(registry.board("IB").curriculumValue, "IB");
    assert.equal(registry.board("Cambridge").curriculumValue, "CAMBRIDGE");
    assert.equal(registry.board("IGCSE").id, "cambridge");
  });
  check("unknown or empty input does not invent a board", () => {
    assert.equal(registry.board("State Board"), null);
    assert.equal(registry.board(""), null);
    assert.equal(registry.board("made up board"), null);
    assert.deepEqual(registry.searchBoards("made up board"), []);
    assert.equal(registry.searchBoards("").length, data.boards.length);
  });
  check("subject aliases use one preference source", () => {
    assert.equal(registry.searchSubjects("Maths")[0].name, "Mathematics");
    assert.equal(registry.searchSubjects("CS")[0].name, "Computer Science");
    assert.equal(registry.searchSubjects("SST")[0].name, "Social Science");
    assert.ok(registry.searchSubjects("Hindi").length);
  });
  check("no curriculum chapters, availability flags, or affiliation claims in choices", () => {
    data.boards.forEach((entry) => {
      ["chapters", "topics", "available", "verified", "curriculumAvailable"].forEach((key) => assert.ok(!(key in entry)));
    });
  });
  check("registry cannot be accidentally modified by a selector", () => {
    assert.throws(() => data.boards.push({}), TypeError);
    assert.throws(() => { data.boards[0].name = "Changed"; }, TypeError);
    const results = registry.searchBoards(""); results.pop();
    assert.equal(data.boards.length, 31);
  });
  let fetches = 0;
  const remote = createRegistry({ fetch: async () => { fetches += 1; return { ok: true, json: async () => structuredClone(snapshot) }; } });
  const values = await Promise.all([remote.load(), remote.load(), remote.load()]);
  check("concurrent load shares a single request and cached result", () => {
    assert.equal(fetches, 1); assert.equal(values[0], values[1]); assert.equal(values[1], values[2]);
  });
  let attempts = 0;
  const retry = createRegistry({ fetch: async () => ({ ok: ++attempts > 1, json: async () => structuredClone(snapshot) }) });
  await assert.rejects(retry.load(), /retry/);
  await retry.load();
  check("failed fetch can retry", () => assert.equal(attempts, 2));
  const broken = createRegistry({ data: { boards: [{ id: "x" }], subjects: [] } });
  await assert.rejects(broken.load(), /Invalid education registry/);
  check("invalid registry does not silently return an empty selector", () => assert.throws(() => broken.searchBoards(""), /Load/));
  let browserUrl = "";
  const browser = { fetch: async (url) => { browserUrl = url; return { ok: true, json: async () => structuredClone(snapshot) }; } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../js/education-registry.js"), "utf8"), { window: browser, URL, document: { currentScript: { src: "https://tutorly.example/subpath/js/education-registry.js" } } });
  await browser.TutorlyEducation.load();
  check("browser fetch resolves relative to script without assuming root hosting", () => assert.equal(browserUrl, "https://tutorly.example/subpath/data/education-registry.json"));
  console.log(`Education registry: ${checks} checks passed.`);
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
