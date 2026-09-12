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
  const chatLog = document.getElementById("liveBoardChatLog");
  const input = document.getElementById("liveBoardInput");
  const send = document.getElementById("liveBoardSend");
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
    const stored = readJson(CONTEXT_KEY, {});
    return {
      prompt: params.get("prompt") || stored.prompt || "Show me a visual lesson",
      conversationId: params.get("conversationId") || stored.conversationId || "",
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

  function addChat(role, copy) {
    if (!chatLog) return;
    const item = document.createElement("article");
    item.className = `lb-chat-message ${role}`;
    item.textContent = copy;
    chatLog.appendChild(item);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  async function generate(prompt, options = {}) {
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
    }
  }

  function stopPlayback() {
    playing = false;
    window.clearInterval(playTimer);
    playTimer = null;
    if (play) play.textContent = "Play";
  }

  function startPlayback() {
    if (!currentLesson) return;
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
    tryToggle.textContent = active ? "Return to Lesson" : "Let Me Try";
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

  async function submitFollowUp() {
    const prompt = String(input?.value || "").trim();
    if (!prompt) return;
    input.value = "";
    addChat("student", prompt);
    addChat("tutorly", "Got it. I’ll update the board using the same lesson context.");
    context.chatContext = [...(context.chatContext || []), { role: "student", content: prompt }].slice(-10);
    await generate(prompt, { followUp: true });
  }

  send?.addEventListener("click", submitFollowUp);
  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitFollowUp();
    }
  });

  window.addEventListener("pagehide", stopPlayback);

  addChat("tutorly", context.prompt
    ? `I opened a Live Board for: ${context.prompt}`
    : "Ask a visual follow-up and I’ll update the board.");
  if (context.reply) addChat("tutorly", String(context.reply).slice(0, 260));
  generate(context.prompt);
})();
