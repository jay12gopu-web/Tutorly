(function () {
  "use strict";

  let activeCatalog = null;
  let subjects = [];

  function normalizeBoard(board) {
    return window.TutorlyCurriculum?.normalizeBoard(board) || String(board || "").trim().toUpperCase();
  }

  function normalizeGrade(grade) {
    return window.TutorlyCurriculum?.normalizeGrade(grade) || String(grade || "").replace(/\D/g, "");
  }

  async function load(grade, board, options = {}) {
    if (!window.TutorlyCurriculum) throw new Error("Tutorly curriculum client is unavailable.");
    activeCatalog = await window.TutorlyCurriculum.load({
      ...options,
      profile: { grade: normalizeGrade(grade), board: normalizeBoard(board) }
    });
    subjects = window.TutorlyCurriculum.subjectModels(activeCatalog).map((subject) => ({
      ...subject,
      accent: subject.color,
      chapters: subject.chapters.map((chapter) => ({
        ...chapter,
        concepts: chapter.concepts.length ? chapter.concepts : [chapter.name]
      }))
    }));
    return activeCatalog;
  }

  function getSubjects() {
    return subjects;
  }

  function getChapters(_grade, _board, subjectId) {
    return subjects.find((subject) => subject.id === subjectId)?.chapters || [];
  }

  function getSyllabus() {
    return {
      available: Boolean(activeCatalog?.available),
      message: activeCatalog?.message || window.TutorlyCurriculum?.UNAVAILABLE_MESSAGE || "Curriculum unavailable.",
      subjects
    };
  }

  window.TutorlySyllabus = Object.freeze({
    load,
    getSubjects,
    getChapters,
    getSyllabus,
    normalizeBoard,
    normalizeGrade
  });
})();
