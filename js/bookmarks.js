(function () {
  const STORAGE_KEY = "tutorly_bookmarks_v1";
  const FILTERS = ["all", "doubt", "note", "test", "tutor"];

  const sampleBookmarks = [
    {
      id: "bm-germination",
      title: "Germination concept explanation",
      type: "doubt",
      note: "Seed growth needs water, air, warmth, and the right conditions.",
      url: "maths_gpt.html",
      tags: ["science", "biology"],
      pinned: true,
      done: false,
      createdAt: Date.now() - 1000 * 60 * 60 * 20
    },
    {
      id: "bm-algebra",
      title: "Linear equations practice",
      type: "note",
      note: "Useful for solving equations like x + 5 = 10 and checking each step.",
      url: "tests.html",
      tags: ["maths", "algebra"],
      pinned: false,
      done: false,
      createdAt: Date.now() - 1000 * 60 * 60 * 48
    },
    {
      id: "bm-geography",
      title: "Country location revision",
      type: "test",
      note: "Review continents, oceans, borders, and map-based questions.",
      url: "tests.html",
      tags: ["geography"],
      pinned: false,
      done: true,
      createdAt: Date.now() - 1000 * 60 * 60 * 72
    },
    {
      id: "bm-online-tutor",
      title: "Online tutor search",
      type: "tutor",
      note: "Compare live 1-on-1 session options for maths and science.",
      url: "online_tutor.html",
      tags: ["tutor", "online"],
      pinned: false,
      done: false,
      createdAt: Date.now() - 1000 * 60 * 60 * 96
    }
  ];

  const state = {
    filter: "all",
    query: "",
    sort: "recent"
  };

  const els = {
    list: document.getElementById("bookmarkList"),
    empty: document.getElementById("bookmarkEmpty"),
    search: document.getElementById("bookmarkSearch"),
    sort: document.getElementById("bookmarkSort"),
    form: document.getElementById("bookmarkForm"),
    title: document.getElementById("bookmarkTitle"),
    type: document.getElementById("bookmarkType"),
    url: document.getElementById("bookmarkUrl"),
    note: document.getElementById("bookmarkNote"),
    tags: document.getElementById("bookmarkTags"),
    total: document.getElementById("bookmarkTotal"),
    pinned: document.getElementById("bookmarkPinned"),
    completed: document.getElementById("bookmarkCompleted"),
    activeType: document.getElementById("bookmarkActiveType"),
    clearDone: document.getElementById("clearDoneBtn"),
    toast: document.getElementById("bookmarkToast")
  };

  function readBookmarks() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (Array.isArray(saved)) return saved;
    } catch (error) {
      // If stored data is broken, fall back to a clean starter list.
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleBookmarks));
    return sampleBookmarks;
  }

  function writeBookmarks(bookmarks) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalizeUrl(url) {
    const trimmed = String(url || "").trim();
    if (!trimmed) return "home.html";
    if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed;
    if (/\.html(?:$|[?#])/i.test(trimmed)) return trimmed;
    return trimmed.replace(/^\/+/, "") || "home.html";
  }

  function iconFor(type) {
    const icons = {
      doubt: "?",
      note: "N",
      test: "T",
      tutor: "U"
    };
    return icons[type] || "B";
  }

  function labelFor(type) {
    const labels = {
      doubt: "AI Doubt",
      note: "Study Note",
      test: "Test",
      tutor: "Tutor"
    };
    return labels[type] || "Bookmark";
  }

  function formatDate(timestamp) {
    try {
      return new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short"
      }).format(new Date(timestamp));
    } catch (error) {
      return "Saved";
    }
  }

  function toast(message) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.classList.add("show");
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => els.toast.classList.remove("show"), 2100);
  }

  function filteredBookmarks() {
    const query = state.query.toLowerCase();
    let items = readBookmarks().filter((item) => {
      const typeMatch = state.filter === "all" || item.type === state.filter;
      const searchable = [item.title, item.note, item.type, ...(item.tags || [])].join(" ").toLowerCase();
      return typeMatch && (!query || searchable.includes(query));
    });

    items.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (state.sort === "oldest") return a.createdAt - b.createdAt;
      if (state.sort === "title") return a.title.localeCompare(b.title);
      return b.createdAt - a.createdAt;
    });

    return items;
  }

  function renderStats(allBookmarks) {
    const activeItems = state.filter === "all"
      ? allBookmarks
      : allBookmarks.filter((item) => item.type === state.filter);
    if (els.total) els.total.textContent = allBookmarks.length;
    if (els.pinned) els.pinned.textContent = allBookmarks.filter((item) => item.pinned).length;
    if (els.completed) els.completed.textContent = allBookmarks.filter((item) => item.done).length;
    if (els.activeType) els.activeType.textContent = activeItems.length;
  }

  function render() {
    const allBookmarks = readBookmarks();
    const items = filteredBookmarks();
    renderStats(allBookmarks);

    document.querySelectorAll("[data-bookmark-filter]").forEach((button) => {
      button.classList.toggle("active", button.dataset.bookmarkFilter === state.filter);
    });

    if (!els.list) return;
    if (!items.length) {
      els.list.innerHTML = "";
      if (els.empty) els.empty.hidden = false;
      return;
    }

    if (els.empty) els.empty.hidden = true;
    els.list.innerHTML = items.map((item) => `
      <article class="bookmark-card ${item.pinned ? "pinned" : ""} ${item.done ? "done" : ""}" data-id="${escapeHtml(item.id)}">
        <div class="bookmark-type-icon">${escapeHtml(iconFor(item.type))}</div>
        <div class="bookmark-main">
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.note || "No notes added yet.")}</p>
          <div class="bookmark-meta">
            <span class="bookmark-tag">${escapeHtml(labelFor(item.type))}</span>
            <span class="bookmark-tag gold">${escapeHtml(formatDate(item.createdAt))}</span>
            ${(item.tags || []).slice(0, 4).map((tag) => `<span class="bookmark-tag">#${escapeHtml(tag)}</span>`).join("")}
            ${item.done ? '<span class="bookmark-tag">Done</span>' : ""}
          </div>
          <div class="bookmark-actions">
            <button class="bookmark-icon-btn" type="button" data-action="open">Open</button>
            <button class="bookmark-icon-btn" type="button" data-action="pin">${item.pinned ? "Unpin" : "Pin"}</button>
            <button class="bookmark-icon-btn" type="button" data-action="done">${item.done ? "Undo Done" : "Mark Done"}</button>
            <button class="bookmark-icon-btn" type="button" data-action="delete">Delete</button>
          </div>
        </div>
      </article>
    `).join("");
  }

  function updateBookmark(id, updater) {
    const bookmarks = readBookmarks();
    const next = bookmarks.map((item) => item.id === id ? updater(item) : item);
    writeBookmarks(next);
    render();
  }

  function deleteBookmark(id) {
    const next = readBookmarks().filter((item) => item.id !== id);
    writeBookmarks(next);
    render();
  }

  document.querySelectorAll("[data-bookmark-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextFilter = button.dataset.bookmarkFilter;
      state.filter = FILTERS.includes(nextFilter) ? nextFilter : "all";
      render();
    });
  });

  els.search?.addEventListener("input", () => {
    state.query = els.search.value.trim();
    render();
  });

  els.sort?.addEventListener("change", () => {
    state.sort = els.sort.value;
    render();
  });

  els.list?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    const card = event.target.closest(".bookmark-card");
    if (!button || !card) return;

    const id = card.dataset.id;
    const action = button.dataset.action;
    const bookmarks = readBookmarks();
    const item = bookmarks.find((entry) => entry.id === id);
    if (!item) return;

    if (action === "open") {
      window.location.href = normalizeUrl(item.url);
      return;
    }
    if (action === "pin") {
      updateBookmark(id, (entry) => ({ ...entry, pinned: !entry.pinned }));
      toast(item.pinned ? "Bookmark unpinned." : "Bookmark pinned.");
      return;
    }
    if (action === "done") {
      updateBookmark(id, (entry) => ({ ...entry, done: !entry.done }));
      toast(item.done ? "Marked as active again." : "Marked as done.");
      return;
    }
    if (action === "delete") {
      deleteBookmark(id);
      toast("Bookmark deleted.");
    }
  });

  els.form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = els.title.value.trim();
    if (!title) {
      toast("Add a title first.");
      els.title.focus();
      return;
    }

    const bookmark = {
      id: `bm-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title,
      type: els.type.value || "note",
      note: els.note.value.trim(),
      url: normalizeUrl(els.url.value),
      tags: els.tags.value.split(",").map((tag) => tag.trim()).filter(Boolean),
      pinned: false,
      done: false,
      createdAt: Date.now()
    };

    writeBookmarks([bookmark, ...readBookmarks()]);
    els.form.reset();
    state.filter = "all";
    render();
    toast("Bookmark saved.");
  });

  els.clearDone?.addEventListener("click", () => {
    const current = readBookmarks();
    const next = current.filter((item) => !item.done);
    writeBookmarks(next);
    render();
    toast(`${current.length - next.length} completed bookmark(s) cleared.`);
  });

  render();
})();
