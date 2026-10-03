(function (root) {
  'use strict';

  const SUPPORT_EMAIL = 'support@tutorly.co.in';
  const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
  const TOPICS = Object.freeze(['Account Help', 'Subscriptions', 'Tutor Support', 'Feedback', 'Bug Report', 'Other']);
  const clean = value => String(value == null ? '' : value).trim();

  function validateFields(values) {
    const errors = {};
    const name = clean(values.name);
    const email = clean(values.email);
    const phone = clean(values.phone);
    const message = clean(values.message);
    if (!name || name.length > 80 || /[\r\n\x00-\x1f]/.test(name)) errors.name = 'Enter your name (up to 80 characters).';
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address.';
    if (phone && (phone.length > 30 || !/^\+?[\d\s().-]+$/.test(phone) || !/^\d{7,15}$/.test(phone.replace(/\D/g, '')))) {
      errors.phone = 'Enter a valid phone number (7–15 digits), or leave this optional field empty.';
    }
    if (!TOPICS.includes(values.topic)) errors.topic = 'Choose a reason for contacting us.';
    if (!message || message.length > 2000) errors.message = 'Enter your message (up to 2,000 characters).';
    return errors;
  }

  function validateAttachment(file) {
    if (!file) return '';
    if (!Number.isFinite(file.size) || file.size <= 0) return 'This file is empty. Choose a JPG, PNG or PDF file.';
    if (file.size > MAX_ATTACHMENT_BYTES) return 'Choose a file no larger than 5 MB.';
    const extension = clean(file.name).split('.').pop().toLowerCase();
    const mimeTypes = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', pdf: 'application/pdf' };
    if (!Object.prototype.hasOwnProperty.call(mimeTypes, extension) || (file.type && file.type.toLowerCase() !== mimeTypes[extension])) {
      return 'Choose a JPG, PNG or PDF file.';
    }
    return '';
  }

  function requestedTopic(search) {
    return new URLSearchParams(search).get('topic') === 'bug' ? 'Bug Report' : '';
  }

  function draftText(values, file) {
    const lines = [`Name: ${clean(values.name)}`, `Email: ${clean(values.email)}`];
    if (clean(values.phone)) lines.push(`Phone (optional): ${clean(values.phone)}`);
    lines.push(`Reason: ${values.topic}`, '', clean(values.message));
    if (file) lines.push('', `Attachment to add manually: ${clean(file.name).replace(/[\r\n\x00-\x1f]/g, ' ')}`);
    return lines.join('\n');
  }

  function mailtoUrl(values, file) {
    return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Tutorly support: ${values.topic}`)}&body=${encodeURIComponent(draftText(values, file))}`;
  }

  function init(document, window) {
    const form = document.getElementById('contactForm');
    if (!form) return;
    const fieldNames = ['name', 'email', 'phone', 'topic', 'message'];
    const fields = Object.fromEntries(fieldNames.map(name => [name, document.getElementById(name)]));
    const attachment = document.getElementById('attachment');
    const status = document.getElementById('contactStatus');
    const attachmentName = document.getElementById('attachmentName');
    const removeAttachment = document.getElementById('removeAttachment');
    const count = document.getElementById('messageCount');
    const fallback = document.getElementById('emailFallback');
    if (fallback) fallback.href = `mailto:${SUPPORT_EMAIL}`;
    let manualCopy = null;

    function say(message) { if (status) status.textContent = message; }
    function values() { return Object.fromEntries(fieldNames.map(name => [name, fields[name] ? fields[name].value : ''])); }
    function file() { return attachment && attachment.files ? attachment.files[0] : null; }
    function showError(name, message) {
      const element = document.getElementById(name);
      const error = document.getElementById(`${name}Error`);
      if (element) {
        if (message) element.setAttribute('aria-invalid', 'true');
        else element.removeAttribute('aria-invalid');
      }
      if (error) error.textContent = message;
    }
    function validate() {
      const errors = validateFields(values());
      fieldNames.forEach(name => showError(name, errors[name] || ''));
      const fileError = validateAttachment(file());
      showError('attachment', fileError);
      const firstError = fieldNames.find(name => errors[name]);
      if (firstError || fileError) {
        say('Please check the highlighted fields. Your message has not been sent.');
        const firstField = firstError ? fields[firstError] : attachment;
        if (firstField) firstField.focus();
        return false;
      }
      return true;
    }
    function updateCount() { if (count) count.textContent = `${fields.message.value.length} / 2,000`; }
    function updateAttachment() {
      if (manualCopy) { manualCopy.remove(); manualCopy = null; }
      const selected = file();
      if (attachmentName) attachmentName.textContent = selected ? selected.name : '';
      if (removeAttachment) removeAttachment.hidden = !selected;
      const error = validateAttachment(selected);
      showError('attachment', error);
      if (selected && !error) say('File selected on this device only. Attach it manually when your email draft opens.');
      else if (error) say(error);
      else say('Attachment removed.');
    }

    fieldNames.forEach(name => {
      const field = fields[name];
      if (!field) return;
      field.addEventListener('input', () => {
        if (field.getAttribute('aria-invalid') === 'true') showError(name, validateFields(values())[name] || '');
        if (name === 'message') updateCount();
        if (manualCopy) { manualCopy.remove(); manualCopy = null; }
      });
    });
    if (attachment) attachment.addEventListener('change', updateAttachment);
    if (removeAttachment) removeAttachment.addEventListener('click', () => {
      attachment.value = '';
      updateAttachment();
      attachment.focus();
    });
    const topic = requestedTopic(window.location.search);
    if (topic) {
      fields.topic.value = topic;
      fields.message.placeholder = 'What went wrong? What were you trying to do? Include the page name and any useful details.';
    }
    updateCount();

    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!validate()) return;
      try {
        window.location.href = mailtoUrl(values(), file());
        say('Email draft requested. Review it and press Send in your email app.' + (file() ? ' Attach your selected file manually; it has not been uploaded.' : '') + ' If no email app opens, use Copy message or the email link below.');
      } catch (_) {
        say('Your email app could not be opened. Your message is still here. Use Copy message or the email link below.');
      }
    });

    const copy = document.getElementById('copyMessage');
    if (copy) copy.addEventListener('click', async () => {
      if (!validate()) return;
      const text = draftText(values(), file());
      try {
        if (!window.isSecureContext || !window.navigator.clipboard || !window.navigator.clipboard.writeText) throw new Error('Clipboard unavailable');
        await window.navigator.clipboard.writeText(text);
        say('Message copied. Paste it into an email to ' + SUPPORT_EMAIL + '.' + (file() ? ' Attach your selected file manually.' : ''));
      } catch (_) {
        if (!manualCopy) {
          manualCopy = document.createElement('textarea');
          manualCopy.id = 'contactCopyFallback';
          manualCopy.className = 'contact-copy-fallback';
          manualCopy.readOnly = true;
          manualCopy.rows = 6;
          manualCopy.setAttribute('aria-label', 'Email message ready to select and copy');
          form.appendChild(manualCopy);
        }
        manualCopy.value = text;
        manualCopy.focus();
        manualCopy.select();
        say('Automatic copying is unavailable. Copy the selected text below using your device’s Copy command, then paste it into your email app.');
      }
    });

    let theme = '';
    try { theme = window.localStorage.getItem('tutorly_theme') || ''; } catch (_) { /* Storage is optional. */ }
    if (theme !== 'light' && theme !== 'dark') theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.body.setAttribute('data-theme', theme);
  }

  const helpers = Object.freeze({ SUPPORT_EMAIL, MAX_ATTACHMENT_BYTES, TOPICS, validateFields, validateAttachment, requestedTopic, draftText, mailtoUrl });
  if (typeof module !== 'undefined' && module.exports) module.exports = helpers;
  if (root && root.document) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', () => init(root.document, root), { once: true });
    else init(root.document, root);
  }
})(typeof window !== 'undefined' ? window : null);
