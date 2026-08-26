(function (root) {
  "use strict";

  const ACADEMIC_YEAR = "2026-27";
  const MEDIUM = "English";
  const CONTEXT_KEY = "tutorly_curriculum_context";
  const CACHE_PREFIX = "tutorly_curriculum_catalog:";
  const UNAVAILABLE_MESSAGE = "This curriculum is still being added to Tutorly.";
  const memoryCache = new Map();

  const COLOR_TONES = ["blue", "green", "violet", "amber", "slate", "rose"];

  function normalizeGrade(value) {
    const match = String(value || "").match(/\d{1,2}/);
    return match ? match[0] : "";
  }

  function normalizeBoard(value) {
    const normalized = String(value || "").trim().toUpperCase();
    const aliases = {
      NCERT: "CBSE",
      "CBSE / NCERT": "CBSE",
      ICSE: "CISCE",
      ISC: "CISCE",
      "MAHARASHTRA STATE BOARD": "MAHARASHTRA",
      "KERALA STATE BOARD": "KERALA",
      "TELANGANA STATE BOARD": "TELANGANA",
      "TAMIL NADU STATE BOARD": "TAMIL_NADU"
    };
    return aliases[normalized] || normalized;
  }

  function localProfile() {
    return {
      board: normalizeBoard(localStorage.getItem("tutorly_board")),
      grade: normalizeGrade(localStorage.getItem("tutorly_grade")),
      school: String(localStorage.getItem("tutorly_school") || "").trim()
    };
  }

  async function currentProfile() {
    const local = localProfile();
    if (!root.TutorlyAuth?.getSessionToken?.()) return local;
    try {
      const payload = await root.TutorlyAuth.currentUser();
      const user = payload?.user || payload || {};
      const profile = {
        board: normalizeBoard(user.board || local.board),
        grade: normalizeGrade(user.grade || local.grade),
        school: String(user.school || local.school || "").trim()
      };
      if (profile.board) localStorage.setItem("tutorly_board", profile.board);
      if (profile.grade) localStorage.setItem("tutorly_grade", profile.grade);
      if (profile.school) localStorage.setItem("tutorly_school", profile.school);
      return profile;
    } catch (_error) {
      return local;
    }
  }

  function backendOrigin() {
    if (root.TutorlyAuth?.backendOrigin) return root.TutorlyAuth.backendOrigin();
    const configured = root.TUTORLY_BACKEND_ORIGIN || localStorage.getItem("tutorly_backend_origin") || "";
    if (configured) return String(configured).replace(/\/+$/, "");
    if (["127.0.0.1", "localhost"].includes(root.location.hostname)) return "http://127.0.0.1:8000";
    return "https://tutorly-api.onrender.com";
  }

  function cacheKey(profile, academicYear, medium) {
    return `${CACHE_PREFIX}${normalizeBoard(profile.board)}:${normalizeGrade(profile.grade)}:${academicYear}:${medium}`;
  }

  function readCached(key) {
    if (memoryCache.has(key)) return memoryCache.get(key);
    try {
      const cached = JSON.parse(sessionStorage.getItem(key) || "null");
      if (cached?.catalog && Date.now() - Number(cached.saved_at || 0) < 30 * 60 * 1000) {
        memoryCache.set(key, cached.catalog);
        return cached.catalog;
      }
    } catch (_error) { /* Ignore stale or malformed cache entries. */ }
    return null;
  }

  function writeCached(key, catalog) {
    memoryCache.set(key, catalog);
    try { sessionStorage.setItem(key, JSON.stringify({ saved_at: Date.now(), catalog })); }
    catch (_error) { /* Catalog remains usable in memory. */ }
  }

  async function load(options = {}) {
    const profile = options.profile || await currentProfile();
    const academicYear = options.academicYear || ACADEMIC_YEAR;
    const medium = options.medium || MEDIUM;
    if (!profile.board || !profile.grade) {
      return {
        available: false,
        board: profile.board || "",
        grade: profile.grade || "",
        academic_year: academicYear,
        medium,
        subjects: [],
        message: "Complete your Grade and Board in Profile to load your curriculum."
      };
    }

    const key = cacheKey(profile, academicYear, medium);
    if (!options.refresh) {
      const cached = readCached(key);
      if (cached) return cached;
    }

    const query = new URLSearchParams({
      board: normalizeBoard(profile.board),
      grade: normalizeGrade(profile.grade),
      academic_year: academicYear,
      medium
    });
    try {
      const response = await fetch(`${backendOrigin()}/api/curriculum/catalog?${query.toString()}`, {
        headers: { Accept: "application/json" }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || "Curriculum request failed");
      const catalog = {
        ...payload,
        subjects: Array.isArray(payload.subjects) ? payload.subjects : [],
        message: payload.message || (payload.available ? "" : UNAVAILABLE_MESSAGE)
      };
      writeCached(key, catalog);
      return catalog;
    } catch (_error) {
      return {
        available: false,
        board: profile.board,
        grade: profile.grade,
        academic_year: academicYear,
        medium,
        subjects: [],
        message: "Tutorly couldn't load the curriculum right now. Please try again."
      };
    }
  }

  function subjectModels(catalog) {
    return (catalog?.subjects || []).map((subject, subjectIndex) => ({
      id: subject.id,
      name: subject.name,
      icon: subject.name.split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase(),
      color: COLOR_TONES[subjectIndex % COLOR_TONES.length],
      sourceUrl: subject.source_url,
      books: subject.books || [],
      chapters: (subject.books || []).flatMap((book) => (book.chapters || []).map((chapter) => ({
        id: chapter.id,
        title: chapter.name,
        name: chapter.name,
        number: chapter.number,
        sortOrder: chapter.sort_order,
        bookId: book.id,
        bookTitle: book.title,
        partLabel: book.part_label || "",
        sourceUrl: chapter.source_url,
        verificationStatus: chapter.verification_status,
        topics: chapter.topics || [],
        diagrams: chapter.diagrams || [],
        concepts: (chapter.topics || []).map((topic) => topic.name),
        applications: [],
        minutes: 0,
        difficulty: "Curriculum chapter"
      })))
    }));
  }

  function setActiveContext(context) {
    const safe = {
      board: String(context?.board || localStorage.getItem("tutorly_board") || ""),
      grade: normalizeGrade(context?.grade || localStorage.getItem("tutorly_grade")),
      academic_year: String(context?.academic_year || ACADEMIC_YEAR),
      medium: String(context?.medium || MEDIUM),
      subject_id: String(context?.subject_id || ""),
      subject: String(context?.subject || ""),
      book_id: String(context?.book_id || ""),
      book: String(context?.book || ""),
      chapter_id: String(context?.chapter_id || ""),
      chapter: String(context?.chapter || ""),
      source_url: String(context?.source_url || "")
    };
    localStorage.setItem(CONTEXT_KEY, JSON.stringify(safe));
    return safe;
  }

  function getActiveContext() {
    try { return JSON.parse(localStorage.getItem(CONTEXT_KEY) || "null"); }
    catch (_error) { return null; }
  }

  function clearActiveContext() {
    localStorage.removeItem(CONTEXT_KEY);
  }

  root.TutorlyCurriculum = Object.freeze({
    ACADEMIC_YEAR,
    MEDIUM,
    UNAVAILABLE_MESSAGE,
    normalizeBoard,
    normalizeGrade,
    currentProfile,
    load,
    subjectModels,
    setActiveContext,
    getActiveContext,
    clearActiveContext
  });
})(window);
