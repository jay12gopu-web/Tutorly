const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

for (const file of ["leaderboard.html", "ask-doubt.html", "find-tutor.html"]) {
  const source = read(file);
  assert.match(source, /css\/tutorly-theme\.css/, `${file} must reuse Tutorly theme tokens`);
  assert.match(source, /css\/human-tools\.css/, `${file} must share human tools styling`);
  assert.match(source, /data-tutorly-surface="workspace"/, `${file} must be a Tutorly workspace page`);
  assert.match(source, /more-tools\.html/, `${file} must provide natural return navigation`);
}

const moreTools = read("js/more-tools.js");
for (const route of ["leaderboard.html", "ask-doubt.html", "find-tutor.html"]) {
  assert.ok(moreTools.includes(route), `More Tools must link to ${route}`);
}

const leaderboard = read("js/leaderboard.js");
assert.ok(leaderboard.includes("leaderboardData"), "Leaderboard demo data must be isolated");
assert.ok(leaderboard.includes("weekly") && leaderboard.includes("monthly") && leaderboard.includes("allTime"), "Leaderboard periods must be supported");
assert.ok(leaderboard.includes("levels"), "XP level data must be configurable");

const doubts = read("js/ask-doubt.js");
assert.ok(doubts.includes("tutorly_demo_doubts_v1"), "Demo doubts need isolated local persistence");
assert.ok(doubts.includes("demo preview"), "Demo submission must not claim to contact a real tutor");

const tutors = read("js/find-tutor.js");
assert.ok(tutors.includes("tutorData"), "Tutor demo profiles must be isolated");
assert.ok(tutors.includes("GET /api/tutors") && tutors.includes("POST /api/tutor-requests"), "Future tutor API seams must be documented");

console.log("Tutorly leaderboard and human tutor tool checks passed.");
