(function () {
  if (window.TutorlyReasoningStatus) return;

  const SEQUENCES = Object.freeze({
    math: Object.freeze(["Analyzing", "Formulating", "Verifying", "Refining"]),
    writing: Object.freeze(["Interpreting", "Structuring", "Refining", "Reviewing"]),
    concept: Object.freeze(["Assessing", "Clarifying", "Structuring", "Refining"]),
    deep: Object.freeze(["Analyzing", "Evaluating", "Synthesizing", "Verifying"]),
    general: Object.freeze(["Analyzing", "Assessing", "Refining"])
  });
  const ROTATION_DELAYS = Object.freeze([1900, 2150, 1800, 2250]);
  const activeStatuses = new Map();

  function normalized(value) {
    return String(value || "").trim().toLowerCase();
  }

  function unwrapContext(options = {}) {
    const context = options.context || {};
    const route = options.semanticRoute
      || context.semanticRoute
      || context.classification
      || options.classification
      || {};
    return {
      prompt: String(options.prompt || context.studentQuestion || context.message || ""),
      model: normalized(options.model || context.model || context.mode?.id),
      subject: normalized(options.subject || route.subject),
      intent: normalized(options.intent || route.intent),
      responseType: normalized(options.responseType || route.response_type || route.responseType),
      mode: normalized(options.mode || context.mode?.id || context.mode),
      hasImage: !!(options.hasImage || context.hasImage)
    };
  }

  function inferCategory(options = {}) {
    const meta = unwrapContext(options);
    const combinedIntent = `${meta.intent} ${meta.responseType}`;

    if (meta.model === "deep" || meta.mode === "deep" || /advanced_reasoning|deep_solve/.test(combinedIntent)) {
      return "deep";
    }
    if (/math|mathematics|algebra|geometry|trigonometry|calculus|statistics|probability/.test(meta.subject)) {
      return "math";
    }
    if (/english|language|literature|writing/.test(meta.subject)
      || /writing|grammar|literature|poetry|vocabulary|editing/.test(combinedIntent)
      || meta.model === "creative" || meta.mode === "creative") {
      return "writing";
    }
    if (/definition|concept|explanation|why_question|how_question|summarize/.test(combinedIntent)) {
      return "concept";
    }

    // These hints affect presentation only. They never route the AI request or
    // alter its prompt, and the general sequence remains the safe fallback.
    if (/(?:\d+|\b[a-z])\s*(?:=|\+|\*|\/|\^|[−-])\s*(?:\d+|[a-z]\b)|√\s*\d+|\b(?:solve|calculate|factor|differentiate|integrate)\b/i.test(meta.prompt)) {
      return "math";
    }
    if (/\b(?:write|rewrite|essay|paragraph|speech|letter|grammar|sentence|poem|metaphor)\b/i.test(meta.prompt)) {
      return "writing";
    }
    if (/^\s*(?:what|why|how|explain|define|describe)\b/i.test(meta.prompt) || meta.hasImage) {
      return "concept";
    }
    return "general";
  }

  function sequenceFor(options = {}) {
    return SEQUENCES[inferCategory(options)] || SEQUENCES.general;
  }

  function clearTimer(timer) {
    if (timer) window.clearTimeout(timer);
  }

  function stop(message, options = {}) {
    const controller = activeStatuses.get(message);
    if (!controller) return;
    controller.stopped = true;
    clearTimer(controller.rotationTimer);
    clearTimer(controller.transitionTimer);
    activeStatuses.delete(message);
    message?.classList?.remove("reasoning-active");
    if (message?.dataset) delete message.dataset.reasoningPreserve;
    if (options.remove !== false) controller.shell?.remove();
  }

  function stopAll(options = {}) {
    Array.from(activeStatuses.keys()).forEach((message) => stop(message, options));
  }

  function start(message, options = {}) {
    if (!message) return null;
    stop(message);
    const content = message.querySelector?.(".bot-content");
    if (!content) return null;

    const sequence = sequenceFor(options);
    const shell = document.createElement("span");
    shell.className = "reasoning-status-shell";

    const visual = document.createElement("span");
    visual.className = "reasoning-status-visual";
    visual.setAttribute("aria-hidden", "true");

    const pulse = document.createElement("span");
    pulse.className = "reasoning-status-pulse";

    const word = document.createElement("span");
    word.className = "reasoning-status-word";
    word.textContent = sequence[0];

    const ellipsis = document.createElement("span");
    ellipsis.className = "reasoning-status-ellipsis";
    ellipsis.textContent = "…";

    const announcement = document.createElement("span");
    announcement.className = "sr-only reasoning-status-announcement";
    announcement.setAttribute("role", "status");
    announcement.setAttribute("aria-live", "polite");
    announcement.textContent = "Tutorly is preparing a response.";

    visual.append(pulse, word, ellipsis);
    shell.append(visual, announcement);
    content.replaceChildren(shell);
    message.classList.add("reasoning-active");
    if (options.preserveMessage) message.dataset.reasoningPreserve = "true";

    const controller = {
      shell,
      visual,
      word,
      sequence,
      index: 0,
      rotationTimer: null,
      transitionTimer: null,
      reducedMotion: !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches,
      stopped: false
    };
    activeStatuses.set(message, controller);

    const schedule = () => {
      if (controller.stopped || !message.isConnected) {
        stop(message);
        return;
      }
      const delay = ROTATION_DELAYS[controller.index % ROTATION_DELAYS.length];
      controller.rotationTimer = window.setTimeout(changeWord, delay);
    };

    const changeWord = () => {
      if (controller.stopped) return;
      controller.index = (controller.index + 1) % controller.sequence.length;
      if (controller.reducedMotion) {
        controller.word.textContent = controller.sequence[controller.index];
        schedule();
        return;
      }
      controller.visual.classList.add("is-changing");
      controller.transitionTimer = window.setTimeout(() => {
        if (controller.stopped) return;
        controller.word.textContent = controller.sequence[controller.index];
        controller.visual.classList.remove("is-changing");
        schedule();
      }, 170);
    };

    schedule();
    return controller;
  }

  window.TutorlyReasoningStatus = Object.freeze({
    inferCategory,
    sequenceFor,
    start,
    stop,
    stopAll
  });
})();
