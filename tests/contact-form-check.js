'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const contact = require('../js/contact.js');
const valid = { name: 'Jay', email: 'jay@example.com', phone: '', topic: 'Bug Report', message: 'The page does not load.' };
let checks = 0;
function check(label, fn) { fn(); checks += 1; console.log(`PASS ${label}`); }

check('required fields and supported topic are validated', () => {
  assert.deepEqual(contact.validateFields(valid), {});
  assert.deepEqual(Object.keys(contact.validateFields({})), ['name', 'email', 'topic', 'message']);
  assert.ok(contact.validateFields({ ...valid, topic: '<script>bad</script>' }).topic);
  assert.ok(contact.validateFields({ ...valid, email: 'not an email' }).email);
  assert.ok(contact.validateFields({ ...valid, email: 'a\nb@example.com' }).email);
  assert.ok(contact.validateFields({ ...valid, name: 'Jay\r\nBcc: somebody' }).name);
  assert.ok(contact.validateFields({ ...valid, name: 'a'.repeat(81) }).name);
  assert.ok(contact.validateFields({ ...valid, message: 'a'.repeat(2001) }).message);
});
check('phone is optional and accepts only plausible international numbers', () => {
  ['', '+91 98765 43210', '(020) 1234-5678'].forEach(phone => assert.equal(contact.validateFields({ ...valid, phone }).phone, undefined));
  ['123', '1234567890123456', 'CALL ME', '++919876543210', '12+345678'].forEach(phone => assert.ok(contact.validateFields({ ...valid, phone }).phone));
});
check('attachment type, size and empty-file conditions', () => {
  assert.equal(contact.validateAttachment(null), '');
  assert.equal(contact.validateAttachment({ name: 'Homework.JPG', type: 'image/jpeg', size: contact.MAX_ATTACHMENT_BYTES }), '');
  assert.equal(contact.validateAttachment({ name: 'worksheet.pdf', type: 'application/pdf', size: 500 }), '');
  assert.equal(contact.validateAttachment({ name: 'screenshot.png', type: '', size: 500 }), '');
  assert.ok(contact.validateAttachment({ name: 'empty.png', type: 'image/png', size: 0 }));
  assert.ok(contact.validateAttachment({ name: 'large.png', type: 'image/png', size: contact.MAX_ATTACHMENT_BYTES + 1 }));
  assert.ok(contact.validateAttachment({ name: 'script.png.exe', type: 'image/png', size: 500 }));
  assert.ok(contact.validateAttachment({ name: 'script.png', type: 'text/html', size: 500 }));
  assert.ok(contact.validateAttachment({ name: 'photo.gif', type: 'image/gif', size: 500 }));
});
check('bug prefill is allowlisted rather than arbitrary query insertion', () => {
  assert.equal(contact.requestedTopic('?topic=bug'), 'Bug Report');
  assert.equal(contact.requestedTopic('?topic=%3Cscript%3E'), '');
  assert.equal(contact.requestedTopic('?topic=Subscriptions'), '');
  assert.equal(contact.requestedTopic(''), '');
});
check('email draft encodes user input and labels manual attachment honestly', () => {
  assert.equal(contact.SUPPORT_EMAIL, 'support@tutorly.co.in');
  const values = { ...valid, name: 'Jay & Jo', phone: '+91 98765 43210', message: 'Q1? <tag> & hello\nReply in తెలుగు. #help' };
  const file = { name: '<homework>&question.pdf' };
  const url = new URL(contact.mailtoUrl(values, file));
  assert.equal(url.pathname, contact.SUPPORT_EMAIL);
  assert.equal(url.searchParams.get('subject'), 'Tutorly support: Bug Report');
  assert.equal(url.searchParams.get('body'), contact.draftText(values, file));
  assert.equal(Array.from(url.searchParams.keys()).length, 2);
  assert.match(url.searchParams.get('body'), /Phone \(optional\): \+91/);
  assert.match(url.searchParams.get('body'), /Attachment to add manually:/);
  assert.doesNotMatch(contact.draftText(valid), /Phone|Attachment/);
});
check('no fake delivery, uploads, tracking or private-data storage in contact script', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/contact.js'), 'utf8');
  assert.doesNotMatch(source, /\balert\s*\(|\bfetch\s*\(|XMLHttpRequest|localStorage\.setItem|sessionStorage\.setItem|console\./);
  assert.doesNotMatch(source, /successfully sent|successfully submitted|has been uploaded/i);
  assert.match(source, /Email draft requested\. Review it and press Send in your email app\./);
  assert.match(source, /attachmentName\.textContent/);
  assert.match(source, /manualCopy\.value = text/);
  assert.match(source, /clipboard\.writeText/);
  assert.match(source, /aria-invalid/);
});
console.log(`Contact form checks: ${checks} passed.`);
