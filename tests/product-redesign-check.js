'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
let checks = 0;
function check(name, test) { test(); checks++; console.log(`PASS ${name}`); }

check('onboarding uses the existing dedicated page, without a login illustration', () => {
  const html = read('info.html'), css = read('css/onboarding.css');
  assert.match(html, /onboarding-page/);
  assert.doesNotMatch(html, /class="auth-story"/);
  assert.match(html, /js\/onboarding\.js/);
  assert.match(css, /\.onboarding-page \.auth-story\s*\{\s*display:none/);
  assert.match(css, /--width-onboarding,\s*460px/);
  assert.doesNotMatch(read('css/auth-entry.css'), /\.auth-story\s*\{\s*display:none;\s*\}/);
});
check('Inter and Space Grotesk load from bundled, licensed files', () => {
  const css = read('css/tutorly-theme.css');
  for (const font of ['Inter', 'SpaceGrotesk']) {
    assert(fs.statSync(path.join(root, `assets/fonts/${font}.ttf`)).size > 10000);
    assert(fs.existsSync(path.join(root, `assets/fonts/${font}-OFL.txt`)));
    assert(css.includes(`${font}.ttf`));
  }
});
check('Send and Stop occupy the same composer slot; reduced motion is retained', () => {
  const css = read('css/chat-layout.css');
  assert.match(css, /:is\(#voiceBtn,#sendBtn,\.chat-stop-button\)[^{]*\{[^}]*grid-column:5; grid-row:2/);
  assert(css.includes('prefers-reduced-motion:reduce'));
  assert.match(read('js/app.js'), /chat-generating/);
});
check('lesson Bookmark remains visible and secondary tools remain in overflow', () => {
  const html = read('lessons.html');
  assert(html.indexOf('id="bookmarkBtn"') < html.indexOf('<details class="reader-utilities">'));
  assert.match(html, /<details class="reader-utilities">/);
});
check('degree presentation is private, compact and never claims automatic verification', () => {
  assert.match(read('css/onboarding.css'), /:has\(\.degree-file\)/);
  assert.match(read('js/onboarding.js'), /Private · used only for teacher verification · Pending review/);
  assert.match(read('js/onboarding.js'), /degreeReplace/);
  assert.match(read('js/onboarding.js'), /degreeRemove/);
});

class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.attributes = {}; this.dataset = {}; this.events = {}; this.textContent = ''; }
  setAttribute(key, value) { this.attributes[key] = value; }
  append(...children) { this.children.push(...children); }
  addEventListener(name, callback) { this.events[name] = callback; }
  replaceChildren(...children) { this.children = children; }
}
const doc = {createElement: tag => new Node(tag)};
const states = require('../js/ui-state.js');
check('all seven shared states render safely from caller data', () => {
  for (const state of ['loading', 'empty', 'error', 'offline', 'locked', 'demo', 'coming-soon']) {
    const node = states.create({state, title:'<not markup>', message:'Actual caller message', document:doc});
    assert.equal(node.dataset.state, state);
    assert.equal(node.children[0].textContent, '<not markup>');
    assert.equal(node.attributes.role, state === 'error' ? 'alert' : 'status');
    if (state === 'loading') assert.equal(node.attributes['aria-busy'], 'true');
  }
  assert.throws(() => states.create({state:'invented', document:doc}));
});
check('shared state actions invoke the existing caller handler', () => {
  let calls = 0;
  const node = states.create({state:'error', action:{label:'Retry', onClick:()=>calls++}, document:doc});
  node.children[0].events.click();
  assert.equal(calls, 1);
});
check('Help search filters actual articles and restores them on clear', () => {
  const input = new Node('input'), status = new Node('section');
  const articles = ['Account and login', 'Study plans', 'Contact support'].map(text=>Object.assign(new Node('article'), {textContent:text}));
  const context = {document:{getElementById:id=>id==='helpSearch'?input:status,querySelectorAll:()=>articles},window:{TutorlyUIState:{create:options=>states.create({...options,document:doc})}}};
  vm.runInNewContext(read('js/help-search.js'), context);
  input.value = 'STUDY'; input.events.input();
  assert.deepEqual(articles.map(article=>article.hidden), [true,false,true]);
  assert.equal(status.textContent, '1 help article found.');
  input.value = 'unmatched topic'; input.events.input();
  assert.equal(status.children[0].dataset.state, 'empty');
  input.value = ''; input.events.input();
  assert(articles.every(article=>!article.hidden)); assert.equal(status.hidden, true);
});
console.log(`Product redesign: ${checks} checks passed.`);
