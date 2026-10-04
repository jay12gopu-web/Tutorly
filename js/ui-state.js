(function (root) {
  'use strict';
  const states = new Set(['loading', 'empty', 'error', 'offline', 'locked', 'demo', 'coming-soon']);
  // Presentation only: callers supply real state and copy; this never infers service status.
  function create({state, title, message, action, document: doc = root.document}) {
    if (!states.has(state)) throw new Error('Unknown Tutorly UI state');
    const node = doc.createElement('section');
    node.className = 'tutorly-state'; node.dataset.state = state;
    node.setAttribute('role', state === 'error' ? 'alert' : 'status');
    if (state === 'loading') node.setAttribute('aria-busy', 'true');
    if (title) { const heading = doc.createElement('h2'); heading.textContent = title; node.append(heading); }
    if (message) { const copy = doc.createElement('p'); copy.textContent = message; node.append(copy); }
    if (action) {
      const button = doc.createElement('button'); button.type = 'button'; button.className = 'tutorly-state-action';
      button.textContent = action.label; button.addEventListener('click', action.onClick); node.append(button);
    }
    return node;
  }
  const api = {create};
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.TutorlyUIState = api;
})(typeof window === 'undefined' ? globalThis : window);
