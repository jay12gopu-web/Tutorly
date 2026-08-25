(function () {
  if (window.TutorlyReasoningStatus) return;

  const activeStatuses = new Map();
  const STAGE_WORDS = Object.freeze({
    analyzing: "Analyzing",
    assessing: "Assessing",
    interpreting: "Interpreting",
    evaluating: "Evaluating",
    structuring: "Structuring",
    formulating: "Formulating",
    refining: "Refining",
    clarifying: "Clarifying",
    verifying: "Verifying",
    synthesizing: "Synthesizing",
    reviewing: "Reviewing",
    processing: "Processing"
  });

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
      model: normalized(options.model || context.model || context.mode?.id),
      subject: normalized(options.subject || route.subject),
      intent: normalized(options.intent || route.intent),
      responseType: normalized(options.responseType || route.response_type || route.responseType),
      mode: normalized(options.mode || context.mode?.id || context.mode),
      hasImage: !!(options.hasImage || context.hasImage),
      regenerate: !!options.preserveMessage
    };
  }

  function inferCategory(options = {}) {
    const meta = unwrapContext(options);
    const intent = `${meta.intent} ${meta.responseType}`;

    if (meta.regenerate) return "refining";
    if (meta.hasImage) return "interpreting";
    if (meta.model === "deep" || meta.mode === "deep" || /advanced_reasoning|deep_solve/.test(intent)) return "evaluating";
    if (/writing|grammar|literature|poetry|vocabulary|editing/.test(intent)) return "interpreting";
    if (/definition|concept|explanation|why_question|how_question|summarize/.test(intent)) return "assessing";
    if (/math|mathematics|algebra|geometry|trigonometry|calculus|statistics|probability/.test(meta.subject)) return "analyzing";
    return "analyzing";
  }

  function wordFor(stage, options = {}) {
    const normalizedStage = normalized(stage);
    if (!normalizedStage || normalizedStage === "request") {
      return STAGE_WORDS[inferCategory(options)] || STAGE_WORDS.analyzing;
    }
    return STAGE_WORDS[normalizedStage] || STAGE_WORDS.processing;
  }

  function applyWord(controller, nextWord) {
    if (!controller || controller.stopped || controller.word.textContent === nextWord) return;
    controller.word.textContent = nextWord;
    controller.shell.dataset.reasoningStage = normalized(nextWord);
    // The live region announces the initial cue once. It is intentionally not
    // updated for later application stages, avoiding repetitive announcements.
  }

  function stop(message, options = {}) {
    const controller = activeStatuses.get(message);
    if (!controller) return;
    controller.stopped = true;
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

    const initialWord = wordFor("request", options);
    const shell = document.createElement("span");
    shell.className = "reasoning-status-shell";
    shell.dataset.reasoningStage = normalized(initialWord);

    const visual = document.createElement("span");
    visual.className = "reasoning-status-visual";
    visual.setAttribute("aria-hidden", "true");

    const pulse = document.createElement("span");
    pulse.className = "reasoning-status-pulse";

    const word = document.createElement("span");
    word.className = "reasoning-status-word";
    word.textContent = initialWord;

    const ellipsis = document.createElement("span");
    ellipsis.className = "reasoning-status-ellipsis";
    ellipsis.textContent = "…";

    const announcement = document.createElement("span");
    announcement.className = "sr-only reasoning-status-announcement";
    announcement.setAttribute("role", "status");
    announcement.setAttribute("aria-live", "polite");
    announcement.textContent = `${initialWord}…`;

    visual.append(pulse, word, ellipsis);
    shell.append(visual, announcement);
    content.replaceChildren(shell);
    message.classList.add("reasoning-active");
    if (options.preserveMessage) message.dataset.reasoningPreserve = "true";

    const controller = { shell, word, stopped: false, options };
    activeStatuses.set(message, controller);
    return controller;
  }

  function setStage(message, stage) {
    const controller = activeStatuses.get(message);
    if (!controller) return null;
    applyWord(controller, wordFor(stage, controller.options));
    return controller;
  }

  window.TutorlyReasoningStatus = Object.freeze({
    inferCategory,
    wordFor,
    start,
    setStage,
    stop,
    stopAll
  });
})();
