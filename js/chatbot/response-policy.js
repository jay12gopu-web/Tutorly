(function () {
  "use strict";

  const ACTIONS = {
    explain_simpler: {
      label: "Explain Simpler",
      prompt: (question) => `Explain this more simply, using easier words: ${question}`
    },
    more_detail: {
      label: "More Detail",
      prompt: (question) => `Explain this in more detail without repeating unnecessary points: ${question}`
    },
    give_example: {
      label: "Give an Example",
      prompt: (question) => `Give me one clear example that teaches this idea: ${question}`
    },
    quiz_me: {
      label: "Quiz Me",
      prompt: (question) => `Quiz me with one question about this topic. Do not reveal the answer yet: ${question}`
    },
    show_diagram: {
      label: "Show Diagram",
      prompt: (question) => `Explain this with a useful labeled diagram: ${question}`
    },
    explain_this_step: {
      label: "Explain This Step",
      prompt: (question) => `Explain the most important step in this solution more carefully: ${question}`
    },
    another_method: {
      label: "Another Method",
      prompt: (question) => `Solve or explain this using another valid method: ${question}`
    },
    similar_question: {
      label: "Similar Question",
      prompt: (question) => `Give me one similar question to try. Do not show its solution yet: ${question}`
    },
    harder_question: {
      label: "Harder Question",
      prompt: (question) => `Give me a slightly harder question based on this topic. Do not solve it yet: ${question}`
    },
    real_life_use: {
      label: "Real-Life Use",
      prompt: (question) => `Show one useful real-life application of this concept: ${question}`
    }
  };

  function semanticRoute(options = {}) {
    return options.semanticRoute || options.route || options.context?.semanticRoute || null;
  }

  function actionIdsForRoute(route) {
    const intent = String(route?.intent || "");
    const subject = String(route?.subject || "");
    if (intent === "answer_only") return ["more_detail"];
    if (intent === "teach_topic") return ["explain_simpler", "give_example", "more_detail"];
    if (["numerical_problem", "solve_equation", "proof"].includes(intent)) {
      return ["explain_this_step", "another_method", "more_detail"];
    }
    if (["physics", "chemistry", "biology", "science"].includes(subject)) {
      return ["explain_simpler", "give_example", "more_detail"];
    }
    if (subject === "english") return ["give_example", "more_detail", "explain_simpler"];
    return ["explain_simpler", "give_example", "more_detail"];
  }

  function materializeActions(ids, question) {
    return ids.filter((id) => ACTIONS[id]).slice(0, 3).map((id) => ({
      id,
      label: ACTIONS[id].label,
      prompt: ACTIONS[id].prompt(String(question || "").trim())
    }));
  }

  function materializeBackendActions(actions, question) {
    if (!Array.isArray(actions)) return [];
    return actions.slice(0, 3).map((item) => {
      const id = String(item?.id || "");
      const action = ACTIONS[id];
      if (!action) return null;
      return {
        id,
        label: String(item?.label || action.label),
        prompt: action.prompt(String(question || "").trim())
      };
    }).filter(Boolean);
  }

  function analyze(question, options = {}) {
    const route = semanticRoute(options);
    if (!route) {
      return {
        subject: "general",
        kind: "general",
        answerOnly: false,
        visual: { needed: false, type: "none", reason: "No validated semantic route is available." },
        actions: []
      };
    }
    const backendActions = materializeBackendActions(
      options.quickActions || options.context?.quickActions,
      question
    );
    return {
      subject: route.subject || "general",
      topic: route.topic || "",
      kind: route.answer_format || route.response_type || "concept_explanation",
      intent: route.intent || "concept_explanation",
      responseLength: route.response_length || "short",
      answerOnly: route.intent === "answer_only" || route.response_type === "direct_answer",
      visual: route.visual || { needed: false, type: "none", reason: "No visual is needed." },
      tools: route.tools || {},
      actions: backendActions.length
        ? backendActions
        : materializeActions(actionIdsForRoute(route), question)
    };
  }

  function preserveMarkdown(answer) {
    return String(answer || "").trim();
  }

  window.TutorlyResponsePolicy = {
    ACTIONS,
    analyze,
    actionsFor(question, answer, options = {}) {
      return analyze(question, options).actions;
    },
    visualPlanFor(question, options = {}) {
      return analyze(question, options).visual;
    },
    preserveMarkdown
  };
})();
