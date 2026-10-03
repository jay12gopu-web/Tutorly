(function () {
  const Data = window.TutorlyLessonsData;
  const PROGRESS_KEY = "tutorly_lesson_progress";
  const BOOKMARK_KEY = "tutorly_lesson_bookmarks";
  const OFFLINE_KEY = "tutorly_offline_lessons";
  const LAST_KEY = "tutorly_last_lesson";

  const state = {
    subjectId: "",
    chapterId: "",
    zoom: 1,
    theme: localStorage.getItem("tutorly_lessons_theme") || "light",
    searchTerm: "",
    librarySearch: "",
    quickRevision: false
  };

  const $ = (id) => document.getElementById(id);
  const readJson = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (_error) { return fallback; }
  };
  const writeJson = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));
  const lessonKey = (subjectId, chapterId) => `${subjectId}:${chapterId}`;
  const todayLabel = () => new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

  async function init() {
    if (!Data) return;
    document.body.classList.toggle("lesson-dark", state.theme === "dark");
    document.body.dataset.theme = state.theme;
    bindEvents();
    await Data.load();
    renderSubjects();
    const params = new URLSearchParams(window.location.search);
    const subjectId = params.get("subject");
    const chapterId = params.get("chapter");
    if (subjectId && chapterId && Data.getChapter(subjectId, chapterId)) {
      openChapter(subjectId, chapterId);
    } else if (subjectId && Data.getSubject(subjectId)) {
      openSubject(subjectId);
    } else {
      showView("home");
    }
  }

  function bindEvents() {
    $("backToSubjects").addEventListener("click", () => showView("home"));
    $("backToChapters").addEventListener("click", () => openSubject(state.subjectId));
    $("zoomInBtn").addEventListener("click", () => setZoom(state.zoom + 0.08));
    $("zoomOutBtn").addEventListener("click", () => setZoom(state.zoom - 0.08));
    $("fullscreenBtn").addEventListener("click", toggleFullscreen);
    $("themeBtn").addEventListener("click", toggleTheme);
    $("printBtn").addEventListener("click", () => window.print());
    $("pdfBtn").addEventListener("click", openPdfExport);
    $("quickModeBtn").addEventListener("click", () => {
      state.quickRevision = !state.quickRevision;
      renderLesson();
    });
    $("bookmarkBtn").addEventListener("click", toggleBookmark);
    $("offlineBtn").addEventListener("click", saveOffline);
    $("copyNotesBtn").addEventListener("click", copyNotes);
    $("lessonSearch").addEventListener("input", (event) => {
      state.searchTerm = event.target.value.trim();
      renderLesson();
    });
    $("subjectSearch")?.addEventListener("input", (event) => {
      state.librarySearch = event.target.value.trim().toLowerCase();
      renderSubjects();
    });
    $("curriculumRetry")?.addEventListener("click", refreshCurriculum);
  }

  function showView(view) {
    $("subjectsView").hidden = view !== "home";
    $("chaptersView").hidden = view !== "chapters";
    $("readerView").hidden = view !== "reader";
    if (view === "home") renderLearnHome();
  }

  function getProgress() {
    return readJson(PROGRESS_KEY, {});
  }

  function getProgressFor(subjectId, chapterId) {
    return getProgress()[lessonKey(subjectId, chapterId)] || { percent: 0, lastOpened: "" };
  }

  function subjectProgress(subject) {
    if (!subject.chapters.length) return 0;
    const total = subject.chapters.reduce((sum, chapter) => sum + getProgressFor(subject.id, chapter.id).percent, 0);
    return Math.round(total / subject.chapters.length);
  }

  function lastStudied(subject) {
    const entries = subject.chapters
      .map((chapter) => ({ chapter, progress: getProgressFor(subject.id, chapter.id) }))
      .filter((entry) => entry.progress.lastOpened)
      .sort((a, b) => new Date(b.progress.lastOpened) - new Date(a.progress.lastOpened));
    return entries[0]?.chapter.title || "Not started";
  }

  function latestLesson() {
    const saved = readJson(LAST_KEY, null);
    if (!saved?.subjectId || !saved?.chapterId) return null;
    const subject = Data.subjects.find((item) => item.id === saved.subjectId);
    const chapter = subject?.chapters.find((item) => item.id === saved.chapterId);
    if (!subject || !chapter) return null;
    return {
      subject,
      chapter,
      openedAt: getProgressFor(subject.id, chapter.id).lastOpened || saved.openedAt || ""
    };
  }

  function curriculumLabel() {
    if (Data.catalog?.available) {
      return `${Data.catalog.board} · Grade ${Data.catalog.grade} · ${Data.catalog.academic_year}`;
    }
    const board = String(localStorage.getItem("tutorly_board") || "").trim();
    const grade = String(localStorage.getItem("tutorly_grade") || "").trim();
    const details = [grade ? `Grade ${grade}` : "", board].filter(Boolean);
    return details.length ? details.join(" · ") : "Set your grade and board in Profile";
  }

  function renderContinueCard() {
    const latest = latestLesson();
    const button = $("continueLessonBtn");
    if (!button) return;

    if (!latest) {
      $("continueLabel").textContent = "Start learning";
      $("continueTitle").textContent = Data.subjects.length ? "Choose your first chapter" : "Curriculum unavailable";
      $("continueMeta").textContent = Data.subjects.length ? "Pick a subject below to begin." : Data.message;
      button.textContent = "Browse subjects";
      button.disabled = !Data.subjects.length;
      button.onclick = () => $("subjectGrid")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const opened = latest.openedAt
      ? `Last studied ${new Date(latest.openedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
      : "Ready to continue";
    $("continueLabel").textContent = "Continue learning";
    $("continueTitle").textContent = latest.chapter.title;
    $("continueMeta").textContent = `${latest.subject.name} · ${latest.chapter.bookTitle} · ${opened}`;
    button.textContent = "Continue chapter →";
    button.onclick = () => openChapter(latest.subject.id, latest.chapter.id);
  }

  function renderLearnHome() {
    if ($("curriculumStatus")) $("curriculumStatus").textContent = curriculumLabel();
    if ($("curriculumRetry")) $("curriculumRetry").hidden = Data.catalog?.status !== "error";
    if ($("subjectCount")) $("subjectCount").textContent = Data.subjects.length
      ? `${Data.subjects.length} subjects available`
      : Data.message;
    renderContinueCard();
    renderSubjects();
  }

  function renderSubjects() {
    const latest = latestLesson();
    const filteredSubjects = Data.subjects.filter((subject) => {
      if (!state.librarySearch) return true;
      return subject.name.toLowerCase().includes(state.librarySearch)
        || subject.chapters.some((chapter) => chapter.title.toLowerCase().includes(state.librarySearch));
    });
    $("subjectGrid").innerHTML = filteredSubjects.map((subject) => `
      <button class="learn-subject-card tone-${subject.color}${latest?.subject.id === subject.id ? " featured" : ""}" type="button" data-subject="${subject.id}">
        <span class="learn-subject-icon">${escapeHtml(subject.icon)}</span>
        <strong>${escapeHtml(subject.name)}</strong>
        <span class="learn-subject-meta">${subject.chapters.length} ${subject.chapters.length === 1 ? "chapter" : "chapters"}</span>
        <span class="learn-subject-foot">
          <span>Last studied: ${escapeHtml(lastStudied(subject))}</span>
          <b>${latest?.subject.id === subject.id ? "Continue →" : "Open subject →"}</b>
        </span>
      </button>
    `).join("") || `<div class="learn-empty"><strong>${Data.catalog?.status === "profile_incomplete" ? "Set up your curriculum" : "Curriculum unavailable"}</strong><p>${escapeHtml(Data.message)}</p>${Data.catalog?.status === "error" ? '<button class="learn-back" data-curriculum-retry type="button">Retry</button>' : ""}</div>`;
    if ($("subjectSearchEmpty")) $("subjectSearchEmpty").hidden = filteredSubjects.length > 0;
    document.querySelectorAll("[data-subject]").forEach((button) => {
      button.addEventListener("click", () => openSubject(button.dataset.subject));
    });
    document.querySelectorAll("[data-curriculum-retry]").forEach((button) => button.addEventListener("click", refreshCurriculum));
  }

  async function refreshCurriculum() {
    const retry = $("curriculumRetry");
    if (retry) {
      retry.disabled = true;
      retry.textContent = "Loading…";
    }
    await Data.load({ refresh: true });
    if (retry) {
      retry.disabled = false;
      retry.textContent = "Retry";
    }
    renderLearnHome();
  }

  function openSubject(subjectId) {
    state.subjectId = subjectId;
    const subject = Data.getSubject(subjectId);
    if (!subject) return;
    $("chapterSubjectName").textContent = subject.name;
    $("chapterSubjectMeta").textContent = `${subject.chapters.length} textbook chapters`;
    const books = subject.books?.length ? subject.books : [{ id: "all", title: "", chapters: subject.chapters }];
    $("chapterGrid").innerHTML = books.map((book) => {
      const bookChapters = subject.chapters.filter((chapter) => chapter.bookId === book.id);
      if (!bookChapters.length) return "";
      const heading = books.length > 1
        ? `<div class="chapter-book-heading"><span>${escapeHtml(book.part_label || "Textbook")}</span><strong>${escapeHtml(book.title)}</strong></div>`
        : "";
      return heading + bookChapters.map((chapter) => {
      const progress = getProgressFor(subject.id, chapter.id);
      return `
        <button class="chapter-card" type="button" data-chapter="${chapter.id}">
          <span>${escapeHtml(chapter.partLabel || chapter.bookTitle)}</span>
          <strong>${escapeHtml(chapter.title)}</strong>
          <p>${escapeHtml(chapter.bookTitle)}</p>
          <div class="chapter-stats">
            <b>Chapter ${escapeHtml(chapter.number)}</b>
            <b>${progress.lastOpened ? "Continue" : "Start"}</b>
          </div>
          <em>Last opened: ${progress.lastOpened ? new Date(progress.lastOpened).toLocaleDateString() : "Never"}</em>
        </button>
      `;
      }).join("");
    }).join("");
    document.querySelectorAll("[data-chapter]").forEach((button) => {
      button.addEventListener("click", () => openChapter(state.subjectId, button.dataset.chapter));
    });
    showView("chapters");
  }

  function openChapter(subjectId, chapterId) {
    const subject = Data.getSubject(subjectId);
    const chapter = Data.getChapter(subjectId, chapterId);
    if (!subject || !chapter) return;
    state.subjectId = subjectId;
    state.chapterId = chapterId;
    state.searchTerm = "";
    $("lessonSearch").value = "";
    markOpened(subjectId, chapterId);
    window.TutorlyCurriculum?.setActiveContext({
      board: Data.catalog?.board,
      grade: Data.catalog?.grade,
      academic_year: Data.catalog?.academic_year,
      medium: Data.catalog?.medium,
      subject_id: subject.id,
      subject: subject.name,
      book_id: chapter.bookId,
      book: chapter.bookTitle,
      chapter_id: chapter.id,
      chapter: chapter.title,
      source_url: chapter.sourceUrl
    });
    renderLesson();
    showView("reader");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function markOpened(subjectId, chapterId) {
    const progress = getProgress();
    const key = lessonKey(subjectId, chapterId);
    progress[key] = {
      ...(progress[key] || {}),
      lastOpened: new Date().toISOString(),
      status: progress[key]?.status || 'started',
      percent: progress[key]?.percent || 0
    };
    writeJson(PROGRESS_KEY, progress);
    writeJson(LAST_KEY, { subjectId, chapterId, openedAt: new Date().toISOString() });
  }

  function callout(type, title, text) {
    return `<aside class="lesson-callout ${type}"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(text)}</p></aside>`;
  }

  function revisionBlock(type, title, text) {
    return `<article class="revision-block ${type}"><span>${escapeHtml(title)}</span><p>${escapeHtml(text)}</p></article>`;
  }

  // A verified chapter title is not a reviewed lesson. Never manufacture prose,
  // formulas, diagrams or worked solutions from metadata alone (audit H02).
  function lessonHtml(subject, chapter) {
    const source = /^https:\/\//i.test(chapter.sourceUrl || "") ? chapter.sourceUrl : "";
    return `<header><p>${escapeHtml(subject.name)} · ${escapeHtml(chapter.bookTitle)}</p></header>
      <section class="lesson-content-pending" aria-labelledby="lessonPendingTitle">
        <h2 id="lessonPendingTitle">Reviewed lesson coming soon</h2>
        <p>This is a verified curriculum entry. Tutorly's teaching notes, revision and worked examples for this chapter have not been reviewed yet.</p>
        <p>You can read the official source or ask the AI Tutor. AI explanations are generated, not verified textbook content.</p>
        ${source ? `<a class="lesson-action" href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">Open official chapter source</a>` : ""}
        <a class="lesson-action" href="maths_gpt.html?curriculumChapter=${encodeURIComponent(chapter.id)}">Ask Tutorly about this chapter</a>
        <a class="lesson-action" href="maths_gpt.html?practiceChapter=${encodeURIComponent(chapter.id)}">Practise this chapter</a>
        <a class="lesson-action" href="tests.html?curriculumChapter=${encodeURIComponent(chapter.id)}">Create a test from my chapter notes</a>
      </section>`;
  }
  function quickRevisionHtml(subject, chapter) { return lessonHtml(subject, chapter); }
  function contentsHtml() { return '<a href="#lessonPendingTitle">Lesson availability</a>'; }

  function highlight(html, term) {
    if (!term) return html;
    const safe = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return html.replace(new RegExp(`(${safe})`, "gi"), "<mark>$1</mark>");
  }

  function renderLesson() {
    const subject = Data.getSubject(state.subjectId);
    const chapter = Data.getChapter(state.subjectId, state.chapterId);
    if (!subject || !chapter) return;
    $("readerTitle").textContent = chapter.title;
    $("readerMeta").textContent = `${subject.name} | ${chapter.bookTitle} | Verified curriculum chapter`;
    $("lessonProgressText").textContent = "Chapter opened · reviewed lesson pending";
    $("lessonContent").style.setProperty("--reader-zoom", state.zoom);
    $("lessonContent").innerHTML = highlight(state.quickRevision ? quickRevisionHtml(subject, chapter) : lessonHtml(subject, chapter), state.searchTerm);
    $("readerContents").innerHTML = contentsHtml();
    $("quickModeBtn").textContent = state.quickRevision ? "Full Lesson" : "Quick Revision";
    $("quickModeBtn").classList.toggle("active", state.quickRevision);
    syncActionButtons();
  }

  function syncActionButtons() {
    const key = lessonKey(state.subjectId, state.chapterId);
    const bookmarks = readJson(BOOKMARK_KEY, {});
    const offline = readJson(OFFLINE_KEY, {});
    $("bookmarkBtn").classList.toggle("active", !!bookmarks[key]);
    $("bookmarkBtn").textContent = bookmarks[key] ? "Bookmarked" : "Bookmark";
    $("offlineBtn").classList.toggle("active", !!offline[key]);
    $("offlineBtn").textContent = offline[key] ? "Saved Offline" : "Save Offline";
    $("themeBtn").textContent = state.theme === "dark" ? "Light Mode" : "Dark Mode";
  }

  function setZoom(next) {
    state.zoom = Math.max(0.82, Math.min(1.32, next));
    $("lessonContent").style.setProperty("--reader-zoom", state.zoom);
  }

  function toggleFullscreen() {
    const reader = $("readerView");
    if (!document.fullscreenElement && reader.requestFullscreen) {
      reader.requestFullscreen();
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }

  function toggleTheme() {
    state.theme = state.theme === "dark" ? "light" : "dark";
    localStorage.setItem("tutorly_lessons_theme", state.theme);
    document.body.classList.toggle("lesson-dark", state.theme === "dark");
    document.body.dataset.theme = state.theme;
    syncActionButtons();
  }

  function toggleBookmark() {
    const subject = Data.getSubject(state.subjectId);
    const chapter = Data.getChapter(state.subjectId, state.chapterId);
    const key = lessonKey(subject.id, chapter.id);
    const bookmarks = readJson(BOOKMARK_KEY, {});
    if (bookmarks[key]) delete bookmarks[key];
    else bookmarks[key] = { subject: subject.name, chapter: chapter.title, savedAt: new Date().toISOString() };
    writeJson(BOOKMARK_KEY, bookmarks);
    syncActionButtons();
  }

  function saveOffline() {
    const subject = Data.getSubject(state.subjectId);
    const chapter = Data.getChapter(state.subjectId, state.chapterId);
    const key = lessonKey(subject.id, chapter.id);
    const offline = readJson(OFFLINE_KEY, {});
    offline[key] = {
      subject: subject.name,
      chapter: chapter.title,
      savedAt: new Date().toISOString(),
      html: lessonHtml(subject, chapter)
    };
    writeJson(OFFLINE_KEY, offline);
    syncActionButtons();
  }

  async function copyNotes() {
    const subject = Data.getSubject(state.subjectId);
    const chapter = Data.getChapter(state.subjectId, state.chapterId);
    const text = [
      `${subject.name} - ${chapter.title}`,
      "",
      "Curriculum metadata only. Reviewed lesson notes are not available yet.",
      `Book: ${chapter.bookTitle}`,
      `Official source: ${chapter.sourceUrl || 'Not available'}`
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
    $("copyNotesBtn").textContent = "Reference copied";
      setTimeout(() => { $("copyNotesBtn").textContent = "Copy Notes"; }, 1200);
    } catch (_error) {
      alert(text);
    }
  }

  function openPdfExport() {
    const subject = Data.getSubject(state.subjectId);
    const chapter = Data.getChapter(state.subjectId, state.chapterId);
    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) {
      window.print();
      return;
    }
    printWindow.document.write(`
      <!doctype html>
      <html>
      <head>
        <title>${escapeHtml(subject.name)} - ${escapeHtml(chapter.title)}</title>
        <style>${document.getElementById("lessonPrintStyles").textContent}</style>
      </head>
      <body class="pdf-export">
        ${lessonHtml(subject, chapter)}
        <script>window.onload=function(){window.print();};<\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }

  window.addEventListener("DOMContentLoaded", init);
})();
