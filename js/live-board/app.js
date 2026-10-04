(function () {
  "use strict";

  const LB = window.TutorlyLiveBoard;
  const CONTEXT_KEY = "tutorly_live_board_context_v1";
  const SESSION_KEY = "tutorly_live_board_session_v1";

  const stage = document.getElementById("liveBoardStage");
  const title = document.getElementById("liveBoardTitle");
  const summary = document.getElementById("liveBoardSummary");
  const stepLabel = document.getElementById("liveBoardStepLabel");
  const stepTitle = document.getElementById("liveBoardStepTitle");
  const stepText = document.getElementById("liveBoardStepText");
  const stepHint = document.getElementById("liveBoardStepHint");
  const topicForm = document.getElementById("liveBoardTopicForm");
  const input = document.getElementById("liveBoardTopic");
  const send = document.getElementById("liveBoardGenerate");
  const status = document.getElementById("liveBoardStatus");
  const panel = document.getElementById("liveBoardPanel");
  const panelToggle = document.getElementById("liveBoardPanelToggle");
  const tryToggle = document.getElementById("liveBoardTryToggle");
  const studentTools = document.getElementById("studentTools");
  const prev = document.getElementById("liveBoardPrev");
  const play = document.getElementById("liveBoardPlay");
  const next = document.getElementById("liveBoardNext");
  const replay = document.getElementById("liveBoardReplay");
  const resetView = document.getElementById("liveBoardResetView");
  const backToChat = document.getElementById("liveBoardBackToChat");

  if (!stage || !LB?.BoardEngine) return;

  let currentLesson = null;
  let context = readContext();
  let playing = false;
  let playTimer = null;
  let generating = false;
  const board = new LB.BoardEngine(stage, { onStudentChange: persistSession });

  function readJson(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) {}
  }

  function readContext() {
    const params = new URLSearchParams(window.location.search);
    const saved = readJson(CONTEXT_KEY, {});
    const conversationId = params.get("conversationId") || "";
    // A standalone topic must not inherit another conversation's route or reply.
    const stored = conversationId && conversationId === saved.conversationId ? saved : {};
    return {
      prompt: params.get("prompt") || (params.get("conversationId") ? stored.prompt : '') || '',
      conversationId,
      messageId: stored.messageId || "",
      semanticRoute: stored.semanticRoute || null,
      reply: stored.reply || "",
      chatContext: stored.chatContext || [],
      openedAt: stored.openedAt || Date.now()
    };
  }

  function persistSession() {
    writeJson(SESSION_KEY, {
      lessonId: currentLesson?.id || "",
      conversationId: context.conversationId || "",
      compactBoardState: board.compactState(),
      updatedAt: Date.now()
    });
  }

  function setStatus(copy) {
    if (status) status.textContent = copy || "";
  }

  function setLesson(lesson) {
    currentLesson = lesson;
    board.setLesson(lesson);
    renderLessonCopy();
    renderStep();
    persistSession();
  }

  function renderLessonCopy() {
    if (!currentLesson) return;
    if (title) title.textContent = currentLesson.title;
    if (summary) summary.textContent = currentLesson.summary;
    if (backToChat) {
      backToChat.href = currentLesson.context?.conversationId
        ? `maths_gpt.html?conversationId=${encodeURIComponent(currentLesson.context.conversationId)}`
        : "maths_gpt.html";
    }
    document.body.classList.toggle("no-live-visual", currentLesson.visualMode === "none");
    [play, replay, tryToggle, resetView].forEach(button => { if (button) button.disabled = currentLesson.visualMode === "none"; });
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
    if (prev) prev.disabled = board.stepIndex <= 0;
    if (next) next.disabled = board.stepIndex >= currentLesson.steps.length - 1;
  }

  async function generate(prompt, options = {}) {
    if (generating) return null;
    generating = true;
    stopPlayback();
    if (send) send.disabled = true;
    topicForm?.setAttribute("aria-busy", "true");
    setStatus("Structuring the board...");
    try {
      const validatedLesson = await LB.generateLesson({
        prompt,
        conversationId: context.conversationId,
        semanticRoute: context.semanticRoute,
        chatContext: context.chatContext,
        currentLesson,
        compactBoardState: board.compactState(),
        followUp: !!options.followUp
      });
      setLesson(validatedLesson);
      setStatus(validatedLesson.visualMode === "none" ? "Live visual is not available for this yet." : "Ready");
      return validatedLesson;
    } catch (error) {
      setStatus("Live visual isn't available for this explanation yet.");
      const fallback = LB.validateLesson({
        title: "Tutorly Live Board",
        topic: prompt,
        visualMode: "none",
        summary: "Live visual isn't available for this explanation yet.",
        steps: [{ title: "Text explanation", explanation: "Return to Tutorly chat for the normal answer.", commands: [] }]
      });
      if (fallback.ok) setLesson(fallback.value);
      return null;
    } finally {
      generating = false;
      if (send) send.disabled = false;
      topicForm?.setAttribute("aria-busy", "false");
    }
  }

  function stopPlayback() {
    playing = false;
    window.clearInterval(playTimer);
    playTimer = null;
    if (play) play.textContent = "Play";
  }

  function startPlayback() {
    if (!currentLesson || generating || currentLesson.visualMode === "none") return;
    if (board.stepIndex >= currentLesson.steps.length - 1) { board.replay(); renderStep(); }
    playing = true;
    if (play) play.textContent = "Pause";
    playTimer = window.setInterval(() => {
      if (board.stepIndex >= currentLesson.steps.length - 1) {
        stopPlayback();
        return;
      }
      board.next();
      renderStep();
    }, 1900);
  }

  prev?.addEventListener("click", () => { stopPlayback(); board.previous(); renderStep(); });
  next?.addEventListener("click", () => { stopPlayback(); board.next(); renderStep(); });
  replay?.addEventListener("click", () => { stopPlayback(); board.replay(); renderStep(); });
  play?.addEventListener("click", () => playing ? stopPlayback() : startPlayback());
  resetView?.addEventListener("click", () => board.resetView());

  panelToggle?.addEventListener("click", () => {
    document.body.classList.toggle("live-board-panel-collapsed");
    panelToggle.setAttribute("aria-expanded", String(!document.body.classList.contains("live-board-panel-collapsed")));
  });

  tryToggle?.addEventListener("click", () => {
    const active = !document.body.classList.contains("student-work-mode");
    document.body.classList.toggle("student-work-mode", active);
    tryToggle.textContent = active ? "Tutor Mode" : "My Turn";
    tryToggle.setAttribute("aria-pressed", String(active));
    studentTools.hidden = !active;
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

  async function submitTopic(event) {
    event.preventDefault();
    const prompt = String(input?.value || "").trim();
    if (!prompt || generating) return;
    // This is a topic composer, not a second chat. Chat follow-ups remain in Tutorly.
    context.prompt = prompt;
    context.semanticRoute = null;
    await generate(prompt);
  }

  topicForm?.addEventListener("submit", submitTopic);

  window.addEventListener("pagehide", stopPlayback);

  if (context.prompt) { if (input) input.value = context.prompt; generate(context.prompt); }
  else {
    title.textContent = 'What would you like to draw?';
    summary.textContent = 'Enter a supported equation or construction below, or return to Tutorly chat.';
    stepTitle.textContent = 'Start with a topic';
    stepText.textContent = 'Try “Graph y = x^2” or “Construct a perpendicular bisector”. Unsupported diagrams will not be replaced with a misleading drawing.';
    setStatus('Ready for a topic');
    [prev, play, next, replay, tryToggle, resetView].forEach(button => { if (button) button.disabled = true; });
  }
})();
