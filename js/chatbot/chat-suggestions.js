(function (root) {
  "use strict";
  if (!root || root.TutorlyChatSuggestions) return;

  // Only capabilities already supported in Tutorly appear in the new-chat UI.
  // A future integration needs a working adapter and approved icon before activation.
  const registry = Object.freeze([
    { id: "notes", plugin: "tutorly", icon: "notes", label: "Make notes", prompt: "Make concise revision notes about ", status: "available", action: "prefill" },
    { id: "essay", plugin: "tutorly", icon: "writing", label: "Write an essay", prompt: "Help me write an essay about ", status: "available", action: "prefill" },
    { id: "study-plan", plugin: "tutorly", icon: "calendar", label: "Plan my study", prompt: "Help me plan my study time for ", status: "available", action: "prefill" },
    { id: "graph", plugin: "tutorly-live-board", icon: "graph", label: "Graph an equation", prompt: "Graph ", status: "available", action: "prefill" },
    { id: "revision", plugin: "tutorly", icon: "revision", label: "Quiz me", prompt: "Quiz me one question at a time on ", status: "available", action: "prefill" },
    { id: "presentation", plugin: "tutorly", icon: "presentation", label: "Presentation outline", prompt: "Create a slide-by-slide presentation outline about ", status: "available", action: "prefill" },
    ...["notion", "canva", "google-docs", "youtube", "google-classroom", "google-calendar", "google-drive", "desmos"].map(id => ({ id, plugin: id, status: "unavailable", action: null, icon: null }))
  ].map(item => Object.freeze(item)));
  const storageKey = "tutorly_chat_suggestions_v1";
  let previous = [];
  let current = null;

  function available() {
    return registry.filter(item => item.status === "available" && item.action === "prefill");
  }

  function combination(items) {
    return items.map(item => typeof item === "string" ? item : item.id).sort().join("|");
  }

  // Pure selection boundary; future contextual ranking belongs here, not in the UI.
  function select(options = {}) {
    const pool = available();
    const requested = Number(options.count);
    const count = Number.isFinite(requested) ? Math.max(1, Math.min(pool.length, Math.floor(requested))) : 3;
    const random = typeof options.random === "function" ? options.random : Math.random;
    for (let index = pool.length - 1; index > 0; index -= 1) {
      const value = Number(random());
      const bounded = Number.isFinite(value) ? Math.max(0, Math.min(0.999999, value)) : 0;
      const other = Math.floor(bounded * (index + 1));
      [pool[index], pool[other]] = [pool[other], pool[index]];
    }
    const selected = pool.slice(0, count);
    const last = Array.isArray(options.previous) ? options.previous : [];
    if (pool.length > count && combination(selected) === combination(last)) {
      selected[selected.length - 1] = pool[count];
    }
    return selected;
  }

  function readPrevious() {
    try {
      const saved = JSON.parse(root.sessionStorage.getItem(storageKey) || "null");
      const ids = new Set(available().map(item => item.id));
      if (Array.isArray(saved)) previous = saved.filter(id => typeof id === "string" && ids.has(id)).slice(0, ids.size);
    } catch (_) { /* Private browsing/storage restrictions must not break chat. */ }
    return previous;
  }

  function chooseNext() {
    current = select({ previous: readPrevious() });
    previous = current.map(item => item.id);
    try { root.sessionStorage.setItem(storageKey, JSON.stringify(previous)); } catch (_) { /* In-memory rotation remains available. */ }
    return current;
  }

  function createIcon(doc, name) {
    // Locally bundled Tabler assets; no third-party image requests.
    const icon = doc.createElement("img");
    const file = { notes: "notes", writing: "pencil", calendar: "calendar-time", graph: "chart-line", revision: "refresh", presentation: "presentation", youtube: "brand-youtube" }[name] || "notes";
    icon.src = `assets/chat-icons/${file}.svg`;
    icon.alt = "";
    icon.width = 20;
    icon.height = 20;
    return icon;
  }

  function render(container, options = {}) {
    if (!container || !container.ownerDocument) return [];
    const selected = current || chooseNext();
    const doc = container.ownerDocument;
    const buttons = selected.map(item => {
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "chat-suggestion";
      button.setAttribute("data-suggestion-id", item.id);
      const icon = doc.createElement("span");
      icon.className = "chat-suggestion-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.appendChild(createIcon(doc, item.icon));
      const label = doc.createElement("span");
      label.className = "chat-suggestion-label";
      label.textContent = item.label;
      button.appendChild(icon);
      button.appendChild(label);
      button.addEventListener("click", () => {
        if (typeof options.onSelect === "function") options.onSelect(item.prompt, item);
      });
      return button;
    });
    container.replaceChildren(...buttons);
    return selected.slice();
  }

  function rotate(container, options = {}) {
    chooseNext();
    return render(container, options);
  }

  root.TutorlyChatSuggestions = Object.freeze({ registry, available, select, render, rotate });
})(typeof window !== "undefined" ? window : null);
