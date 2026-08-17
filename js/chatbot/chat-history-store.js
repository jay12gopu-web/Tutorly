(function () {
  const core = window.TutorlyChatbot;
  if (!core || core.getModule("history")) return;

  const STORAGE_KEY = "tutorly_chatbot_history_v1";
  const MAX_CONVERSATIONS = 80;
  const MAX_MESSAGES_PER_CONVERSATION = 120;

  function defaultState() {
    return {
      version: 1,
      activeConversationId: null,
      conversations: [],
      folders: [
        { id: "folder_default", name: "All chats", color: "purple", createdAt: core.now(), system: true },
        { id: "folder_homework", name: "Homework", color: "blue", createdAt: core.now(), system: false },
        { id: "folder_revision", name: "Revision", color: "cyan", createdAt: core.now(), system: false }
      ],
      sharedChats: [],
      lastCompactedAt: null
    };
  }

  function readState() {
    const saved = core.storage.get(STORAGE_KEY, null);
    if (!saved || typeof saved !== "object") return defaultState();
    const state = { ...defaultState(), ...saved };
    state.conversations = Array.isArray(saved.conversations) ? saved.conversations : [];
    state.folders = Array.isArray(saved.folders) && saved.folders.length ? saved.folders : defaultState().folders;
    state.sharedChats = Array.isArray(saved.sharedChats) ? saved.sharedChats : [];
    return state;
  }

  function writeState(state) {
    const sorted = {
      ...state,
      conversations: state.conversations
        .slice()
        .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
        .slice(0, MAX_CONVERSATIONS)
    };
    core.storage.set(STORAGE_KEY, sorted);
    core.emit("history:changed", sorted);
    return sorted;
  }

  function getConversationTitle(seed) {
    const text = core.sanitizeText(seed);
    if (!text) return "New study chat";
    const withoutMarkdown = text.replace(/[#*_`>]/g, "");
    return core.truncate(withoutMarkdown, 52);
  }

  function createConversation(options = {}) {
    const state = readState();
    const id = options.id || core.uid("chat");
    const now = core.now();
    const conversation = {
      id,
      title: getConversationTitle(options.title || options.seed || "New study chat"),
      folderId: options.folderId || "folder_default",
      pinned: !!options.pinned,
      archived: !!options.archived,
      shared: false,
      createdAt: now,
      updatedAt: now,
      summary: "",
      summaryUpdatedAt: null,
      subjects: [],
      models: [],
      messageCount: 0,
      ratingScore: 0,
      messages: [],
      metadata: {
        source: options.source || "chatbot",
        entry: options.entry || "direct"
      }
    };
    state.conversations.unshift(conversation);
    state.activeConversationId = id;
    writeState(state);
    return conversation;
  }

  function getConversation(id) {
    const state = readState();
    return state.conversations.find((conversation) => conversation.id === id) || null;
  }

  function getActiveConversationId() {
    return readState().activeConversationId;
  }

  function setActiveConversation(id) {
    const state = readState();
    const exists = state.conversations.some((conversation) => conversation.id === id);
    state.activeConversationId = exists ? id : null;
    writeState(state);
    return state.activeConversationId;
  }

  function ensureConversation(seed, options = {}) {
    const state = readState();
    const active = state.conversations.find((conversation) => conversation.id === state.activeConversationId);
    if (active && !active.archived) return active;
    return createConversation({ ...options, seed });
  }

  function inferSubjectsFromMessages(messages) {
    const subjects = new Set();
    messages.forEach((message) => {
      if (message.subject && message.subject !== "general") subjects.add(message.subject);
      if (message.metadata && message.metadata.subject && message.metadata.subject !== "general") {
        subjects.add(message.metadata.subject);
      }
    });
    return Array.from(subjects).slice(0, 8);
  }

  function summarizeText(messages) {
    const userMessages = messages.filter((message) => message.role === "user").slice(-6);
    const assistantMessages = messages.filter((message) => message.role === "assistant").slice(-4);
    const topics = userMessages.map((message) => core.truncate(message.content, 42)).filter(Boolean);
    const outcomes = assistantMessages.map((message) => core.truncate(message.content, 54)).filter(Boolean);

    if (!topics.length && !outcomes.length) return "";
    return [
      topics.length ? `Student asked about: ${topics.join("; ")}.` : "",
      outcomes.length ? `Tutorly explained: ${outcomes.join("; ")}.` : ""
    ].filter(Boolean).join(" ");
  }

  function appendMessage(conversationId, message) {
    const state = readState();
    let conversation = state.conversations.find((item) => item.id === conversationId);
    if (!conversation) {
      conversation = createConversation({ seed: message.content || "New study chat" });
      conversationId = conversation.id;
      return appendMessage(conversationId, message);
    }

    const now = core.now();
    const record = {
      id: message.id || core.uid(message.role === "assistant" ? "asst" : "user"),
      role: message.role || "user",
      content: String(message.content || ""),
      renderedContent: message.renderedContent || "",
      model: message.model || "prime",
      subject: message.subject || "general",
      parentId: message.parentId || null,
      status: message.status || "complete",
      rating: message.rating || null,
      copied: 0,
      regeneratedFrom: message.regeneratedFrom || null,
      attachments: Array.isArray(message.attachments) ? message.attachments : [],
      citations: Array.isArray(message.citations) ? message.citations : [],
      tools: message.tools || null,
      createdAt: message.createdAt || now,
      updatedAt: now,
      metadata: message.metadata || {}
    };

    conversation.messages.push(record);
    conversation.messages = conversation.messages.slice(-MAX_MESSAGES_PER_CONVERSATION);
    conversation.updatedAt = now;
    conversation.messageCount = conversation.messages.length;
    conversation.subjects = inferSubjectsFromMessages(conversation.messages);
    conversation.models = core.unique(conversation.messages.map((item) => item.model)).slice(0, 10);

    if (conversation.title === "New study chat" && record.role === "user") {
      conversation.title = getConversationTitle(record.content);
    }

    const assistantRatings = conversation.messages
      .filter((item) => item.role === "assistant" && item.rating)
      .map((item) => item.rating === "up" ? 1 : -1);
    conversation.ratingScore = assistantRatings.reduce((sum, value) => sum + value, 0);
    conversation.summary = summarizeText(conversation.messages);
    conversation.summaryUpdatedAt = now;

    writeState(state);
    core.emit("history:message-added", { conversation, message: record });
    return record;
  }

  function updateMessage(conversationId, messageId, patch) {
    const state = readState();
    const conversation = state.conversations.find((item) => item.id === conversationId);
    if (!conversation) return null;
    const message = conversation.messages.find((item) => item.id === messageId);
    if (!message) return null;
    Object.assign(message, patch, { updatedAt: core.now() });
    conversation.updatedAt = core.now();
    conversation.summary = summarizeText(conversation.messages);
    conversation.summaryUpdatedAt = core.now();
    writeState(state);
    core.emit("history:message-updated", { conversation, message });
    return message;
  }

  function rateMessage(conversationId, messageId, rating) {
    const normalized = rating === "down" ? "down" : rating === "up" ? "up" : null;
    return updateMessage(conversationId, messageId, { rating: normalized });
  }

  function incrementCopied(conversationId, messageId) {
    const state = readState();
    const conversation = state.conversations.find((item) => item.id === conversationId);
    if (!conversation) return null;
    const message = conversation.messages.find((item) => item.id === messageId);
    if (!message) return null;
    message.copied = Number(message.copied || 0) + 1;
    message.updatedAt = core.now();
    writeState(state);
    return message;
  }

  function updateConversation(id, patch) {
    const state = readState();
    const conversation = state.conversations.find((item) => item.id === id);
    if (!conversation) return null;
    Object.assign(conversation, patch, { updatedAt: core.now() });
    writeState(state);
    core.emit("history:conversation-updated", conversation);
    return conversation;
  }

  function pinConversation(id, pinned = true) {
    return updateConversation(id, { pinned: !!pinned });
  }

  function archiveConversation(id, archived = true) {
    const updated = updateConversation(id, { archived: !!archived });
    const state = readState();
    if (state.activeConversationId === id && archived) {
      state.activeConversationId = null;
      writeState(state);
    }
    return updated;
  }

  function createFolder(name, options = {}) {
    const state = readState();
    const folder = {
      id: options.id || core.uid("folder"),
      name: core.truncate(name || "Study folder", 40),
      color: options.color || "purple",
      createdAt: core.now(),
      system: false
    };
    state.folders.push(folder);
    writeState(state);
    return folder;
  }

  function moveConversation(conversationId, folderId) {
    return updateConversation(conversationId, { folderId: folderId || "folder_default" });
  }

  function listConversations(options = {}) {
    const state = readState();
    const includeArchived = !!options.includeArchived;
    const folderId = options.folderId || "";
    const query = core.normalizeForSearch(options.query || "");

    return state.conversations
      .filter((conversation) => includeArchived || !conversation.archived)
      .filter((conversation) => !folderId || conversation.folderId === folderId)
      .filter((conversation) => {
        if (!query) return true;
        const haystack = core.normalizeForSearch([
          conversation.title,
          conversation.summary,
          conversation.subjects.join(" "),
          conversation.messages.slice(-8).map((message) => message.content).join(" ")
        ].join(" "));
        return haystack.includes(query);
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return Number(b.updatedAt || 0) - Number(a.updatedAt || 0);
      });
  }

  function searchMessages(query, options = {}) {
    const normalized = core.normalizeForSearch(query);
    if (!normalized) return [];
    const state = readState();
    const results = [];
    state.conversations.forEach((conversation) => {
      if (!options.includeArchived && conversation.archived) return;
      conversation.messages.forEach((message) => {
        const text = core.normalizeForSearch(message.content);
        if (!text.includes(normalized)) return;
        results.push({
          conversationId: conversation.id,
          conversationTitle: conversation.title,
          messageId: message.id,
          role: message.role,
          model: message.model,
          subject: message.subject,
          preview: core.truncate(message.content, 150),
          createdAt: message.createdAt
        });
      });
    });
    return results.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)).slice(0, options.limit || 30);
  }

  function createShare(conversationId) {
    const state = readState();
    const conversation = state.conversations.find((item) => item.id === conversationId);
    if (!conversation) return null;
    let share = state.sharedChats.find((item) => item.conversationId === conversationId);
    if (!share) {
      share = {
        id: core.uid("share"),
        conversationId,
        token: core.uid("mtshare").replace(/^mtshare_/, ""),
        createdAt: core.now(),
        revokedAt: null
      };
      state.sharedChats.push(share);
    } else {
      share.revokedAt = null;
    }
    conversation.shared = true;
    conversation.updatedAt = core.now();
    writeState(state);
    return share;
  }

  function revokeShare(conversationId) {
    const state = readState();
    const conversation = state.conversations.find((item) => item.id === conversationId);
    const share = state.sharedChats.find((item) => item.conversationId === conversationId && !item.revokedAt);
    if (share) share.revokedAt = core.now();
    if (conversation) {
      conversation.shared = false;
      conversation.updatedAt = core.now();
    }
    writeState(state);
    return share || null;
  }

  function getStats() {
    const state = readState();
    const conversations = state.conversations;
    const messages = conversations.flatMap((conversation) => conversation.messages || []);
    return {
      conversations: conversations.length,
      active: conversations.filter((item) => !item.archived).length,
      archived: conversations.filter((item) => item.archived).length,
      pinned: conversations.filter((item) => item.pinned).length,
      shared: conversations.filter((item) => item.shared).length,
      messages: messages.length,
      assistantMessages: messages.filter((item) => item.role === "assistant").length,
      userMessages: messages.filter((item) => item.role === "user").length
    };
  }

  function clearAll() {
    core.storage.remove(STORAGE_KEY);
    core.emit("history:changed", defaultState());
  }

  core.registerModule("history", {
    readState,
    writeState,
    createConversation,
    ensureConversation,
    getConversation,
    getActiveConversationId,
    setActiveConversation,
    appendMessage,
    updateMessage,
    rateMessage,
    incrementCopied,
    updateConversation,
    pinConversation,
    archiveConversation,
    createFolder,
    moveConversation,
    listConversations,
    searchMessages,
    createShare,
    revokeShare,
    summarizeText,
    getStats,
    clearAll
  });
})();
