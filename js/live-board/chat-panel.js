(function () {
  "use strict";

  const LB = window.TutorlyLiveBoard;
  if (!LB?.BoardEngine) return;

  const panel = document.getElementById("chatLiveBoardPanel");
  const stage = document.getElementById("chatLiveBoardStage");
  const status = document.getElementById("chatLiveBoardStatus");
  const title = document.getElementById("chatLiveBoardTitle");
  const summary = document.getElementById("chatLiveBoardSummary");
  const stepLabel = document.getElementById("chatLiveBoardStepLabel");
  const stepTitle = document.getElementById("chatLiveBoardStepTitle");
  const stepText = document.getElementById("chatLiveBoardStepText");
  const stepHint = document.getElementById("chatLiveBoardStepHint");
  const studentTools = document.getElementById("chatLiveBoardStudentTools");
  const tryToggle = document.getElementById("chatLiveBoardTryToggle");
  const closeBtn = document.getElementById("chatLiveBoardClose");
  const expandBtn = document.getElementById("chatLiveBoardExpand");
  const resetBtn = document.getElementById("chatLiveBoardResetView");
  const prevBtn = document.getElementById("chatLiveBoardPrev");
  const playBtn = document.getElementById("chatLiveBoardPlay");
  const nextBtn = document.getElementById("chatLiveBoardNext");
  const replayBtn = document.getElementById("chatLiveBoardReplay");
  const mobileBanner = document.getElementById("chatLiveBoardMobileBanner");

  if (!panel || !stage) return;

  const board = new LB.BoardEngine(stage);
  const mobileQuery = window.matchMedia("(max-width: 760px)");
  let currentLesson = null;
  let context = {};
  let pendingMobile = null;
  let playing = false;
  let playTimer = null;
  let requestToken = 0;

  function isMobile() {
    return mobileQuery.matches;
  }

  function setStatus(copy) {
    if (status) status.textContent = copy || "";
  }

  function stopPlayback() {
    playing = false;
    window.clearInterval(playTimer);
    playTimer = null;
    if (playBtn) playBtn.textContent = "Play";
  }

  function renderStep() {
    if (!currentLesson) return;
    const step = currentLesson.steps[board.stepIndex] || currentLesson.steps[0];
    if (!step) return;
    if (stepLabel) stepLabel.textContent = `Step ${board.stepIndex + 1} of ${currentLesson.steps.length}`;
    if (stepTitle) stepTitle.textContent = step.title || "Live Board step";
    if (stepText) stepText.textContent = step.explanation || step.instruction || "";
    if (stepHint) {
      stepHint.hidden = !step.hint;
      stepHint.textContent = step.hint || "";
    }
    if (prevBtn) prevBtn.disabled = board.stepIndex <= 0;
    if (nextBtn) nextBtn.disabled = board.stepIndex >= currentLesson.steps.length - 1;
  }

  function setLesson(lesson) {
    currentLesson = lesson;
    board.setLesson(lesson);
    if (title) title.textContent = lesson.title || "Live Board";
    if (summary) summary.textContent = lesson.summary || "A visual companion to this Tutorly answer.";
    renderStep();
  }

  function showPanel() {
    panel.hidden = false;
    document.body.classList.add("live-board-open");
    if (mobileBanner) mobileBanner.hidden = true;
  }

  function showMobileBanner(copy = "View Live Board") {
    if (!mobileBanner) return;
    mobileBanner.textContent = copy;
    mobileBanner.hidden = false;
  }

  function close(options = {}) {
    stopPlayback();
    panel.hidden = true;
    document.body.classList.remove("live-board-open", "live-board-expanded", "student-work-mode");
    if (tryToggle) {
      tryToggle.textContent = "Let Me Try";
      tryToggle.setAttribute("aria-pressed", "false");
    }
    if (studentTools) studentTools.hidden = true;
    if (!options.keepBanner && mobileBanner) mobileBanner.hidden = true;
  }

  async function generate(nextContext = {}, options = {}) {
    context = { ...context, ...nextContext };
    if (isMobile() && !options.force) {
      pendingMobile = { context, options: { ...options, force: true } };
      showMobileBanner(currentLesson ? "View updated Live Board" : "View Live Board");
      return currentLesson;
    }

    const token = ++requestToken;
    showPanel();
    setStatus("Structuring...");
    try {
      const lesson = await LB.generateLesson({
        ...context,
        currentLesson,
        compactBoardState: board.compactState(),
        followUp: !!options.followUp
      });
      if (token !== requestToken) return currentLesson;
      setLesson(lesson);
      setStatus(lesson.visualMode === "none" ? "No live visual available" : "Ready");
      return lesson;
    } catch (error) {
      if (token !== requestToken) return currentLesson;
      setStatus("Live visual isn't available for this yet.");
      return null;
    }
  }

  function syncContext(nextContext = {}) {
    context = { ...context, ...nextContext };
  }

  function startPlayback() {
    if (!currentLesson) return;
    playing = true;
    if (playBtn) playBtn.textContent = "Pause";
    playTimer = window.setInterval(() => {
      if (board.stepIndex >= currentLesson.steps.length - 1) {
        stopPlayback();
        return;
      }
      board.next();
      renderStep();
    }, 1900);
  }

  prevBtn?.addEventListener("click", () => { stopPlayback(); board.previous(); renderStep(); });
  nextBtn?.addEventListener("click", () => { stopPlayback(); board.next(); renderStep(); });
  replayBtn?.addEventListener("click", () => { stopPlayback(); board.replay(); renderStep(); });
  playBtn?.addEventListener("click", () => playing ? stopPlayback() : startPlayback());
  resetBtn?.addEventListener("click", () => board.resetView());
  closeBtn?.addEventListener("click", () => close({ keepBanner: false }));
  expandBtn?.addEventListener("click", () => {
    const expanded = !document.body.classList.contains("live-board-expanded");
    document.body.classList.toggle("live-board-expanded", expanded);
    expandBtn.setAttribute("aria-pressed", String(expanded));
    expandBtn.textContent = expanded ? "Shrink" : "Expand";
  });
  mobileBanner?.addEventListener("click", () => {
    if (pendingMobile) generate(pendingMobile.context, pendingMobile.options);
    else showPanel();
  });

  tryToggle?.addEventListener("click", () => {
    const active = !document.body.classList.contains("student-work-mode");
    document.body.classList.toggle("student-work-mode", active);
    tryToggle.textContent = active ? "Return to Lesson" : "Let Me Try";
    tryToggle.setAttribute("aria-pressed", String(active));
    if (studentTools) studentTools.hidden = !active;
    board.setTool(active ? "pen" : "select");
  });

  studentTools?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-student-tool], [data-board-action]");
    if (!button) return;
    const action = button.dataset.boardAction;
    if (action === "undo") board.undo();
    else if (action === "redo") board.redo();
    else if (action === "clear") board.clearStudentLayer();
    else if (button.dataset.studentTool) {
      board.setTool(button.dataset.studentTool);
      studentTools.querySelectorAll("[data-student-tool]").forEach((item) => item.classList.toggle("active", item === button));
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) close({ keepBanner: false });
  });
  window.addEventListener("pagehide", stopPlayback);

  window.TutorlyLiveBoardPanel = {
    open: generate,
    syncContext,
    close,
    isOpen: () => !panel.hidden,
    hasLesson: () => !!currentLesson,
    getCurrentLesson: () => currentLesson,
    compactBoardState: () => board.compactState()
  };
})();
