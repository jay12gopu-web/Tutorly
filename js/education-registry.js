(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory;
  else root.TutorlyEducation = factory({
    fetch: root.fetch.bind(root),
    url: new URL("../data/education-registry.json", document.currentScript.src).href
  });
})(typeof window !== "undefined" ? window : globalThis, function createEducationRegistry(options) {
  "use strict";
  const config = options || {};
  let data = null;
  let pending = null;

  function normalize(value) {
    return String(value || "").normalize("NFKC").toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
  }

  function strings(entry) {
    return [entry.id, entry.name, entry.shortName, entry.state, entry.curriculumValue, ...(entry.aliases || [])]
      .filter(Boolean).map(normalize);
  }

  function prepare(value) {
    if (!value || !Array.isArray(value.boards) || !Array.isArray(value.subjects)) {
      throw new Error("Tutorly couldn't load education choices. Please retry.");
    }
    const seen = new Set();
    for (const entry of [...value.boards, ...value.subjects]) {
      if (!entry.id || !entry.name || seen.has(entry.id)) throw new Error("Invalid education registry.");
      seen.add(entry.id);
      Object.freeze(entry.aliases);
      if (entry.sourceUrls) Object.freeze(entry.sourceUrls);
      Object.freeze(entry);
    }
    Object.freeze(value.boards);
    Object.freeze(value.subjects);
    return Object.freeze(value);
  }

  async function load() {
    if (data) return data;
    if (!pending) pending = (async function () {
      if (config.data) return prepare(config.data);
      const response = await config.fetch(config.url || "data/education-registry.json", { credentials: "same-origin" });
      if (!response.ok) throw new Error("Tutorly couldn't load education choices. Please retry.");
      return prepare(await response.json());
    })().then(function (value) { data = value; return value; }).catch(function (error) {
      pending = null; // A failed request must not poison the Retry button.
      throw error;
    });
    return pending;
  }

  function search(entries, query) {
    const term = normalize(query);
    if (!term) return entries.slice();
    const words = term.split(" ");
    return entries.map(function (entry, index) {
      const values = strings(entry);
      const searchable = values.join(" ");
      const score = values.includes(term) ? 3 : values.some((value) => value.startsWith(term)) ? 2 : words.every((word) => searchable.includes(word)) ? 1 : 0;
      return { entry, index, score };
    }).filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map((result) => result.entry);
  }

  function requiredData() {
    if (!data) throw new Error("Load TutorlyEducation before using its choices.");
    return data;
  }

  function board(value) {
    const term = normalize(value);
    if (!term) return null;
    const boards = requiredData().boards;
    // Prefer explicit IDs/values before aliases such as a state's shared name.
    return boards.find((entry) => [entry.id, entry.curriculumValue].some((key) => normalize(key) === term)) ||
      boards.find((entry) => [entry.name, entry.shortName, ...entry.aliases].some((key) => normalize(key) === term)) || null;
  }

  return Object.freeze({
    load,
    searchBoards: (query) => search(requiredData().boards, query),
    searchSubjects: (query) => search(requiredData().subjects, query),
    board,
    normalize
  });
});
