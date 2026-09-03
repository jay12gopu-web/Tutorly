const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const html = read("profile.html");
const script = read("js/profile-hub.js");
const style = read("css/profile-hub.css");
const app = read("js/app.js");

for (const section of ["profile", "personalization", "voice", "billing", "usage", "security", "privacy", "account"]) {
  assert(html.includes(`data-settings-panel="${section}"`), `Missing ${section} profile section`);
}
for (const voice of ["miles", "theo", "leo", "ethan", "aria", "clara", "luna", "nova"]) {
  assert(read("shared/tutorly-voice-agents.json").includes(`"key": "${voice}"`), `Missing ${voice} voice`);
}
for (const key of ["teaching_style", "answer_detail", "learning_approach", "use_examples", "show_diagrams", "show_formulas", "suggest_follow_ups", "quick_answers", "language"]) {
  assert(script.includes(key), `Profile UI does not persist ${key}`);
  assert(app.includes(key), `Chat request does not include ${key}`);
}
for (const storageKey of ["tutorly_exam_history", "tutorly_lesson_progress", "tutorly_chatbot_history_v1"]) {
  assert(script.includes(storageKey), `Profile activity must read ${storageKey}`);
}
assert(style.includes("@media (max-width: 760px)"), "Profile hub mobile layout is missing");
assert(style.includes("[data-theme=\"dark\"]"), "Profile hub dark theme is missing");
assert(html.includes("Save personalization") && html.includes("Save voice settings"), "Settings save actions are missing");
assert(!html.includes("32%"), "Profile hub must not use demo progress values");

console.log("Tutorly profile hub structure, preferences, voice reuse, activity, and responsive styling checks passed.");
