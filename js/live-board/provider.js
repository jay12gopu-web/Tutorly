(function () {
  "use strict";

  const root = window.TutorlyLiveBoard = window.TutorlyLiveBoard || {};

  /*
   * VisualLessonProvider boundary.
   *
   * The browser never receives provider secrets and never executes model code.
   * A production Tutorly endpoint can later implement:
   *
   * POST /api/live-board/generate
   * { prompt, currentLesson, compactBoardState, chatContext, semanticRoute }
   *
   * The server should call the selected AI provider, validate the returned
   * LiveBoardLesson schema, then return only approved command data.
   */
  class VisualLessonProvider {
    async generateLesson(_request) {
      throw new Error("VisualLessonProvider.generateLesson must be implemented.");
    }
  }

  class MockProvider extends VisualLessonProvider {
    async generateLesson(request) {
      return root.MockVisualLessonProvider.generateLesson(request);
    }
  }

  async function generateLesson(request = {}) {
    const provider = new MockProvider();
    const lesson = await provider.generateLesson(request);
    const validation = root.validateLesson(lesson);
    if (!validation.ok) throw new Error(validation.error);
    return validation.value;
  }

  root.VisualLessonProvider = VisualLessonProvider;
  root.generateLesson = generateLesson;
})();
