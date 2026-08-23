document.addEventListener("DOMContentLoaded", () => {
  const body = document.body;
  const chatShell = document.getElementById("chatShell");
  const sidebar = document.getElementById("sidebar");
  const sidebarToggle = document.getElementById("sidebarToggle");
  const mobileMenu = document.getElementById("mobileMenu");
  const newChatBtn = document.getElementById("newChatBtn");
  const chatHistoryBtn = document.getElementById("chatHistoryBtn");
  const settingsBtn = document.getElementById("settingsBtn");
  const uploadInput = document.getElementById("uploadInput");
  const uploadBtn = document.getElementById("uploadBtn");
  const cameraBtn = document.getElementById("cameraBtn");
  const speechTextBtn = document.getElementById("speechTextBtn");
  const voiceBtn = document.getElementById("voiceBtn");
  const voiceWaveBars = document.querySelectorAll("#voiceWave span");
  const modelSelector = document.getElementById("modelSelector");
  const modelSelectorBtn = document.getElementById("modelSelectorBtn");
  const modelMenu = document.getElementById("modelMenu");
  const selectedModelIcon = document.getElementById("selectedModelIcon");
  const selectedModelName = document.getElementById("selectedModelName");
  const selectedModelDesc = document.getElementById("selectedModelDesc");
  const modelOptions = document.querySelectorAll(".model-option");
  const chatTitle = document.getElementById("chatTitle");
  const chatNotificationBtn = document.getElementById("chatNotificationBtn");
  const input = document.getElementById("input");
  const sendBtn = document.getElementById("sendBtn");
  const messages = document.getElementById("messages");
  const chatWindow = document.getElementById("chatWindow");
  const suggestionChips = document.querySelectorAll(".suggestion-chip");
  const disclaimer = document.querySelector(".disclaimer");
  let speakLiveReply = null;
  let chatRequestInFlight = false;

  if (!input || !sendBtn || !messages || !chatWindow) {
    return;
  }

  const ChatbotCore = window.TutorlyChatbot || null;
  const ChatbotModes = ChatbotCore?.getModule?.("modes") || null;
  const ChatHistory = ChatbotCore?.getModule?.("history") || null;
  const ChatMemory = ChatbotCore?.getModule?.("memory") || null;
  const LearningTools = ChatbotCore?.getModule?.("learningTools") || null;
  const GPT = window.TutorlyGPT || null;
  const ResponseContract = window.TutorlyResponseContract || null;
  const MathResponseContract = window.TutorlyMathResponseContract || null;
  const ResponsePolicy = window.TutorlyResponsePolicy || null;
  const EducationalVisuals = window.TutorlyEducationalVisuals || null;
  const ENABLE_LEGACY_LOCAL_ROUTER = false;
  const BOT_AVATAR_SRC = "assets/chatbot-star.png";
  const MODEL_STORAGE_KEY = "tutorly_selected_ai_model";
  const MODEL_CONFIGS = {
    spark: {
      id: "spark",
      name: "Spark",
      icon: "⚡",
      description: "Fast homework help",
      loading: "Thinking fast..."
    },
    prime: {
      id: "prime",
      name: "Prime",
      icon: "✦",
      description: "Best for most students",
      loading: "Tutorly is thinking..."
    },
    lens: {
      id: "lens",
      name: "Lens",
      icon: "◉",
      description: "Solve from photos",
      loading: "Analyzing image..."
    }
  };
  if (GPT?.getAppModelConfigs) {
    Object.assign(MODEL_CONFIGS, GPT.getAppModelConfigs());
  } else if (ChatbotModes?.asAppConfigs) {
    Object.assign(MODEL_CONFIGS, ChatbotModes.asAppConfigs());
  }
  const MODEL_BODY_CLASSES = Object.keys(MODEL_CONFIGS).map((modelId) => `model-${modelId}`);
  const WELCOME_TRIAL_LIMIT = 5;
  const WELCOME_TRIAL_KEY = "tutorly_bot_try_count";
  const pageParams = new URLSearchParams(window.location.search);
  const isWelcomeTrial = pageParams.get("entry") === "welcome";
  let selectedModel = getStoredModel();
  let activeConversationId = GPT?.getActiveConversationId?.() || ChatHistory?.getActiveConversationId?.() || null;
  let welcomeTrialLocked = false;
  let pendingImage = null;
  let tesseractLoaderPromise = null;
  let cameraStream = null;

  const numberFormatter = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 8
  });

  function formatNumber(value) {
    if (!Number.isFinite(value)) return String(value);
    const cleanValue = Math.abs(value) < 1e-10 ? 0 : value;
    return numberFormatter.format(cleanValue);
  }

  function normalizeModelId(modelId) {
    const normalized = GPT?.normalizeModel?.(modelId) || ChatbotModes?.normalize?.(modelId) || modelId;
    return MODEL_CONFIGS[normalized] ? normalized : "prime";
  }

  function getStoredModel() {
    try {
      return normalizeModelId(localStorage.getItem(MODEL_STORAGE_KEY) || "prime");
    } catch (error) {
      return "prime";
    }
  }

  function getSelectedModelConfig() {
    return MODEL_CONFIGS[normalizeModelId(selectedModel)];
  }

  function closeModelMenu() {
    if (!modelSelector || !modelSelectorBtn) return;
    modelSelector.classList.remove("open");
    modelSelectorBtn.setAttribute("aria-expanded", "false");
  }

  function updateModelSelectorUi() {
    const config = getSelectedModelConfig();
    body.classList.remove(...MODEL_BODY_CLASSES);
    body.classList.add(`model-${config.id}`);

    if (selectedModelIcon) selectedModelIcon.textContent = config.icon;
    if (selectedModelName) selectedModelName.textContent = config.name;
    if (selectedModelDesc) selectedModelDesc.textContent = config.description;

    modelOptions.forEach((option) => {
      const isActive = option.dataset.model === config.id;
      option.classList.toggle("active", isActive);
      option.setAttribute("aria-selected", String(isActive));
    });
  }

  function setSelectedModel(modelId, options = {}) {
    const nextModel = normalizeModelId(modelId);
    selectedModel = nextModel;
    try {
      localStorage.setItem(MODEL_STORAGE_KEY, nextModel);
    } catch (error) {
      // localStorage can fail in strict privacy modes; the UI still updates for this session.
    }

    updateModelSelectorUi();
    closeModelMenu();

    if (options.announce) {
      showToast(`${MODEL_CONFIGS[nextModel].name} mode selected.`);
    }
  }

  function createChatRequestPayload(message, options = {}) {
    const model = getSelectedModelConfig().id;
    if (GPT?.createRequestPayload) {
      return GPT.createRequestPayload(message, { ...options, model, selectedModel: model });
    }
    return {
      message,
      model,
      mode: ChatbotModes?.createPayloadMeta?.(model) || { id: model },
      responseDirectives: ChatbotModes?.getResponseDirectives?.(model) || [],
      memoryContext: ChatMemory?.buildContext?.({ mode }) || null,
      hasImage: !!options.hasImage,
      imageSource: options.imageSource || null,
      imageDataUrl: options.imageDataUrl || "",
      extractedText: options.extractedText || ""
    };
  }

  function getBackendOrigin() {
    const configuredOrigin = window.TUTORLY_BACKEND_ORIGIN || (() => {
      try {
        return localStorage.getItem("tutorly_backend_origin") || "";
      } catch (error) {
        return "";
      }
    })();
    if (configuredOrigin) return configuredOrigin.replace(/\/+$/, "");

    const isFastApiOrigin = window.location.hostname === "127.0.0.1"
      && window.location.port === "8000";
    if (isFastApiOrigin) return "";

    const isLocalDevelopment = ["127.0.0.1", "localhost"].includes(window.location.hostname);
    if (!isLocalDevelopment && ["http:", "https:"].includes(window.location.protocol)) {
      return "https://tutorly-api.onrender.com";
    }

    return "http://127.0.0.1:8000";
  }

  function getBackendEndpoint(path) {
    const origin = getBackendOrigin();
    return `${origin}${path}`;
  }

  function getChatEndpoint() {
    return getBackendEndpoint("/api/chat");
  }

  function getLegacyChatEndpoint() {
    return getBackendEndpoint("/chat");
  }

  function getChatFeedbackEndpoint() {
    return getBackendEndpoint("/api/chatbot/feedback");
  }

  function getLegacyChatFeedbackEndpoint() {
    return getBackendEndpoint("/chat-feedback");
  }

  function createBackendChatRequest(message, context = {}) {
    const model = normalizeModelId(context.model || context.selectedModel || selectedModel);
    const conversationId = context.conversationId || activeConversationId || null;
    const conversation = conversationId
      ? (GPT?.getConversation?.(conversationId) || ChatHistory?.getConversation?.(conversationId))
      : null;
    const history = (conversation?.messages || [])
      .filter((item) => item?.role === "user" || item?.role === "assistant")
      .slice(-8)
      .map((item) => ({ role: item.role, content: String(item.content || "").slice(0, 5000) }));
    const learner = context.memoryContext?.learner || {};
    let savedGrade = learner.grade || "";
    try {
      savedGrade = savedGrade || localStorage.getItem("tutorly_grade") || "";
    } catch (error) {
      // Grade is optional; the semantic tutor will infer conservatively when unavailable.
    }
    return {
      user_id: getChatUserId(),
      conversation_id: conversationId,
      message,
      mode: model,
      history,
      profile: {
        user_id: getChatUserId(),
        grade: savedGrade || null,
        weak_concepts: Array.isArray(learner.weakSubjects) ? learner.weakSubjects : [],
        strong_concepts: Array.isArray(learner.strongSubjects) ? learner.strongSubjects : []
      },
      attachments: context.hasImage ? [{
        type: "image",
        url: context.imageSource || null,
        extracted_text: context.extractedText || "",
        metadata: {
          source: "chat-ui",
          data_url: context.imageDataUrl || ""
        }
      }] : [],
      client_context: {
        source: "maths_gpt.html",
        model,
        adaptiveContext: context.adaptiveContext || null,
        hasImage: !!context.hasImage
      }
    };
  }

  function createLegacyChatRequest(message, context = {}) {
    return {
      userId: getChatUserId(),
      message,
      model: normalizeModelId(context.model || context.selectedModel || selectedModel),
      adaptiveContext: context.adaptiveContext || null
    };
  }

  function normalizeBackendDiagnostics(data) {
    if (data?.diagnostics) return data.diagnostics;
    const analysis = data?.metadata?.analysis || data?.analytics || {};
    const knowledge = data?.metadata?.knowledge_confidence || {};
    const patterns = Array.isArray(data?.metadata?.pattern_matches) ? data.metadata.pattern_matches : [];
    if (!analysis && !data?.subject) return null;

    return {
      subject: analysis.subject || data?.subject || "-",
      topic: analysis.topic || "-",
      subtopic: analysis.sub_topic || analysis.subtopic || "-",
      difficulty: analysis.difficulty || "-",
      questionType: analysis.question_type || "-",
      confidenceScore: analysis.confidence ?? knowledge.confidence_score ?? "-",
      patternMatch: patterns.length > 0,
      patterns,
      search: {
        triggered: false,
        provider: "-",
        resultsFound: 0
      },
      teachingStrategy: data?.metadata?.recommended_teaching_strategy || data?.metadata?.mode_strategy || "-",
      templateUsed: data?.subject || "-",
      validation: {
        status: Array.isArray(data?.metadata?.verification_issues) && data.metadata.verification_issues.length
          ? "repaired"
          : "passed"
      }
    };
  }

  function isDeveloperMode() {
    try {
      return pageParams.get("dev") === "1" || localStorage.getItem("tutorly_developer_mode") === "true";
    } catch (error) {
      return pageParams.get("dev") === "1";
    }
  }

  function updateDeveloperDiagnosticsPanel(diagnostics) {
    if (!isDeveloperMode() || !diagnostics) return;

    let panel = document.getElementById("tutorlyDevDiagnostics");
    if (!panel) {
      panel = document.createElement("aside");
      panel.id = "tutorlyDevDiagnostics";
      panel.setAttribute("aria-label", "Tutorly developer diagnostics");
      panel.style.cssText = [
        "position:fixed",
        "right:16px",
        "bottom:16px",
        "z-index:9999",
        "width:min(360px,calc(100vw - 32px))",
        "max-height:52vh",
        "overflow:auto",
        "padding:14px",
        "border-radius:18px",
        "background:rgba(12,18,38,.86)",
        "color:#eef4ff",
        "border:1px solid rgba(155,171,255,.35)",
        "box-shadow:0 18px 48px rgba(40,58,120,.28)",
        "backdrop-filter:blur(18px)",
        "font:12px/1.45 Inter,system-ui,sans-serif"
      ].join(";");
      document.body.appendChild(panel);
    }

    const patterns = Array.isArray(diagnostics.patterns) ? diagnostics.patterns : [];
    const bestPattern = patterns[0];
    const search = diagnostics.search || {};
    const validation = diagnostics.validation || {};
    const rows = [
      ["Subject", diagnostics.subject || "-"],
      ["Topic", diagnostics.topic || "-"],
      ["Subtopic", diagnostics.subtopic || "-"],
      ["Difficulty", diagnostics.difficulty || "-"],
      ["Question Type", diagnostics.questionType || "-"],
      ["Confidence", diagnostics.confidenceScore ?? "-"],
      ["Pattern Match", diagnostics.patternMatch ? "Yes" : "No"],
      ["Similarity", bestPattern ? `${Math.round(Number(bestPattern.similarity || 0) * 100)}%` : "-"],
      ["Relevance", bestPattern ? `${Math.round(Number(bestPattern.relevanceScore || 0) * 100)}%` : "-"],
      ["Search", search.triggered ? "Yes" : "No"],
      ["Provider", search.provider || "-"],
      ["Results", search.resultsFound ?? 0],
      ["Strategy", diagnostics.teachingStrategy || "-"],
      ["Template", diagnostics.templateUsed || "-"],
      ["Validation", validation.status || "-"]
    ];

    panel.innerHTML = [
      "<strong style=\"display:block;font-size:13px;margin-bottom:8px;color:#fff;\">Tutorly Diagnostics</strong>",
      ...rows.map(([label, value]) => `<div style="display:grid;grid-template-columns:108px 1fr;gap:8px;margin:4px 0;"><span style="color:#aebcf8;">${label}</span><span>${String(value)}</span></div>`),
      search.warning ? `<div style="margin-top:10px;padding:8px;border-radius:12px;background:rgba(255,189,89,.12);color:#ffd58a;">${search.warning}</div>` : ""
    ].join("");
  }

  function getChatUserId() {
    const key = "tutorly_chat_user_id";
    try {
      let userId = localStorage.getItem(key);
      if (!userId) {
        userId = `student_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        localStorage.setItem(key, userId);
      }
      return userId;
    } catch (error) {
      return "student_browser";
    }
  }

  async function postChatRequest(endpoint, payload, controller) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok) {
      const error = new Error(`Chat backend returned ${response.status}`);
      error.status = response.status;
      throw error;
    }

    return response.json();
  }

  async function requestBackendChat(message, context = {}) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 18000);

    try {
      let data;
      try {
        data = await postChatRequest(getChatEndpoint(), createBackendChatRequest(message, context), controller);
      } catch (primaryError) {
        if (![404, 405].includes(primaryError?.status)) throw primaryError;
        console.warn("Tutorly semantic endpoint is unavailable; trying the compatibility route.");
        data = await postChatRequest(getLegacyChatEndpoint(), createLegacyChatRequest(message, context), controller);
      }

      updateDeveloperDiagnosticsPanel(normalizeBackendDiagnostics(data));
      context.semanticRoute = data?.metadata?.semantic_route || null;
      context.quickActions = data?.metadata?.quick_actions || [];
      context.backendConversationId = data?.conversation_id || context.conversationId || null;
      context.activityChatId = data?.metadata?.activity_chat_id || null;
      if (data?.error && data?.message) return data.message;
      const answer = data?.answer || data?.message || data?.response || "";
      if (!answer || /error generating response/i.test(answer)) {
        throw new Error("Chat backend returned an empty or error response");
      }
      return String(answer).trim();
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function sendTeachingFeedback(payload = {}) {
    GPT?.recordTeachingFeedback?.(payload);

    try {
      const response = await fetch(getChatFeedbackEndpoint(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          user_id: getChatUserId(),
          conversation_id: payload.conversationId || null,
          message_id: payload.messageId || null,
          prompt: payload.message || payload.prompt || "",
          answer: payload.reply || "",
          feedback_type: payload.feedbackType,
          analysis: null,
          metadata: {
            model: payload.model || selectedModel,
            source: "chat-ui",
            activity_chat_id: payload.activityChatId || null
          }
        })
      });

      if (!response.ok) throw new Error(`Feedback returned ${response.status}`);
      return await response.json();
    } catch (error) {
      console.warn("Tutorly feedback sync failed:", error);
      return null;
    }
  }

  function getContractMode(modelId = selectedModel) {
    return normalizeModelId(modelId) === "spark" ? "spark" : "prime";
  }

  function normalizeReplyForRender(rawReply, modelId = selectedModel, options = {}) {
    return ResponsePolicy?.preserveMarkdown
      ? ResponsePolicy.preserveMarkdown(rawReply)
      : String(rawReply || "").trim();
  }

  function normalizeMathReplyForRender(rawReply, modelId = selectedModel, options = {}) {
    if (!MathResponseContract?.createMathResponseMarkdown) {
      return normalizeReplyForRender(rawReply, modelId, {
        ...options,
        topic: "Mathematics"
      });
    }

    return MathResponseContract.createMathResponseMarkdown(rawReply, {
      mode: getContractMode(modelId),
      subtopic: options.subtopic || "Math Word Problem",
      confidence: options.confidence ?? 0.82,
      fallbackUsed: !!options.fallbackUsed,
      question: options.question || ""
    });
  }

  const CORRUPTED_REPLY_PATTERNS = [
    /\bcontinue\b/i,
    /\bcontinues\b/i,
    /\bcontinued\b/i,
    /\bcontinuing\b/i,
    /\bcontinue from\b/i,
    /\bmath lane\b/i,
    /\bnext useful move\b/i,
    /\bone[- ]minute recap\b/i,
    /\bprevious (?:answer|explanation|idea|part)\b/i,
    /\bwe were in\b/i,
    /\bpicking up from where we left off\b/i,
    /\bProduct Thinking\b/i
  ];

  function hasCorruptedTutorText(text) {
    const value = String(text || "");
    return CORRUPTED_REPLY_PATTERNS.some((pattern) => pattern.test(value));
  }

  function isOrbitalWeightlessnessQuestion(question) {
    const value = normalizeUserText(question);
    return /\b(astronaut|astronauts|spacecraft|spaceship|orbit|orbiting|weightless|weightlessness|microgravity|zero gravity|free fall)\b/.test(value) &&
      /\b(gravity|earth|spacecraft|orbit|weightless|weightlessness)\b/.test(value);
  }

  function isOrbitalWeightlessnessAnswer(answer) {
    const value = normalizeUserText(answer);
    const signals = [
      "free fall",
      "falling around earth",
      "orbit",
      "centripetal",
      "normal force",
      "support force",
      "microgravity",
      "apparent weightlessness",
      "weightlessness"
    ];
    return signals.filter((signal) => value.includes(signal)).length >= 2;
  }

  function buildOrbitalWeightlessnessFallback() {
    return [
      "# Apparent Weightlessness in Orbit",
      "",
      "## Direct answer",
      "",
      "Astronauts appear weightless because they and the spacecraft are in free fall around Earth together. Gravity is still present—it keeps them in orbit.",
      "",
      "## Explanation",
      "",
      "1. Gravity pulls the spacecraft and astronauts toward Earth.",
      "2. Their forward speed makes them keep missing Earth, creating an orbit.",
      "3. Because everything falls together, the floor provides almost no upward support force.",
      "4. With no noticeable support force, the astronauts float relative to the spacecraft.",
      "",
      "## Real-life comparison",
      "",
      "A person in a falling elevator would briefly feel lighter for the same reason: the person and elevator are accelerating downward together.",
      "",
      "**Remember:** Weightlessness does not mean zero gravity or zero mass; it means there is almost no support force acting on the body."
    ].join("\n");
  }

  function isTutorReplySafeForQuestion(reply, question, subject) {
    if (!String(reply || "").trim()) return false;
    if (hasCorruptedTutorText(reply)) return false;
    if (isOrbitalWeightlessnessQuestion(question) && !isOrbitalWeightlessnessAnswer(reply)) return false;
    if (subject === "science" && /\b(coding help|product thinking|business direction|ui\/ux direction)\b/i.test(String(reply || ""))) return false;
    return true;
  }

  function getValidatedLocalTutorReply(text, model, context = {}, subject = "general") {
    if (!ENABLE_LEGACY_LOCAL_ROUTER) return "";
    if (isOrbitalWeightlessnessQuestion(text)) return buildOrbitalWeightlessnessFallback();

    const directReply = getModeBaseReply(text, model, context);
    if (isTutorReplySafeForQuestion(directReply, text, subject)) return directReply;

    const localReply = getLocalBotReply(text, "prime", context);
    if (isTutorReplySafeForQuestion(localReply, text, subject)) return localReply;

    return [
      "# Tutorly Help",
      "",
      "I need the exact question or topic to give you a reliable answer.",
      "",
      "**Please send it again in one complete sentence, including the subject or chapter if you know it.**"
    ].join("\n");
  }

  function renderAdaptiveAdvancedMath(result, responsePlan = {}) {
    const cleanItems = (items = []) => items.filter(Boolean);
    const bulletLines = (items, fallback) => {
      const values = cleanItems(items);
      return values.length ? values.map((item) => `- ${item}`) : [`- ${fallback}`];
    };
    const working = cleanItems(result.steps).flatMap((step, index) => {
      const lines = [`**Step ${index + 1}**`, "", step.work || String(step)];
      if (step.why) lines.push("", `_Why: ${step.why}_`);
      return [...lines, ""];
    });
    const finalAnswer = result.finalAnswer || "Please provide one more detail so I can finish the solution.";

    if (responsePlan.answerOnly) return `**${finalAnswer}**`;

    if (result.isWordProblem || responsePlan.responseKind === "math_word_problem") {
      const lines = [
        "## What we know",
        "",
        ...bulletLines(result.given, "The values and relationships stated in the question."),
        "",
        "## What we need to find",
        "",
        ...bulletLines(result.unknown, result.goal || "The unknown value."),
        ""
      ];
      if (result.translation?.length) {
        lines.push("## Translate the words into maths", "", ...bulletLines(result.translation, "Write the relationship as an equation."), "");
      }
      if (result.model?.length || result.formulas?.length) {
        lines.push("## Method / Formula", "", ...bulletLines([...(result.formulas || []), ...(result.model || [])], result.method || "Build and solve the equation."), "");
      }
      lines.push("## Working", "", ...working, "### Final Answer", "", `**${finalAnswer}**`);
      return lines.join("\n");
    }

    const detailed = responsePlan.detailLevel === "detailed";
    const lines = [
      detailed ? "## What we know" : "## Given",
      "",
      ...bulletLines(result.given, result.story || "The expression or equation in the question."),
      ""
    ];
    if (detailed) {
      lines.push(
        "## What we need to find",
        "",
        ...bulletLines(result.unknown, result.goal || "The requested value."),
        "",
        "## Method / Formula",
        "",
        ...bulletLines(result.formulas, result.method || "Apply the relevant rule, then simplify."),
        ""
      );
    }
    lines.push(detailed ? "## Working" : "## Steps", "", ...working, "### Final Answer", "", `**${finalAnswer}**`);
    if (result.method) lines.push("", `**Key idea:** ${result.method}`);
    return lines.join("\n");
  }

  function getConfidentAdvancedMathReply(text, modelId = selectedModel) {
    const engine = window.TutorlyAdvancedMath;
    if (!engine?.analyze || !engine?.render) return "";

    const result = engine.analyze(text);
    if (!result) return "";

    const confidence = String(result.confidence || "high").toLowerCase();
    const confidenceScore = Number.isFinite(Number(result.confidence))
      ? (Number(result.confidence) > 1 ? Number(result.confidence) / 100 : Number(result.confidence))
      : confidence === "high"
        ? 1
        : confidence === "medium"
          ? 0.75
          : confidence === "low"
            ? 0.25
            : 0.5;
    const lowConfidence =
      confidenceScore < 0.9 ||
      confidence === "low" ||
      result.subtopic === "Needs Clarification" ||
      /please send the exact/i.test(result.finalAnswer || "");

    if (lowConfidence) return "";
    const responsePlan = ResponsePolicy?.analyze?.(text, { subject: "math" }) || {};
    return renderAdaptiveAdvancedMath(result, responsePlan);
  }

  function getConfidentEnglishReply(text, modelId = selectedModel) {
    const engine = window.TutorlyEnglishEngine;
    if (!engine?.getConfidentReply) return "";
    const model = normalizeModelId(modelId);
    return engine.getConfidentReply(text, model) || "";
  }

  function normalizeMathText(text) {
    return text
      .toLowerCase()
      .replace(/,/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokenizeExpression(expression) {
    const tokens = [];
    let index = 0;

    while (index < expression.length) {
      const char = expression[index];

      if (/\s/.test(char)) {
        index += 1;
        continue;
      }

      if (/\d|\./.test(char)) {
        let value = char;
        index += 1;

        while (index < expression.length && /[\d.]/.test(expression[index])) {
          value += expression[index];
          index += 1;
        }

        const number = Number(value);
        if (!Number.isFinite(number)) {
          throw new Error("Invalid number");
        }

        tokens.push({ type: "number", value: number });
        continue;
      }

      if (char === "x") {
        tokens.push({ type: "variable", value: "x" });
        index += 1;
        continue;
      }

      if ("+-*/()".includes(char)) {
        tokens.push({ type: "operator", value: char });
        index += 1;
        continue;
      }

      throw new Error("Unsupported character");
    }

    return tokens;
  }

  function prepareExpression(expression) {
    return expression
      .toLowerCase()
      .replace(/[^0-9x+\-*/().\s]/g, "")
      .replace(/(\d|\))\s*x/g, "$1*x")
      .replace(/x\s*(\d|\()/g, "x*$1")
      .replace(/\)\s*(\d|x|\()/g, ")*$1")
      .replace(/(\d|x)\s*\(/g, "$1*(");
  }

  function parseLinearExpression(expression) {
    const tokens = tokenizeExpression(prepareExpression(expression));
    let index = 0;

    function peek(value) {
      return tokens[index] && tokens[index].value === value;
    }

    function consume(value) {
      if (peek(value)) {
        index += 1;
        return true;
      }
      return false;
    }

    function add(left, right, sign = 1) {
      return {
        a: left.a + sign * right.a,
        b: left.b + sign * right.b
      };
    }

    function scale(value, factor) {
      return {
        a: value.a * factor,
        b: value.b * factor
      };
    }

    function multiply(left, right) {
      if (left.a !== 0 && right.a !== 0) {
        throw new Error("Nonlinear expression");
      }

      if (right.a === 0) return scale(left, right.b);
      if (left.a === 0) return scale(right, left.b);
      return { a: 0, b: left.b * right.b };
    }

    function divide(left, right) {
      if (right.a !== 0 || right.b === 0) {
        throw new Error("Invalid division");
      }

      return {
        a: left.a / right.b,
        b: left.b / right.b
      };
    }

    function parseFactor() {
      if (consume("+")) return parseFactor();
      if (consume("-")) return scale(parseFactor(), -1);

      const token = tokens[index];
      if (!token) throw new Error("Unexpected end");

      if (token.type === "number") {
        index += 1;
        return { a: 0, b: token.value };
      }

      if (token.type === "variable") {
        index += 1;
        return { a: 1, b: 0 };
      }

      if (consume("(")) {
        const value = parseExpression();
        if (!consume(")")) throw new Error("Missing closing parenthesis");
        return value;
      }

      throw new Error("Unexpected token");
    }

    function parseTerm() {
      let value = parseFactor();

      while (peek("*") || peek("/")) {
        const operator = tokens[index].value;
        index += 1;
        const right = parseFactor();
        value = operator === "*" ? multiply(value, right) : divide(value, right);
      }

      return value;
    }

    function parseExpression() {
      let value = parseTerm();

      while (peek("+") || peek("-")) {
        const operator = tokens[index].value;
        index += 1;
        const right = parseTerm();
        value = operator === "+" ? add(value, right) : add(value, right, -1);
      }

      return value;
    }

    const result = parseExpression();
    if (index !== tokens.length) {
      throw new Error("Unused tokens");
    }

    return result;
  }

  function solveEquation(text) {
    const match = normalizeMathText(text).match(/[\d.x+\-*/()\s]+=[\d.x+\-*/()\s]+/);
    if (!match) return null;

    const equation = match[0].trim();
    if (!equation.includes("x")) return null;

    const sides = equation.split("=");
    if (sides.length !== 2) return null;

    const left = parseLinearExpression(sides[0]);
    const right = parseLinearExpression(sides[1]);
    const coefficient = left.a - right.a;
    const constant = right.b - left.b;

    if (coefficient === 0) {
      return {
        equation,
        noSingleSolution: true
      };
    }

    return {
      equation,
      x: constant / coefficient,
      coefficient,
      constant
    };
  }

  function solvePercentage(text) {
    const normalized = normalizeMathText(text);
    let match = normalized.match(/(-?\d+(?:\.\d+)?)\s*%\s*of\s*(-?\d+(?:\.\d+)?)/);

    if (match) {
      const percent = Number(match[1]);
      const base = Number(match[2]);
      return {
        label: `${formatNumber(percent)}% of ${formatNumber(base)}`,
        result: (percent / 100) * base,
        steps: [
          `${formatNumber(percent)}% means ${formatNumber(percent / 100)}.`,
          `Multiply ${formatNumber(percent / 100)} by ${formatNumber(base)}.`
        ]
      };
    }

    match = normalized.match(/(-?\d+(?:\.\d+)?)\s+is\s+what\s+percent\s+of\s+(-?\d+(?:\.\d+)?)/);
    if (match) {
      const part = Number(match[1]);
      const whole = Number(match[2]);
      if (whole === 0) return null;

      return {
        label: `${formatNumber(part)} is what percent of ${formatNumber(whole)}`,
        result: (part / whole) * 100,
        suffix: "%",
        steps: [
          `Divide ${formatNumber(part)} by ${formatNumber(whole)}.`,
          "Multiply the decimal by 100."
        ]
      };
    }

    return null;
  }

  function solveArithmetic(text) {
    const candidates = normalizeMathText(text).match(/[-+*/().\d\s]+/g) || [];
    const expression = candidates
      .map((candidate) => candidate.trim())
      .filter((candidate) => /\d/.test(candidate) && /[+\-*/]/.test(candidate))
      .sort((a, b) => b.length - a.length)[0];

    if (!expression) return null;

    const parsed = parseLinearExpression(expression);
    if (parsed.a !== 0) return null;

    return {
      expression,
      result: parsed.b
    };
  }

  function simpleEnglishFix(sentence) {
    if (!sentence) return "";

    let fixed = sentence.trim();
    fixed = fixed.replace(/\bi\b/g, "I");
    fixed = fixed.replace(/\bI has\b/g, "I have");
    fixed = fixed.replace(/\ba ([aeiou])/gi, "an $1");
    fixed = fixed.replace(/\s+/g, " ");
    fixed = fixed.charAt(0).toUpperCase() + fixed.slice(1);

    if (!/[.!?]$/.test(fixed)) {
      fixed += ".";
    }

    return fixed;
  }

  const slangMap = {
    abt: "about",
    bcoz: "because",
    cuz: "because",
    bc: "because",
    coz: "because",
    becuz: "because",
    becuase: "because",
    concpet: "concept",
    conecpt: "concept",
    def: "definition",
    defination: "definition",
    diff: "difference",
    diffrence: "difference",
    eg: "example",
    eqn: "equation",
    equaton: "equation",
    ez: "easy",
    explaiin: "explain",
    explaination: "explanation",
    explian: "explain",
    frm: "from",
    geo: "geography",
    gimme: "give me",
    grammer: "grammar",
    hist: "history",
    histroy: "history",
    hlp: "help",
    hw: "homework",
    idk: "i do not know",
    info: "information",
    k: "okay",
    kinda: "kind of",
    lyk: "like",
    nd: "and",
    pls: "please",
    plz: "please",
    prob: "problem",
    probelm: "problem",
    qn: "question",
    ques: "question",
    quetsion: "question",
    shld: "should",
    shoud: "should",
    smth: "something",
    smthing: "something",
    solvee: "solve",
    teachr: "teacher",
    tmrw: "tomorrow",
    u: "you",
    ur: "your",
    wat: "what",
    wht: "what",
    wdym: "what do you mean",
    wtf: "what",
    xplain: "explain",
    xpain: "explain",
    y: "why"
  };

  const topicKeywords = {
    math: [
      "add", "addition", "algebra", "angle", "area", "average", "calculate", "divide", "division",
      "equation", "factor", "fraction", "geometry", "graph", "minus", "multiply", "percentage",
      "percent", "plus", "ratio", "simplify", "solve", "subtract", "sum", "times", "trigonometry",
      "value", "volume", "together", "shared", "equally", "speed", "distance", "profit", "loss",
      "mixture", "older", "younger", "difference"
    ],
    science: [
      "acid", "atom", "base", "biology", "cell", "chemical", "chemistry", "circuit", "climate",
      "density", "digest", "digestion", "earth", "electricity", "energy", "evaporation", "evolution",
      "force", "friction", "germination", "gravity", "heat", "inertia", "light", "magnet", "mass",
      "matter", "molecule", "motion", "newton", "organ", "photosynthesis", "physics", "plant",
      "pressure", "reproduction", "seed", "sound", "species", "sprout", "stem", "water cycle"
    ],
    english: [
      "adjective", "adverb", "article", "clause", "comma", "essay", "grammar", "letter", "meaning",
      "noun", "paragraph", "phrase", "poem", "punctuation", "reading", "sentence", "speech",
      "story", "summary", "tense", "verb", "vocabulary", "writing", "summarize", "gist",
      "theme", "central idea", "moral", "character sketch", "traits", "plot", "climax",
      "conflict", "resolution", "metaphor", "simile", "imagery", "personification",
      "alliteration", "hyperbole", "irony", "tone", "mood", "rhyme scheme", "poetic",
      "author purpose", "writer intention", "extract", "passage", "pronoun", "preposition",
      "conjunction", "active voice", "passive voice", "direct speech", "indirect speech",
      "reported speech", "modal", "rewrite", "transformation", "correct sentence",
      "find error", "spot mistake", "capitalization", "synonym", "antonym", "idiom",
      "homophone", "formal letter", "informal letter", "email", "article writing",
      "report writing", "speech writing", "debate", "notice", "diary entry"
    ],
    history: [
      "ancient", "ashoka", "battle", "british", "civilisation", "civilization", "colonial",
      "constitution", "dynasty", "empire", "freedom", "french revolution", "gandhi", "gupta",
      "harappa", "history", "independence", "industrial revolution", "king", "mauryan",
      "medieval", "mughal", "nationalism", "nehru", "revolt", "revolution", "ruler",
      "sultanate", "timeline", "war", "world war", "ww1", "ww2"
    ],
    geography: [
      "agriculture", "atmosphere", "climate", "continent", "country", "delta", "earthquake",
      "erosion", "geography", "glacier", "hemisphere", "latitude", "longitude", "map",
      "location", "located", "india", "indian ocean", "asia", "south asia", "arabian sea",
      "bay of bengal", "border", "neighbour", "neighbor", "peninsula", "subcontinent",
      "usa", "u.s.a", "united states", "united states of america", "america", "north america",
      "monsoon", "mountain", "ocean", "plateau", "population", "rainfall", "river",
      "rocks", "soil", "tectonic", "tributary", "valley", "vegetation", "volcano", "weather"
    ]
  };

  const mathWordProblemPattern = /\b(area|perimeter|length|width|breadth|rectangular|rectangle|garden|together\s+(?:they\s+)?(?:have|has)|how\s+many\s+(?:does|do)\s+each\s+(?:have|get)|(?:twice|thrice|double|triple|three\s+times|two\s+times|four\s+times|five\s+times|\d+\s+times)\s+as\s+many|older\s+than|younger\s+than|sum\s+of|difference\s+between|shared\s+equally|ratio|percent(?:age)?|speed|distance|work\s+together|work\s+rate|mixture|profit|loss|discount|simple\s+interest|compound\s+interest)\b/;
  const mathRelationshipPattern = /\b(is|are|has|have|longer\s+than|shorter\s+than|more\s+than|less\s+than|together|total|find|unknown|what\s+is|how\s+many)\b/;
  const mathRealWorldPattern = /\b(garden|field|room|plot|train|car|bus|shop|student|worker|pipe|tank|mixture|profit|loss|speed|distance|age|marbles|pencils|books|rectangle|rectangular|circle|triangle)\b/;

  function isMathWordProblem(text) {
    const value = normalizeUserText(text);
    const words = value.split(/\s+/).filter(Boolean);
    const multipleUnknowns = /\b(length|width|breadth|each|both|two|unknowns?)\b/.test(value);
    const relationshipStatement = mathRelationshipPattern.test(value);
    const realWorldContext = mathRealWorldPattern.test(value);
    return mathWordProblemPattern.test(value) || (words.length >= 8 && relationshipStatement && (realWorldContext || multipleUnknowns));
  }

  function getMathCategory(text) {
    const value = normalizeUserText(text);
    if (isMathWordProblem(value)) {
      if (/\b(area|perimeter|length|width|breadth|rectangular|rectangle|garden|circle|triangle)\b/.test(value)) {
        return /\b(area)\b/.test(value) && /\b(longer\s+than|shorter\s+than|more\s+than|less\s+than)\b/.test(value)
          ? "quadratic-word-problem"
          : "geometry-problem";
      }
      if (/\b(speed|distance|time|work\s+rate|work\s+together)\b/.test(value)) return "rate-problem";
      if (/\bratio\b/.test(value)) return "ratio-problem";
      return "word-problem";
    }
    if (/\bsolve\b|[a-z]\s*[+\-*/=]/i.test(value)) return "direct-equation";
    if (/^\s*\d+(?:\.\d+)?\s*[+\-*/]\s*\d+(?:\.\d+)?\s*$/.test(value)) return "arithmetic-problem";
    return "math";
  }

  const countryLocationGroups = [
    { region: "North Africa", continent: "Africa", countries: ["Algeria", "Egypt", "Libya", "Morocco", "Sudan", "Tunisia"] },
    { region: "West Africa", continent: "Africa", countries: ["Benin", "Burkina Faso", "Cabo Verde", "Cote dIvoire", "Gambia", "Ghana", "Guinea", "Guinea-Bissau", "Liberia", "Mali", "Mauritania", "Niger", "Nigeria", "Senegal", "Sierra Leone", "Togo"] },
    { region: "Central Africa", continent: "Africa", countries: ["Angola", "Cameroon", "Central African Republic", "Chad", "Democratic Republic of the Congo", "Equatorial Guinea", "Gabon", "Republic of the Congo", "Sao Tome and Principe"] },
    { region: "East Africa", continent: "Africa", countries: ["Burundi", "Comoros", "Djibouti", "Eritrea", "Ethiopia", "Kenya", "Madagascar", "Malawi", "Mauritius", "Mozambique", "Rwanda", "Seychelles", "Somalia", "South Sudan", "Tanzania", "Uganda", "Zambia", "Zimbabwe"] },
    { region: "Southern Africa", continent: "Africa", countries: ["Botswana", "Eswatini", "Lesotho", "Namibia", "South Africa"] },
    { region: "East Asia", continent: "Asia", countries: ["China", "Japan", "Mongolia", "North Korea", "South Korea", "Taiwan"] },
    { region: "Southeast Asia", continent: "Asia", countries: ["Brunei", "Cambodia", "Indonesia", "Laos", "Malaysia", "Myanmar", "Philippines", "Singapore", "Thailand", "Timor-Leste", "Vietnam"] },
    { region: "South Asia", continent: "Asia", countries: ["Afghanistan", "Bangladesh", "Bhutan", "India", "Maldives", "Nepal", "Pakistan", "Sri Lanka"] },
    { region: "Central Asia", continent: "Asia", countries: ["Kazakhstan", "Kyrgyzstan", "Tajikistan", "Turkmenistan", "Uzbekistan"] },
    { region: "Western Asia", continent: "Asia", countries: ["Armenia", "Azerbaijan", "Bahrain", "Cyprus", "Georgia", "Iran", "Iraq", "Israel", "Jordan", "Kuwait", "Lebanon", "Oman", "Palestine", "Qatar", "Saudi Arabia", "Syria", "Turkey", "United Arab Emirates", "Yemen"] },
    { region: "Northern Europe", continent: "Europe", countries: ["Denmark", "Estonia", "Finland", "Iceland", "Ireland", "Latvia", "Lithuania", "Norway", "Sweden", "United Kingdom"] },
    { region: "Western Europe", continent: "Europe", countries: ["Austria", "Belgium", "France", "Germany", "Liechtenstein", "Luxembourg", "Monaco", "Netherlands", "Switzerland"] },
    { region: "Southern Europe", continent: "Europe", countries: ["Albania", "Andorra", "Bosnia and Herzegovina", "Croatia", "Greece", "Italy", "Malta", "Montenegro", "North Macedonia", "Portugal", "San Marino", "Serbia", "Slovenia", "Spain", "Vatican City"] },
    { region: "Eastern Europe", continent: "Europe", countries: ["Belarus", "Bulgaria", "Czech Republic", "Hungary", "Moldova", "Poland", "Romania", "Slovakia", "Ukraine"] },
    { region: "Eastern Europe and Northern Asia", continent: "Europe and Asia", countries: ["Russia"] },
    { region: "Northern America", continent: "North America", countries: ["Canada", "United States"] },
    { region: "Central America", continent: "North America", countries: ["Belize", "Costa Rica", "El Salvador", "Guatemala", "Honduras", "Nicaragua", "Panama"] },
    { region: "the Caribbean", continent: "North America", countries: ["Antigua and Barbuda", "Bahamas", "Barbados", "Cuba", "Dominica", "Dominican Republic", "Grenada", "Haiti", "Jamaica", "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines", "Trinidad and Tobago"] },
    { region: "South America", continent: "South America", countries: ["Argentina", "Bolivia", "Brazil", "Chile", "Colombia", "Ecuador", "Guyana", "Paraguay", "Peru", "Suriname", "Uruguay", "Venezuela"] },
    { region: "Australia and New Zealand", continent: "Oceania", countries: ["Australia", "New Zealand"] },
    { region: "Melanesia", continent: "Oceania", countries: ["Fiji", "Papua New Guinea", "Solomon Islands", "Vanuatu"] },
    { region: "Micronesia", continent: "Oceania", countries: ["Kiribati", "Marshall Islands", "Micronesia", "Nauru", "Palau"] },
    { region: "Polynesia", continent: "Oceania", countries: ["Samoa", "Tonga", "Tuvalu"] }
  ];

  const countryAliases = {
    america: "United States",
    britain: "United Kingdom",
    burma: "Myanmar",
    congo: "Democratic Republic of the Congo",
    "cape verde": "Cabo Verde",
    czechia: "Czech Republic",
    drc: "Democratic Republic of the Congo",
    "dr congo": "Democratic Republic of the Congo",
    "east timor": "Timor-Leste",
    england: "United Kingdom",
    "great britain": "United Kingdom",
    holland: "Netherlands",
    "ivory coast": "Cote dIvoire",
    korea: "South Korea",
    scotland: "United Kingdom",
    uae: "United Arab Emirates",
    uk: "United Kingdom",
    us: "United States",
    usa: "United States",
    "u s": "United States",
    "u s a": "United States",
    "united states of america": "United States",
    vatican: "Vatican City",
    wales: "United Kingdom"
  };

  const countryArticleNames = new Set([
    "Bahamas",
    "Central African Republic",
    "Czech Republic",
    "Democratic Republic of the Congo",
    "Dominican Republic",
    "Gambia",
    "Maldives",
    "Netherlands",
    "Philippines",
    "Republic of the Congo",
    "Seychelles",
    "Solomon Islands",
    "United Arab Emirates",
    "United Kingdom",
    "United States"
  ]);

  function countryKey(value) {
    return value
      .toLowerCase()
      .replace(/[.']/g, "")
      .replace(/\bthe\b/g, " ")
      .replace(/[^a-z0-9\s-]/g, " ")
      .replace(/-/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  const countryLocationMap = (() => {
    const map = {};

    countryLocationGroups.forEach((group) => {
      group.countries.forEach((country) => {
        map[countryKey(country)] = {
          name: country,
          region: group.region,
          continent: group.continent
        };
      });
    });

    Object.entries(countryAliases).forEach(([alias, country]) => {
      const target = map[countryKey(country)];
      if (target) map[countryKey(alias)] = target;
    });

    return map;
  })();

  const countryLocationKeys = Object.keys(countryLocationMap).sort((a, b) => b.length - a.length);

  function findCountryLocation(value) {
    if (!/\b(where|located|location|continent|country|map|place)\b/.test(value)) return null;

    const cleanValue = countryKey(value);
    const country = countryLocationKeys.find((key) => {
      return new RegExp(`(^|\\s)${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`).test(cleanValue);
    });

    return country ? countryLocationMap[country] : null;
  }

  function getCountryDisplayName(country) {
    return countryArticleNames.has(country.name) ? `the ${country.name}` : country.name;
  }

  function getCountryLocationText(country) {
    return country.region === country.continent ? country.continent : `${country.region}, ${country.continent}`;
  }

  function normalizeUserText(text) {
    let value = text
      .toLowerCase()
      .replace(/[’']/g, "")
      .replace(/[^a-z0-9%+\-*/=().\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    Object.entries(slangMap).forEach(([slang, replacement]) => {
      value = value.replace(new RegExp(`\\b${slang}\\b`, "g"), replacement);
    });

    return value;
  }

  function keywordScore(value, keywords) {
    return keywords.reduce((score, keyword) => {
      return value.includes(keyword) ? score + 1 : score;
    }, 0);
  }

  function hasEducationalSignal(value) {
    if (/[0-9]\s*[+\-*/=%]\s*[0-9]/.test(value)) return true;
    if (/\bsolve\b|\bx\b\s*[+\-*/=]|[+\-*/=]\s*x\b/.test(value)) return true;
    if (findCountryLocation(value)) return true;

    return (
      keywordScore(value, topicKeywords.math) +
      keywordScore(value, topicKeywords.science) +
      keywordScore(value, topicKeywords.english) +
      keywordScore(value, topicKeywords.history) +
      keywordScore(value, topicKeywords.geography)
    ) > 0;
  }

  function getCasualReply(text) {
    const value = normalizeUserText(text);
    if (!value || hasEducationalSignal(value)) return null;

    if (/^(hi|hello|hey|yo|sup|namaste)( bro| dude| teacher| tutor)?$/.test(value)) {
      return "Hey! What do you want to learn today? 🙂";
    }

    if (/\b(thanks|thank you|thank u|thx|ty)\b/.test(value)) {
      return "Anytime. You’re doing good. 🙂";
    }

    if (/\b(sorry|my bad)\b/.test(value)) {
      return "No worries at all. We’ll take it slowly.";
    }

    if (/\b(bye|goodbye|good night|goodnight|see you)\b/.test(value)) {
      return "Bye! Study well, and come back when you need help.";
    }

    if (/\b(how are you|how r you|how you doing)\b/.test(value)) {
      return "I’m good, bro. Ready to help you study.";
    }

    if (/^(lol|haha|lmao|bro what|what bro|bruh)$/.test(value)) {
      return "Haha, fair. Send me the topic and I’ll explain it clearly.";
    }

    if (/^(ok|okay|cool|nice|great|got it)$/.test(value)) {
      return "Cool. Send the next question whenever you’re ready.";
    }

    return null;
  }

  function escapeHtml(value) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderInlineMarkdown(value) {
    const codeTokens = [];
    const tokenized = String(value || "").replace(/`([^`]+)`/g, (_, code) => {
      codeTokens.push(`<code>${escapeHtml(code)}</code>`);
      return `@@TUTORLY_CODE_${codeTokens.length - 1}@@`;
    });
    let html = escapeHtml(tokenized)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/_([^_]+)_/g, "<em>$1</em>")
      .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '<span class="math-fraction"><span>$1</span><span>$2</span></span>')
      .replace(/\\sqrt\{([^{}]+)\}/g, '<span class="math-root">√<span class="math-radicand">$1</span></span>')
      .replace(/\\\((.+?)\\\)|\$([^$]+)\$/g, (_, parenMath, dollarMath) => `<span class="math-inline">${parenMath || dollarMath}</span>`);
    codeTokens.forEach((token, index) => {
      html = html.replace(`@@TUTORLY_CODE_${index}@@`, token);
    });
    return html;
  }

  function splitMarkdownTableRow(line) {
    return String(line || "").trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
  }

  function isMarkdownTableDivider(line) {
    const cells = splitMarkdownTableRow(line);
    return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
  }

  function renderMarkdownNote(markdown) {
    const trustedHtml = String(markdown || "").trim();
    if (/^<section\s+class="math-learning-flow"\s+data-tutorly-math-response/i.test(trustedHtml)) {
      return trustedHtml;
    }

    const lines = markdown.trim().split(/\r?\n/);
    const html = [];
    let paragraph = [];
    let list = null;
    let codeBlock = null;

    function closeParagraph() {
      if (!paragraph.length) return;
      html.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
      paragraph = [];
    }

    function closeList() {
      if (!list) return;
      html.push(`<${list.type}>${list.items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</${list.type}>`);
      list = null;
    }

    function closeCodeBlock() {
      if (!codeBlock) return;
      const language = codeBlock.language ? ` data-language="${escapeHtml(codeBlock.language)}"` : "";
      html.push(`<pre${language}><code>${escapeHtml(codeBlock.lines.join("\n"))}</code></pre>`);
      codeBlock = null;
    }

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const rawLine = lines[lineIndex];
      const fence = rawLine.trim().match(/^```([a-z0-9_-]+)?$/i);
      if (fence) {
        if (codeBlock) {
          closeCodeBlock();
        } else {
          closeParagraph();
          closeList();
          codeBlock = { language: fence[1] || "", lines: [] };
        }
        continue;
      }

      if (codeBlock) {
        codeBlock.lines.push(rawLine);
        continue;
      }

      const line = rawLine.trim();

      if (!line) {
        closeParagraph();
        closeList();
        continue;
      }

      if (line.includes("|") && lines[lineIndex + 1] && isMarkdownTableDivider(lines[lineIndex + 1])) {
        closeParagraph();
        closeList();
        const headers = splitMarkdownTableRow(line);
        const rows = [];
        let rowIndex = lineIndex + 2;
        while (rowIndex < lines.length && lines[rowIndex].trim() && lines[rowIndex].includes("|")) {
          rows.push(splitMarkdownTableRow(lines[rowIndex]));
          rowIndex += 1;
        }
        html.push(`
          <div class="markdown-table-wrap">
            <table>
              <thead><tr>${headers.map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`).join("")}</tr></thead>
              <tbody>${rows.map((row) => `<tr>${headers.map((_, index) => `<td>${renderInlineMarkdown(row[index] || "")}</td>`).join("")}</tr>`).join("")}</tbody>
            </table>
          </div>
        `);
        lineIndex = rowIndex - 1;
        continue;
      }

      const displayMath = line.match(/^\$\$(.+)\$\$$|^\\\[(.+)\\\]$/);
      if (displayMath) {
        closeParagraph();
        closeList();
        html.push(`<div class="math-display">${renderInlineMarkdown(`$${displayMath[1] || displayMath[2]}$`)}</div>`);
        continue;
      }

      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        closeParagraph();
        closeList();
        const level = heading[1].length;
        html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
        continue;
      }

      const finalAnswer = line.match(/^>\s+(.+)$/);
      if (finalAnswer) {
        closeParagraph();
        closeList();
        html.push(`<blockquote>${renderInlineMarkdown(finalAnswer[1])}</blockquote>`);
        continue;
      }

      const orderedItem = line.match(/^\d+\.\s+(.+)$/);
      if (orderedItem) {
        closeParagraph();
        if (!list || list.type !== "ol") {
          closeList();
          list = { type: "ol", items: [] };
        }
        list.items.push(orderedItem[1]);
        continue;
      }

      const unorderedItem = line.match(/^[-*]\s+(.+)$/);
      if (unorderedItem) {
        closeParagraph();
        if (!list || list.type !== "ul") {
          closeList();
          list = { type: "ul", items: [] };
        }
        list.items.push(unorderedItem[1]);
        continue;
      }

      closeList();
      paragraph.push(line);
    }

    closeParagraph();
    closeList();
    closeCodeBlock();
    return html.join("");
  }

  const SubjectEngine = {
    getSubject(text) {
      const value = normalizeUserText(text);
      const wantsTeaching = /\b(concept|define|definition|explain|help|how|meaning|teach|tell|what|when|where|who|why)\b/.test(value);
      const mathScore = keywordScore(value, topicKeywords.math);
      const scienceScore = keywordScore(value, topicKeywords.science);
      const englishScore = keywordScore(value, topicKeywords.english);
      const historyScore = keywordScore(value, topicKeywords.history);
      const geographyScore = keywordScore(value, topicKeywords.geography);
      const countryLocation = findCountryLocation(value);
      const mathWordProblem = isMathWordProblem(value);
      const englishClassification = window.TutorlyEnglishEngine?.classify?.(value);
      const mathPattern =
        mathWordProblem ||
        /\bpercent(age)?\b/.test(value) ||
        /\d+\s*%/.test(value) ||
        /[\d)]\s*[+\-*/=]\s*[\d(]/.test(value) ||
        /\bx\b\s*[+\-*/=]/.test(value) ||
        /[+\-*/=]\s*x\b/.test(value);

      if (
        mathPattern ||
        (/\bsolve\b/.test(value) && mathScore > 0)
      ) {
        return "math";
      }

      if (countryLocation) {
        return "geography";
      }

      if (
        historyScore > 0 &&
        historyScore >= scienceScore &&
        historyScore >= englishScore &&
        historyScore >= geographyScore
      ) {
        return "history";
      }

      if (
        geographyScore > 0 &&
        geographyScore >= scienceScore &&
        geographyScore >= englishScore &&
        geographyScore >= historyScore
      ) {
        return "geography";
      }

      if (
        mathScore > 0 &&
        mathScore >= scienceScore &&
        mathScore >= englishScore &&
        mathScore >= historyScore &&
        mathScore >= geographyScore
      ) {
        return "math";
      }

      if (
        scienceScore > 0 &&
        (wantsTeaching || scienceScore >= englishScore)
      ) {
        return "science";
      }

      if (
        englishClassification?.isEnglish &&
        englishClassification.confidence >= 0.55
      ) {
        return "english";
      }

      if (englishScore > 0 || /\b(correct|improve|rewrite|summarize|theme|character sketch|poem analysis|formal letter|informal letter|notice writing)\b/.test(value)) {
        return "english";
      }

      return "general";
    },

    getMathCategory(text) {
      return getMathCategory(text);
    },

    mathResponse(text) {
      const advancedMathReply = window.TutorlyAdvancedMath?.createResponse?.(text, { model: selectedModel });
      if (advancedMathReply) return advancedMathReply;

      try {
        const equation = solveEquation(text);
        if (equation) {
          if (equation.noSingleSolution) {
            return [
              "# Math Solution 📘",
              "",
              "### Equation",
              "",
              `_${equation.equation}_`,
              "",
              "The x terms cancel out, so there is no single value of x to solve for.",
              "",
              "_Check whether the original equation has no solution or infinitely many solutions._",
              "",
              "> **Final answer: _No single value of x._**"
            ].join("\n");
          }

          return [
            "# Solving for x 📘",
            "",
            "### Equation",
            "",
            `_${equation.equation}_`,
            "",
            "### Solution",
            "",
            "1. Move all x terms to one side.",
            "2. Move the number terms to the other side.",
            `3. Divide using _x = ${formatNumber(equation.constant)} / ${formatNumber(equation.coefficient)}_.`,
            "",
            `> **Final answer: _x = ${formatNumber(equation.x)}_**`
          ].join("\n");
        }

        const percentage = solvePercentage(text);
        if (percentage) {
          return [
            "# Percentage 📘",
            "",
            "### Problem",
            "",
            `_${percentage.label}_`,
            "",
            "### Solution",
            "",
            ...percentage.steps.map((step, index) => `${index + 1}. ${step}`),
            "",
            `> **Final answer: _${formatNumber(percentage.result)}${percentage.suffix || ""}_**`
          ].join("\n");
        }

        const arithmetic = solveArithmetic(text);
        if (arithmetic) {
          return [
            "# Arithmetic 📘",
            "",
            "### Expression",
            "",
            `_${arithmetic.expression}_`,
            "",
            "### Solution",
            "",
            "_Use the normal order of operations:_ brackets first, then multiplication/division, then addition/subtraction.",
            "",
            `> **Final answer: _${formatNumber(arithmetic.result)}_**`
          ].join("\n");
        }
      } catch (error) {
        return [
          "# Math Help 📘",
          "",
          "I could not solve that cleanly yet 😅",
          "",
          "_Try a simpler format like_ `2 + 2`, `20% of 150`, _or_ `solve x + 5 = 10`."
        ].join("\n");
      }

      return [
        "# Math Help 📘",
        "",
        "I can help with arithmetic, percentages, and simple equations.",
        "",
        "_Try_ `10 * 5`, `15% of 80`, _or_ `solve 2x + 3 = 11`."
      ].join("\n");
    },

    scienceResponse(text) {
      const value = normalizeUserText(text);
      let title = "Science Note";
      let definition = "A science concept is easiest to understand when you connect it to something you can see or test.";
      let explanation = "Start with the main change happening in the situation. Then look for what causes that change and what result comes after it.";
      let example = "For example, when water heats up, its particles move faster. That small particle-level change explains why the water eventually boils.";
      let finalLine = "Final answer: connect the cause, the change, and the result.";

      if (value.includes("photosynthesis")) {
        title = "Photosynthesis";
        definition = "Photosynthesis is the process where _green plants use sunlight to make their own food_.";
        explanation = "The plant takes in carbon dioxide from the air and water from the soil. Chlorophyll in the leaves traps sunlight, and that energy helps the plant make glucose. Oxygen is released as a useful extra product.";
        example = "A simple way to remember it is: _sunlight + water + carbon dioxide gives the plant food_.";
        finalLine = "Final answer: photosynthesis is how plants make glucose using sunlight.";
      } else if (isOrbitalWeightlessnessQuestion(value)) {
        return buildOrbitalWeightlessnessFallback();
      } else if (value.includes("gravity")) {
        title = "Gravity";
        definition = "Gravity is _the force of attraction between objects that have mass_.";
        explanation = "Earth has a very large mass, so it pulls nearby objects toward its center. That is why things fall down when you drop them.";
        example = "A ball falls to the ground because Earth is pulling it downward with gravity.";
        finalLine = "Final answer: gravity is the pulling force that attracts objects toward each other.";
      } else if (value.includes("atom")) {
        title = "Atoms";
        definition = "An atom is _one of the smallest units of matter that still keeps the identity of an element_.";
        explanation = "Atoms have a nucleus in the center with protons and neutrons. Electrons move around the nucleus. The number of protons decides which element the atom is.";
        example = "Hydrogen has one proton, so it is hydrogen. If the proton number changes, the element changes too.";
        finalLine = "Final answer: atoms are tiny building blocks of matter.";
      } else if (value.includes("sublimation")) {
        title = "Sublimation";
        definition = "Sublimation is the change in which a _solid turns directly into a gas_.";
        explanation = "The liquid state is skipped. The particles gain enough energy to leave the solid directly as gas particles.";
        example = "Dry ice is a familiar example. Sublimation is also used in freeze-drying and dye-sublimation printing.";
        finalLine = "Key idea: sublimation is solid → gas without becoming liquid first.";
      } else if (value.includes("germination") || value.includes("seed") || value.includes("sprout")) {
        title = "Germination";
        definition = "Germination is _the process where a seed starts growing into a new plant_.";
        explanation = "First, the seed absorbs water and becomes swollen. Then the seed coat breaks open. A tiny root grows downward to take in water, and a shoot grows upward toward light.";
        example = "When a bean seed gets enough water, air, and warmth, it begins to sprout. That sprouting stage is germination.";
        finalLine = "Final answer: germination is the beginning of plant growth from a seed.";
      }

      return [
        `# ${title} 🔬`,
        "",
        `_${definition}_`,
        "",
        explanation,
        "",
        `_${example}_`,
        "",
        `> **${finalLine}**`
      ].join("\n");
    },

    englishResponse(text) {
      const engineReply = getConfidentEnglishReply(text, "prime");
      if (engineReply) return engineReply;

      const sentence = text.includes(":") ? text.split(":").slice(1).join(":").trim() : "";
      const improved = simpleEnglishFix(sentence);

      if (improved) {
        return [
          "# Sentence Improvement 📚",
          "",
          "### Improved version",
          "",
          `_${improved}_`,
          "",
          "The sentence is cleaner because the capital letter, verb form, and article now match standard English.",
          "",
          "_Read it aloud once. If it sounds smooth, it is usually easier for the reader too._",
          "",
          `> **Final answer: _${improved}_**`
        ].join("\n");
      }

      return [
        "# English Writing 📚",
        "",
        "_Good English is writing that is clear, correct, and easy to read._",
        "",
        "Send a sentence after a colon, like `Improve this sentence: I has a idea`, and I will clean it up.",
        "",
        "_Small grammar fixes can make a sentence feel much more confident._"
      ].join("\n");
    },

    historyResponse(text) {
      const value = normalizeUserText(text);
      let title = "History Note";
      let definition = "History is _the study of people, events, ideas, and changes from the past_.";
      let explanation = "To understand a history topic, focus on the time period, the people involved, the causes, and the results. Dates are useful, but the reason behind the event matters more.";
      let example = "For example, a revolution usually happens when many people feel that the existing system is unfair and they want political or social change.";
      let finalLine = "Final answer: history becomes easier when you connect cause, event, and effect.";

      if (value.includes("french revolution")) {
        title = "French Revolution";
        definition = "The French Revolution was _a major political and social revolution in France that began in 1789_.";
        explanation = "Many common people were angry because they paid heavy taxes while the king, nobles, and clergy enjoyed special privileges. Food shortages, inequality, and weak leadership made the situation worse. The revolution challenged absolute monarchy and promoted ideas like liberty, equality, and citizenship.";
        example = "A simple way to remember it is: _unfair society plus economic crisis led people to demand change_.";
        finalLine = "Final answer: the French Revolution began because inequality, taxes, hunger, and weak rule pushed people to revolt.";
      } else if (value.includes("world war 2") || value.includes("world war ii") || value.includes("ww2") || value.includes("second world war")) {
        title = "World War II";
        definition = "World War II was _a global war fought from 1939 to 1945 between the Allied Powers and Axis Powers_.";
        explanation = "It started after aggressive expansion by countries like Nazi Germany, Fascist Italy, and Imperial Japan. Germany's invasion of Poland in 1939 pushed Britain and France into war. The war spread across Europe, Africa, and Asia and changed world politics deeply.";
        example = "The war ended in 1945, and after it the United Nations was created to help prevent another global conflict.";
        finalLine = "Final answer: World War II happened mainly because aggressive expansion, dictatorship, and unresolved tensions after World War I led to global conflict.";
      } else if (value.includes("world war 1") || value.includes("world war i") || value.includes("ww1") || value.includes("first world war")) {
        title = "World War I";
        definition = "World War I was _a major global war fought from 1914 to 1918_.";
        explanation = "The immediate trigger was the assassination of Archduke Franz Ferdinand, but the deeper causes were militarism, alliances, imperialism, and nationalism. Countries were already tense, so one event quickly pulled many nations into war.";
        example = "Think of it like a row of dominoes: one crisis started a chain reaction because countries had military promises to support each other.";
        finalLine = "Final answer: World War I began because long-term tensions and alliances turned one assassination into a large war.";
      } else if (value.includes("independence") || value.includes("freedom") || value.includes("british") || value.includes("gandhi")) {
        title = "Indian Independence Movement";
        definition = "The Indian Independence Movement was _the long struggle to end British rule in India_.";
        explanation = "Different leaders and groups used different methods, including petitions, protests, boycotts, non-cooperation, civil disobedience, and revolutionary activities. Mahatma Gandhi made non-violent mass movements a powerful part of the struggle.";
        example = "The Salt March showed how a simple everyday issue could become a strong protest against unfair colonial laws.";
        finalLine = "Final answer: India's freedom struggle grew because people wanted self-rule, dignity, and freedom from colonial control.";
      } else if (value.includes("harappa") || value.includes("civilization") || value.includes("civilisation")) {
        title = "Harappan Civilization";
        definition = "The Harappan Civilization was _an ancient urban civilization of the Indus Valley_.";
        explanation = "It is known for planned cities, drainage systems, brick houses, trade, seals, and organized streets. These features show that people had strong planning and administration.";
        example = "Cities like Harappa and Mohenjo-daro had carefully built drains, which shows advanced urban planning for that time.";
        finalLine = "Final answer: the Harappan Civilization is important because it shows early city life, planning, trade, and technology.";
      } else if (value.includes("constitution")) {
        title = "Constitution";
        definition = "A constitution is _a set of basic rules that explains how a country is governed and what rights people have_.";
        explanation = "It tells the government what it can do, what it cannot do, and how power is shared. It also protects citizens by listing important rights and duties.";
        example = "India's Constitution explains the powers of Parliament, courts, and governments, while also protecting fundamental rights.";
        finalLine = "Final answer: a constitution is the rulebook for running a country fairly.";
      } else if (value.includes("mughal")) {
        title = "Mughal Empire";
        definition = "The Mughal Empire was _a powerful empire that ruled large parts of India from the 16th to the 18th century_.";
        explanation = "The Mughals are known for strong administration, military power, art, architecture, trade, and cultural development. Rulers like Akbar expanded the empire and built systems for governance.";
        example = "The Taj Mahal is one famous example of Mughal architecture.";
        finalLine = "Final answer: the Mughal Empire was important for its political power, administration, culture, and architecture.";
      }

      return [
        `# ${title} 🏛️`,
        "",
        `_${definition}_`,
        "",
        explanation,
        "",
        `_${example}_`,
        "",
        `> **${finalLine}**`
      ].join("\n");
    },

    geographyResponse(text) {
      const value = normalizeUserText(text);
      let title = "Geography Note";
      let definition = "Geography is _the study of Earth, places, people, environment, and how they are connected_.";
      let explanation = "To understand a geography topic, look at location, physical features, climate, resources, and human activity. Geography becomes easier when you ask where something is, why it is there, and how it affects people.";
      let example = "For example, a river can shape farming, transport, settlements, and trade in the area around it.";
      let finalLine = "Final answer: geography connects land, climate, resources, and human life.";
      const countryLocation = findCountryLocation(value);

      if (countryLocation) {
        const countryName = getCountryDisplayName(countryLocation);
        const sentenceName = countryName.charAt(0).toUpperCase() + countryName.slice(1);
        const locationText = getCountryLocationText(countryLocation);
        title = `Location of ${sentenceName}`;
        definition = `${sentenceName} is _located in ${locationText}_.`;
        explanation = countryLocation.region === countryLocation.continent
          ? `${sentenceName} is part of ${countryLocation.continent}. To find it on a map, look for the ${countryLocation.continent} region of the world.`
          : `${sentenceName} is usually grouped in ${countryLocation.region}. To find it on a map, first look for ${countryLocation.continent}, then look for ${countryLocation.region}.`;
        example = `A simple map trick is: _continent first, region second, country third_. That helps you locate ${countryName} faster.`;
        finalLine = `Final answer: ${countryName} is located in ${locationText}.`;
      } else if (value.includes("latitude") || value.includes("longitude")) {
        title = "Latitude and Longitude";
        definition = "Latitude and longitude are _imaginary lines used to find exact locations on Earth_.";
        explanation = "Latitude lines run east to west and measure distance north or south of the Equator. Longitude lines run north to south and measure distance east or west of the Prime Meridian.";
        example = "If latitude tells how far north or south a place is, longitude tells how far east or west it is.";
        finalLine = "Final answer: latitude and longitude work like Earth's address system.";
      } else if (value.includes("monsoon")) {
        title = "Monsoon";
        definition = "A monsoon is _a seasonal wind system that brings a major change in rainfall_.";
        explanation = "In summer, land heats faster than the sea. Warm air rises over land, and moist air from the sea moves in, bringing rain. In winter, the wind direction changes because the land cools faster.";
        example = "In India, the southwest monsoon brings most of the yearly rainfall, which is very important for farming.";
        finalLine = "Final answer: monsoon is a seasonal wind change that brings heavy rainfall to many regions.";
      } else if (value.includes("earthquake")) {
        title = "Earthquake";
        definition = "An earthquake is _the sudden shaking of Earth's surface due to movement inside the Earth_.";
        explanation = "Earth's crust is divided into plates. When these plates move, pressure builds up. When the pressure is released suddenly, energy travels as seismic waves and the ground shakes.";
        example = "Areas near plate boundaries often have more earthquakes because plates are constantly moving there.";
        finalLine = "Final answer: earthquakes happen when built-up energy inside Earth is released suddenly.";
      } else if (value.includes("volcano")) {
        title = "Volcano";
        definition = "A volcano is _an opening in Earth's crust through which magma, ash, and gases can come out_.";
        explanation = "Magma forms deep inside Earth. When pressure increases, it can rise through cracks and erupt at the surface. After it comes out, magma is called lava.";
        example = "Many volcanoes form near plate boundaries where Earth's plates move apart or collide.";
        finalLine = "Final answer: a volcano forms when molten rock and gases escape from inside Earth.";
      } else if (value.includes("river") || value.includes("tributary") || value.includes("delta")) {
        title = "Rivers";
        definition = "A river is _a natural flowing stream of water that usually moves from higher land to lower land_.";
        explanation = "Rivers shape the land by erosion, transportation, and deposition. They also provide water for farming, drinking, transport, and settlements.";
        example = "A delta forms near a river's mouth when the river slows down and deposits soil and sand.";
        finalLine = "Final answer: rivers shape land and support human life by carrying water and fertile soil.";
      } else if (value.includes("climate") || value.includes("weather")) {
        title = "Weather and Climate";
        definition = "Weather is _the short-term condition of the atmosphere_, while climate is _the average weather pattern of a place over a long time_.";
        explanation = "Weather can change daily, like rain today and sunshine tomorrow. Climate changes slowly and describes the usual conditions of a region, such as hot and dry or cold and wet.";
        example = "A rainy day is weather. A region having heavy rainfall every year is climate.";
        finalLine = "Final answer: weather is short-term, climate is long-term.";
      } else if (value.includes("soil") || value.includes("erosion")) {
        title = "Soil Erosion";
        definition = "Soil erosion is _the removal of the top layer of soil by wind, water, or human activity_.";
        explanation = "The topsoil is the most fertile layer, so losing it can reduce farming quality. Trees, roots, and careful farming help hold soil in place.";
        example = "Heavy rain can wash away loose soil on a bare slope, but plants can slow down that movement.";
        finalLine = "Final answer: soil erosion removes fertile topsoil and can harm farming and land quality.";
      }

      return [
        `# ${title} 🌍`,
        "",
        `_${definition}_`,
        "",
        explanation,
        "",
        `_${example}_`,
        "",
        `> **${finalLine}**`
      ].join("\n");
    },

    generalResponse() {
      return [
        "# Tutorly Study Help 👋",
        "",
        "I can help you with math, science, English, history, geography, and general study questions.",
        "",
        "_You do not need perfect English. Write the words you know, and I will try to understand._",
        "",
        "1. Solve math problems.",
        "2. Explain science concepts.",
        "3. Improve English writing.",
        "4. Explain history events.",
        "5. Explain geography topics.",
        "",
        `> **Try: _French Revolution explain_ or _monsoon concept_**`
      ].join("\n");
    }
  };

  function scrollToBottom() {
    requestAnimationFrame(() => {
      chatWindow.scrollTop = chatWindow.scrollHeight;
    });
  }

  function getWelcomeTrialCount() {
    const count = Number(localStorage.getItem(WELCOME_TRIAL_KEY) || "0");
    return Number.isFinite(count) ? Math.max(0, count) : 0;
  }

  function setWelcomeTrialCount(count) {
    localStorage.setItem(WELCOME_TRIAL_KEY, String(Math.min(WELCOME_TRIAL_LIMIT, Math.max(0, count))));
  }

  function getWelcomeTrialLeft() {
    return Math.max(WELCOME_TRIAL_LIMIT - getWelcomeTrialCount(), 0);
  }

  function createWelcomeTrialOverlay() {
    let overlay = document.getElementById("welcomeTrialOverlay");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "welcomeTrialOverlay";
    overlay.className = "cooldown-overlay";
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = `
      <article class="cooldown-card" role="dialog" aria-modal="true" aria-labelledby="welcomeTrialTitle">
        <div class="cooldown-icon" aria-hidden="true">✦</div>
        <p class="cooldown-kicker">Welcome trial finished</p>
        <h2 id="welcomeTrialTitle">Return Home to continue</h2>
        <p class="cooldown-copy">You have used your 5 chatbot attempts from the welcome page. Please return to the Home screen to continue your search with Tutorly.</p>
        <button class="cooldown-close" id="welcomeTrialHomeBtn" type="button">Go to Home</button>
      </article>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector("#welcomeTrialHomeBtn").addEventListener("click", () => {
      window.location.href = "home.html";
    });

    return overlay;
  }

  function lockWelcomeTrialComposer() {
    if (!isWelcomeTrial) return;
    welcomeTrialLocked = true;
    input.disabled = true;
    input.placeholder = "Return Home to continue using Tutorly";
    sendBtn.disabled = true;
    if (uploadBtn) uploadBtn.disabled = true;
    if (cameraBtn) cameraBtn.disabled = true;
    if (voiceBtn) voiceBtn.disabled = true;
    suggestionChips.forEach((chip) => {
      chip.disabled = true;
    });
    body.classList.add("chat-cooldown-active");
    updateSendState();
  }

  function showWelcomeTrialLimit() {
    if (!isWelcomeTrial) return;
    lockWelcomeTrialComposer();
    const overlay = createWelcomeTrialOverlay();
    overlay.classList.add("show");
    overlay.setAttribute("aria-hidden", "false");
  }

  function updateWelcomeTrialStatus() {
    if (!isWelcomeTrial || !disclaimer) return;
    const left = getWelcomeTrialLeft();
    disclaimer.textContent = left > 0
      ? `Welcome trial: ${left} of ${WELCOME_TRIAL_LIMIT} messages left. Go Home for full chatbot access.`
      : "Welcome trial finished. Return Home to continue with Tutorly.";
  }

  function registerWelcomeTrialAttempt() {
    if (!isWelcomeTrial) return false;
    const nextCount = getWelcomeTrialCount() + 1;
    setWelcomeTrialCount(nextCount);
    updateWelcomeTrialStatus();

    if (nextCount >= WELCOME_TRIAL_LIMIT) {
      lockWelcomeTrialComposer();
      return true;
    }

    return false;
  }

  function isMobileOrTabletImageLayout() {
    const ua = navigator.userAgent;
    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const touchSupport = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const widthLooksMobile = Math.min(window.innerWidth, window.screen.width || window.innerWidth) <= 1280;
    const uaLooksMobile = /Android|iPhone|iPad|iPod|Mobile|Tablet|Silk|Kindle/i.test(ua);
    const iPadDesktopMode = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
    return (widthLooksMobile && (touchSupport || coarsePointer)) || uaLooksMobile || iPadDesktopMode;
  }

  function updateImageDeviceMode() {
    body.classList.toggle("camera-enabled", isMobileOrTabletImageLayout() && !!navigator.mediaDevices?.getUserMedia);
  }

  function getUploadEndpoint() {
    return window.location.protocol === "file:" ? "http://127.0.0.1:8000/upload-image" : "/upload-image";
  }

  function requirePremiumFeature(featureName) {
    if (!window.TutorlyPremiumGuard) return true;
    return window.TutorlyPremiumGuard.requirePremium(featureName);
  }

  function showToast(message) {
    let toast = document.getElementById("chatToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "chatToast";
      toast.className = "toast";
      toast.innerHTML = `<b></b><button class="toast-close" type="button" aria-label="Close">×</button>`;
      document.body.appendChild(toast);
      toast.querySelector(".toast-close").addEventListener("click", () => toast.classList.remove("show"));
    }

    toast.querySelector("b").textContent = message;
    toast.classList.add("show");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 3200);
  }

  function createImagePreviewCard() {
    let card = document.getElementById("imagePreviewCard");
    if (card) return card;

    card = document.createElement("section");
    card.id = "imagePreviewCard";
    card.className = "image-preview-card";
    card.setAttribute("aria-live", "polite");
    card.innerHTML = `
      <img class="image-preview-thumb" id="imagePreviewThumb" alt="Selected homework preview" />
      <div class="image-preview-info">
        <p class="image-preview-title" id="imagePreviewTitle">Image ready</p>
        <p class="image-preview-status" id="imagePreviewStatus">Preparing image...</p>
        <div class="ocr-progress" aria-hidden="true"><span id="ocrProgressBar"></span></div>
        <div class="preview-actions">
          <button class="preview-action" id="retakeImageBtn" type="button">Retake</button>
          <button class="preview-action" id="removeImageBtn" type="button">Remove</button>
          <button class="preview-action preview-send" id="sendImageBtn" type="button">Send</button>
        </div>
      </div>
    `;

    const composerWrap = document.querySelector(".composer-wrap");
    if (composerWrap) composerWrap.insertBefore(card, composerWrap.firstChild);

    card.querySelector("#imagePreviewThumb").addEventListener("click", () => {
      if (pendingImage?.previewUrl) openImageModal(pendingImage.previewUrl);
    });
    card.querySelector("#retakeImageBtn").addEventListener("click", retakePendingImage);
    card.querySelector("#removeImageBtn").addEventListener("click", removePendingImage);
    card.querySelector("#sendImageBtn").addEventListener("click", sendMessage);
    return card;
  }

  function setPreviewStatus(message, progress = null) {
    const status = document.getElementById("imagePreviewStatus");
    const bar = document.getElementById("ocrProgressBar");
    if (status) status.textContent = message;
    if (bar && progress !== null) bar.style.width = `${Math.max(0, Math.min(progress, 100))}%`;
  }

  function showImagePreview() {
    if (!pendingImage) return;
    const card = createImagePreviewCard();
    const thumb = card.querySelector("#imagePreviewThumb");
    const title = card.querySelector("#imagePreviewTitle");
    thumb.src = pendingImage.previewUrl;
    title.textContent = pendingImage.source === "camera" ? "Photo captured" : "Image selected";
    card.classList.add("show");
  }

  function removePendingImage() {
    if (pendingImage?.previewUrl) URL.revokeObjectURL(pendingImage.previewUrl);
    pendingImage = null;
    const card = document.getElementById("imagePreviewCard");
    if (card) card.classList.remove("show");
    updateSendState();
  }

  function retakePendingImage() {
    const source = pendingImage?.source || "upload";
    removePendingImage();
    if (source === "camera" && isMobileOrTabletImageLayout()) {
      openCamera();
    } else if (uploadInput) {
      uploadInput.click();
    }
  }

  function validateImageFile(file) {
    if (!file || file.size === 0) {
      showToast("Empty image detected. Please choose a clear photo or screenshot.");
      return false;
    }

    const isImage = /^(image\/png|image\/jpe?g|image\/webp)$/i.test(file.type || "") ||
      /\.(png|jpe?g|webp)$/i.test(file.name || "");
    if (!isImage) {
      showToast("Unsupported file type. Please upload PNG, JPG, JPEG, or WEBP.");
      return false;
    }

    return true;
  }

  function loadImageFromBlob(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Image could not be read"));
      };
      img.src = url;
    });
  }

  async function compressImageForOcr(file) {
    const image = await loadImageFromBlob(file);
    const maxSide = 1600;
    const ratio = Math.min(1, maxSide / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
    const width = Math.max(1, Math.round((image.naturalWidth || image.width) * ratio));
    const height = Math.max(1, Math.round((image.naturalHeight || image.height) * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);

    if (isCanvasProbablyBlank(ctx, width, height)) {
      throw new Error("Empty image detected");
    }

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob || blob.size === 0) {
          reject(new Error("Empty image detected"));
          return;
        }
        resolve(new File([blob], "tutorly-image.jpg", { type: "image/jpeg" }));
      }, "image/jpeg", 0.84);
    });
  }

  function imageFileToDataUrl(file) {
    if (!file) return Promise.resolve("");
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => reject(new Error("Could not prepare the image for analysis."));
      reader.readAsDataURL(file);
    });
  }

  function isCanvasProbablyBlank(ctx, width, height) {
    const sampleSize = 72;
    const canvas = document.createElement("canvas");
    canvas.width = sampleSize;
    canvas.height = sampleSize;
    const sampleCtx = canvas.getContext("2d", { willReadFrequently: true });
    sampleCtx.drawImage(ctx.canvas, 0, 0, width, height, 0, 0, sampleSize, sampleSize);
    const pixels = sampleCtx.getImageData(0, 0, sampleSize, sampleSize).data;
    let min = 255;
    let max = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const value = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    return max - min < 5;
  }

  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (tesseractLoaderPromise) return tesseractLoaderPromise;

    tesseractLoaderPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
      script.async = true;
      script.onload = () => window.Tesseract ? resolve(window.Tesseract) : reject(new Error("OCR library unavailable"));
      script.onerror = () => reject(new Error("OCR library failed to load"));
      document.head.appendChild(script);
    });

    return tesseractLoaderPromise;
  }

  async function runOcrForPendingImage() {
    if (!pendingImage) return;
    pendingImage.ocrRunning = true;
    setPreviewStatus("Reading text from image... 0%", 2);

    try {
      const ocrFile = await compressImageForOcr(pendingImage.file);
      pendingImage.uploadFile = ocrFile;
      const Tesseract = await loadTesseract();
      const result = await Tesseract.recognize(ocrFile, "eng", {
        logger: (event) => {
          if (event.status === "recognizing text" && Number.isFinite(event.progress)) {
            const percent = Math.round(event.progress * 100);
            setPreviewStatus(`Reading text from image... ${percent}%`, percent);
          }
        }
      });

      const extracted = (result?.data?.text || "").replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").trim();
      pendingImage.ocrRunning = false;
      pendingImage.extractedText = extracted;

      if (!extracted) {
        setPreviewStatus("No readable text found. You can type the question manually.", 100);
        showToast("No readable text found in this image.");
        return;
      }

      appendToInput(extracted);
      setPreviewStatus("Text extracted. You can edit it before sending.", 100);
    } catch (error) {
      if (pendingImage) pendingImage.ocrRunning = false;
      const message = error.message === "Empty image detected"
        ? "Empty image detected. Please retake or upload a clearer image."
        : "OCR failed. You can still type the question manually.";
      setPreviewStatus(message, 0);
      showToast(message);
    }
  }

  async function prepareImageFile(file, source = "upload") {
    if (!validateImageFile(file)) return;
    setSelectedModel("lens", { announce: true });
    removePendingImage();
    pendingImage = {
      file,
      uploadFile: file,
      source,
      previewUrl: URL.createObjectURL(file),
      extractedText: "",
      ocrRunning: false
    };
    showImagePreview();
    setPreviewStatus("Reading text from image... 0%", 0);
    updateSendState();
    runOcrForPendingImage();
  }

  async function uploadImageToBackend(file) {
    const response = await fetch(getUploadEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": file.type || "image/jpeg",
        "X-Filename": file.name || "tutorly-image.jpg"
      },
      body: file
    });

    if (!response.ok) throw new Error("Upload failed");
    return response.json();
  }

  function createCameraOverlay() {
    let overlay = document.getElementById("cameraOverlay");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "cameraOverlay";
    overlay.className = "camera-overlay";
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = `
      <article class="camera-card" role="dialog" aria-modal="true" aria-labelledby="cameraTitle">
        <h2 id="cameraTitle">Take a homework photo</h2>
        <div class="camera-view"><video id="cameraVideo" playsinline autoplay muted></video></div>
        <canvas id="cameraCanvas" hidden></canvas>
        <div class="camera-actions">
          <button class="camera-action" id="cameraCancelBtn" type="button">Cancel</button>
          <button class="camera-action camera-capture" id="cameraCaptureBtn" type="button">Capture</button>
        </div>
      </article>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector("#cameraCancelBtn").addEventListener("click", closeCamera);
    overlay.querySelector("#cameraCaptureBtn").addEventListener("click", captureCameraPhoto);
    return overlay;
  }

  async function openCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      showToast("Camera is not supported on this device.");
      return;
    }

    const overlay = createCameraOverlay();
    const video = overlay.querySelector("#cameraVideo");
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false
      });
      video.srcObject = cameraStream;
      overlay.classList.add("show");
      overlay.setAttribute("aria-hidden", "false");
    } catch (error) {
      showToast("Camera permission denied. You can upload an image instead.");
    }
  }

  function closeCamera() {
    const overlay = document.getElementById("cameraOverlay");
    if (overlay) {
      overlay.classList.remove("show");
      overlay.setAttribute("aria-hidden", "true");
    }
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      cameraStream = null;
    }
  }

  function captureCameraPhoto() {
    const overlay = createCameraOverlay();
    const video = overlay.querySelector("#cameraVideo");
    const canvas = overlay.querySelector("#cameraCanvas");
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 960;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, width, height);
    canvas.toBlob((blob) => {
      closeCamera();
      if (!blob || blob.size === 0) {
        showToast("Empty image detected. Please retake the photo.");
        return;
      }
      prepareImageFile(new File([blob], `tutorly-photo-${Date.now()}.jpg`, { type: "image/jpeg" }), "camera");
    }, "image/jpeg", 0.88);
  }

  function openImageModal(src) {
    let modal = document.getElementById("imageModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "imageModal";
      modal.className = "image-modal";
      modal.setAttribute("aria-hidden", "true");
      modal.innerHTML = `<img alt="Uploaded homework preview" />`;
      document.body.appendChild(modal);
      modal.addEventListener("click", () => {
        modal.classList.remove("show");
        modal.setAttribute("aria-hidden", "true");
      });
    }

    modal.querySelector("img").src = src;
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
  }

  function createBotAvatar() {
    const avatar = document.createElement("span");
    avatar.className = "bot-avatar";
    avatar.setAttribute("aria-hidden", "true");

    const image = document.createElement("img");
    image.src = BOT_AVATAR_SRC;
    image.alt = "";
    image.decoding = "async";
    image.loading = "eager";

    avatar.appendChild(image);
    return avatar;
  }

  function updateBotContent(message, markdown, meta = {}) {
    const content = message.querySelector(".bot-content");
    if (!content) return;
    message.dataset.rawReply = markdown;
    if (meta.conversationId) message.dataset.conversationId = meta.conversationId;
    if (meta.messageId) message.dataset.messageId = meta.messageId;
    if (meta.prompt) message.dataset.prompt = meta.prompt;
    if (meta.model) message.dataset.model = meta.model;
    content.innerHTML = renderMarkdownNote(markdown);
    hydrateMathLearningCards(message);
    attachEducationalVisual(message, meta);
    attachMathVisual(message, meta);
    attachGeographyVisual(message, meta);
    attachBotMessageActions(message, markdown, meta);
  }

  function attachEducationalVisual(message, meta = {}) {
    if (!EducationalVisuals?.fromSemanticRoute || !EducationalVisuals?.renderPanel) return;
    const content = message.querySelector(".bot-content");
    if (!content || content.querySelector(".edu-visual-panel")) return;

    const prompt = meta.prompt || message.dataset.prompt || "";
    if (!prompt) return;
    const semanticRoute = meta.semanticRoute || meta.context?.semanticRoute || null;
    const context = EducationalVisuals.fromSemanticRoute(semanticRoute, prompt);
    if (!context) return;

    const holder = document.createElement("div");
    holder.innerHTML = EducationalVisuals.renderPanel(context);
    const panel = holder.firstElementChild;
    if (!panel) return;
    placeSemanticVisual(content, panel, semanticRoute?.visual?.placement || "after_answer");
    EducationalVisuals.hydrate?.(panel);
  }

  function placeSemanticVisual(content, panel, placement) {
    const children = Array.from(content.children);
    const isHeading = (node) => /^H[1-6]$/.test(node.tagName || "");
    const findHeading = (pattern) => children.find((node) => isHeading(node) && pattern.test(node.textContent || ""));
    const insertBefore = (target) => {
      if (!target) return false;
      content.insertBefore(panel, target);
      return true;
    };

    if (placement === "after_intro") {
      const intro = children.find((node) => node.tagName === "P");
      if (intro) {
        intro.insertAdjacentElement("afterend", panel);
        return;
      }
    }

    if (placement === "before_steps") {
      const steps = findHeading(/step|solution|working|calculation|what happens|how it works|why this happens/i)
        || children.find((node) => node.tagName === "OL");
      if (insertBefore(steps)) return;
    }

    if (placement === "after_steps" || placement === "before_summary") {
      if (insertBefore(findHeading(/answer|remember|main idea|key idea|in short|observation|result/i))) return;
    }

    content.appendChild(panel);
  }

  function hydrateMathLearningCards(message) {
    const flows = message.querySelectorAll(".math-learning-flow:not([data-hydrated])");
    flows.forEach((flow) => {
      flow.dataset.hydrated = "true";
      const cards = Array.from(flow.querySelectorAll(".math-learn-card"));
      const isSparkMath = flow.dataset.mode === "spark";

      function revealCard(card) {
        if (!card) return;
        card.hidden = false;
        window.requestAnimationFrame(() => card.classList.add("is-visible"));
      }

      function collapseCards() {
        if (isSparkMath) {
          cards.forEach(revealCard);
          scrollToBottom();
          return;
        }
        cards.forEach((card, index) => {
          card.classList.toggle("is-visible", index === 0);
          card.hidden = index !== 0;
        });
        scrollToBottom();
      }

      function revealNext() {
        const next = cards.find((card) => card.hidden);
        if (next) {
          revealCard(next);
          scrollToBottom();
        }
      }

      flow.addEventListener("click", (event) => {
        const button = event.target.closest("[data-math-action]");
        if (!button) return;
        const action = button.dataset.mathAction;
        if (action === "next") revealNext();
        if (action === "all") {
          cards.forEach(revealCard);
          scrollToBottom();
        }
        if (action === "collapse") collapseCards();
      });

      if (isSparkMath) {
        cards.forEach(revealCard);
      } else {
        collapseCards();
      }
    });
  }

  function attachMathVisual(message, meta = {}) {
    if (meta.context) return;
    const mathRenderer = window.TutorlyMathRenderer;
    if (!mathRenderer?.analyze || !mathRenderer?.renderPanel) return;
    const content = message.querySelector(".bot-content");
    if (!content || content.querySelector(".math-solve-panel") || content.querySelector(".edu-visual-panel")) return;

    const prompt = meta.prompt || message.dataset.prompt || "";
    const responsePlan = ResponsePolicy?.analyze?.(prompt, { subject: "mathematics" });
    if (responsePlan?.kind === "simple_math" || responsePlan?.answerOnly) return;
    const fallbackText = `${prompt} ${message.dataset.rawReply || ""}`;
    const context = mathRenderer.analyze(prompt || fallbackText, {
      model: meta.model || message.dataset.model || selectedModel
    });
    if (!context) return;

    const holder = document.createElement("div");
    holder.innerHTML = mathRenderer.renderPanel(context);
    const panel = holder.firstElementChild;
    if (!panel) return;
    content.insertBefore(panel, content.firstChild);
    mathRenderer.hydrate?.(panel);
  }

  function attachGeographyVisual(message, meta = {}) {
    if (meta.context) return;
    const geography = window.TutorlyGeography;
    if (!geography?.analyze || !geography?.renderPanel) return;
    const content = message.querySelector(".bot-content");
    if (!content || content.querySelector(".geo-visual-panel")) return;

    const prompt = meta.prompt || message.dataset.prompt || "";
    const fallbackText = `${prompt} ${message.dataset.rawReply || ""}`;
    const context = geography.analyze(prompt || fallbackText, {
      model: meta.model || message.dataset.model || selectedModel
    });
    if (!context) return;

    const holder = document.createElement("div");
    holder.innerHTML = geography.renderPanel(context);
    const panel = holder.firstElementChild;
    if (!panel) return;
    content.appendChild(panel);
    geography.hydrate?.(panel);
  }

  function ensureActiveConversation(seed) {
    if (GPT?.ensureConversation) {
      const conversation = GPT.ensureConversation(seed);
      if (conversation?.id) activeConversationId = conversation.id;
      return conversation;
    }
    if (!ChatHistory) return null;
    const existing = activeConversationId ? ChatHistory.getConversation(activeConversationId) : null;
    if (existing && !existing.archived) return existing;
    const conversation = ChatHistory.ensureConversation(seed, { seed, source: "chatbot" });
    activeConversationId = conversation.id;
    return conversation;
  }

  function observeChatMemory(messageRecord, conversationId, subject) {
    if (!ChatMemory || !messageRecord) return;
    ChatMemory.observeMessage(messageRecord, { conversationId, subject });
  }

  function buildAttachmentMeta(imageToSend) {
    if (GPT?.buildAttachmentMeta) return GPT.buildAttachmentMeta(imageToSend);
    if (!imageToSend) return [];
    return [{
      id: `img_${Date.now().toString(36)}`,
      type: "image",
      source: imageToSend.source || "upload",
      name: imageToSend.file?.name || "homework-image",
      mimeType: imageToSend.file?.type || "image/jpeg",
      previewUrl: imageToSend.previewUrl || "",
      extractedText: imageToSend.extractedText || ""
    }];
  }

  function createStudyToolkit(subject, userMessage, assistantReply, model) {
    if (GPT?.createStudyToolkit) {
      return GPT.createStudyToolkit(subject, userMessage, assistantReply, model);
    }
    if (!LearningTools?.generateToolkit) return null;
    return LearningTools.generateToolkit({
      subject,
      userMessage,
      assistantReply,
      model
    });
  }

  function openStudyToolkit(toolkit) {
    const toolkitHtml = GPT?.renderStudyToolkitHtml?.(toolkit) || LearningTools?.renderToolkitHtml?.(toolkit);
    if (!toolkit || !toolkitHtml) {
      showToast("Study tools are not ready for this message yet.");
      return;
    }

    let overlay = document.getElementById("studyToolkitOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "studyToolkitOverlay";
      overlay.className = "study-tools-overlay";
      overlay.setAttribute("aria-hidden", "true");
      document.body.appendChild(overlay);
    }

    overlay.innerHTML = `
      <article class="study-tools-card" role="dialog" aria-modal="true" aria-labelledby="studyToolsTitle">
        <button class="study-tools-close" type="button" aria-label="Close study tools">&times;</button>
        <h2 id="studyToolsTitle">Study tools</h2>
        ${toolkitHtml}
      </article>
    `;
    overlay.classList.add("show");
    overlay.setAttribute("aria-hidden", "false");
    overlay.querySelector(".study-tools-close").addEventListener("click", () => {
      overlay.classList.remove("show");
      overlay.setAttribute("aria-hidden", "true");
    });
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        overlay.classList.remove("show");
        overlay.setAttribute("aria-hidden", "true");
      }
    }, { once: true });
  }

  function attachBotMessageActions(message, rawReply, meta = {}) {
    if (!message || message.querySelector(".message-actions")) return;
    const content = message.querySelector(".bot-content");
    if (!content) return;

    const prompt = meta.prompt || message.dataset.prompt || "";
    const contextualActions = ResponsePolicy?.actionsFor?.(prompt, rawReply, {
      semanticRoute: meta.semanticRoute || meta.context?.semanticRoute || null,
      quickActions: meta.quickActions || meta.context?.quickActions || []
    }) || [];
    const contextualMarkup = contextualActions.length
      ? `<div class="learning-feedback contextual-actions" aria-label="Continue learning">${contextualActions
          .map((item) => `<button type="button" data-action="contextual" data-context-action="${escapeHtml(item.id)}">${escapeHtml(item.label)}</button>`)
          .join("")}</div>`
      : "";

    const actions = document.createElement("div");
    actions.className = "message-actions";
    actions.innerHTML = `
      <button class="message-action-btn" type="button" data-action="copy" aria-label="Copy response" title="Copy response">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="9" y="9" width="13" height="13" rx="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
      </button>
      <button class="message-action-btn" type="button" data-action="up" aria-label="Like response" title="Like response">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 10v12"></path>
          <path d="M15 5.9 14 10h5.8a2 2 0 0 1 2 2.4l-1.4 7A2 2 0 0 1 18.4 21H7"></path>
          <path d="M7 10H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"></path>
          <path d="M14 10V5.5A2.5 2.5 0 0 0 11.5 3L7 10"></path>
        </svg>
      </button>
      <button class="message-action-btn" type="button" data-action="down" aria-label="Dislike response" title="Dislike response">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M17 14V2"></path>
          <path d="M9 18.1 10 14H4.2a2 2 0 0 1-2-2.4l1.4-7A2 2 0 0 1 5.6 3H17"></path>
          <path d="M17 14h3a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-3"></path>
          <path d="M10 14v4.5A2.5 2.5 0 0 0 12.5 21L17 14"></path>
        </svg>
      </button>
      ${contextualMarkup}
    `;

    actions.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const action = button.dataset.action;
      const conversationId = meta.conversationId || message.dataset.conversationId;
      const messageId = meta.messageId || message.dataset.messageId;

      if (action === "contextual") {
        const selected = contextualActions.find((item) => item.id === button.dataset.contextAction);
        if (!selected?.prompt) return;
        input.value = selected.prompt;
        resizeInput();
        updateSendState();
        await sendMessage();
        return;
      }

      if (action === "copy") {
        const copied = await (ChatbotCore?.copyText?.(rawReply) || Promise.resolve(false));
        if (copied) {
          GPT?.incrementCopied?.(conversationId, messageId) || ChatHistory?.incrementCopied?.(conversationId, messageId);
          showToast("Copied response.");
        } else {
          showToast("Copy failed in this browser.");
        }
      }

      if (action === "up" || action === "down") {
        GPT?.rateMessage?.(conversationId, messageId, action) || ChatHistory?.rateMessage?.(conversationId, messageId, action);
        actions.querySelectorAll("[data-action='up'], [data-action='down']").forEach((item) => {
          item.classList.toggle("active", item.dataset.action === action);
        });
        sendTeachingFeedback({
          conversationId,
          messageId,
          message: meta.prompt || message.dataset.prompt || "",
          reply: rawReply,
          feedbackType: action,
          model: meta.model || message.dataset.model || selectedModel,
          activityChatId: meta.context?.activityChatId || meta.activityChatId || null,
          adaptiveContext: meta.context?.adaptiveContext || meta.adaptiveContext || null
        });
        showToast(action === "up" ? "Marked as helpful." : "Marked for improvement.");
      }

      if (["understood", "simpler", "examples", "confused"].includes(action)) {
        actions.querySelectorAll(".learning-feedback button").forEach((item) => {
          item.classList.toggle("active", item.dataset.action === action);
        });
        const prompt = meta.prompt || message.dataset.prompt || "";
        const feedbackResult = await sendTeachingFeedback({
          conversationId,
          messageId,
          message: prompt,
          reply: rawReply,
          feedbackType: action,
          model: meta.model || message.dataset.model || selectedModel,
          activityChatId: meta.context?.activityChatId || meta.activityChatId || null,
          adaptiveContext: meta.context?.adaptiveContext || meta.adaptiveContext || null
        });
        const followup = feedbackResult?.followup || GPT?.createFeedbackFollowup?.(action, {
          message: prompt,
          reply: rawReply,
          subject: meta.context?.semanticRoute?.subject || "general",
          adaptiveContext: meta.context?.adaptiveContext || meta.adaptiveContext || null
        });
        showToast(action === "understood" ? "Nice. Tutorly will remember this helped." : "I will adjust the explanation style.");
        if (followup && action !== "understood") {
          setChatMode(true);
          const followupMessage = addMessage(followup, "bot", {
            conversationId,
            model: meta.model || selectedModel,
            prompt
          });
          scrollToBottom();
          return followupMessage;
        }
      }

      if (action === "regenerate") {
        const prompt = meta.prompt || message.dataset.prompt || "";
        const model = meta.model || message.dataset.model || selectedModel;
        const context = meta.context || {};
        if (!prompt) {
          showToast("I need the original prompt to regenerate this.");
          return;
        }
        message.classList.add("loading");
        content.innerHTML = `<span class="typing-label">Regenerating...</span><span class="typing-dots" aria-label="Tutorly is thinking"></span>`;
        const freshReply = await getBotReply(prompt, model, context);
        const subject = context.semanticRoute?.subject || "general";
        const toolkit = createStudyToolkit(subject, prompt, freshReply, model);
        GPT?.updateMessage?.(conversationId, messageId, {
          content: freshReply,
          model,
          subject,
          regeneratedFrom: rawReply.slice(0, 500),
          tools: toolkit
        }) || ChatHistory?.updateMessage?.(conversationId, messageId, {
          content: freshReply,
          model,
          subject,
          regeneratedFrom: rawReply.slice(0, 500),
          tools: toolkit
        });
        streamBotReply(message, freshReply, {
          ...meta,
          model,
          prompt,
          context,
          toolkit,
          onDone: () => showToast("Response regenerated.")
        });
      }

      if (action === "tools") {
        const toolkit = meta.toolkit || ChatHistory?.getConversation?.(conversationId)?.messages?.find((item) => item.id === messageId)?.tools;
        openStudyToolkit(toolkit);
      }
    });

    content.appendChild(actions);
  }

  function streamBotReply(message, markdown, meta = {}) {
    const content = message.querySelector(".bot-content");
    const mode = ChatbotModes?.get?.(meta.model || selectedModel);
    const shouldStream = mode ? mode.stream !== false : true;
    const text = String(markdown || "");
    const isInteractiveMath = /^<section\s+class="math-learning-flow"\s+data-tutorly-math-response/i.test(text.trim());

    if (!content || isInteractiveMath || !shouldStream || text.length < 160) {
      message.classList.remove("loading");
      updateBotContent(message, text, meta);
      if (typeof meta.onDone === "function") meta.onDone();
      scrollToBottom();
      return;
    }

    const chunks = text.match(/.{1,42}(\s|$)/g) || [text];
    let index = 0;
    const interval = meta.model === "spark" ? 14 : meta.model === "deep" ? 28 : 20;

    function tick() {
      index += 1;
      const partial = chunks.slice(0, index).join("");
      content.innerHTML = renderMarkdownNote(partial);
      scrollToBottom();

      if (index < chunks.length) {
        window.setTimeout(tick, interval);
        return;
      }

      message.classList.remove("loading");
      updateBotContent(message, text, meta);
      if (typeof meta.onDone === "function") meta.onDone();
      scrollToBottom();
    }

    tick();
  }

  function addMessage(text, type, options = {}) {
    const message = document.createElement("div");
    message.className = `msg ${type}`;
    if (options.loading) message.classList.add("loading");
    if (options.imageSrc) message.classList.add("has-image");
    if (options.conversationId) message.dataset.conversationId = options.conversationId;
    if (options.messageId) message.dataset.messageId = options.messageId;
    if (options.model) message.dataset.model = options.model;
    if (options.prompt) message.dataset.prompt = options.prompt;

    if (type === "bot") {
      const content = document.createElement("div");
      content.className = "bot-content";

      if (options.loading) {
        if (options.loadingText) {
          const label = document.createElement("span");
          label.className = "typing-label";
          label.textContent = options.loadingText;
          content.appendChild(label);
        }
        const dots = document.createElement("span");
        dots.className = "typing-dots";
        dots.setAttribute("aria-label", "Tutorly is thinking");
        content.appendChild(dots);
      } else {
        content.innerHTML = renderMarkdownNote(text);
        hydrateMathLearningCards(message);
      }

      message.appendChild(createBotAvatar());
      message.appendChild(content);
      if (!options.loading) {
        attachEducationalVisual(message, options);
        attachMathVisual(message, options);
        attachGeographyVisual(message, options);
        attachBotMessageActions(message, text, options);
      }
    } else {
      if (options.imageSrc) {
        const image = document.createElement("img");
        image.className = "user-image";
        image.src = options.imageSrc;
        image.alt = "Uploaded homework image";
        image.loading = "lazy";
        image.addEventListener("click", () => openImageModal(options.imageSrc));
        message.appendChild(image);

        if (text) {
          const caption = document.createElement("p");
          caption.className = "user-image-caption";
          caption.textContent = text;
          message.appendChild(caption);
        }
      } else {
        message.textContent = text;
      }
    }
    messages.appendChild(message);
    scrollToBottom();
    return message;
  }

  function updateSendState() {
    const locked = isWelcomeTrial && (welcomeTrialLocked || getWelcomeTrialCount() >= WELCOME_TRIAL_LIMIT);
    const hasReadyContent = input.value.trim().length > 0 || !!pendingImage;
    sendBtn.disabled = locked || chatRequestInFlight || !hasReadyContent;
    sendBtn.classList.toggle("active", !locked && !chatRequestInFlight && hasReadyContent);
    if (voiceBtn) {
      voiceBtn.disabled = locked || chatRequestInFlight;
      voiceBtn.classList.toggle("active", !locked && !chatRequestInFlight && !hasReadyContent);
      voiceBtn.setAttribute("aria-hidden", String(!locked && !chatRequestInFlight && hasReadyContent));
    }
    if (speechTextBtn) {
      speechTextBtn.hidden = true;
      speechTextBtn.setAttribute("aria-hidden", "true");
    }
    body.classList.toggle("composer-ready", !locked && hasReadyContent);
  }

  function appendToInput(text) {
    const currentValue = input.value.trimEnd();
    input.value = currentValue ? `${currentValue} ${text}` : text;
    resizeInput();
    updateSendState();
    input.focus();
  }

  function resizeInput() {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  }

  function setChatMode(isActive) {
    body.classList.toggle("has-chat", isActive);
    if (chatTitle) {
      chatTitle.textContent = isActive ? "Tutorly chat" : "New chat";
    }
  }

  function getResponseDelay(text, modelId = selectedModel, hasImage = false) {
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    const chars = text.trim().length;
    const model = normalizeModelId(modelId);

    let delay = 4800;
    if (words <= 3 && chars <= 20) delay = 1000;
    else if (words <= 10 && chars <= 70) delay = 1600;
    else if (words <= 25 && chars <= 170) delay = 2600;
    else if (words <= 45 && chars <= 320) delay = 3600;

    if (GPT?.getResponseDelay) {
      return GPT.getResponseDelay(text, model, delay, { hasImage });
    }
    if (ChatbotModes?.getDelay) {
      return ChatbotModes.getDelay(text, model, delay, { hasImage });
    }
    if (model === "spark") return Math.max(650, Math.round(delay * 0.55));
    if (model === "lens") return hasImage ? Math.max(1800, Math.round(delay * 0.75)) : Math.round(delay * 0.9);
    return delay;
  }

  function getPrimeReply(text) {
    if (!ENABLE_LEGACY_LOCAL_ROUTER) return "";
    const subject = SubjectEngine.getSubject(text);

    switch (subject) {
      case "math":
        return SubjectEngine.mathResponse(text);
      case "science":
        return SubjectEngine.scienceResponse(text);
      case "english":
        return SubjectEngine.englishResponse(text);
      case "history":
        return SubjectEngine.historyResponse(text);
      case "geography":
        return SubjectEngine.geographyResponse(text);
      default:
        return SubjectEngine.generalResponse(text);
    }
  }

  function compactStudyNote(markdown) {
    const lines = markdown.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const heading = lines.find((line) => /^#\s+/.test(line)) || "# Spark Answer";
    const finalLine = lines.find((line) => /^>\s+/.test(line));
    const steps = lines.filter((line) => /^\d+\.\s+/.test(line)).slice(0, 3);
    const bodyLines = lines.filter((line) => {
      return !/^#{1,3}\s+/.test(line) &&
        !/^>\s+/.test(line) &&
        !/^\d+\.\s+/.test(line) &&
        !/^[-*]\s+/.test(line);
    }).slice(0, steps.length ? 1 : 2);

    const output = [
      heading.replace(/^#\s+/, "# Spark Answer "),
      "",
      ...bodyLines
    ];

    if (steps.length) {
      output.push("", "### Quick steps", "", ...steps);
    }

    if (finalLine) {
      output.push("", finalLine);
    }

    return output.join("\n");
  }

  function getSparkReply(text) {
    const sparkMathReply = window.TutorlyMathRenderer?.createSparkMarkdown?.(text, { model: "spark" });
    if (sparkMathReply) return sparkMathReply;
    const sparkEnglishReply = getConfidentEnglishReply(text, "spark");
    if (sparkEnglishReply) return sparkEnglishReply;
    return compactStudyNote(getPrimeReply(text));
  }

  function getLensReply(text, context = {}) {
    const reply = getPrimeReply(text);
    if (!context.hasImage) return reply;

    const lines = reply.split(/\r?\n/);
    const headingIndex = lines.findIndex((line) => /^#\s+/.test(line.trim()));
    if (headingIndex >= 0) {
      lines[headingIndex] = lines[headingIndex].replace(/^#\s+/, "# Lens Solution ");
    }

    const helper = [
      "",
      "_I read the question from your image and turned it into editable text before solving it._",
      ""
    ];

    return [
      ...lines.slice(0, headingIndex + 1),
      ...helper,
      ...lines.slice(headingIndex + 1)
    ].join("\n");
  }

  function getModeBaseReply(text, model, context = {}) {
    if (GPT?.createBaseReply) {
      return GPT.createBaseReply(text, model, context);
    }
    const primeReply = getPrimeReply(text);

    if (model === "spark") {
      const sparkMathReply = window.TutorlyMathRenderer?.createSparkMarkdown?.(text, { model: "spark", context });
      return sparkMathReply || compactStudyNote(primeReply);
    }
    if (model === "lens") return getLensReply(text, context);

    if (model === "deep") {
      return [
        primeReply,
        "",
        "### Deeper connection",
        "",
        "_A strong answer should connect the definition, the reason behind it, and one example. That makes the concept easier to remember and easier to use in exams._",
        "",
        "### Check your understanding",
        "",
        "Try explaining the same idea in one sentence, then solve or describe one similar example."
      ].join("\n");
    }

    if (model === "research") {
      return [
        primeReply,
        "",
        "### Fact-check notes",
        "",
        "_Use this as a study explanation. For dates, statistics, current events, or exact legal/scientific standards, verify with your textbook or teacher-approved source._",
        "",
        "### Citation style",
        "",
        "- Class textbook or school notes",
        "- Teacher reference material",
        "- Reliable educational atlas or encyclopedia for geography/history facts"
      ].join("\n");
    }

    if (model === "creative") {
      return [
        primeReply,
        "",
        "### Creative memory hook",
        "",
        "_Turn the topic into a small story, comparison, or visual image. If you can picture it, you can usually remember it faster._"
      ].join("\n");
    }

    if (model === "study") {
      return [
        primeReply,
        "",
        "### Revision move",
        "",
        "After reading this, make one flashcard and one practice question from the answer.",
        "",
        "_Learning sticks better when you test yourself right after the explanation._"
      ].join("\n");
    }

    return primeReply;
  }

  function getLocalBotReply(text, modelId = selectedModel, context = {}) {
    if (!ENABLE_LEGACY_LOCAL_ROUTER) return "";
    const model = normalizeModelId(modelId);
    const subject = SubjectEngine.getSubject(text);

    if (subject === "english") {
      const localEnglishReply = getConfidentEnglishReply(text, model);
      if (localEnglishReply) return localEnglishReply;
    }

    if (GPT?.createReply) {
      return GPT.createReply({
        message: text,
        modelId: model,
        subject,
        context
      });
    }

    if (window.TutorlyResponseEngine?.createReply) {
      const baseReply = getModeBaseReply(text, model, context);

      return window.TutorlyResponseEngine.createReply({
        message: text,
        modelId: model,
        subject,
        context,
        baseReply
      });
    }

    const casualReply = getCasualReply(text);
    if (casualReply) return casualReply;

    return getModeBaseReply(text, model, context);
  }

  async function getBotReply(text, modelId = selectedModel, context = {}) {
    const model = normalizeModelId(modelId);
    context.model = model;

    try {
      const backendReply = await requestBackendChat(text, context);
      if (backendReply) {
        return normalizeReplyForRender(backendReply, model, {
          topic: context.semanticRoute?.topic || "Study Help",
          subject: context.semanticRoute?.subject || "general",
          question: text,
          confidence: context.semanticRoute?.confidence ?? 0.8,
          semanticRoute: context.semanticRoute
        });
      }
    } catch (error) {
      console.warn("Tutorly semantic chat request failed.");
    }
    return "I couldn't process that question properly. Please try again.";
  }

  async function sendMessage(options = {}) {
    if (chatRequestInFlight) return;
    const text = input.value.trim();
    const imageToSend = pendingImage;
    const hasImage = !!imageToSend;
    if (!text && !hasImage) return;

    if (hasImage && imageToSend.ocrRunning) {
      showToast("Still preparing your image. Please wait a moment before sending.");
      setPreviewStatus("Preparing the image for analysis... please wait before sending.", null);
      input.focus();
      return;
    }

    if (isWelcomeTrial && getWelcomeTrialCount() >= WELCOME_TRIAL_LIMIT) {
      showWelcomeTrialLimit();
      return;
    }

    chatRequestInFlight = true;
    updateSendState();

    const shouldShowTrialLimitAfterReply = registerWelcomeTrialAttempt();
    const imageDataUrl = hasImage
      ? await imageFileToDataUrl(imageToSend.uploadFile || imageToSend.file).catch(() => "")
      : "";
    const botInputText = text || imageToSend?.extractedText || "Please read and explain the uploaded learning image.";
    const userDisplayText = text || imageToSend?.extractedText || "Uploaded learning image";
    const requestPayload = createChatRequestPayload(botInputText, {
      hasImage,
      imageSource: imageToSend?.source || null,
      imageDataUrl,
      extractedText: imageToSend?.extractedText || ""
    });
    const modelAtSend = requestPayload.model;
    const subjectAtSend = "general";
    const conversation = ensureActiveConversation(botInputText);
    const conversationId = conversation?.id || null;
    requestPayload.conversationId = conversationId;
    if (conversationId) {
      activeConversationId = conversationId;
      GPT?.setActiveConversation?.(conversationId) || ChatHistory?.setActiveConversation?.(conversationId);
    }
    window.TutorlyLastChatPayload = requestPayload;

    setChatMode(true);
    const userRecord = GPT?.recordUserMessage?.({
      conversationId,
      content: userDisplayText,
      model: modelAtSend,
      subject: subjectAtSend,
      imageToSend,
      metadata: {
        hasImage,
        imageSource: imageToSend?.source || null,
        extractedText: imageToSend?.extractedText || ""
      }
    }) || ChatHistory?.appendMessage?.(conversationId, {
      role: "user",
      content: userDisplayText,
      model: modelAtSend,
      subject: subjectAtSend,
      attachments: buildAttachmentMeta(imageToSend),
      metadata: {
        hasImage,
        imageSource: imageToSend?.source || null,
        extractedText: imageToSend?.extractedText || ""
      }
    });
    if (!GPT) observeChatMemory(userRecord, conversationId, subjectAtSend);

    addMessage(userDisplayText, "user", hasImage ? {
      imageSrc: imageToSend.previewUrl,
      conversationId,
      messageId: userRecord?.id,
      model: modelAtSend
    } : {
      conversationId,
      messageId: userRecord?.id,
      model: modelAtSend
    });

    if (hasImage) {
      const fileForUpload = imageToSend.uploadFile || imageToSend.file;
      const card = document.getElementById("imagePreviewCard");
      if (card) card.classList.remove("show");
      pendingImage = null;
      uploadImageToBackend(fileForUpload).catch(() => {
        showToast("Upload failed. The image is still visible in this chat.");
      });
    }

    input.value = "";
    resizeInput();
    updateSendState();

    const loadingMessage = addMessage("", "bot", {
      loading: true,
      loadingText: hasImage || modelAtSend === "lens"
        ? MODEL_CONFIGS.lens.loading
        : MODEL_CONFIGS[modelAtSend].loading,
      conversationId,
      model: modelAtSend,
      prompt: botInputText
    });

    window.setTimeout(async () => {
      let replyText;
      try {
        replyText = await getBotReply(botInputText, modelAtSend, requestPayload);
      } finally {
        chatRequestInFlight = false;
        updateSendState();
      }
      const routedSubject = requestPayload.semanticRoute?.subject || subjectAtSend;
      const toolkit = createStudyToolkit(routedSubject, botInputText, replyText, modelAtSend);
      if (userRecord?.id && conversationId) {
        GPT?.updateMessage?.(conversationId, userRecord.id, { subject: routedSubject })
          || ChatHistory?.updateMessage?.(conversationId, userRecord.id, { subject: routedSubject });
      }
      const assistantRecord = GPT?.recordAssistantMessage?.({
        conversationId,
        content: replyText,
        model: modelAtSend,
        subject: routedSubject,
        parentId: userRecord?.id || null,
        tools: toolkit,
        metadata: {
          prompt: botInputText,
          userMessage: botInputText,
          mode: requestPayload.mode,
          directives: requestPayload.responseDirectives,
          adaptiveContext: requestPayload.adaptiveContext || null,
          semanticRoute: requestPayload.semanticRoute || null,
          activityChatId: requestPayload.activityChatId || null,
          hasImage
        }
      }) || ChatHistory?.appendMessage?.(conversationId, {
        role: "assistant",
        content: replyText,
        model: modelAtSend,
        subject: routedSubject,
        parentId: userRecord?.id || null,
        tools: toolkit,
        metadata: {
          prompt: botInputText,
          userMessage: botInputText,
          mode: requestPayload.mode,
          directives: requestPayload.responseDirectives,
          adaptiveContext: requestPayload.adaptiveContext || null,
          semanticRoute: requestPayload.semanticRoute || null,
          activityChatId: requestPayload.activityChatId || null,
          hasImage
        }
      });
      if (!GPT) observeChatMemory(assistantRecord, conversationId, routedSubject);
      streamBotReply(loadingMessage, replyText, {
        conversationId,
        messageId: assistantRecord?.id,
        prompt: botInputText,
        model: modelAtSend,
        context: requestPayload,
        toolkit,
        onDone: () => {
          if (options.speakReply && typeof speakLiveReply === "function") {
            speakLiveReply(replyText);
          }
          if (shouldShowTrialLimitAfterReply) {
            showWelcomeTrialLimit();
          }
        }
      });
    }, getResponseDelay(botInputText, modelAtSend, hasImage));
  }

  function resetChat() {
    messages.innerHTML = "";
    input.value = "";
    removePendingImage();
    resizeInput();
    updateSendState();
    activeConversationId = null;
    GPT?.setActiveConversation?.(null) || ChatHistory?.setActiveConversation?.(null);
    setChatMode(false);
    input.focus();
  }

  function closeHistoryPanel() {
    const overlay = document.getElementById("chatHistoryOverlay");
    if (!overlay) return;
    overlay.classList.remove("show");
    overlay.setAttribute("aria-hidden", "true");
  }

  function renderHistoryList(overlay, query = "") {
    const list = overlay.querySelector("#chatHistoryList");
    const empty = overlay.querySelector("#chatHistoryEmpty");
    const stats = overlay.querySelector("#chatHistoryStats");
    if (!list || (!GPT && !ChatHistory)) return;

    const conversations = GPT?.listConversations?.({ query, includeArchived: false }) || ChatHistory.listConversations({ query, includeArchived: false });
    const historyStats = GPT?.getStats?.() || ChatHistory.getStats();
    if (stats) {
      stats.innerHTML = `
        <span><strong>${historyStats.active}</strong> active</span>
        <span><strong>${historyStats.pinned}</strong> pinned</span>
        <span><strong>${historyStats.messages}</strong> messages</span>
      `;
    }

    list.innerHTML = conversations.map((conversation) => {
      const isActive = conversation.id === activeConversationId;
      const subject = conversation.subjects && conversation.subjects[0] ? conversation.subjects[0] : "study";
      return `
        <article class="history-item ${isActive ? "active" : ""}" data-chat-id="${escapeHtml(conversation.id)}">
          <button class="history-main" type="button" data-history-action="open">
            <span class="history-pin" aria-hidden="true">${conversation.pinned ? "*" : ""}</span>
            <span>
              <strong>${escapeHtml(conversation.title || "Study chat")}</strong>
              <small>${escapeHtml(conversation.summary || `${conversation.messageCount || 0} messages`)}</small>
            </span>
          </button>
          <div class="history-meta">
            <span>${escapeHtml(subject)}</span>
            <button type="button" data-history-action="pin">${conversation.pinned ? "Unpin" : "Pin"}</button>
            <button type="button" data-history-action="archive">Archive</button>
          </div>
        </article>
      `;
    }).join("");

    if (empty) empty.hidden = conversations.length > 0;
  }

  function loadConversation(conversationId) {
    if (!GPT && !ChatHistory) return;
    const conversation = GPT?.getConversation?.(conversationId) || ChatHistory.getConversation(conversationId);
    if (!conversation) {
      showToast("That chat could not be found.");
      return;
    }

    messages.innerHTML = "";
    activeConversationId = conversation.id;
    GPT?.setActiveConversation?.(conversation.id) || ChatHistory.setActiveConversation(conversation.id);
    setChatMode(true);

    conversation.messages.forEach((messageRecord) => {
      if (messageRecord.role === "assistant") {
        addMessage(messageRecord.content, "bot", {
          conversationId: conversation.id,
          messageId: messageRecord.id,
          model: messageRecord.model,
          prompt: conversation.messages.find((item) => item.id === messageRecord.parentId)?.content || "",
          toolkit: messageRecord.tools
        });
        return;
      }

      const imageAttachment = (messageRecord.attachments || []).find((item) => item.type === "image" && item.previewUrl);
      addMessage(messageRecord.content, "user", {
        conversationId: conversation.id,
        messageId: messageRecord.id,
        model: messageRecord.model,
        imageSrc: imageAttachment?.previewUrl || ""
      });
    });

    closeHistoryPanel();
    closeMobileSidebar();
    scrollToBottom();
    input.focus();
  }

  function createHistoryPanel() {
    let overlay = document.getElementById("chatHistoryOverlay");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "chatHistoryOverlay";
    overlay.className = "history-overlay";
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = `
      <aside class="history-drawer" role="dialog" aria-modal="true" aria-labelledby="chatHistoryTitle">
        <header class="history-head">
          <div>
            <p>Tutorly memory</p>
            <h2 id="chatHistoryTitle">Chat history</h2>
          </div>
          <button class="history-close" type="button" aria-label="Close history">&times;</button>
        </header>
        <div class="history-stats" id="chatHistoryStats"></div>
        <label class="history-search">
          <span>Search chats</span>
          <input id="chatHistorySearch" type="search" placeholder="Search topics, answers, subjects..." />
        </label>
        <div class="history-list" id="chatHistoryList"></div>
        <p class="history-empty" id="chatHistoryEmpty" hidden>No saved chats yet. Send a message and it will appear here.</p>
      </aside>
    `;
    document.body.appendChild(overlay);

    const search = overlay.querySelector("#chatHistorySearch");
    const debouncedRender = ChatbotCore?.debounce
      ? ChatbotCore.debounce(() => renderHistoryList(overlay, search.value), 120)
      : () => renderHistoryList(overlay, search.value);

    search.addEventListener("input", debouncedRender);
    overlay.querySelector(".history-close").addEventListener("click", closeHistoryPanel);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeHistoryPanel();
    });
    overlay.querySelector("#chatHistoryList").addEventListener("click", (event) => {
      const action = event.target.closest("[data-history-action]");
      const item = event.target.closest(".history-item");
      if (!action || !item || (!GPT && !ChatHistory)) return;
      const conversationId = item.dataset.chatId;

      if (action.dataset.historyAction === "open") {
        loadConversation(conversationId);
      }

      if (action.dataset.historyAction === "pin") {
        const conversation = GPT?.getConversation?.(conversationId) || ChatHistory.getConversation(conversationId);
        GPT?.pinConversation?.(conversationId, !conversation?.pinned) || ChatHistory.pinConversation(conversationId, !conversation?.pinned);
        renderHistoryList(overlay, search.value);
      }

      if (action.dataset.historyAction === "archive") {
        GPT?.archiveConversation?.(conversationId, true) || ChatHistory.archiveConversation(conversationId, true);
        renderHistoryList(overlay, search.value);
        showToast("Chat archived.");
      }
    });

    return overlay;
  }

  function openHistoryPanel() {
    if (!GPT && !ChatHistory) {
      showToast("Chat history is not available in this browser.");
      return;
    }
    const overlay = createHistoryPanel();
    renderHistoryList(overlay, overlay.querySelector("#chatHistorySearch")?.value || "");
    overlay.classList.add("show");
    overlay.setAttribute("aria-hidden", "false");
    closeMobileSidebar();
    overlay.querySelector("#chatHistorySearch")?.focus();
  }

  const ENGLISH_VOICE_LANGUAGES = new Set(["en-US", "en-IN", "en-GB"]);

  function normalizeVoiceLanguage(value) {
    return ENGLISH_VOICE_LANGUAGES.has(value) ? value : "en-US";
  }

  function getVoiceLanguage() {
    try {
      const storedLanguage = localStorage.getItem("tutorly_voice_language");
      const language = normalizeVoiceLanguage(storedLanguage || "en-US");
      if (storedLanguage !== language) {
        localStorage.setItem("tutorly_voice_language", language);
      }
      return language;
    } catch (error) {
      return "en-US";
    }
  }

  function containsNonEnglishScript(text) {
    return /[\u0900-\u097F\u0C00-\u0C7F]/.test(text || "");
  }

  function setStoredValue(key, value) {
    try {
      if (value === "") localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (error) {
      showToast("Settings could not be saved in this browser.");
    }
  }

  function closeSettingsPanel() {
    const overlay = document.getElementById("chatSettingsOverlay");
    if (!overlay) return;
    overlay.classList.remove("show");
    overlay.setAttribute("aria-hidden", "true");
  }

  function createSettingsPanel() {
    let overlay = document.getElementById("chatSettingsOverlay");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "chatSettingsOverlay";
    overlay.className = "settings-overlay";
    overlay.setAttribute("aria-hidden", "true");
    const settingsModeOptions = Object.values(MODEL_CONFIGS).map((config) => {
      return `<option value="${escapeHtml(config.id)}">${escapeHtml(config.name)} - ${escapeHtml(config.description)}</option>`;
    }).join("");
    overlay.innerHTML = `
      <article class="settings-card" role="dialog" aria-modal="true" aria-labelledby="chatSettingsTitle">
        <header class="settings-head">
          <span class="settings-icon" aria-hidden="true">&#10022;</span>
          <div>
            <p>Tutorly controls</p>
            <h2 id="chatSettingsTitle">Chat settings</h2>
          </div>
          <button id="settingsCloseBtn" class="settings-close" type="button" aria-label="Close settings">&times;</button>
        </header>

        <div class="settings-grid">
          <label class="settings-field">
            <span>Default model</span>
            <select id="settingsModelSelect">
              ${settingsModeOptions}
            </select>
          </label>

          <label class="settings-field">
            <span>Tutor tone</span>
            <select id="settingsToneSelect">
              <option value="">Auto match</option>
              <option value="friendly">Friendly</option>
              <option value="teacher">Teacher</option>
              <option value="smart">Smart</option>
              <option value="fast">Fast answer</option>
              <option value="deep">Deep explanation</option>
              <option value="motivational">Motivational</option>
              <option value="creative">Creative</option>
            </select>
          </label>

          <label class="settings-field">
            <span>Voice language</span>
            <select id="settingsVoiceSelect">
              <option value="en-US">English (US)</option>
              <option value="en-IN">English (India)</option>
              <option value="en-GB">English (UK)</option>
            </select>
          </label>
        </div>

        <div class="settings-actions">
          <button id="settingsResetMemory" class="settings-action" type="button">Reset AI memory</button>
        </div>

        <p class="settings-note">Settings are saved on this device and apply instantly.</p>
      </article>
    `;
    document.body.appendChild(overlay);

    const modelSelect = overlay.querySelector("#settingsModelSelect");
    const toneSelect = overlay.querySelector("#settingsToneSelect");
    const voiceSelect = overlay.querySelector("#settingsVoiceSelect");

    modelSelect.value = getSelectedModelConfig().id;
    try {
      toneSelect.value = localStorage.getItem("tutorly_ai_tone_mode") || "";
      voiceSelect.value = getVoiceLanguage();
    } catch (error) {
      toneSelect.value = "";
      voiceSelect.value = "en-US";
    }

    overlay.querySelector("#settingsCloseBtn").addEventListener("click", closeSettingsPanel);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeSettingsPanel();
    });

    modelSelect.addEventListener("change", () => {
      setSelectedModel(modelSelect.value, { announce: true });
    });

    toneSelect.addEventListener("change", () => {
      setStoredValue("tutorly_ai_tone_mode", toneSelect.value);
      showToast(toneSelect.value ? `Tutor tone set to ${toneSelect.options[toneSelect.selectedIndex].text}.` : "Tutor tone set to Auto match.");
    });

    voiceSelect.addEventListener("change", () => {
      const nextLanguage = normalizeVoiceLanguage(voiceSelect.value);
      voiceSelect.value = nextLanguage;
      setStoredValue("tutorly_voice_language", nextLanguage);
      showToast(`Voice language set to ${voiceSelect.options[voiceSelect.selectedIndex].text}.`);
    });

    overlay.querySelector("#settingsResetMemory").addEventListener("click", () => {
      try {
        GPT?.clearMemory?.();
        if (!GPT) {
          localStorage.removeItem("tutorly_response_engine_memory_v1");
          ChatMemory?.clear?.();
        }
        showToast("AI response memory reset.");
      } catch (error) {
        showToast("Could not reset memory in this browser.");
      }
    });

    return overlay;
  }

  function openSettingsPanel() {
    const overlay = createSettingsPanel();
    overlay.querySelector("#settingsModelSelect").value = getSelectedModelConfig().id;
    overlay.classList.add("show");
    overlay.setAttribute("aria-hidden", "false");
    closeMobileSidebar();
  }

  function isMobileLayout() {
    return window.matchMedia("(max-width: 1080px)").matches;
  }

  function toggleMobileSidebar(forceOpen) {
    if (!sidebar) return;
    const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : !sidebar.classList.contains("open");
    sidebar.classList.toggle("open", shouldOpen);
    body.classList.toggle("sidebar-drawer-open", shouldOpen);
  }

  function closeMobileSidebar() {
    toggleMobileSidebar(false);
  }

  if (modelSelectorBtn && modelSelector) {
    modelSelectorBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const willOpen = !modelSelector.classList.contains("open");
      modelSelector.classList.toggle("open", willOpen);
      modelSelectorBtn.setAttribute("aria-expanded", String(willOpen));
    });
  }

  modelOptions.forEach((option) => {
    option.addEventListener("click", (event) => {
      event.stopPropagation();
      setSelectedModel(option.dataset.model, { announce: true });
      input.focus();
    });
  });

  sendBtn.addEventListener("click", sendMessage);

  input.addEventListener("input", () => {
    resizeInput();
    updateSendState();
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  suggestionChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      input.value = chip.dataset.prompt || chip.textContent.trim();
      resizeInput();
      updateSendState();
      sendMessage();
    });
  });

  if (newChatBtn) {
    newChatBtn.addEventListener("click", resetChat);
  }

  if (chatHistoryBtn) {
    chatHistoryBtn.addEventListener("click", openHistoryPanel);
  }

  if (settingsBtn) {
    settingsBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      openSettingsPanel();
    }, true);
  }

  if (settingsBtn) {
    settingsBtn.addEventListener("click", () => {
      setChatMode(true);
      addMessage("⚙️ Settings are ready for future options like theme, voice language, and tutor style.", "bot");
      closeMobileSidebar();
    });
  }

  if (uploadBtn && uploadInput) {
    uploadBtn.addEventListener("click", () => {
      uploadInput.click();
    });
    uploadInput.addEventListener("change", () => {
      const file = uploadInput.files && uploadInput.files[0];
      if (file) prepareImageFile(file, "upload");
      uploadInput.value = "";
    });
  }

  if (cameraBtn) {
    cameraBtn.addEventListener("click", () => {
      openCamera();
    });
  }

  const composerWrap = document.querySelector(".composer-wrap");
  if (composerWrap) {
    ["dragenter", "dragover"].forEach((eventName) => {
      composerWrap.addEventListener(eventName, (event) => {
        event.preventDefault();
        if (isMobileOrTabletImageLayout()) return;
        composerWrap.classList.add("drag-over");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      composerWrap.addEventListener(eventName, () => {
        composerWrap.classList.remove("drag-over");
      });
    });

    composerWrap.addEventListener("drop", (event) => {
      event.preventDefault();
      const file = Array.from(event.dataTransfer?.files || []).find((entry) => entry.type.startsWith("image/"));
      if (!file) {
        showToast("Drop an image file here.");
        return;
      }
      prepareImageFile(file, "upload");
    });
  }

  if (voiceBtn || speechTextBtn) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const NO_SPEECH_TIMEOUT_MS = 3800;
    const WAVE_PATTERN = [0.32, 0.56, 0.82, 0.5, 1, 0.68, 0.9, 0.48, 0.76, 0.54, 0.34];
    let recognition = null;
    let isListening = false;
    let activeSpeechButton = null;
    let speechDetected = false;
    let transcriptReceived = false;
    let speechStream = null;
    let speechAudioContext = null;
    let speechAnalyser = null;
    let speechData = null;
    let waveFrameId = null;
    let noSpeechTimer = null;
    let liveSessionMode = null;
    let liveRestartTimer = null;
    let liveActionSheet = null;
    let beginLiveMode = () => showToast("Speech recognition is not supported in this browser.");
    const speechButtons = [speechTextBtn, voiceBtn].filter(Boolean);

    function clearNoSpeechTimer() {
      window.clearTimeout(noSpeechTimer);
      noSpeechTimer = null;
    }

    function markSpeechDetected() {
      speechDetected = true;
      clearNoSpeechTimer();
    }

    function resetVoiceWave() {
      voiceWaveBars.forEach((bar) => {
        bar.style.height = "";
        bar.style.opacity = "";
      });
    }

    function stopMicrophoneMeter() {
      if (waveFrameId) {
        cancelAnimationFrame(waveFrameId);
        waveFrameId = null;
      }

      if (speechStream) {
        speechStream.getTracks().forEach((track) => track.stop());
        speechStream = null;
      }

      if (speechAudioContext) {
        speechAudioContext.close().catch(() => {});
        speechAudioContext = null;
      }

      speechAnalyser = null;
      speechData = null;
      resetVoiceWave();
    }

    function drawLiveVoiceWave() {
      if (!speechAnalyser || !speechData || !voiceWaveBars.length) return;

      speechAnalyser.getByteTimeDomainData(speechData);
      let sum = 0;
      for (let i = 0; i < speechData.length; i += 1) {
        const value = (speechData[i] - 128) / 128;
        sum += value * value;
      }

      const rms = Math.sqrt(sum / speechData.length);
      const loudness = Math.max(0, Math.min(1, (rms - 0.012) * 12));

      if (loudness > 0.12) {
        markSpeechDetected();
      }

      voiceWaveBars.forEach((bar, index) => {
        const shape = WAVE_PATTERN[index % WAVE_PATTERN.length];
        const shimmer = Math.sin(performance.now() / 95 + index * 0.7) * 0.045;
        const energy = Math.max(0, Math.min(1, loudness * (0.62 + shape * 0.62) + shimmer));
        const height = 7 + energy * (12 + shape * 22);
        bar.style.height = `${height.toFixed(1)}px`;
        bar.style.opacity = String(0.42 + energy * 0.58);
      });

      waveFrameId = requestAnimationFrame(drawLiveVoiceWave);
    }

    async function startMicrophoneMeter() {
      if (!navigator.mediaDevices?.getUserMedia || !AudioContextClass) {
        throw new Error("Microphone meter unavailable");
      }

      stopMicrophoneMeter();
      speechStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      speechAudioContext = new AudioContextClass();
      if (speechAudioContext.state === "suspended") {
        await speechAudioContext.resume();
      }

      const source = speechAudioContext.createMediaStreamSource(speechStream);
      speechAnalyser = speechAudioContext.createAnalyser();
      speechAnalyser.fftSize = 1024;
      speechAnalyser.smoothingTimeConstant = 0.72;
      speechData = new Uint8Array(speechAnalyser.fftSize);
      source.connect(speechAnalyser);
      drawLiveVoiceWave();
    }

    function stopSpeechRecognition(reason = "") {
      clearNoSpeechTimer();
      clearLiveRestartTimer();
      if (isListening && recognition) {
        try {
          recognition.abort();
        } catch (error) {
          try {
            recognition.stop();
          } catch (_stopError) {}
        }
      }

      setVoiceListening(false);
      activeSpeechButton = null;
      stopMicrophoneMeter();

      if (reason) {
        liveSessionMode = null;
        setLiveButtonState("idle");
        showToast(reason);
      }
    }

    function startNoSpeechTimer() {
      clearNoSpeechTimer();
      noSpeechTimer = window.setTimeout(() => {
        if (!transcriptReceived && !speechDetected) {
          stopSpeechRecognition("No speech detected. Tap the mic and try again.");
        }
      }, NO_SPEECH_TIMEOUT_MS);
    }

    function clearLiveRestartTimer() {
      window.clearTimeout(liveRestartTimer);
      liveRestartTimer = null;
    }

    function setLiveButtonState(state = "idle") {
      if (!voiceBtn) return;
      ["listening", "thinking", "speaking"].forEach((className) => {
        voiceBtn.classList.toggle(className, className === state);
      });
      body.classList.toggle("live-tutor-active", state !== "idle");
      body.classList.toggle("live-tutor-speaking", state === "speaking");
      voiceBtn.dataset.liveState = state;
    }

    function getSpeakableText(markdown) {
      const scratch = document.createElement("div");
      scratch.innerHTML = renderMarkdown(markdown || "");
      return (scratch.textContent || "")
        .replace(/\s+/g, " ")
        .replace(/Final answer:/gi, "Final answer:")
        .trim()
        .slice(0, 900);
    }

    function closeLiveActionSheet() {
      if (!liveActionSheet) return;
      document.removeEventListener("keydown", handleLiveSheetKeydown);
      liveActionSheet.classList.remove("show");
      liveActionSheet.setAttribute("aria-hidden", "true");
      window.setTimeout(() => {
        liveActionSheet?.remove();
        liveActionSheet = null;
      }, 180);
    }

    function handleLiveSheetKeydown(event) {
      if (event.key === "Escape") {
        closeLiveActionSheet();
      }
    }

    function openLiveActionSheet() {
      closeLiveActionSheet();
      liveActionSheet = document.createElement("div");
      liveActionSheet.className = "live-sheet-backdrop";
      liveActionSheet.setAttribute("aria-hidden", "true");
      liveActionSheet.innerHTML = `
        <section class="live-sheet" role="dialog" aria-modal="true" aria-labelledby="liveSheetTitle">
          <div class="live-sheet-handle" aria-hidden="true"></div>
          <div class="live-sheet-heading">
            <span class="live-sheet-orb" aria-hidden="true">✦</span>
            <div>
              <p>Choose live mode</p>
              <h2 id="liveSheetTitle">How do you want to learn?</h2>
            </div>
          </div>
          <button class="live-mode-option" type="button" data-live-mode="voice">
            <span class="live-mode-icon" aria-hidden="true">🎤</span>
            <span><strong>Tutorly Live</strong><small>Voice-only tutor conversation</small></span>
          </button>
          <button class="live-mode-option" type="button" data-live-mode="vision">
            <span class="live-mode-icon" aria-hidden="true">📹</span>
            <span><strong>Vision Live</strong><small>Camera + voice for homework help</small></span>
          </button>
        </section>
      `;
      document.body.appendChild(liveActionSheet);
      document.addEventListener("keydown", handleLiveSheetKeydown);
      liveActionSheet.addEventListener("click", (event) => {
        if (event.target === liveActionSheet) closeLiveActionSheet();
      });
      liveActionSheet.querySelectorAll("[data-live-mode]").forEach((button) => {
        button.addEventListener("click", () => {
          const mode = button.dataset.liveMode || "voice";
          closeLiveActionSheet();
          beginLiveMode(mode);
        });
      });
      window.requestAnimationFrame(() => {
        liveActionSheet?.classList.add("show");
        liveActionSheet?.setAttribute("aria-hidden", "false");
      });
    }

    async function attachVisionLiveFrame() {
      const overlay = document.getElementById("cameraOverlay");
      const video = overlay?.querySelector("#cameraVideo");
      const canvas = overlay?.querySelector("#cameraCanvas");
      if (!video || !canvas || !cameraStream) return false;

      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 960;
      if (!width || !height) return false;

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, width, height);

      const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", 0.82);
      });
      if (!blob || blob.size === 0) return false;

      const file = new File([blob], `vision-live-${Date.now()}.jpg`, { type: "image/jpeg" });
      setSelectedModel("lens", { announce: false });
      removePendingImage();
      pendingImage = {
        file,
        uploadFile: file,
        source: "camera",
        previewUrl: URL.createObjectURL(file),
        extractedText: "",
        ocrRunning: false
      };
      return true;
    }

    async function submitLiveTranscript(transcript) {
      const spokenText = String(transcript || "").trim();
      if (!spokenText) return;

      setLiveButtonState("thinking");
      if (liveSessionMode === "vision") {
        const frameAttached = await attachVisionLiveFrame();
        if (!frameAttached) {
          showToast("Vision Live is listening. Keep the camera open or use the photo button for image analysis.");
        }
      }

      input.value = spokenText;
      resizeInput();
      updateSendState();
      sendMessage({ speakReply: true, liveMode: liveSessionMode });
    }

    function setVoiceListening(value) {
      isListening = value;
      body.classList.toggle("voice-wave-active", value);
      speechButtons.forEach((button) => {
        const isActiveButton = value && button === activeSpeechButton;
        button.classList.toggle("listening", isActiveButton);
        button.setAttribute("aria-pressed", String(isActiveButton));
      });
    }

    if (SpeechRecognition) {
      recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = getVoiceLanguage();

      recognition.addEventListener("start", () => {
        setVoiceListening(true);
        if (activeSpeechButton === voiceBtn && liveSessionMode) {
          setLiveButtonState("listening");
        }
        startNoSpeechTimer();
      });
      recognition.addEventListener("soundstart", markSpeechDetected);
      recognition.addEventListener("speechstart", markSpeechDetected);
      recognition.addEventListener("end", () => {
        const wasLiveListening = activeSpeechButton === voiceBtn && liveSessionMode;
        const hadTranscript = transcriptReceived;
        clearNoSpeechTimer();
        setVoiceListening(false);
        activeSpeechButton = null;
        stopMicrophoneMeter();
        if (wasLiveListening && !hadTranscript) {
          liveSessionMode = null;
          setLiveButtonState("idle");
        }
      });
      recognition.addEventListener("error", () => {
        const wasLiveListening = activeSpeechButton === voiceBtn && liveSessionMode;
        clearNoSpeechTimer();
        setVoiceListening(false);
        activeSpeechButton = null;
        stopMicrophoneMeter();
        if (wasLiveListening) {
          liveSessionMode = null;
          setLiveButtonState("idle");
        }
      });
      recognition.addEventListener("result", (event) => {
        const transcript = Array.from(event.results)
          .map((result) => result[0].transcript)
          .join(" ")
          .trim();

        if (transcript) {
          transcriptReceived = true;
          clearNoSpeechTimer();
          if (containsNonEnglishScript(transcript)) {
            setStoredValue("tutorly_voice_language", "en-US");
            recognition.lang = "en-US";
            showToast("Voice input is now set to English. Please try again.");
            return;
          }
          if (activeSpeechButton === voiceBtn && liveSessionMode) {
            submitLiveTranscript(transcript).catch(() => {
              liveSessionMode = null;
              setLiveButtonState("idle");
              showToast("Live mode could not send that message. Please try again.");
            });
          } else {
            appendToInput(transcript);
          }
        }
      });

      async function startSpeechRecognition(button) {
        if (isListening) {
          stopSpeechRecognition();
          return;
        }

        activeSpeechButton = button;
        speechDetected = false;
        transcriptReceived = false;
        try {
          recognition.lang = getVoiceLanguage();
          await startMicrophoneMeter();
          recognition.start();
        } catch (error) {
          setVoiceListening(false);
          activeSpeechButton = null;
          stopMicrophoneMeter();
          const message = error.message === "Microphone meter unavailable"
            ? "Microphone access is not available in this browser."
            : "Microphone permission denied. Please allow mic access and try again.";
          showToast(message);
        }
      }

      speakLiveReply = (markdown) => {
        if (!liveSessionMode) {
          setLiveButtonState("idle");
          return;
        }

        const spokenText = getSpeakableText(markdown);
        if (!spokenText || !window.speechSynthesis) {
          setLiveButtonState("idle");
          return;
        }

        clearLiveRestartTimer();
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(spokenText);
        utterance.lang = getVoiceLanguage();
        utterance.rate = 1;
        utterance.pitch = 1;
        utterance.onstart = () => setLiveButtonState("speaking");
        utterance.onend = () => {
          setLiveButtonState("idle");
          if (liveSessionMode) {
            liveRestartTimer = window.setTimeout(() => startSpeechRecognition(voiceBtn), 420);
          }
        };
        utterance.onerror = () => {
          setLiveButtonState("idle");
          if (liveSessionMode) {
            liveRestartTimer = window.setTimeout(() => startSpeechRecognition(voiceBtn), 420);
          }
        };
        window.speechSynthesis.speak(utterance);
      };

      beginLiveMode = (mode = "voice") => {
        liveSessionMode = mode === "vision" ? "vision" : "voice";
        clearLiveRestartTimer();
        if (window.speechSynthesis?.speaking) {
          window.speechSynthesis.cancel();
        }
        if (liveSessionMode === "vision") {
          setSelectedModel("lens", { announce: true });
          openCamera();
          showToast("Vision Live is ready. Point the camera and speak your question.");
        } else {
          showToast("Tutorly Live is listening. Speak your doubt naturally.");
        }
        startSpeechRecognition(voiceBtn);
      };

      if (speechTextBtn) {
        speechTextBtn.addEventListener("click", () => startSpeechRecognition(speechTextBtn));
      }

      if (voiceBtn) {
        voiceBtn.addEventListener("click", () => {
          if (isListening && activeSpeechButton === voiceBtn) {
            liveSessionMode = null;
            stopSpeechRecognition();
            setLiveButtonState("idle");
            return;
          }

          if (liveSessionMode && window.speechSynthesis?.speaking) {
            window.speechSynthesis.cancel();
            setLiveButtonState("listening");
            startSpeechRecognition(voiceBtn);
            return;
          }

          openLiveActionSheet();
        });
      }
    } else {
      speechButtons.forEach((button) => {
        button.title = "Speech recognition is not supported in this browser";
        button.addEventListener("click", () => {
          showToast("Speech recognition is not supported in this browser.");
        });
      });
    }
  }

  if (sidebarToggle && sidebar && chatShell) {
    sidebarToggle.addEventListener("click", () => {
      if (isMobileLayout()) {
        toggleMobileSidebar();
        return;
      }

      sidebar.classList.toggle("collapsed");
      chatShell.classList.toggle("sidebar-collapsed");
    });
  }

  if (mobileMenu) {
    mobileMenu.addEventListener("click", () => toggleMobileSidebar());
  }

  if (chatNotificationBtn) {
    chatNotificationBtn.addEventListener("click", () => {
      showToast("No notifications right now.");
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSettingsPanel();
      closeModelMenu();
      closeMobileSidebar();
      closeCamera();
      const modal = document.getElementById("imageModal");
      if (modal) {
        modal.classList.remove("show");
        modal.setAttribute("aria-hidden", "true");
      }
    }
  });

  document.addEventListener("click", (event) => {
    if (modelSelector && !modelSelector.contains(event.target)) {
      closeModelMenu();
    }

    if (!body.classList.contains("sidebar-drawer-open")) return;
    if (sidebar && sidebar.contains(event.target)) return;
    if (mobileMenu && mobileMenu.contains(event.target)) return;
    closeMobileSidebar();
  });

  window.addEventListener("resize", () => {
    updateImageDeviceMode();
    if (!isMobileLayout()) {
      closeMobileSidebar();
    }
  });

  updateImageDeviceMode();
  updateModelSelectorUi();

  if (isWelcomeTrial) {
    updateWelcomeTrialStatus();
    if (getWelcomeTrialCount() >= WELCOME_TRIAL_LIMIT) {
      window.setTimeout(showWelcomeTrialLimit, 250);
    }
  }

  try {
    const pendingDoubt = localStorage.getItem("tutorly_pending_doubt");
    const pendingDoubtFile = localStorage.getItem("tutorly_pending_doubt_file");
    if (pendingDoubt) {
      input.value = pendingDoubtFile ? `${pendingDoubt}\n\nAttached image: ${pendingDoubtFile}` : pendingDoubt;
      localStorage.removeItem("tutorly_pending_doubt");
      localStorage.removeItem("tutorly_pending_doubt_file");
      window.setTimeout(() => {
        resizeInput();
        updateSendState();
        input.focus();
        showToast("Your doubt is ready. Edit it or send it.");
      }, 80);
    }
  } catch (error) {
    // Local storage can be unavailable in strict browser modes; the chat still works normally.
  }

  resizeInput();
  updateSendState();
  setChatMode(false);
});
