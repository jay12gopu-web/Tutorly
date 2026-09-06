const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const globalCss = read('css/global-layout.css');
const mobileCss = read('css/mobile-app.css');
const globalJs = read('js/global-layout.js');
const mobileJs = read('js/mobile-app.js');

assert.match(globalCss, /@media \(max-width: 1080px\)/, 'tablet drawer styles must remain active through 1080px');
assert.match(globalCss, /@media \(min-width: 1081px\)/, 'desktop sidebar styles must start after the tablet breakpoint');
const sharedHiddenRule = mobileCss.match(/body\.mt-mobile-app\s+:where\(([^)]*)\)\s*\{\s*display:\s*none\s*!important/);
assert.ok(sharedHiddenRule, 'shared phone-only hidden controls rule must exist');
assert.ok(!sharedHiddenRule[1].includes('.mt-page-drawer'), 'phone styles must not force-hide the page drawer');
assert.ok(!sharedHiddenRule[1].includes('.mt-mobile-menu'), 'phone styles must not force-hide the menu button');

for (const headerClass of ['test-flow-topbar', 'learn-topbar', 'profile-topbar']) {
  assert.ok(globalJs.includes(`header.${headerClass}`), `${headerClass} must receive mobile navigation actions`);
}
assert.ok(globalJs.includes("window.self !== window.top"), 'embedded tools must be detected');
assert.ok(globalJs.includes("if (!isEmbeddedTool) enhanceMobileHeader(current)"), 'embedded tools must not add a second header menu');
assert.ok(mobileJs.includes("if (!isEmbeddedTool) mountBottomNav()"), 'embedded tools must not add a second bottom navigation');
assert.ok(mobileJs.includes("'login.html', 'sign_up.html', 'welcome.html'"), 'auth and public pages must not receive workspace navigation');

for (const item of [
  "label: 'Home', href: 'home.html'",
  "label: 'Learn', href: 'lessons.html'",
  "label: 'AI', href: 'maths_gpt.html'",
  "label: 'Quests', href: 'quests.html'",
  "label: 'Tools', href: 'more-tools.html'"
]) {
  assert.ok(mobileJs.includes(item), `mobile navigation is missing ${item}`);
}
assert.ok(!mobileJs.includes("label: 'Progress', href: 'tests.html'"), 'Tests must not be mislabeled as Progress');

const sharedPages = ['lessons.html', 'tests.html', 'quests.html', 'profile.html'];
for (const file of sharedPages) {
  const html = read(file);
  assert.match(html, /css\/global-layout\.css\?v=responsive-20260905/, `${file} must load the responsive layout CSS`);
  assert.match(html, /js\/global-layout\.js\?v=responsive-20260905b/, `${file} must load the current responsive layout JS`);
  assert.match(html, /js\/mobile-app\.js\?v=responsive-20260905c/, `${file} must load the current phone navigation JS`);
}

console.log('Tutorly phone and tablet navigation checks passed.');
