(function () {
  const core = window.TutorlyChatbot;
  if (!core || core.getModule("modes")) return;

  const MODES = {
    spark: {
      id: "spark",
      group: "fast",
      name: "Spark",
      icon: "\u26A1",
      description: "Fast homework help",
      loading: "Analyzing",
      delayMultiplier: 0.55,
      answerDepth: "short",
      stream: true,
      temperatureHint: 0.25,
      educationStyle: "quick",
      payloadHints: {
        responseLength: "short",
        tutorMode: "fast",
        shouldAskFollowUp: false
      }
    },
    prime: {
      id: "prime",
      group: "balanced",
      name: "Prime",
      icon: "\u2726",
      description: "Best for most students",
      loading: "Assessing",
      delayMultiplier: 1,
      answerDepth: "balanced",
      stream: true,
      temperatureHint: 0.35,
      educationStyle: "study-note",
      payloadHints: {
        responseLength: "medium",
        tutorMode: "balanced",
        shouldAskFollowUp: true
      }
    },
    lens: {
      id: "lens",
      group: "multimodal",
      name: "Lens",
      icon: "\u25C9",
      description: "Solve from photos",
      loading: "Interpreting",
      delayMultiplier: 0.9,
      answerDepth: "image-aware",
      stream: true,
      temperatureHint: 0.3,
      educationStyle: "ocr-solution",
      payloadHints: {
        responseLength: "medium",
        tutorMode: "image",
        shouldAskFollowUp: true,
        needsImageContext: true
      }
    },
    deep: {
      id: "deep",
      group: "reasoning",
      name: "Deep Think",
      icon: "\u2234",
      description: "Careful step-by-step reasoning",
      loading: "Synthesizing",
      delayMultiplier: 1.35,
      answerDepth: "deep",
      stream: true,
      temperatureHint: 0.22,
      educationStyle: "deep-explanation",
      payloadHints: {
        responseLength: "long",
        tutorMode: "deep",
        shouldAskFollowUp: true,
        showReasoningPlan: true
      }
    },
    research: {
      id: "research",
      group: "research",
      name: "Research",
      icon: "\u2315",
      description: "Organized facts and citations",
      loading: "Reviewing",
      delayMultiplier: 1.2,
      answerDepth: "research",
      stream: true,
      temperatureHint: 0.18,
      educationStyle: "cited-note",
      payloadHints: {
        responseLength: "long",
        tutorMode: "research",
        shouldAskFollowUp: true,
        preferCitations: true
      }
    },
    creative: {
      id: "creative",
      group: "creative",
      name: "Creative",
      icon: "\u2727",
      description: "Ideas, writing, and examples",
      loading: "Structuring",
      delayMultiplier: 1.05,
      answerDepth: "creative",
      stream: true,
      temperatureHint: 0.72,
      educationStyle: "creative-coach",
      payloadHints: {
        responseLength: "medium",
        tutorMode: "creative",
        shouldAskFollowUp: true,
        allowAnalogies: true
      }
    },
    study: {
      id: "study",
      group: "education",
      name: "Study",
      icon: "\u25A3",
      description: "Quizzes, flashcards, revision",
      loading: "Clarifying",
      delayMultiplier: 1.05,
      answerDepth: "study",
      stream: true,
      temperatureHint: 0.32,
      educationStyle: "learning-plan",
      payloadHints: {
        responseLength: "medium",
        tutorMode: "study",
        shouldAskFollowUp: true,
        includePractice: true
      }
    }
  };

  const ALIASES = {
    fast: "spark",
    quick: "spark",
    default: "prime",
    photo: "lens",
    image: "lens",
    camera: "lens",
    deepthink: "deep",
    think: "deep",
    facts: "research",
    cite: "research",
    writing: "creative",
    idea: "creative",
    revision: "study",
    quiz: "study"
  };

  function normalize(modelId) {
    const raw = String(modelId || "prime").toLowerCase().replace(/[^a-z0-9]/g, "");
    const mapped = ALIASES[raw] || raw;
    return MODES[mapped] ? mapped : "prime";
  }

  function get(modelId) {
    return MODES[normalize(modelId)];
  }

  function all() {
    return Object.values(MODES);
  }

  function asAppConfigs() {
    return all().reduce((configs, mode) => {
      configs[mode.id] = {
        id: mode.id,
        name: mode.name,
        icon: mode.icon,
        description: mode.description,
        loading: mode.loading
      };
      return configs;
    }, {});
  }

  function getDelay(text, modelId, baseDelay, context = {}) {
    const mode = get(modelId);
    const extraImageDelay = context.hasImage && mode.id !== "spark" ? 250 : 0;
    return Math.max(450, Math.round(baseDelay * mode.delayMultiplier + extraImageDelay));
  }

  function createPayloadMeta(modelId) {
    const mode = get(modelId);
    return {
      id: mode.id,
      name: mode.name,
      group: mode.group,
      answerDepth: mode.answerDepth,
      educationStyle: mode.educationStyle,
      temperatureHint: mode.temperatureHint,
      ...mode.payloadHints
    };
  }

  function getResponseDirectives(modelId) {
    const mode = get(modelId);
    const common = [
      "Keep the answer student-friendly.",
      "Use clean markdown only for educational replies.",
      "Avoid labels like Big Idea or How to Think."
    ];

    const perMode = {
      spark: ["Answer quickly.", "Prefer compact steps.", "Avoid long side notes."],
      prime: ["Balance clarity and detail.", "Use examples when they help."],
      lens: ["Mention image text extraction only when an image exists.", "Explain the solved content clearly."],
      deep: ["Include deeper reasoning.", "Show the important steps without overexplaining trivial arithmetic."],
      research: ["Organize facts carefully.", "Add citation-style placeholders only for verifiable claims."],
      creative: ["Offer fresh examples.", "Keep the tone warm and flexible."],
      study: ["Add revision support.", "Suggest practice questions or flashcards when useful."]
    };

    return common.concat(perMode[mode.id] || []);
  }

  core.registerModule("modes", {
    normalize,
    get,
    all,
    asAppConfigs,
    getDelay,
    createPayloadMeta,
    getResponseDirectives
  });
})();
