const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const htmlFiles = fs.readdirSync(root).filter((file) => file.endsWith(".html"));
const activePages = htmlFiles.filter((file) => ![
  "index.html",
  "home.html",
  "teach_home.html",
  "teacher_info.html",
  "teacher_location.html",
  "teacher_verification.html"
].includes(file));

for (const file of htmlFiles) {
  const source = read(file);
  assert(/<meta\s+charset="UTF-8"/i.test(source), `${file} must declare UTF-8`);
  assert(/<title>Tutorly<\/title>/i.test(source), `${file} must use the Tutorly title`);
  const inlineScripts = [...source.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => !/type=["'](?:application\/(?:ld\+)?json|importmap|module)["']/i.test(match[1]));
  inlineScripts.forEach((match, index) => {
    try {
      new Function(match[2]);
    } catch (error) {
      throw new Error(`${file} inline script ${index + 1} has invalid syntax: ${error.message}`);
    }
  });
}

for (const file of activePages) {
  const source = read(file);
  assert(source.includes("css/tutorly-theme.css"), `${file} must load the shared Tutorly theme`);
  assert(source.includes("family=Inter"), `${file} must load Inter`);
  assert(/data-tutorly-surface="(public|auth|workspace)"/.test(source), `${file} must declare its Tutorly surface`);
}

const theme = read("css/tutorly-theme.css");
for (const variable of [
  "--tutorly-blue", "--tutorly-blue-dark", "--tutorly-violet", "--tutorly-cyan",
  "--tutorly-bg-dark", "--tutorly-bg-light", "--tutorly-surface", "--tutorly-text",
  "--tutorly-muted", "--tutorly-border"
]) {
  assert(theme.includes(variable), `Missing shared theme variable ${variable}`);
}
assert(theme.includes("--tutorly-page-duration: 270ms"), "Page motion must use 270ms");
assert(theme.includes("--tutorly-panel-duration: 200ms"), "Panel motion must use 200ms");
assert(theme.includes("--tutorly-button-duration: 170ms"), "Button motion must use 170ms");
assert(theme.includes("--tutorly-sidebar-duration: 220ms"), "Sidebar motion must use 220ms");
assert(theme.includes("prefers-reduced-motion: reduce"), "Reduced motion must be supported");
for (const width of ["1024px", "768px", "390px"]) {
  assert(theme.includes(width), `Shared theme must include the ${width} responsive checkpoint`);
}

const allText = [
  ...htmlFiles.map(read),
  read("frontend/subscription/subscription.js"),
  read("js/tutor-pages.js")
].join("\n");
for (const bad of ["Opening Tutorly", "Questions Solved", "Students Helped", "â‚¹", "Ã—", "+840 this month", "+4.2% improved", "+91 12345 67890", "<span>??</span>"]) {
  assert(!allText.includes(bad), `Removed placeholder/corrupted content returned: ${bad}`);
}

const welcome = read("welcome.html");
assert(welcome.includes('rel="canonical" href="https://mytutor.co.in/"'), "Landing canonical domain is missing");
assert(welcome.includes('href="https://mytutor.co.in/">mytutor.co.in</a>'), "Landing domain link is missing");
for (const trustLabel of ["Multi-subject support", "24/7 AI tutor", "Adaptive explanations", "Visual learning support"]) {
  assert(welcome.includes(trustLabel), `Landing trust indicator missing: ${trustLabel}`);
}
assert(welcome.includes("+ English, Civics, Economics, Computer Science and more"), "Landing subject expansion line is missing");

const signup = read("sign_up.html");
assert(!signup.includes('id="phone"'), "Phone must not be required during initial signup");
assert(!signup.includes('id="dateOfBirth"'), "Date of birth must not be required during initial signup");

const login = read("login.html");
assert(login.includes("Enter your email and password."), "Password-mode copy is missing");
assert(login.includes("We'll send a 6-digit code to your email."), "OTP-mode copy is missing");
assert(login.includes("if (loginMode === 'otp')"), "OTP must only open for OTP mode");

const contact = read("contact.html");
assert(contact.includes("mailto:jay12.gopu@gmail.com"), "Support email link is missing");
assert(contact.includes('href="https://mytutor.co.in/">mytutor.co.in</a>'), "Support website link is missing");
assert(!/Phone<\/strong>|Hours<\/strong>|Location<\/strong>/.test(contact), "Unsupported contact details must be omitted");

const envExample = read(".env.example");
assert(envExample.includes("APP_ORIGIN=https://mytutor.co.in"), "Production app origin must use the public domain");
assert(envExample.includes("TUTORLY_ALLOWED_ORIGINS=https://mytutor.co.in"), "FastAPI origin list must include the public domain");
const appSource = read("js/app.js");
assert(appSource.includes('return "https://tutorly-api.onrender.com"'), "Production chat API must use the deployed Tutorly backend");

const subscriptions = read("subscriptions.html");
assert(subscriptions.includes("₹499<small>/month</small>"), "Plus price encoding is incorrect");
assert(subscriptions.includes("₹999<small>/month</small>"), "Pro price encoding is incorrect");
assert((subscriptions.match(/class="current-pill"[^>]+hidden/g) || []).length === 3, "All current-plan badges must start hidden");
const subscriptionJs = read("frontend/subscription/subscription.js");
assert(subscriptionJs.includes('pill.hidden = pill.getAttribute("data-current-for") !== currentPlan'), "Current plan badge must be data-driven");
assert(subscriptionJs.includes('button.textContent = "Current plan"'), "Current plan button state must be data-driven");

const profile = read("profile.html");
for (const emptyState of ["Complete your first test to unlock performance insights.", "No learning activity yet.", "No academic reports yet"]) {
  assert(profile.includes(emptyState), `Profile empty state missing: ${emptyState}`);
}
for (const storageKey of ["tutorly_exam_history", "tutorly_lesson_progress", "tutorly_chatbot_history_v1"]) {
  assert(profile.includes(storageKey), `Profile must read real ${storageKey} data`);
}

console.log("Tutorly shared design, copy, profile, billing, encoding, and responsive static checks passed.");
