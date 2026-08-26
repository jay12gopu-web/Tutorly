(function () {
  "use strict";

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  })[character]);

  async function init() {
    const grid = document.getElementById("practiceSubjectGrid");
    const status = document.getElementById("practiceCurriculumStatus");
    if (!grid || !window.TutorlyCurriculum) return;

    const catalog = await window.TutorlyCurriculum.load();
    const subjects = window.TutorlyCurriculum.subjectModels(catalog);
    if (status) {
      status.textContent = subjects.length
        ? `Grade ${catalog.grade} · ${catalog.board} · ${catalog.academic_year}`
        : catalog.message;
    }
    grid.innerHTML = subjects.map((subject) => `
      <article class="foundation-card">
        <h2>${escapeHtml(subject.name)}</h2>
        <p>${subject.chapters.length} verified ${subject.chapters.length === 1 ? "chapter" : "chapters"} across ${subject.books.length} ${subject.books.length === 1 ? "book" : "books"}.</p>
        <button class="foundation-button" data-curriculum-practice-subject="${escapeHtml(subject.id)}" type="button">Start practice</button>
      </article>
    `).join("") || `<article class="foundation-card"><h2>Curriculum unavailable</h2><p>${escapeHtml(catalog.message)}</p></article>`;

    grid.querySelectorAll("[data-curriculum-practice-subject]").forEach((button) => {
      button.addEventListener("click", () => {
        const subject = subjects.find((item) => item.id === button.dataset.curriculumPracticeSubject);
        if (!subject) return;
        localStorage.setItem("tutorly_practice_subject_id", subject.id);
        localStorage.setItem("tutorly_practice_subject", subject.name);
        window.TutorlyCurriculum.setActiveContext({
          board: catalog.board,
          grade: catalog.grade,
          academic_year: catalog.academic_year,
          medium: catalog.medium,
          subject_id: subject.id,
          subject: subject.name
        });
        window.location.href = "tests.html?mode=practice";
      });
    });
  }

  window.addEventListener("DOMContentLoaded", init);
})();
