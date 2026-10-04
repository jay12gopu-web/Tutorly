"use strict";
// Exercise the real auth client with isolated API responses, never real credentials.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "js/auth-client.js"), "utf8");

(async () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
  let profile, failure;
  const requests = [];
  const window = {location: {hostname: "127.0.0.1", port: "8000", origin: "http://127.0.0.1:8000"}, dispatchEvent() {}};
  vm.runInNewContext(source, {
    window, localStorage: storage, sessionStorage: {}, CustomEvent: class {},
    fetch: async (url, options) => {
      requests.push({url, options});
      if (failure) throw failure;
      return {ok: true, json: async () => profile};
    },
  });
  const auth = window.TutorlyAuth;
  const completed = role => ({authenticated: true, onboarding_required: false, role_selection_required: false,
    user: {id: role, role, full_name: "Saved " + role, email: role + "@example.test", age: 14,
      grade: "9", board: "CBSE", school: "Saved school", onboarding_completed: true,
      ...(role === "teacher" ? {teacher_profile: {subjects: ["Science"], boards: ["CBSE"], verification_status: "pending"}} : {})}});
  let checks = 0;
  for (const role of ["student", "teacher"]) {
    profile = completed(role);
    auth.saveSession({...profile, session_token: "isolated-session-" + role});
    auth.clearSession();
    assert.equal(storage.getItem("tutorly_session_token"), null);
    // Simulates a subsequent successful authentication with no local profile cache.
    auth.saveSession({authenticated: true, session_token: "returning-test-session", user: {id: role}});
    const restored = await auth.currentUser();
    assert.equal(restored.user.full_name, profile.user.full_name);
    assert.equal(storage.getItem("tutorly_name"), profile.user.full_name);
    assert.equal(storage.getItem("tutorly_age"), "14");
    assert.equal(storage.getItem("tutorly_grade"), "9");
    assert.equal(storage.getItem("tutorly_board"), "CBSE");
    assert.equal(storage.getItem("tutorly_school"), "Saved school");
    assert.equal(await auth.authenticatedDestination(restored), role === "teacher" ? "teacher-workspace.html" : "maths_gpt.html");
    assert.equal(requests.at(-1).options.headers.Authorization, "Bearer returning-test-session");
    checks++;
  }
  profile = {authenticated: true, onboarding_required: true, role_selection_required: true,
    user: {id: "new", role: "student", onboarding_completed: false}};
  assert.equal(await auth.authenticatedDestination(await auth.currentUser()), "info.html");
  checks++;
  // Account switching must not carry another person's saved name/board into setup.
  assert.equal(storage.getItem("tutorly_name"), null);
  assert.equal(storage.getItem("tutorly_board"), null);
  assert.equal(storage.getItem("tutorly_teacher_profile"), null);
  checks++;
  failure = new Error("isolated network failure");
  await assert.rejects(auth.authenticatedDestination(), /unavailable/);
  checks++;
  const entry = fs.readFileSync(path.join(root, "js/auth-entry.js"), "utf8");
  const onboarding = fs.readFileSync(path.join(root, "js/onboarding.js"), "utf8");
  assert.match(entry, /const profile = await auth.currentUser\(\)/);
  assert.match(entry, /auth.authenticatedDestination\(profile\)/);
  assert.match(onboarding, /payload.onboarding_required === false \|\| payload.user.onboarding_completed === true/);
  assert.match(onboarding, /TutorlyAuth.completeOnboarding\(payload\)/);
  assert.match(onboarding, /Your answers are still here; please try again/);
  checks++;
  console.log(`PASS: ${checks} auth profile restore checks: saved students/teachers skip setup, new profiles use the dedicated page, account caches remain isolated, network failures do not route to onboarding.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
