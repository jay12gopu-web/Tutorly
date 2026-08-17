(function () {
  const core = window.TutorlyChatbot;
  if (!core || core.getModule("memory")) return;

  const STORAGE_KEY = "tutorly_chatbot_memory_v1";
  const MAX_FACTS = 80;
  const MAX_SUMMARIES = 40;

  const SUBJECT_WORDS = {
    math: ["math", "maths", "algebra", "equation", "percentage", "geometry", "calculus", "fraction"],
    science: ["science", "biology", "physics", "chemistry", "germination", "photosynthesis", "atom", "force"],
    english: ["english", "grammar", "essay", "letter", "poem", "summary", "rewrite", "meaning"],
    history: ["history", "war", "empire", "king", "independence", "civilization", "revolution"],
    geography: ["geography", "country", "continent", "ocean", "river", "climate", "location", "map"]
  };

  function defaultMemory() {
    return {
      version: 1,
      learner: {
        name: "",
        grade: "",
        preferredTone: "",
        preferredDifficulty: "balanced",
        strongSubjects: [],
        weakSubjects: []
      },
      facts: [],
      summaries: [],
      topicCounts: {},
      updatedAt: null
    };
  }

  function readMemory() {
    const saved = core.storage.get(STORAGE_KEY, null);
    if (!saved || typeof saved !== "object") return defaultMemory();
    const memory = { ...defaultMemory(), ...saved };
    memory.learner = { ...defaultMemory().learner, ...(saved.learner || {}) };
    memory.facts = Array.isArray(saved.facts) ? saved.facts : [];
    memory.summaries = Array.isArray(saved.summaries) ? saved.summaries : [];
    memory.topicCounts = saved.topicCounts && typeof saved.topicCounts === "object" ? saved.topicCounts : {};
    return memory;
  }

  function writeMemory(memory) {
    const compacted = {
      ...memory,
      facts: (memory.facts || []).slice(-MAX_FACTS),
      summaries: (memory.summaries || []).slice(-MAX_SUMMARIES),
      updatedAt: core.now()
    };
    core.storage.set(STORAGE_KEY, compacted);
    core.emit("memory:changed", compacted);
    return compacted;
  }

  function detectSubject(text, fallback = "general") {
    const value = core.normalizeForSearch(text);
    let best = { subject: fallback, score: 0 };
    Object.entries(SUBJECT_WORDS).forEach(([subject, words]) => {
      const score = words.reduce((sum, word) => sum + (value.includes(word) ? 1 : 0), 0);
      if (score > best.score) best = { subject, score };
    });
    return best.score ? best.subject : fallback;
  }

  function extractLearnerFacts(text) {
    const value = String(text || "");
    const facts = [];
    const grade = value.match(/\b(?:class|grade)\s*(\d{1,2})\b/i);
    const name = value.match(/\bmy name is\s+([a-z][a-z\s]{1,30})/i);
    const weak = value.match(/\b(?:i am weak in|i struggle with|hard for me is)\s+([a-z\s]{3,40})/i);
    const strong = value.match(/\b(?:i am good at|i like|my favorite subject is)\s+([a-z\s]{3,40})/i);

    if (grade) facts.push({ type: "grade", value: grade[1], confidence: 0.82 });
    if (name) facts.push({ type: "name", value: core.truncate(name[1].trim(), 30), confidence: 0.76 });
    if (weak) facts.push({ type: "weakSubject", value: detectSubject(weak[1], core.truncate(weak[1], 24)), confidence: 0.68 });
    if (strong) facts.push({ type: "strongSubject", value: detectSubject(strong[1], core.truncate(strong[1], 24)), confidence: 0.62 });
    return facts;
  }

  function upsertFact(memory, fact, sourceMessageId) {
    const existing = memory.facts.find((item) => item.type === fact.type && item.value === fact.value);
    if (existing) {
      existing.count = Number(existing.count || 1) + 1;
      existing.confidence = Math.max(Number(existing.confidence || 0), fact.confidence || 0.5);
      existing.updatedAt = core.now();
      return existing;
    }

    const record = {
      id: core.uid("fact"),
      type: fact.type,
      value: fact.value,
      confidence: fact.confidence || 0.5,
      sourceMessageId: sourceMessageId || null,
      count: 1,
      createdAt: core.now(),
      updatedAt: core.now()
    };
    memory.facts.push(record);
    return record;
  }

  function applyLearnerFact(memory, fact) {
    if (fact.type === "grade") memory.learner.grade = fact.value;
    if (fact.type === "name") memory.learner.name = fact.value;
    if (fact.type === "weakSubject") memory.learner.weakSubjects = core.unique(memory.learner.weakSubjects.concat(fact.value)).slice(0, 8);
    if (fact.type === "strongSubject") memory.learner.strongSubjects = core.unique(memory.learner.strongSubjects.concat(fact.value)).slice(0, 8);
  }

  function observeMessage(message, context = {}) {
    const memory = readMemory();
    const text = message.content || "";
    const subject = message.subject || detectSubject(text, context.subject || "general");

    if (message.role === "user") {
      memory.topicCounts[subject] = Number(memory.topicCounts[subject] || 0) + 1;
      extractLearnerFacts(text).forEach((fact) => {
        upsertFact(memory, fact, message.id);
        applyLearnerFact(memory, fact);
      });
    }

    if (message.role === "assistant" && text.length > 120) {
      memory.summaries.push({
        id: core.uid("sum"),
        conversationId: context.conversationId || null,
        messageId: message.id || null,
        subject,
        summary: core.truncate(text.replace(/[#*_`>]/g, ""), 220),
        createdAt: core.now()
      });
    }

    writeMemory(memory);
    return memory;
  }

  function buildContext(options = {}) {
    const memory = readMemory();
    const weakSubjects = memory.learner.weakSubjects.length ? memory.learner.weakSubjects.join(", ") : "none known";
    const strongSubjects = memory.learner.strongSubjects.length ? memory.learner.strongSubjects.join(", ") : "none known";
    const recentSummaries = memory.summaries.slice(-3).map((item) => item.summary);
    const topTopics = Object.entries(memory.topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic]) => topic);

    return {
      learner: { ...memory.learner },
      weakSubjects,
      strongSubjects,
      topTopics,
      recentSummaries,
      promptHints: [
        memory.learner.name ? `Learner name: ${memory.learner.name}` : "",
        memory.learner.grade ? `Grade/class: ${memory.learner.grade}` : "",
        `Weak subjects: ${weakSubjects}`,
        `Strong subjects: ${strongSubjects}`,
        topTopics.length ? `Frequently asked topics: ${topTopics.join(", ")}` : "",
        options.mode ? `Selected mode: ${options.mode}` : ""
      ].filter(Boolean)
    };
  }

  function summarizeConversation(conversation) {
    const messages = (conversation && conversation.messages) || [];
    const userTopics = messages
      .filter((message) => message.role === "user")
      .slice(-8)
      .map((message) => core.truncate(message.content, 50));
    const subjects = core.unique(messages.map((message) => message.subject).filter(Boolean));
    return {
      title: conversation ? conversation.title : "Study chat",
      subjects,
      summary: userTopics.length
        ? `Recent student focus: ${userTopics.join("; ")}.`
        : "No detailed chat summary yet.",
      messageCount: messages.length
    };
  }

  function searchMemory(query) {
    const normalized = core.normalizeForSearch(query);
    if (!normalized) return [];
    const memory = readMemory();
    const factHits = memory.facts
      .filter((fact) => core.normalizeForSearch(`${fact.type} ${fact.value}`).includes(normalized))
      .map((fact) => ({ type: "fact", preview: `${fact.type}: ${fact.value}`, createdAt: fact.updatedAt }));
    const summaryHits = memory.summaries
      .filter((summary) => core.normalizeForSearch(summary.summary).includes(normalized))
      .map((summary) => ({ type: "summary", preview: summary.summary, createdAt: summary.createdAt }));
    return factHits.concat(summaryHits).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)).slice(0, 20);
  }

  function clear() {
    core.storage.remove(STORAGE_KEY);
    core.emit("memory:changed", defaultMemory());
  }

  core.registerModule("memory", {
    readMemory,
    writeMemory,
    detectSubject,
    observeMessage,
    buildContext,
    summarizeConversation,
    searchMemory,
    clear
  });
})();
