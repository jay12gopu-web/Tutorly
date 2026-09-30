(function () {
  let materialInput;
  let generating = false;
  const HISTORY_KEY = "tutorly_exam_history";
  const MASTERY_KEY = "tutorly_chapter_mastery";
  const WEAK_AREAS_KEY = "tutorly_weak_areas";

  const MODE_CONFIG = {
    practice: {
      label: "Quick Check",
      description: "Short and focused for a fast revision session.",
      counts: [5, 10, 15, 20],
      defaultCount: 10,
      times: ["No Limit", "5 Minutes", "10 Minutes", "15 Minutes", "Custom"],
      defaultDifficulty: "Easy",
      hints: true,
      instant: true
    },
    chapter: {
      label: "Topic Test",
      description: "Balanced coverage of your uploaded study material.",
      counts: [10, 15, 20, 30, 40],
      defaultCount: 20,
      times: ["10 Minutes", "20 Minutes", "30 Minutes", "45 Minutes", "60 Minutes", "Custom"],
      defaultDifficulty: "Moderate",
      hints: false,
      instant: false
    },
    mock: {
      label: "Exam Mode",
      description: "A timed paper that feels closer to a real exam.",
      counts: [15, 20, 30, 40],
      defaultCount: 20,
      times: ["15 Minutes", "30 Minutes", "45 Minutes", "60 Minutes", "90 Minutes", "Custom"],
      defaultDifficulty: "Moderate",
      hints: false,
      instant: false
    },
    rapid: {
      label: "Challenge",
      description: "Harder reasoning with more mixed-concept questions.",
      counts: [10, 15, 20, 30, 40],
      defaultCount: 15,
      times: ["No Limit", "20 Minutes", "30 Minutes", "45 Minutes", "60 Minutes", "Custom"],
      defaultDifficulty: "Hard",
      hints: false,
      instant: false
    }
  };

  const state = {
    profile: null,
    subject: null,
    chapters: [],
    selectedChapters: [],
    mode: "practice",
    settings: {},
    questions: [],
    answers: [],
    index: 0,
    startedAt: 0,
    questionStartedAt: 0,
    timerId: null,
    remainingSeconds: null,
    currentReport: null,
    sessionId: "",
    finished: false,
    difficulty: "Easy",
    includeSubjective: false,
    sourceMaterials: [],
    materialBased: false
  };

  const $ = (id) => document.getElementById(id);
  const readJson = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (_error) { return fallback; }
  };
  const writeJson = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const pct = (num, den) => den ? Math.round((num / den) * 100) : 0;
  const secondsLabel = (seconds) => {
    const clean = Math.max(0, Math.round(seconds || 0));
    const minutes = Math.floor(clean / 60);
    const rest = clean % 60;
    return minutes ? `${minutes}m ${rest}s` : `${rest}s`;
  };
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));

  async function init() {
    const academicProfile = await window.TutorlyCurriculum?.currentProfile?.() || {};
    state.profile = {
      grade: academicProfile.grade || localStorage.getItem("tutorly_grade") || "",
      board: academicProfile.board || localStorage.getItem("tutorly_board") || "",
      name: localStorage.getItem("tutorly_name") || localStorage.getItem("math-bot-name") || "Student"
    };

    $("profilePill").textContent = state.profile.grade && state.profile.board
      ? `Grade ${state.profile.grade} · ${state.profile.board}`
      : "Academic profile required";
    bindStaticEvents();
    materialInput = window.TutorlyTestMaterials.create({onChange: () => {
      document.querySelector('[data-step="mode"]').disabled = !materialInput?.hasContent();
      $("continueToModes").disabled = materialInput?.reading();
    }});
    renderRecommendation();
    renderHistory();
    showSetupStep("material");
  }

  function bindStaticEvents() {
    $("continueToModes").addEventListener("click", () => {
      try {
        state.sourceMaterials = materialInput.get();
        state.subject = {id:"uploaded-material",name:"My study material"};
        state.chapters = state.sourceMaterials.map(item => ({id:item.id,name:item.label}));
        state.selectedChapters = state.chapters.map(item => item.id);
        state.materialBased = true;
        renderModeCards(); showSetupStep("mode");
      } catch (error) { materialInput.error(error.message); }
    });
    $("backToMaterials").addEventListener("click", () => { if (!generating) showSetupStep("material"); });
    $("startExamBtn").addEventListener("click", startExam);
    $("submitAnswerBtn").addEventListener("click", submitAnswer);
    $("skipQuestionBtn").addEventListener("click", () => submitAnswer(null));
    $("finishExamBtn").addEventListener("click", finishExam);
    $("newExamBtn").addEventListener("click", () => {
      stopTimer();
      $("examView").hidden = true;
      $("reportView").hidden = true;
      $("setupPanel").hidden = false;
      showSetupStep("material");
    });
    $("retakeBtn").addEventListener("click", () => {
      if (!state.currentReport) return;
      state.mode = state.currentReport.mode;
      state.settings = state.currentReport.settings;
      state.subject = state.currentReport.subject;
      state.chapters = state.currentReport.chapters.map((name,index) => ({id:state.currentReport.chapterIds[index] || "review-"+index,name}));
      state.selectedChapters = state.chapters.map(item => item.id);
      state.materialBased = !!state.currentReport.materialBased;
      state.questions = state.currentReport.questions.map(item => ({...item}));
      beginExam();
    });
    $("historySearch").addEventListener("input", renderHistory);
    $("historySort").addEventListener("change", renderHistory);
    $("historyFilter").addEventListener("change", renderHistory);
    document.querySelectorAll("[data-review-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll("[data-review-filter]").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        renderQuestionReview(button.dataset.reviewFilter);
      });
    });
    document.querySelectorAll(".stepper [data-step]").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.disabled) return;
        if (button.dataset.step === 'mode') $("continueToModes").click();
        else showSetupStep(button.dataset.step);
      });
    });
  }

  function showSetupStep(step) {
    if (generating) return;
    const mode = step === "mode";
    $("materialStep").hidden = mode;
    $("modeStep").hidden = !mode;
    document.querySelectorAll(".stepper [data-step]").forEach(button => {
      button.classList.toggle("active",button.dataset.step === step);
      button.classList.toggle("done",mode && button.dataset.step === "material");
      if (button.dataset.step === "mode") button.disabled = !materialInput?.hasContent();
    });
    $("flowTitle").textContent = mode ? "Shape the paper your way." : "Turn your notes into a test.";
    $("flowLead").textContent = mode ? "Choose the test style, difficulty, question count, and timing." : "Add your material, choose your paper settings, and practise.";
    $("profilePill").textContent = [state.profile.grade ? "Grade " + state.profile.grade : "",state.profile.board].filter(Boolean).join(" · ") || "Your study material";
    window.scrollTo({top:0,behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});
  }

  function renderModeCards() {
    const selectedNames = getSelectedChapters().map((chapter) => chapter.name).join(", ");
    $("modeSummary").textContent = `Your material | ${selectedNames || "No material added"}`;
    $("modeGrid").innerHTML = Object.entries(MODE_CONFIG).map(([id, mode]) => `
      <button class="exam-card mode-card ${state.mode === id ? "selected" : ""}" type="button" data-mode="${id}">
        <span class="card-icon">${id === "practice" ? "✓" : id === "chapter" ? "▤" : id === "mock" ? "◷" : "★"}</span>
        <span><strong>${mode.label}</strong><small>${mode.description}</small></span>
      </button>
    `).join("");

    document.querySelectorAll("[data-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        state.mode = button.dataset.mode;
        state.settings = {};
        state.difficulty = MODE_CONFIG[state.mode].defaultDifficulty;
        renderModeCards();
      });
    });
    renderModeOptions();
  }

  function renderModeOptions() {
    const mode = MODE_CONFIG[state.mode];
    const difficultyValue = { Easy: 1, Moderate: 2, Hard: 3 }[state.difficulty || mode.defaultDifficulty] || 1;
    $("modeOptions").innerHTML = `
      <div class="settings-grid">
        <label class="paper-field">Number of questions
          <select id="questionCountSelect">${mode.counts.map((count) => `<option ${count === mode.defaultCount ? "selected" : ""}>${count}</option>`).join("")}</select>
        </label>
        <label class="paper-field">Time limit
          <select id="timeLimitSelect">${mode.times.map((time, index) => `<option ${index === 0 ? "selected" : ""}>${time}</option>`).join("")}</select>
        </label>
        <label class="paper-field" id="customTimeWrap" hidden>Custom minutes
          <input id="customMinutesInput" type="number" min="1" max="180" value="20" />
        </label>
        <div class="difficulty-setting">
          <div class="difficulty-head"><span>Difficulty</span><strong class="difficulty-value" id="difficultyControlValue">${state.difficulty || mode.defaultDifficulty}</strong></div>
          <input class="difficulty-slider" id="difficultySlider" type="range" min="1" max="3" step="1" value="${difficultyValue}" aria-label="Test difficulty" />
          <div class="difficulty-labels" aria-hidden="true"><span>Easy</span><span>Moderate</span><span>Hard</span></div>
        </div>
        <label class="subjective-toggle">
          <input id="includeSubjective" type="checkbox" ${state.includeSubjective ? "checked" : ""} />
          <span><strong>Add written questions as well</strong><small>Compare written answers with a guide and self-review. They are not automatically graded.</small></span>
        </label>
      </div>
    `;
    $("timeLimitSelect")?.addEventListener("change", (event) => {
      $("customTimeWrap").hidden = event.target.value !== "Custom";
      updatePaperSummary();
    });
    $("questionCountSelect").addEventListener("change", updatePaperSummary);
    $("customMinutesInput").addEventListener("input", updatePaperSummary);
    $("difficultySlider").addEventListener("input", (event) => {
      state.difficulty = ["Easy", "Moderate", "Hard"][Number(event.target.value) - 1];
      $("difficultyControlValue").textContent = state.difficulty;
      updatePaperSummary();
    });
    $("includeSubjective").addEventListener("change", (event) => {
      state.includeSubjective = event.target.checked;
      updatePaperSummary();
    });
    updatePaperSummary();
  }

  function updatePaperSummary() {
    if (!state.subject) return;
    const timeValue = $("timeLimitSelect")?.value || "No Limit";
    const timer = timeValue === "Custom" ? `${Number($("customMinutesInput")?.value || 20)} Minutes` : timeValue;
    $("summarySubject").textContent = state.subject.name;
    $("summaryChapters").textContent = getSelectedChapters().map((chapter) => chapter.name).join(", ");
    $("summaryMode").textContent = MODE_CONFIG[state.mode].label;
    $("summaryQuestions").textContent = $("questionCountSelect")?.value || MODE_CONFIG[state.mode].defaultCount;
    $("summaryDifficulty").textContent = state.difficulty || MODE_CONFIG[state.mode].defaultDifficulty;
    $("summarySubjective").textContent = state.includeSubjective ? "Yes" : "No";
    $("summaryTime").textContent = timer.replace("Minutes", "minutes");
  }

  function getSelectedChapters() {
    return state.chapters.filter((chapter) => state.selectedChapters.includes(chapter.id));
  }

  function collectSettings() {
    const count = Number($("questionCountSelect").value || 10);
    const timeValue = $("timeLimitSelect").value;
    const timeLimit = timeValue === "No Limit" ? null : timeValue === "Custom" ? Number($("customMinutesInput").value || 20) : Number(timeValue.match(/\d+/)?.[0] || 20);
    return { questionCount: count, timeLimit, difficulty: state.difficulty, includeSubjective: state.includeSubjective };
  }

  async function startExam() {
    if (generating) return;
    state.settings = collectSettings();
    generating = true;
    const controls = Array.from($("setupPanel").querySelectorAll("button,input,select,textarea"));
    const disabled = controls.map(node => node.disabled); controls.forEach(node => {node.disabled = true;});
    $("generationStatus").textContent = "Creating questions from your notes…";
    try {
      const result = await window.TutorlyTestMaterials.generate(state.sourceMaterials,state.settings,state.profile);
      state.questions = result.questions;
      $("generationStatus").textContent = result.notice;
      $("paperNotice").textContent = result.notice + (state.settings.includeSubjective ? " Written answers are self-reviewed, not automatically graded." : "");
      beginExam();
    } catch (error) {
      $("generationStatus").textContent = error.message + " Use Generate test paper to retry.";
    } finally {
      generating = false;
      controls.forEach((node,index) => {node.disabled = disabled[index];});
    }
  }

  function beginExam() {
    state.answers = state.questions.map(() => ({ selected: null, status: "unattempted", time: 0 }));
    state.index = 0;
    state.startedAt = Date.now();
    state.sessionId = `exam_${state.startedAt}_${Math.random().toString(36).slice(2, 10)}`;
    state.finished = false;
    state.remainingSeconds = state.settings.timeLimit ? state.settings.timeLimit * 60 : null;
    $("setupPanel").hidden = true;
    $("reportView").hidden = true;
    $("examView").hidden = false;
    $("examTitle").textContent = MODE_CONFIG[state.mode].label;
    $("examSubtitle").textContent = `${state.subject.name} | ${getSelectedChapters().map((chapter) => chapter.name).join(", ")}`;
    renderQuestion();
    startTimer();
  }

  function startTimer() {
    stopTimer();
    paintTimer();
    if (state.remainingSeconds === null) return;
    state.timerId = window.setInterval(() => {
      state.remainingSeconds -= 1;
      paintTimer();
      if (state.remainingSeconds <= 0) {
        finishExam();
      }
    }, 1000);
  }

  function stopTimer() {
    if (state.timerId) window.clearInterval(state.timerId);
    state.timerId = null;
  }

  function paintTimer() {
    $("timerText").textContent = state.remainingSeconds === null ? "No limit" : secondsLabel(state.remainingSeconds);
  }

  function renderQuestion() {
    const question = state.questions[state.index];
    state.questionStartedAt = Date.now();
    $("submitAnswerBtn").disabled = false; $("skipQuestionBtn").disabled = false;
    $("progressText").textContent = `Question ${state.index + 1} of ${state.questions.length}`;
    $("progressFill").style.width = `${pct(state.index, state.questions.length)}%`;
    $("questionMeta").textContent = `${question.chapterName} | ${question.concept}`;
    $("questionText").textContent = question.question;
    $("hintBox").hidden = true;
    $("hintBox").textContent = question.hint;
    $("hintBtn").hidden = !MODE_CONFIG[state.mode].hints;
    $("hintBtn").onclick = () => { $("hintBox").hidden = false; };
    if (question.type === "subjective") {
      $("answerGrid").innerHTML = `<textarea class="written-answer" id="writtenAnswer" placeholder="Write your answer here..." aria-label="Written answer"></textarea>`;
      $("answerGrid").classList.add("written");
      $("writtenAnswer").value = typeof state.answers[state.index].selected === "string" ? state.answers[state.index].selected : "";
      $("writtenAnswer").addEventListener("input", (event) => { state.answers[state.index].selected = event.target.value; });
    } else {
      $("answerGrid").classList.remove("written");
      $("answerGrid").innerHTML = question.options.map((option, index) => `
        <button class="answer-option" type="button" data-answer="${index}">
          <b>${String.fromCharCode(65 + index)}</b>
          <span>${escapeHtml(option)}</span>
        </button>
      `).join("");
      $("answerGrid").querySelectorAll("[data-answer]").forEach((button) => {
        button.addEventListener("click", () => {
          $("answerGrid").querySelectorAll(".answer-option").forEach((item) => item.classList.remove("selected"));
          button.classList.add("selected");
          state.answers[state.index].selected = Number(button.dataset.answer);
        });
      });
    }
  }

  function submitAnswer(answerIndex) {
    if (state.finished || $("submitAnswerBtn").disabled) return;
    const elapsed = (Date.now() - state.questionStartedAt) / 1000;
    const question = state.questions[state.index];
    const selected = answerIndex === null ? null : state.answers[state.index].selected;
    let status;
    if (question.type === "subjective" && selected !== null) {
      const response = String(selected || "").trim();
      if (!response) { $("hintBox").textContent = "Write an answer first, or skip this question."; $("hintBox").hidden = false; return; }
      $("hintBox").replaceChildren();
      const guide = document.createElement("p"); guide.textContent = "Self-review — compare your answer: " + question.correctText;
      const note = document.createElement("p"); note.textContent = "Tutorly has not automatically graded your written answer.";
      $("hintBox").append(guide,note); $("hintBox").hidden = false;
      $("submitAnswerBtn").disabled = true; $("skipQuestionBtn").disabled = true;
      [["My answer matches","correct"],["Needs revision","incorrect"]].forEach(([label,result]) => {
        const button=document.createElement("button"); button.type="button"; button.className="secondary-btn";button.textContent=label;
        button.addEventListener("click",()=>{if(state.finished)return;state.answers[state.index]={selected:response,status:result,time:elapsed,selfReviewed:true};$("submitAnswerBtn").disabled=false;$("skipQuestionBtn").disabled=false;nextQuestionOrFinish();});
        $("hintBox").append(button);
      });
      return;
    }
    status = selected === null ? "unattempted" : selected === question.answer ? "correct" : "incorrect";
    state.answers[state.index] = { selected, status, time: elapsed };

    if (state.mode === "practice" && status === "correct") {
      window.TutorlyQuestEvents?.record(
        "practice_question_correct",
        `practice:${state.startedAt}:question:${state.index}`,
        {
          subject: state.subject?.name || "",
          chapter_id: question.chapterId || "",
          concept: question.concept || ""
        }
      );
    }

    if (MODE_CONFIG[state.mode].instant) {
      $("submitAnswerBtn").disabled = true; $("skipQuestionBtn").disabled = true;
      showMiniFeedback(question, status);
      const session = state.sessionId, index = state.index;
      window.setTimeout(() => { if (!state.finished && state.sessionId === session && state.index === index) nextQuestionOrFinish(); }, 850);
    } else {
      nextQuestionOrFinish();
    }
  }

  function showMiniFeedback(question, status) {
    const box = $("hintBox");
    box.hidden = false;
    box.textContent = status === "correct" ? `Correct. ${question.explanation}` : `Answer: ${question.correctText}. ${question.explanation}`;
  }

  function nextQuestionOrFinish() {
    if (state.index >= state.questions.length - 1) {
      finishExam();
      return;
    }
    state.index += 1;
    renderQuestion();
  }

  function finishExam() {
    if (state.finished) return;
    state.finished = true;
    stopTimer();
    state.answers = state.answers.map((answer) => answer.status === "unattempted" && answer.time === 0
      ? { ...answer, time: 0 }
      : answer);
    const report = buildReport();
    state.currentReport = report;
    const progressionEvents = saveReport(report);
    syncQuestCompletionEvents(report, progressionEvents);
    $("examView").hidden = true;
    $("reportView").hidden = false;
    renderReport(report);
    renderRecommendation();
    renderHistory();
  }

  function buildReport() {
    const total = state.questions.length;
    const correct = state.answers.filter((answer) => answer.status === "correct").length;
    const incorrect = state.answers.filter((answer) => answer.status === "incorrect").length;
    const unattempted = total - correct - incorrect;
    const totalTime = Math.round((Date.now() - state.startedAt) / 1000);
    const attempted = Math.max(1, correct + incorrect);
    const percentage = pct(correct, total);
    const averageTime = Math.round(state.answers.reduce((sum, answer) => sum + answer.time, 0) / attempted);
    const topicStats = {};
    state.questions.forEach((question, index) => {
      topicStats[question.concept] ||= { concept: question.concept, total: 0, correct: 0 };
      topicStats[question.concept].total += 1;
      if (state.answers[index].status === "correct") topicStats[question.concept].correct += 1;
    });
    const topics = Object.values(topicStats).map((topic) => ({ ...topic, percentage: pct(topic.correct, topic.total) }));
    const weakAreas = topics.filter((topic) => topic.percentage < 70).map((topic) => topic.concept);
    const chapterIds = state.materialBased ? [] : state.selectedChapters.slice();
    return {
      id: state.sessionId || `exam_${state.startedAt}`,
      date: new Date().toISOString(),
      grade: state.profile.grade,
      board: state.profile.board,
      subject: state.subject,
      materialBased: state.materialBased,
      assessmentSource: state.materialBased ? "ai_generated_material_practice" : "legacy_practice",
      chapterIds,
      chapters: getSelectedChapters().map((chapter) => chapter.name),
      mode: state.mode,
      testType: MODE_CONFIG[state.mode].label,
      settings: state.settings,
      score: correct,
      total,
      correct,
      incorrect,
      unattempted,
      percentage,
      gradeLetter: percentage >= 90 ? "A" : percentage >= 75 ? "B" : percentage >= 60 ? "C" : percentage >= 40 ? "D" : "Needs Practice",
      performance: percentage >= 90 ? "Excellent" : percentage >= 75 ? "Strong" : percentage >= 60 ? "Steady" : "Needs focused practice",
      totalTime,
      averageTime,
      completionRate: pct(correct + incorrect, total),
      speedRating: averageTime <= 35 ? "Fast" : averageTime <= 70 ? "Balanced" : "Slow",
      difficulty: state.settings.difficulty || MODE_CONFIG[state.mode].defaultDifficulty,
      questions: state.questions,
      answers: state.answers,
      topics,
      weakAreas,
      longest: Math.max(...state.answers.map((answer) => Math.round(answer.time || 0)), 0),
      fastest: Math.min(...state.answers.filter((answer) => answer.time > 0).map((answer) => Math.round(answer.time)), 0) || 0
    };
  }

  function saveReport(report) {
    const history = [report, ...readJson(HISTORY_KEY, [])].slice(0, 60);
    writeJson(HISTORY_KEY, history);

    const progressionEvents = [];
    const mastery = readJson(MASTERY_KEY, {});
    report.chapterIds.forEach((chapterId) => {
      const previous = Number(mastery[chapterId]?.mastery || 0);
      const updated = Math.round(previous ? previous * 0.65 + report.percentage * 0.35 : report.percentage);
      mastery[chapterId] = {
        chapter: report.chapters[report.chapterIds.indexOf(chapterId)] || chapterId,
        subject: report.subject.name,
        mastery: updated,
        updatedAt: report.date
      };
      if (previous < 80 && updated >= 80) {
        progressionEvents.push({
          event_type: "topic_mastered",
          event_id: `mastery:${report.id}:${chapterId}`,
          metadata: { subject: report.subject.name, chapter_id: chapterId, mastery: updated }
        });
      }
    });
    writeJson(MASTERY_KEY, mastery);

    const weakAreas = readJson(WEAK_AREAS_KEY, {});
    report.topics.forEach((topic) => {
      if (topic.percentage >= 70 && weakAreas[topic.concept]) {
        delete weakAreas[topic.concept];
        progressionEvents.push({
          event_type: "weak_topic_improved",
          event_id: `weak-improved:${report.id}:${String(topic.concept).replace(/[^A-Za-z0-9_.-]/g, "-").slice(0, 70)}`,
          metadata: { subject: report.subject.name, topic: topic.concept, score: topic.percentage }
        });
      }
    });
    report.weakAreas.forEach((area) => {
      weakAreas[area] = { concept: area, subject: report.subject.name, updatedAt: report.date };
    });
    writeJson(WEAK_AREAS_KEY, weakAreas);
    return progressionEvents;
  }

  function syncQuestCompletionEvents(report, progressionEvents) {
    const metadata = {
      subject: report.subject?.name || "",
      chapter_ids: report.chapterIds,
      score: report.percentage,
      mode: report.mode
    };
    const completionEvent = report.mode === "practice"
      ? { event_type: "practice_session_completed", event_id: `practice:${report.id}:completed`, metadata }
      : { event_type: "test_completed", event_id: `test:${report.id}:completed`, metadata };
    window.TutorlyQuestEvents?.recordBatch([completionEvent, ...(progressionEvents || [])]);
  }

  function renderReport(report) {
    $("reportTitle").textContent = `${report.performance}: ${report.score}/${report.total}`;
    $("reportSubtitle").textContent = `${report.testType} | ${report.subject.name} | ${report.chapters.join(", ")}`;
    $("reportScore").textContent = `${report.percentage}%`;
    $("reportGrade").textContent = report.gradeLetter;
    $("reportTime").textContent = secondsLabel(report.totalTime);
    $("reportAverage").textContent = secondsLabel(report.averageTime);
    $("correctCount").textContent = report.correct;
    $("incorrectCount").textContent = report.incorrect;
    $("unattemptedCount").textContent = report.unattempted;
    $("avgTimeCount").textContent = secondsLabel(report.averageTime);
    $("accuracyValue").textContent = `${report.percentage}%`;
    $("completionValue").textContent = `${report.completionRate}%`;
    $("speedValue").textContent = report.speedRating;
    $("difficultyValue").textContent = report.difficulty;
    $("scoreRing").style.setProperty("--correct", report.correct);
    $("scoreRing").style.setProperty("--incorrect", report.incorrect);
    $("scoreRing").style.setProperty("--unattempted", report.unattempted);
    $("timeStats").innerHTML = `
      <span>Fastest: <b>${secondsLabel(report.fastest)}</b></span>
      <span>Slowest: <b>${secondsLabel(report.longest)}</b></span>
      <span>Average: <b>${secondsLabel(report.averageTime)}</b></span>
      <span>Long effort: <b>${report.answers.filter((answer) => answer.time > report.averageTime * 1.5).length}</b> questions</span>
    `;
    $("topicBars").innerHTML = report.topics.map((topic) => `
      <div class="topic-row">
        <span>${escapeHtml(topic.concept)}</span>
        <div class="topic-track"><i style="width:${topic.percentage}%"></i></div>
        <b>${topic.percentage}%</b>
      </div>
    `).join("");
    $("aiFeedback").innerHTML = buildFeedback(report);
    $("recommendedStartBtn")?.addEventListener("click", () => {
      $("reportView").hidden = true;
      $("setupPanel").hidden = false;
      showSetupStep("material");
      materialInput.error("Add the notes you want to practise. Your previous report is kept.");
    });
    renderQuestionReview("all");
  }

  function buildFeedback(report) {
    const strong = report.topics.filter((topic) => topic.percentage >= 80).map((topic) => topic.concept).slice(0, 3);
    const weak = report.weakAreas.slice(0, 3);
    const nextMode = report.percentage >= 85 && report.averageTime > 60 ? "Challenge" : report.percentage < 70 ? "Quick Check" : "Chapter Test";
    return `
      <p><b>Great work, ${escapeHtml(state.profile.name)}.</b> Your practice score is ${report.percentage}% and your completion rate is ${report.completionRate}%.${report.answers.some(answer => answer.selfReviewed) ? ' Includes self-reviewed written answers.' : ''}</p>
      <p>${strong.length ? `You are strong in ${strong.map(escapeHtml).join(", ")}.` : "You are building a foundation across the selected concepts."}</p>
      <p>${weak.length ? `Focus next on ${weak.map(escapeHtml).join(", ")}.` : "No major weak area was detected in this attempt."}</p>
      <div class="next-card">
        <strong>Recommended Next Test</strong>
        <span>${escapeHtml(report.subject.name)} | ${escapeHtml(report.chapters[0] || "Selected chapter")} | ${nextMode}</span>
        <button class="btn btn-primary" type="button" id="recommendedStartBtn">Start Recommended</button>
      </div>
    `;
  }

  function renderQuestionReview(filter = "all") {
    const report = state.currentReport;
    if (!report) return;
    const items = report.questions.map((question, index) => ({ question, answer: report.answers[index], index }))
      .filter((item) => filter === "all" || item.answer.status === filter);
    $("questionReview").innerHTML = items.map(({ question, answer, index }) => {
      const selectedText = answer.selected === null || answer.selected === ""
        ? "Unattempted"
        : question.type === "subjective" ? answer.selected : question.options[answer.selected];
      return `
        <details class="review-item ${answer.status}">
          <summary>
            <span>Question ${index + 1}</span>
            <b>${answer.status}</b>
            <small>${secondsLabel(answer.time)}</small>
          </summary>
          <p>${escapeHtml(question.question)}</p>
          <dl>
            <dt>Your Answer</dt><dd>${escapeHtml(selectedText)}</dd>
            <dt>${question.type === "subjective" ? "Answer Guide" : "Correct Answer"}</dt><dd>${escapeHtml(question.correctText)}</dd>
            <dt>Concept</dt><dd>${escapeHtml(question.concept)}</dd>
          </dl>
          <div class="explanation">
            <strong>${answer.status === "incorrect" ? "Why Your Answer Was Incorrect" : "Explanation"}</strong>
            <p>${escapeHtml(question.explanation)}</p>
            <p><b>Exam Tip:</b> Tie the answer back to ${escapeHtml(question.concept)} before selecting an option.</p>
          </div>
        </details>
      `;
    }).join("") || "<p class=\"empty-note\">No questions match this filter.</p>";
  }

  function renderRecommendation() {
    const history = readJson(HISTORY_KEY, []);
    const mastery = Object.values(readJson(MASTERY_KEY, {}));
    const weak = Object.values(readJson(WEAK_AREAS_KEY, {})).slice(0, 3);
    const lowMastery = mastery.sort((a, b) => a.mastery - b.mastery).slice(0, 2);
    const weakText = weak.length ? weak.map((item) => item.concept).join(", ") : lowMastery.map((item) => item.chapter).join(", ") || "Start with your current chapter";
    const recommendation = history[0]?.percentage < 70 ? "Quick Check" : history[0]?.averageTime > 65 ? "Challenge" : "Chapter Test";
    $("recommendationBox").innerHTML = `
      <div>
        <span class="section-kicker">Recommended For You</span>
        <h2>${recommendation}</h2>
        <p>Weak areas: ${escapeHtml(weakText)}</p>
      </div>
      <div class="recommendation-meta">
        <span>20 Questions</span>
        <span>${recommendation === "Quick Check" ? "No time limit" : "20 Minutes"}</span>
      </div>
    `;
  }

  function renderHistory() {
    let history = readJson(HISTORY_KEY, []);
    const search = $("historySearch")?.value?.trim().toLowerCase() || "";
    const filter = $("historyFilter")?.value || "all";
    if (search) {
      history = history.filter((report) => [report.subject.name, report.testType, ...report.chapters].join(" ").toLowerCase().includes(search));
    }
    if (filter !== "all") history = history.filter((report) => report.mode === filter);
    if (($("historySort")?.value || "newest") === "score") {
      history.sort((a, b) => b.percentage - a.percentage);
    } else {
      history.sort((a, b) => new Date(b.date) - new Date(a.date));
    }
    $("historyList").innerHTML = history.map((report) => `
      <article class="history-row">
        <div>
          <strong>${escapeHtml(report.subject.name)} - ${escapeHtml(report.chapters.join(", "))}</strong>
          <span>${new Date(report.date).toLocaleDateString()} | ${report.testType} | ${secondsLabel(report.totalTime)}</span>
        </div>
        <b>${report.score}/${report.total}</b>
        <span>${report.percentage}%</span>
        <button class="btn btn-soft" type="button" data-report="${report.id}">View Report</button>
      </article>
    `).join("") || "<p class=\"empty-note\">No test history yet. Your completed reports will appear here.</p>";
    $("historyList").querySelectorAll("[data-report]").forEach((button) => {
      button.addEventListener("click", () => {
        const report = readJson(HISTORY_KEY, []).find((item) => item.id === button.dataset.report);
        if (!report) return;
        state.currentReport = report;
        $("setupPanel").hidden = true;
        $("examView").hidden = true;
        $("reportView").hidden = false;
        renderReport(report);
        $("reportView").scrollIntoView({ behavior: "smooth" });
      });
    });
  }

  window.addEventListener("DOMContentLoaded", init);
})();
