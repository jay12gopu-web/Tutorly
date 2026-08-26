(function () {
  "use strict";

  const data = {
    subjects: [],
    catalog: null,
    message: "",

    async load() {
      if (!window.TutorlyCurriculum) throw new Error("Tutorly curriculum client is unavailable.");
      this.catalog = await window.TutorlyCurriculum.load();
      this.message = this.catalog.message || "";
      this.subjects = window.TutorlyCurriculum.subjectModels(this.catalog).map((subject) => ({
        ...subject,
        chapters: subject.chapters.map((chapter) => ({
          ...chapter,
          concepts: chapter.concepts.length ? chapter.concepts : [chapter.title],
          applications: ["classroom learning"],
          minutes: 0,
          difficulty: chapter.bookTitle
        }))
      }));
      return this.catalog;
    },

    getSubject(subjectId) {
      return this.subjects.find((subject) => subject.id === subjectId) || null;
    },

    getChapter(subjectId, chapterId) {
      return this.getSubject(subjectId)?.chapters.find((chapter) => chapter.id === chapterId) || null;
    }
  };

  window.TutorlyLessonsData = data;
})();
