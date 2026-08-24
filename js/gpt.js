(function () {
  const core = window.TutorlyChatbot;
  if (!core || window.TutorlyGPT) return;

  const modes = core.getModule("modes");
  const history = core.getModule("history");
  const memory = core.getModule("memory");
  const learningTools = core.getModule("learningTools");
  const adaptive = core.getModule("adaptive");

  const callbacks = {
    createPrimeReply: null,
    compactStudyNote: null,
    createLensReply: null,
    subjectFor: null
  };

  function configure(nextCallbacks = {}) {
    Object.assign(callbacks, nextCallbacks);
  }

  function normalizeModel(modelId) {
    return modes?.normalize?.(modelId) || (["spark", "prime", "lens"].includes(modelId) ? modelId : "prime");
  }

  function getModel(modelId) {
    return modes?.get?.(modelId) || {
      id: normalizeModel(modelId),
      name: "Prime",
      description: "Best for most students",
      loading: "Tutorly is thinking...",
      delayMultiplier: 1,
      stream: true
    };
  }

  function getAppModelConfigs() {
    return modes?.asAppConfigs?.() || {
      spark: {
        id: "spark",
        name: "Spark",
        icon: "S",
        description: "Fast homework help",
        loading: "Thinking fast..."
      },
      prime: {
        id: "prime",
        name: "Prime",
        icon: "*",
        description: "Best for most students",
        loading: "Tutorly is thinking..."
      },
      lens: {
        id: "lens",
        name: "Lens",
        icon: "O",
        description: "Solve from photos",
        loading: "Analyzing image..."
      }
    };
  }

  function getSubject(text, fallback = "general") {
    if (typeof callbacks.subjectFor === "function") return callbacks.subjectFor(text);
    return memory?.detectSubject?.(text, fallback) || fallback;
  }

  function createRequestPayload(message, options = {}) {
    const model = normalizeModel(options.model || options.selectedModel || "prime");
    const adaptiveContext = adaptive?.buildAdaptiveContext?.(message, {
      model,
      subject: options.subject || "",
      hasImage: !!options.hasImage,
      extractedText: options.extractedText || ""
    }) || null;
    return {
      message,
      model,
      mode: modes?.createPayloadMeta?.(model) || { id: model },
      responseDirectives: (modes?.getResponseDirectives?.(model) || []).concat(
        adaptiveContext ? adaptive.createTeachingDirectives(adaptiveContext) : []
      ),
      memoryContext: memory?.buildContext?.({ mode: model }) || null,
      adaptiveContext,
      hasImage: !!options.hasImage,
      imageSource: options.imageSource || null,
      imageDataUrl: options.imageDataUrl || "",
      extractedText: options.extractedText || ""
    };
  }

  function getResponseDelay(text, modelId, baseDelay, context = {}) {
    if (modes?.getDelay) return modes.getDelay(text, modelId, baseDelay, context);
    const model = normalizeModel(modelId);
    if (model === "spark") return Math.max(650, Math.round(baseDelay * 0.55));
    if (model === "lens") return context.hasImage ? Math.max(1800, Math.round(baseDelay * 0.75)) : Math.round(baseDelay * 0.9);
    return baseDelay;
  }

  function createPrimeReply(text) {
    if (typeof callbacks.createPrimeReply === "function") return callbacks.createPrimeReply(text);
    return [
      "# Tutorly Answer",
      "",
      "I can help with this, but the local tutor engine is still connecting.",
      "",
      "_Try giving me the exact question, topic, or a photo of the problem._"
    ].join("\n");
  }

  function createBaseReply(text, modelId, context = {}) {
    const model = normalizeModel(modelId);
    if (model === "spark") {
      const sparkMathReply = window.TutorlyMathRenderer?.createSparkMarkdown?.(text, { model, context });
      if (sparkMathReply) return sparkMathReply;
    }

    const primeReply = createPrimeReply(text);

    if (model === "spark") {
      return typeof callbacks.compactStudyNote === "function"
        ? callbacks.compactStudyNote(primeReply)
        : primeReply;
    }

    if (model === "lens") {
      return typeof callbacks.createLensReply === "function"
        ? callbacks.createLensReply(text, context)
        : primeReply;
    }

    const modeEnhancers = {
      deep: [
        "### Deeper connection",
        "",
        "_A strong answer should connect the definition, the reason behind it, and one example. That makes the concept easier to remember and easier to use in exams._",
        "",
        "### Check your understanding",
        "",
        "Try explaining the same idea in one sentence, then solve or describe one similar example."
      ],
      research: [
        "### Fact-check notes",
        "",
        "_Use this as a study explanation. For dates, statistics, current events, or exact standards, verify with your textbook or teacher-approved source._",
        "",
        "### Citation style",
        "",
        "- Class textbook or school notes",
        "- Teacher reference material",
        "- Reliable educational atlas or encyclopedia for geography/history facts"
      ],
      creative: [
        "### Creative memory hook",
        "",
        "_Turn the topic into a small story, comparison, or visual image. If you can picture it, you can usually remember it faster._"
      ],
      study: [
        "### Revision move",
        "",
        "After reading this, make one flashcard and one practice question from the answer.",
        "",
        "_Learning sticks better when you test yourself right after the explanation._"
      ]
    };

    if (!modeEnhancers[model]) return primeReply;
    return [primeReply, "", ...modeEnhancers[model]].join("\n");
  }

  function createReply({ message, modelId = "prime", subject = "", context = {} }) {
    const model = normalizeModel(modelId);
    const resolvedSubject = subject || getSubject(message);
    const adaptiveContext = context.adaptiveContext || adaptive?.buildAdaptiveContext?.(message, {
      model,
      subject: resolvedSubject,
      hasImage: !!context.hasImage,
      extractedText: context.extractedText || ""
    }) || null;
    const baseReply = createBaseReply(message, model, context);

    if (window.TutorlyResponseEngine?.createReply) {
      const reply = window.TutorlyResponseEngine.createReply({
        message,
        modelId: model,
        subject: resolvedSubject,
        context: {
          ...context,
          adaptiveContext
        },
        baseReply
      });
      return adaptive?.enhanceReply?.(reply, {
        message,
        model,
        subject: resolvedSubject,
        adaptiveContext
      }) || reply;
    }

    return adaptive?.enhanceReply?.(baseReply, {
      message,
      model,
      subject: resolvedSubject,
      adaptiveContext
    }) || baseReply;
  }

  function ensureConversation(seed, options = {}) {
    return history?.ensureConversation?.(seed, { ...options, source: "chatbot" }) || null;
  }

  function setActiveConversation(conversationId) {
    return history?.setActiveConversation?.(conversationId) || null;
  }

  function getActiveConversationId() {
    return history?.getActiveConversationId?.() || null;
  }

  function getConversation(conversationId) {
    return history?.getConversation?.(conversationId) || null;
  }

  function buildAttachmentMeta(imageToSend) {
    if (!imageToSend) return [];
    return [{
      id: core.uid("img"),
      type: "image",
      source: imageToSend.source || "upload",
      name: imageToSend.file?.name || "homework-image",
      mimeType: imageToSend.file?.type || "image/jpeg",
      previewUrl: imageToSend.previewUrl || "",
      extractedText: imageToSend.extractedText || ""
    }];
  }

  function observeMessage(messageRecord, conversationId, subject) {
    if (!messageRecord) return null;
    return memory?.observeMessage?.(messageRecord, { conversationId, subject }) || null;
  }

  function recordUserMessage({ conversationId, content, model, subject, imageToSend, metadata = {} }) {
    const record = history?.appendMessage?.(conversationId, {
      role: "user",
      content,
      model,
      subject,
      attachments: buildAttachmentMeta(imageToSend),
      metadata
    }) || null;
    observeMessage(record, conversationId, subject);
    return record;
  }

  function createStudyToolkit(subject, userMessage, assistantReply, model) {
    return learningTools?.generateToolkit?.({
      subject,
      userMessage,
      assistantReply,
      model
    }) || null;
  }

  function renderStudyToolkitHtml(toolkit) {
    return learningTools?.renderToolkitHtml?.(toolkit) || "";
  }

  function recordAssistantMessage({ conversationId, content, model, subject, parentId, toolkit, metadata = {} }) {
    const record = history?.appendMessage?.(conversationId, {
      role: "assistant",
      content,
      model,
      subject,
      parentId,
      tools: toolkit,
      metadata
    }) || null;
    observeMessage(record, conversationId, subject);
    adaptive?.recordInteraction?.({
      conversationId,
      messageId: record?.id || null,
      message: metadata.prompt || metadata.userMessage || "",
      reply: content,
      model,
      subject,
      analysis: metadata.adaptiveContext?.analysis || null,
      successScore: metadata.initialSuccessScore ?? 0.62
    });
    return record;
  }

  function updateMessage(conversationId, messageId, patch) {
    return history?.updateMessage?.(conversationId, messageId, patch) || null;
  }

  function rateMessage(conversationId, messageId, rating) {
    return history?.rateMessage?.(conversationId, messageId, rating) || null;
  }

  function incrementCopied(conversationId, messageId) {
    return history?.incrementCopied?.(conversationId, messageId) || null;
  }

  function listConversations(options = {}) {
    return history?.listConversations?.(options) || [];
  }

  function searchMessages(query, options = {}) {
    return history?.searchMessages?.(query, options) || [];
  }

  function getStats() {
    return history?.getStats?.() || {
      conversations: 0,
      active: 0,
      archived: 0,
      pinned: 0,
      shared: 0,
      messages: 0,
      assistantMessages: 0,
      userMessages: 0
    };
  }

  function pinConversation(conversationId, pinned) {
    return history?.pinConversation?.(conversationId, pinned) || null;
  }

  function archiveConversation(conversationId, archived) {
    return history?.archiveConversation?.(conversationId, archived) || null;
  }

  function deleteConversation(conversationId) {
    return history?.deleteConversation?.(conversationId) || null;
  }

  function clearMemory() {
    memory?.clear?.();
    core.storage.remove("tutorly_response_engine_memory_v1");
    core.storage.remove("tutorly_adaptive_intelligence_v1");
  }

  function getAdaptiveContext(message, options = {}) {
    return adaptive?.buildAdaptiveContext?.(message, options) || null;
  }

  function recordTeachingFeedback(payload = {}) {
    return adaptive?.recordFeedback?.(payload) || null;
  }

  function createFeedbackFollowup(feedbackType, payload = {}) {
    return adaptive?.createFeedbackFollowup?.(feedbackType, payload) || "";
  }

  function getAdaptiveStore() {
    return adaptive?.readStore?.() || null;
  }

  window.TutorlyGPT = {
    configure,
    normalizeModel,
    getModel,
    getAppModelConfigs,
    getSubject,
    createRequestPayload,
    getResponseDelay,
    createBaseReply,
    createReply,
    ensureConversation,
    setActiveConversation,
    getActiveConversationId,
    getConversation,
    buildAttachmentMeta,
    recordUserMessage,
    recordAssistantMessage,
    createStudyToolkit,
    renderStudyToolkitHtml,
    updateMessage,
    rateMessage,
    recordTeachingFeedback,
    createFeedbackFollowup,
    getAdaptiveContext,
    getAdaptiveStore,
    incrementCopied,
    listConversations,
    searchMessages,
    getStats,
    pinConversation,
    archiveConversation,
    deleteConversation,
    clearMemory
  };
})();
