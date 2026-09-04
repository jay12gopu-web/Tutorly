const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const quests = fs.readFileSync(path.join(root, "quests.html"), "utf8");
const questUi = fs.readFileSync(path.join(root, "js", "quests.js"), "utf8");
const questClient = fs.readFileSync(path.join(root, "js", "quest-client.js"), "utf8");
const exams = fs.readFileSync(path.join(root, "js", "exams", "exam-system.js"), "utf8");
const lessons = fs.readFileSync(path.join(root, "js", "lessons", "lesson-module.js"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(!quests.includes("data-complete"), "Quest UI must not expose manual completion controls.");
assert(!quests.includes("tutorly_quests_done"), "Quest progress must not be stored in localStorage.");
assert(!quests.includes("alert("), "Quest UI must not use browser alerts.");
assert(quests.includes("js/quest-client.js") && quests.includes("js/quests.js"), "Quest page must use the authenticated quest client.");
assert(questUi.includes('getQuests()'), "Quest progress must load from the backend.");
assert(questClient.includes('recordQuestEvents'), "Learning events must be sent through the authenticated backend client.");

[
  "practice_question_correct",
  "practice_session_completed",
  "test_completed",
  "topic_mastered",
  "weak_topic_improved"
].forEach((eventName) => assert(exams.includes(eventName), `Exam flow must emit ${eventName}.`));
assert(lessons.includes("lesson_completed"), "Lesson flow must emit lesson_completed.");
assert(questClient.includes("tutorly-quest-toast"), "Quest completion must use the in-app animation.");

console.log("Tutorly automatic quest UI and learning-event wiring checks passed.");
