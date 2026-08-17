(function () {
  const Syllabus = window.TutorlySyllabus;
  const HISTORY_KEY = "tutorly_exam_history";
  const MASTERY_KEY = "tutorly_chapter_mastery";
  const WEAK_AREAS_KEY = "tutorly_weak_areas";

  const MODE_CONFIG = {
    practice: {
      label: "Practice Quiz",
      description: "Learn while practicing with instant feedback and explanations.",
      counts: [5, 10, 15, 20],
      times: ["No Limit", "5 Minutes", "10 Minutes", "15 Minutes", "Custom"],
      difficulty: "Easy-Medium",
      hints: true,
      instant: true
    },
    chapter: {
      label: "Chapter Test",
      description: "Test understanding of selected chapter work with detailed analytics.",
      counts: [10, 20, 30, 40, 50],
      times: ["10 Minutes", "20 Minutes", "30 Minutes", "45 Minutes", "60 Minutes", "Custom"],
      difficulty: "Medium-Hard",
      hints: false,
      instant: false
    },
    mock: {
      label: "Mock Exam",
      description: "Simulate a real school examination with strict timing.",
      examTypes: {
        "Unit Test": { count: 25, minutes: 30 },
        "Quarterly Exam": { count: 50, minutes: 75 },
        "Half-Yearly Exam": { count: 70, minutes: 105 },
        "Final Exam": { count: 90, minutes: 150 }
      },
      difficulty: "Mixed-Hard",
      hints: false,
      instant: false
    },
    rapid: {
      label: "Rapid Fire",
      description: "Improve speed and recall with quick MCQs.",
      counts: [10, 20, 30],
      perQuestion: [5, 10, 15],
      difficulty: "Easy-Medium",
      hints: false,
      instant: true
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
    currentReport: null
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

  function init() {
    state.profile = {
      grade: localStorage.getItem("tutorly_grade") || "9",
      board: localStorage.getItem("tutorly_board") || "CBSE",
      name: localStorage.getItem("tutorly_name") || localStorage.getItem("math-bot-name") || "Student"
    };

    $("profilePill").textContent = `Grade ${state.profile.grade} | ${state.profile.board}`;
    renderSubjects();
    renderRecommendation();
    renderHistory();
    showSetupStep("subject");
    bindStaticEvents();
  }

  function bindStaticEvents() {
    $("chapterSearch").addEventListener("input", renderChapters);
    $("selectAllChapters").addEventListener("change", (event) => {
      state.selectedChapters = event.target.checked ? state.chapters.map((chapter) => chapter.id) : [];
      renderChapters();
      renderModeCards();
    });
    $("backToSubjects").addEventListener("click", () => showSetupStep("subject"));
    $("backToChapters").addEventListener("click", () => showSetupStep("chapter"));
    $("startExamBtn").addEventListener("click", startExam);
    $("submitAnswerBtn").addEventListener("click", submitAnswer);
    $("skipQuestionBtn").addEventListener("click", () => submitAnswer(null));
    $("finishExamBtn").addEventListener("click", finishExam);
    $("newExamBtn").addEventListener("click", () => {
      stopTimer();
      $("examView").hidden = true;
      $("reportView").hidden = true;
      $("setupPanel").hidden = false;
      showSetupStep("subject");
    });
    $("retakeBtn").addEventListener("click", () => {
      if (!state.currentReport) return;
      state.selectedChapters = state.currentReport.chapterIds;
      state.mode = state.currentReport.mode;
      state.settings = state.currentReport.settings;
      state.subject = state.currentReport.subject;
      state.chapters = Syllabus.getChapters(state.profile.grade, state.profile.board, state.subject.id);
      startExam(true);
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
  }

  function showSetupStep(step) {
    ["subject", "chapter", "mode"].forEach((name) => {
      $(`${name}Step`).hidden = name !== step;
      document.querySelector(`[data-step="${name}"]`)?.classList.toggle("active", name === step);
    });
  }

  function renderSubjects() {
    const subjects = Syllabus.getSubjects(state.profile.grade, state.profile.board);
    $("subjectGrid").innerHTML = subjects.map((subject) => `
      <button class="exam-card subject-card accent-${subject.accent}" type="button" data-subject="${subject.id}">
        <span class="card-icon">${subject.name.slice(0, 1)}</span>
        <strong>${escapeHtml(subject.name)}</strong>
        <small>Grade ${escapeHtml(state.profile.grade)} ${escapeHtml(state.profile.board)}</small>
      </button>
    `).join("");

    document.querySelectorAll("[data-subject]").forEach((button) => {
      button.addEventListener("click", () => {
        const subject = subjects.find((item) => item.id === button.dataset.subject);
        chooseSubject(subject);
      });
    });
  }

  function chooseSubject(subject) {
    state.subject = subject;
    state.chapters = Syllabus.getChapters(state.profile.grade, state.profile.board, subject.id);
    state.selectedChapters = [];
    state.settings = {};
    $("subjectSummary").textContent = `${state.profile.board} Grade ${state.profile.grade} | ${subject.name}`;
    $("selectAllChapters").checked = false;
    renderChapters();
    showSetupStep("chapter");
  }

  function renderChapters() {
    const search = $("chapterSearch").value.trim().toLowerCase();
    const visibleChapters = state.chapters.filter((chapter) => chapter.name.toLowerCase().includes(search));
    $("chapterGrid").innerHTML = visibleChapters.map((chapter) => {
      const checked = state.selectedChapters.includes(chapter.id);
      return `
        <label class="chapter-option ${checked ? "selected" : ""}">
          <input type="checkbox" value="${chapter.id}" ${checked ? "checked" : ""} />
          <span>
            <strong>${escapeHtml(chapter.name)}</strong>
            <small>${chapter.concepts.map(escapeHtml).join(" | ")}</small>
          </span>
        </label>
      `;
    }).join("");

    $("chapterGrid").querySelectorAll("input").forEach((input) => {
      input.addEventListener("change", () => {
        if (input.checked) {
          state.selectedChapters = Array.from(new Set([...state.selectedChapters, input.value]));
        } else {
          state.selectedChapters = state.selectedChapters.filter((id) => id !== input.value);
        }
        state.settings = {};
        $("selectAllChapters").checked = state.selectedChapters.length === state.chapters.length;
        renderChapters();
        renderModeCards();
      });
    });

    $("chapterCount").textContent = `${state.selectedChapters.length} selected`;
    $("continueToModes").disabled = state.selectedChapters.length === 0;
    $("continueToModes").onclick = () => {
      renderModeCards();
      showSetupStep("mode");
    };
  }

  function renderModeCards() {
    const selectedNames = getSelectedChapters().map((chapter) => chapter.name).join(", ");
    $("modeSummary").textContent = `${state.subject?.name || "Subject"} | ${selectedNames || "No chapters selected"}`;
    $("modeGrid").innerHTML = Object.entries(MODE_CONFIG).map(([id, mode]) => `
      <button class="exam-card mode-card ${state.mode === id ? "selected" : ""}" type="button" data-mode="${id}">
        <span class="card-icon">${id === "practice" ? "P" : id === "chapter" ? "T" : id === "mock" ? "M" : "R"}</span>
        <strong>${mode.label}</strong>
        <small>${mode.description}</small>
      </button>
    `).join("");

    document.querySelectorAll("[data-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        state.mode = button.dataset.mode;
        state.settings = {};
        renderModeCards();
        renderModeOptions();
      });
    });
    renderModeOptions();
  }

  function renderModeOptions() {
    const mode = MODE_CONFIG[state.mode];
    let html = "";
    if (state.mode === "mock") {
      html = `
        <label>Exam Type<select id="examTypeSelect" class="select">${Object.keys(mode.examTypes).map((type) => `<option>${type}</option>`).join("")}</select></label>
        <p class="setup-note">Question count and duration are generated automatically from the selected exam type.</p>
      `;
    } else if (state.mode === "rapid") {
      html = `
        <label>Questions<select id="questionCountSelect" class="select">${mode.counts.map((count) => `<option>${count}</option>`).join("")}</select></label>
        <label>Time Per Question<select id="perQuestionSelect" class="select">${mode.perQuestion.map((sec) => `<option value="${sec}">${sec} Seconds</option>`).join("")}</select></label>
      `;
    } else {
      html = `
        <label>Questions<select id="questionCountSelect" class="select">${mode.counts.map((count) => `<option>${count}</option>`).join("")}</select></label>
        <label>Time<select id="timeLimitSelect" class="select">${mode.times.map((time) => `<option>${time}</option>`).join("")}</select></label>
        <label id="customTimeWrap" hidden>Custom Minutes<input id="customMinutesInput" class="input" type="number" min="1" max="180" value="20" /></label>
      `;
    }
    $("modeOptions").innerHTML = html;
    $("timeLimitSelect")?.addEventListener("change", (event) => {
      $("customTimeWrap").hidden = event.target.value !== "Custom";
    });
  }

  function getSelectedChapters() {
    return state.chapters.filter((chapter) => state.selectedChapters.includes(chapter.id));
  }

  function collectSettings() {
    const mode = MODE_CONFIG[state.mode];
    if (state.mode === "mock") {
      const examType = $("examTypeSelect").value;
      return { examType, questionCount: mode.examTypes[examType].count, timeLimit: mode.examTypes[examType].minutes };
    }
    if (state.mode === "rapid") {
      const count = Number($("questionCountSelect").value || 10);
      const perQuestion = Number($("perQuestionSelect").value || 10);
      return { questionCount: count, perQuestion, timeLimit: Math.ceil((count * perQuestion) / 60) };
    }
    const count = Number($("questionCountSelect").value || 10);
    const timeValue = $("timeLimitSelect").value;
    const timeLimit = timeValue === "No Limit" ? null : timeValue === "Custom" ? Number($("customMinutesInput").value || 20) : Number(timeValue.match(/\d+/)?.[0] || 20);
    return { questionCount: count, timeLimit };
  }

  function startExam(usePresetSettings = false) {
    state.settings = usePresetSettings && state.settings.questionCount ? state.settings : collectSettings();
    state.questions = generateQuestions({
      grade: state.profile.grade,
      board: state.profile.board,
      subject: state.subject.name,
      subjectId: state.subject.id,
      chapters: getSelectedChapters(),
      testType: MODE_CONFIG[state.mode].label,
      questionCount: state.settings.questionCount,
      timeLimit: state.settings.timeLimit
    });
    state.answers = state.questions.map(() => ({ selected: null, status: "unattempted", time: 0 }));
    state.index = 0;
    state.startedAt = Date.now();
    state.remainingSeconds = state.mode === "rapid"
      ? state.settings.perQuestion
      : state.settings.timeLimit ? state.settings.timeLimit * 60 : null;
    $("setupPanel").hidden = true;
    $("reportView").hidden = true;
    $("examView").hidden = false;
    $("examTitle").textContent = MODE_CONFIG[state.mode].label;
    $("examSubtitle").textContent = `${state.subject.name} | ${getSelectedChapters().map((chapter) => chapter.name).join(", ")}`;
    renderQuestion();
    startTimer();
  }

  function generateQuestions(config) {
    const selected = config.chapters.length ? config.chapters : state.chapters.slice(0, 1);
    const questions = [];
    for (let i = 0; i < config.questionCount; i += 1) {
      const chapter = selected[i % selected.length];
      const concept = chapter.concepts[Math.floor(i / selected.length) % chapter.concepts.length];
      questions.push(makeQuestion(chapter, concept, i, config));
    }
    return questions;
  }

  function makeQuestion(chapter, concept, index, config) {
    const templates = [
      {
        q: `In ${chapter.name}, which statement best matches the concept "${concept}"?`,
        options: [
          `${concept} is a key idea from ${chapter.name}.`,
          `${concept} belongs mainly to a different chapter.`,
          `${concept} should be ignored in this test.`,
          `${concept} is only a memorized label.`
        ],
        answer: 0
      },
      {
        q: `A student is revising ${chapter.name}. Which topic should they connect most closely with ${concept}?`,
        options: [
          chapter.concepts[(chapter.concepts.indexOf(concept) + 1) % chapter.concepts.length],
          "An unrelated topic",
          "A different unit",
          "A revision habit"
        ],
        answer: 0
      },
      {
        q: `Why is ${concept} important in ${chapter.name}?`,
        options: [
          `It helps solve questions from ${chapter.name} accurately.`,
          "It is outside the selected chapter.",
          "It replaces all other concepts.",
          "It is not used in school exams."
        ],
        answer: 0
      }
    ];

    if (chapter.id === "number-systems") {
      const numberSystemQuestions = [
        {
          q: "Which number is irrational?",
          options: ["sqrt(2)", "3/4", "0.25", "7"],
          answer: 0,
          concept: "Irrational Numbers",
          explanation: "sqrt(2) cannot be written as p/q, so it is irrational."
        },
        {
          q: "The decimal expansion 0.3333... represents which type of number?",
          options: ["Rational number", "Irrational number", "Prime number", "Whole number only"],
          answer: 0,
          concept: "Decimal Expansions",
          explanation: "A recurring decimal is rational because it can be written as a fraction."
        },
        {
          q: "Which set contains both rational and irrational numbers?",
          options: ["Real Numbers", "Natural Numbers", "Whole Numbers", "Integers"],
          answer: 0,
          concept: "Real Numbers",
          explanation: "Real numbers include every rational and irrational number on the number line."
        },
        {
          q: "Which number can be represented exactly on the number line?",
          options: ["Every real number", "Only whole numbers", "Only positive numbers", "Only integers"],
          answer: 0,
          concept: "Number Line Representation",
          explanation: "Every real number has a position on the number line."
        },
        {
          q: "A number of the form p/q, where q is not zero, is called what?",
          options: ["Rational number", "Irrational number", "Imaginary number", "Composite number"],
          answer: 0,
          concept: "Rational Numbers",
          explanation: "Rational numbers are exactly the numbers that can be written as p/q with q not equal to zero."
        }
      ];
      return normalizeQuestion(numberSystemQuestions[index % numberSystemQuestions.length], chapter, config);
    }

    const base = templates[index % templates.length];
    return normalizeQuestion({ ...base, concept, explanation: `This question is restricted to ${chapter.name} and checks ${concept}. Review the definition, examples, and common exam applications of this concept.` }, chapter, config);
  }

  function normalizeQuestion(question, chapter, config) {
    const options = question.options.map((text, index) => ({ text, originalIndex: index }));
    for (let i = options.length - 1; i > 0; i -= 1) {
      const swap = (i + chapter.id.length + config.subjectId.length) % (i + 1);
      [options[i], options[swap]] = [options[swap], options[i]];
    }
    return {
      id: `q_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      question: question.q,
      options: options.map((option) => option.text),
      answer: options.findIndex((option) => option.originalIndex === question.answer),
      correctText: question.options[question.answer],
      chapterId: chapter.id,
      chapterName: chapter.name,
      concept: question.concept,
      explanation: question.explanation,
      hint: `Focus on ${question.concept} inside ${chapter.name}. Eliminate options that belong to another chapter.`
    };
  }

  function startTimer() {
    stopTimer();
    paintTimer();
    if (state.remainingSeconds === null) return;
    state.timerId = window.setInterval(() => {
      state.remainingSeconds -= 1;
      paintTimer();
      if (state.remainingSeconds <= 0) {
        if (state.mode === "rapid" && state.index < state.questions.length - 1) {
          submitAnswer(null);
        } else {
          finishExam();
        }
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
    if (state.mode === "rapid") {
      state.remainingSeconds = state.settings.perQuestion;
      startTimer();
    }
    $("progressText").textContent = `Question ${state.index + 1} of ${state.questions.length}`;
    $("progressFill").style.width = `${pct(state.index, state.questions.length)}%`;
    $("questionMeta").textContent = `${question.chapterName} | ${question.concept}`;
    $("questionText").textContent = question.question;
    $("hintBox").hidden = true;
    $("hintBox").textContent = question.hint;
    $("hintBtn").hidden = !MODE_CONFIG[state.mode].hints;
    $("hintBtn").onclick = () => { $("hintBox").hidden = false; };
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

  function submitAnswer(answerIndex) {
    const elapsed = (Date.now() - state.questionStartedAt) / 1000;
    const question = state.questions[state.index];
    const selected = answerIndex === null ? null : state.answers[state.index].selected;
    const status = selected === null ? "unattempted" : selected === question.answer ? "correct" : "incorrect";
    state.answers[state.index] = { selected, status, time: elapsed };

    if (MODE_CONFIG[state.mode].instant) {
      showMiniFeedback(question, status);
      window.setTimeout(nextQuestionOrFinish, state.mode === "rapid" ? 300 : 850);
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
    stopTimer();
    state.answers = state.answers.map((answer) => answer.status === "unattempted" && answer.time === 0
      ? { ...answer, time: 0 }
      : answer);
    const report = buildReport();
    state.currentReport = report;
    saveReport(report);
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
    const chapterIds = state.selectedChapters.slice();
    return {
      id: `report_${Date.now()}`,
      date: new Date().toISOString(),
      grade: state.profile.grade,
      board: state.profile.board,
      subject: state.subject,
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
      difficulty: MODE_CONFIG[state.mode].difficulty,
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

    const mastery = readJson(MASTERY_KEY, {});
    report.chapterIds.forEach((chapterId) => {
      const previous = Number(mastery[chapterId]?.mastery || 0);
      mastery[chapterId] = {
        chapter: report.chapters[report.chapterIds.indexOf(chapterId)] || chapterId,
        subject: report.subject.name,
        mastery: Math.round(previous ? previous * 0.65 + report.percentage * 0.35 : report.percentage),
        updatedAt: report.date
      };
    });
    writeJson(MASTERY_KEY, mastery);

    const weakAreas = readJson(WEAK_AREAS_KEY, {});
    report.weakAreas.forEach((area) => {
      weakAreas[area] = { concept: area, subject: report.subject.name, updatedAt: report.date };
    });
    writeJson(WEAK_AREAS_KEY, weakAreas);
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
      state.subject = report.subject;
      state.chapters = Syllabus.getChapters(report.grade, report.board, report.subject.id);
      state.selectedChapters = report.chapterIds.slice();
      state.mode = report.percentage < 70 ? "practice" : report.averageTime > 60 ? "rapid" : "chapter";
      state.settings = state.mode === "rapid"
        ? { questionCount: 10, perQuestion: 10, timeLimit: 2 }
        : { questionCount: 20, timeLimit: 20 };
      startExam(true);
    });
    renderQuestionReview("all");
  }

  function buildFeedback(report) {
    const strong = report.topics.filter((topic) => topic.percentage >= 80).map((topic) => topic.concept).slice(0, 3);
    const weak = report.weakAreas.slice(0, 3);
    const nextMode = report.percentage >= 85 && report.averageTime > 60 ? "Rapid Fire" : report.percentage < 70 ? "Practice Quiz" : "Chapter Test";
    return `
      <p><b>Great work, ${escapeHtml(state.profile.name)}.</b> Your accuracy is ${report.percentage}% and your completion rate is ${report.completionRate}%.</p>
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
      const selectedText = answer.selected === null ? "Unattempted" : question.options[answer.selected];
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
            <dt>Correct Answer</dt><dd>${escapeHtml(question.correctText)}</dd>
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
    const recommendation = history[0]?.percentage < 70 ? "Practice Quiz" : history[0]?.averageTime > 65 ? "Rapid Fire" : "Chapter Test";
    $("recommendationBox").innerHTML = `
      <div>
        <span class="section-kicker">Recommended For You</span>
        <h2>${recommendation}</h2>
        <p>Weak areas: ${escapeHtml(weakText)}</p>
      </div>
      <div class="recommendation-meta">
        <span>20 Questions</span>
        <span>${recommendation === "Rapid Fire" ? "10 sec each" : "20 Minutes"}</span>
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
