(function () {
  const globalName = "TutorlyChatbot";
  const existing = window[globalName];
  if (existing && existing.version) return;

  const listeners = new Map();
  const modules = new Map();
  const memoryCache = new Map();

  function now() {
    return Date.now();
  }

  function uid(prefix = "id") {
    const random = Math.random().toString(36).slice(2, 10);
    return `${prefix}_${now().toString(36)}_${random}`;
  }

  function safeParse(value, fallback) {
    if (!value) return fallback;
    try {
      const parsed = JSON.parse(value);
      return parsed == null ? fallback : parsed;
    } catch (error) {
      return fallback;
    }
  }

  function safeStringify(value) {
    try {
      return JSON.stringify(value);
    } catch (error) {
      return "";
    }
  }

  function canUseStorage() {
    try {
      const key = "__tutorly_chatbot_storage_test__";
      localStorage.setItem(key, "1");
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      return false;
    }
  }

  const storageAvailable = canUseStorage();

  const storage = {
    get(key, fallback = null) {
      if (!storageAvailable) return memoryCache.has(key) ? memoryCache.get(key) : fallback;
      try {
        return safeParse(localStorage.getItem(key), fallback);
      } catch (error) {
        return fallback;
      }
    },
    set(key, value) {
      if (!storageAvailable) {
        memoryCache.set(key, value);
        return true;
      }
      try {
        localStorage.setItem(key, safeStringify(value));
        return true;
      } catch (error) {
        return false;
      }
    },
    getText(key, fallback = "") {
      if (!storageAvailable) return memoryCache.has(key) ? String(memoryCache.get(key) || "") : fallback;
      try {
        const value = localStorage.getItem(key);
        return value == null ? fallback : value;
      } catch (error) {
        return fallback;
      }
    },
    setText(key, value) {
      if (!storageAvailable) {
        memoryCache.set(key, String(value || ""));
        return true;
      }
      try {
        localStorage.setItem(key, String(value || ""));
        return true;
      } catch (error) {
        return false;
      }
    },
    remove(key) {
      if (!storageAvailable) {
        memoryCache.delete(key);
        return true;
      }
      try {
        localStorage.removeItem(key);
        return true;
      } catch (error) {
        return false;
      }
    }
  };

  function sanitizeText(value) {
    return String(value || "")
      .replace(/\u0000/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeForSearch(value) {
    return sanitizeText(value)
      .toLowerCase()
      .replace(/[^a-z0-9#+=/%*().,\s-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function truncate(value, limit = 120) {
    const text = sanitizeText(value);
    if (text.length <= limit) return text;
    return `${text.slice(0, Math.max(0, limit - 1)).trim()}...`;
  }

  function wordCount(value) {
    const text = sanitizeText(value);
    return text ? text.split(/\s+/).length : 0;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function unique(values) {
    return Array.from(new Set((values || []).filter(Boolean)));
  }

  function debounce(fn, wait = 160) {
    let timer = null;
    return function debounced(...args) {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function on(eventName, handler) {
    if (!listeners.has(eventName)) listeners.set(eventName, new Set());
    listeners.get(eventName).add(handler);
    return () => off(eventName, handler);
  }

  function off(eventName, handler) {
    const set = listeners.get(eventName);
    if (!set) return;
    set.delete(handler);
    if (!set.size) listeners.delete(eventName);
  }

  function emit(eventName, payload) {
    const set = listeners.get(eventName);
    if (!set) return;
    set.forEach((handler) => {
      try {
        handler(payload);
      } catch (error) {
        window.setTimeout(() => {
          throw error;
        }, 0);
      }
    });
  }

  async function copyText(text) {
    const value = String(text || "");
    if (!value) return false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch (error) {
        // Fall through to the textarea fallback.
      }
    }

    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    area.style.top = "-9999px";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (error) {
      ok = false;
    }
    area.remove();
    return ok;
  }

  function registerModule(name, api) {
    if (!name || !api) return api;
    modules.set(name, api);
    const root = window[globalName];
    if (root) root[name] = api;
    emit("module:registered", { name, api });
    return api;
  }

  function getModule(name) {
    return modules.get(name) || null;
  }

  window[globalName] = {
    version: "0.1.0",
    now,
    uid,
    storage,
    safeParse,
    safeStringify,
    sanitizeText,
    normalizeForSearch,
    truncate,
    wordCount,
    clamp,
    unique,
    debounce,
    copyText,
    on,
    off,
    emit,
    registerModule,
    getModule
  };
})();
