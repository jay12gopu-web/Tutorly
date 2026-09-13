(function () {
  "use strict";

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
  const state = { catalog: null, subjects: [], subject: null };

  function startPractice(subject, chapter = {}) {
    localStorage.setItem("tutorly_practice_subject_id", subject.id);
    localStorage.setItem("tutorly_practice_subject", subject.name);
    window.TutorlyCurriculum.setActiveContext({
      board: state.catalog.board, grade: state.catalog.grade,
      academic_year: state.catalog.academic_year, medium: state.catalog.medium,
      subject_id: subject.id, subject: subject.name,
      book_id: chapter.bookId || "", book: chapter.bookTitle || "",
      chapter_id: chapter.id || "", chapter: chapter.name || "", source_url: chapter.sourceUrl || ""
    });
    window.location.href = "tests.html?mode=practice";
  }

  function renderSubjects(grid, status) {
    const { catalog, subjects } = state;
    status.textContent = subjects.length
      ? `Grade ${catalog.grade} · ${catalog.board} · ${catalog.academic_year}`
      : catalog.message;
    grid.innerHTML = subjects.map((subject) => `
      <article class="foundation-card">
        <h2>${escapeHtml(subject.name)}</h2>
        <p>${subject.chapters.length} verified ${subject.chapters.length === 1 ? "chapter" : "chapters"} across ${subject.books.length} ${subject.books.length === 1 ? "book" : "books"}.</p>
        <button class="foundation-button" data-curriculum-practice-subject="${escapeHtml(subject.id)}" type="button">Choose chapter</button>
      </article>
    `).join("") || `<article class="foundation-card"><h2>${catalog.status === "profile_incomplete" ? "Set up your curriculum" : "Curriculum unavailable"}</h2><p>${escapeHtml(catalog.message)}</p>${catalog.status === "error" ? '<button class="foundation-button" data-curriculum-retry type="button">Retry</button>' : ""}</article>`;
    grid.querySelectorAll("[data-curriculum-practice-subject]").forEach((button) => button.addEventListener("click", () => {
      state.subject = subjects.find((item) => item.id === button.dataset.curriculumPracticeSubject) || null;
      renderChapters(grid, status);
    }));
    grid.querySelector("[data-curriculum-retry]")?.addEventListener("click", () => load(grid, status, true));
  }

  function renderChapters(grid, status) {
    const subject = state.subject;
    if (!subject) return renderSubjects(grid, status);
    status.textContent = `${subject.name} · choose a verified chapter to practise`;
    grid.innerHTML = `<article class="foundation-card foundation-card-wide">
      <button class="foundation-button-secondary" data-practice-back type="button">Back to subjects</button>
      <h2>${escapeHtml(subject.name)}</h2>
      <p>Choose one chapter. Tutorly keeps your Board, Grade and chapter context for this practice session.</p>
      <div class="foundation-grid">${subject.chapters.map((chapter) => `<article class="foundation-card">
        <p>${escapeHtml(chapter.partLabel || chapter.bookTitle)}</p>
        <h2>Chapter ${escapeHtml(chapter.number)}: ${escapeHtml(chapter.name)}</h2>
        <button class="foundation-button" data-curriculum-practice-chapter="${escapeHtml(chapter.id)}" type="button">Practise this chapter</button>
      </article>`).join("")}</div>
      <button class="foundation-button-secondary" data-curriculum-practice-all type="button">Practise all ${escapeHtml(subject.name)} chapters</button>
    </article>`;
    grid.querySelector("[data-practice-back]")?.addEventListener("click", () => { state.subject = null; renderSubjects(grid, status); });
    grid.querySelectorAll("[data-curriculum-practice-chapter]").forEach((button) => button.addEventListener("click", () => {
      startPractice(subject, subject.chapters.find((chapter) => chapter.id === button.dataset.curriculumPracticeChapter));
    }));
    grid.querySelector("[data-curriculum-practice-all]")?.addEventListener("click", () => startPractice(subject));
  }

  async function load(grid, status, refresh = false) {
    status.textContent = "Loading your curriculum…";
    state.catalog = await window.TutorlyCurriculum.load({ refresh });
    state.subjects = window.TutorlyCurriculum.subjectModels(state.catalog);
    if (!refresh) state.subject = null;
    state.subject ? renderChapters(grid, status) : renderSubjects(grid, status);
  }

  window.addEventListener("DOMContentLoaded", () => {
    const grid = document.getElementById("practiceSubjectGrid");
    const status = document.getElementById("practiceCurriculumStatus");
    if (grid && status && window.TutorlyCurriculum) load(grid, status);
  });
})();
