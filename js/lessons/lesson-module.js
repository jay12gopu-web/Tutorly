(function () {
  const Data = window.TutorlyLessonsData;
  const PROGRESS_KEY = "tutorly_lesson_progress";
  const BOOKMARK_KEY = "tutorly_lesson_bookmarks";
  const OFFLINE_KEY = "tutorly_offline_lessons";
  const LAST_KEY = "tutorly_last_lesson";

  const state = {
    subjectId: "",
    chapterId: "",
    zoom: 1,
    theme: localStorage.getItem("tutorly_theme") || localStorage.getItem("tutorly_lessons_theme") || "light",
    searchTerm: "",
    quickRevision: false
  };

  const $ = (id) => document.getElementById(id);
  const readJson = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (_error) { return fallback; }
  };
  const writeJson = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));
  const lessonKey = (subjectId, chapterId) => `${subjectId}:${chapterId}`;
  const todayLabel = () => new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

  function init() {
    if (!Data) return;
    document.body.classList.toggle("lesson-dark", state.theme === "dark");
    bindEvents();
    renderSubjects();
    const params = new URLSearchParams(window.location.search);
    const subjectId = params.get("subject");
    const chapterId = params.get("chapter");
    if (subjectId && chapterId) {
      openChapter(subjectId, chapterId);
    } else if (subjectId) {
      openSubject(subjectId);
    } else {
      showView("home");
    }
  }

  function bindEvents() {
    $("backToSubjects").addEventListener("click", () => showView("home"));
    $("backToChapters").addEventListener("click", () => openSubject(state.subjectId));
    $("zoomInBtn").addEventListener("click", () => setZoom(state.zoom + 0.08));
    $("zoomOutBtn").addEventListener("click", () => setZoom(state.zoom - 0.08));
    $("fullscreenBtn").addEventListener("click", toggleFullscreen);
    $("themeBtn").addEventListener("click", toggleTheme);
    $("printBtn").addEventListener("click", () => window.print());
    $("pdfBtn").addEventListener("click", openPdfExport);
    $("quickModeBtn").addEventListener("click", () => {
      state.quickRevision = !state.quickRevision;
      renderLesson();
    });
    $("bookmarkBtn").addEventListener("click", toggleBookmark);
    $("offlineBtn").addEventListener("click", saveOffline);
    $("copyNotesBtn").addEventListener("click", copyNotes);
    $("lessonSearch").addEventListener("input", (event) => {
      state.searchTerm = event.target.value.trim();
      renderLesson();
    });
    window.addEventListener("scroll", saveScrollProgress, { passive: true });
  }

  function showView(view) {
    $("subjectsView").hidden = view !== "home";
    $("chaptersView").hidden = view !== "chapters";
    $("readerView").hidden = view !== "reader";
  }

  function getProgress() {
    return readJson(PROGRESS_KEY, {});
  }

  function getProgressFor(subjectId, chapterId) {
    return getProgress()[lessonKey(subjectId, chapterId)] || { percent: 0, lastOpened: "" };
  }

  function subjectProgress(subject) {
    if (!subject.chapters.length) return 0;
    const total = subject.chapters.reduce((sum, chapter) => sum + getProgressFor(subject.id, chapter.id).percent, 0);
    return Math.round(total / subject.chapters.length);
  }

  function lastStudied(subject) {
    const entries = subject.chapters
      .map((chapter) => ({ chapter, progress: getProgressFor(subject.id, chapter.id) }))
      .filter((entry) => entry.progress.lastOpened)
      .sort((a, b) => new Date(b.progress.lastOpened) - new Date(a.progress.lastOpened));
    return entries[0]?.chapter.title || "Not started";
  }

  function renderSubjects() {
    $("subjectGrid").innerHTML = Data.subjects.map((subject) => `
      <button class="subject-card tone-${subject.color}" type="button" data-subject="${subject.id}">
        <span class="subject-icon">${escapeHtml(subject.icon)}</span>
        <strong>${escapeHtml(subject.name)}</strong>
        <small>${subject.chapters.length} chapters</small>
        <div class="mini-progress"><span style="width:${subjectProgress(subject)}%"></span></div>
        <p>${subjectProgress(subject)}% complete</p>
        <em>Last studied: ${escapeHtml(lastStudied(subject))}</em>
      </button>
    `).join("");
    document.querySelectorAll("[data-subject]").forEach((button) => {
      button.addEventListener("click", () => openSubject(button.dataset.subject));
    });
  }

  function openSubject(subjectId) {
    state.subjectId = subjectId;
    const subject = Data.getSubject(subjectId);
    $("chapterSubjectName").textContent = subject.name;
    $("chapterSubjectMeta").textContent = `${subject.chapters.length} textbook chapters`;
    $("chapterGrid").innerHTML = subject.chapters.map((chapter) => {
      const progress = getProgressFor(subject.id, chapter.id);
      return `
        <button class="chapter-card" type="button" data-chapter="${chapter.id}">
          <span>${escapeHtml(chapter.difficulty)}</span>
          <strong>${escapeHtml(chapter.title)}</strong>
          <p>${escapeHtml(chapter.concepts.slice(0, 4).join(", "))}</p>
          <div class="chapter-stats">
            <b>${chapter.minutes} min</b>
            <b>${progress.percent || 0}% read</b>
          </div>
          <div class="mini-progress"><span style="width:${progress.percent || 0}%"></span></div>
          <em>Last opened: ${progress.lastOpened ? new Date(progress.lastOpened).toLocaleDateString() : "Never"}</em>
        </button>
      `;
    }).join("");
    document.querySelectorAll("[data-chapter]").forEach((button) => {
      button.addEventListener("click", () => openChapter(state.subjectId, button.dataset.chapter));
    });
    showView("chapters");
  }

  function openChapter(subjectId, chapterId) {
    state.subjectId = subjectId;
    state.chapterId = chapterId;
    state.searchTerm = "";
    $("lessonSearch").value = "";
    markOpened(subjectId, chapterId);
    renderLesson();
    showView("reader");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function markOpened(subjectId, chapterId) {
    const progress = getProgress();
    const key = lessonKey(subjectId, chapterId);
    progress[key] = {
      ...(progress[key] || {}),
      lastOpened: new Date().toISOString(),
      percent: Math.max(progress[key]?.percent || 0, 4)
    };
    writeJson(PROGRESS_KEY, progress);
    writeJson(LAST_KEY, { subjectId, chapterId, openedAt: new Date().toISOString() });
  }

  function callout(type, title, text) {
    return `<aside class="lesson-callout ${type}"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(text)}</p></aside>`;
  }

  function revisionBlock(type, title, text) {
    return `<article class="revision-block ${type}"><span>${escapeHtml(title)}</span><p>${escapeHtml(text)}</p></article>`;
  }

  function formulaFor(subjectId, chapter) {
    if (subjectId === "mathematics") return chapter.id === "trigonometry" ? "sin theta = opposite / hypotenuse, cos theta = adjacent / hypotenuse, tan theta = opposite / adjacent" : "Concept + definition + example = reliable revision";
    if (subjectId === "science") return "Observation -> Concept -> Explanation -> Application";
    if (subjectId === "computer-science") return "Input -> Process -> Decision -> Output";
    if (subjectId === "english") return "Idea -> Evidence -> Explanation -> Link";
    return "Cause -> Event -> Consequence -> Impact";
  }

  function diagram(subjectId, chapter) {
    if (subjectId === "mathematics") {
      return `
        <figure class="lesson-figure">
          <svg viewBox="0 0 620 320" role="img" aria-label="Coordinate plane and triangle diagram">
            <rect width="620" height="320" fill="#ffffff"></rect>
            <g stroke="#d7e1ef" stroke-width="1">${Array.from({ length: 12 }, (_, i) => `<path d="M${50 + i * 45} 25v250"></path>`).join("")}${Array.from({ length: 6 }, (_, i) => `<path d="M40 ${55 + i * 40}h540"></path>`).join("")}</g>
            <path d="M40 175h540M310 25v250" stroke="#334155" stroke-width="2"></path>
            <path d="M190 215L310 95L445 215Z" fill="#dbeafe" stroke="#1a73e8" stroke-width="4"></path>
            <circle cx="190" cy="215" r="6" fill="#1a73e8"></circle><circle cx="310" cy="95" r="6" fill="#1a73e8"></circle><circle cx="445" cy="215" r="6" fill="#1a73e8"></circle>
            <text x="178" y="238">A</text><text x="315" y="88">B</text><text x="452" y="238">C</text><text x="500" y="165">x-axis</text><text x="318" y="42">y-axis</text>
          </svg>
          <figcaption>A print-friendly mathematical figure for visualizing ${escapeHtml(chapter.title)} ideas.</figcaption>
        </figure>
      `;
    }
    if (subjectId === "science") {
      return `
        <figure class="lesson-figure">
          <svg viewBox="0 0 620 330" role="img" aria-label="Labeled science process diagram">
            <rect width="620" height="330" fill="#ffffff"></rect>
            <ellipse cx="300" cy="165" rx="205" ry="110" fill="#ecfdf5" stroke="#0f9d58" stroke-width="4"></ellipse>
            <circle cx="300" cy="165" r="48" fill="#bbf7d0" stroke="#15803d" stroke-width="3"></circle>
            <ellipse cx="405" cy="138" rx="34" ry="18" fill="#dcfce7" stroke="#16a34a" stroke-width="3"></ellipse>
            <ellipse cx="220" cy="205" rx="38" ry="20" fill="#dcfce7" stroke="#16a34a" stroke-width="3"></ellipse>
            <path d="M300 165L145 80M300 165L487 92M405 138L528 142M220 205L86 238" stroke="#334155" stroke-width="2"></path>
            <text x="82" y="76">Cell boundary</text><text x="490" y="88">Cytoplasm</text><text x="532" y="146">Organelle</text><text x="34" y="244">Storage</text><text x="282" y="170">Nucleus</text>
          </svg>
          <figcaption>A labeled science illustration showing parts and relationships clearly.</figcaption>
        </figure>
      `;
    }
    if (subjectId === "social-studies") {
      return `
        <figure class="lesson-figure">
          <svg viewBox="0 0 620 300" role="img" aria-label="Historical timeline">
            <rect width="620" height="300" fill="#ffffff"></rect>
            <path d="M70 150h480" stroke="#92400e" stroke-width="5" stroke-linecap="round"></path>
            ${[90, 210, 330, 450, 540].map((x, i) => `<circle cx="${x}" cy="150" r="13" fill="#f59e0b"></circle><path d="M${x} 150v${i % 2 ? 70 : -70}" stroke="#92400e" stroke-width="2"></path><text x="${x - 45}" y="${i % 2 ? 240 : 60}">Stage ${i + 1}</text>`).join("")}
            <text x="72" y="130">Start</text><text x="518" y="130">Impact</text>
          </svg>
          <figcaption>A timeline helps connect causes, events, and consequences in sequence.</figcaption>
        </figure>
      `;
    }
    if (subjectId === "computer-science") {
      return `
        <figure class="lesson-figure">
          <svg viewBox="0 0 620 330" role="img" aria-label="Algorithm flowchart">
            <rect width="620" height="330" fill="#ffffff"></rect>
            <rect x="235" y="24" width="150" height="48" rx="24" fill="#e0f2fe" stroke="#0369a1" stroke-width="3"></rect>
            <rect x="220" y="104" width="180" height="56" rx="10" fill="#f8fafc" stroke="#334155" stroke-width="3"></rect>
            <path d="M310 192l82 48-82 48-82-48z" fill="#eef2ff" stroke="#4f46e5" stroke-width="3"></path>
            <rect x="440" y="216" width="130" height="48" rx="10" fill="#dcfce7" stroke="#15803d" stroke-width="3"></rect>
            <rect x="50" y="216" width="130" height="48" rx="10" fill="#fee2e2" stroke="#b91c1c" stroke-width="3"></rect>
            <path d="M310 72v32M310 160v32M392 240h48M228 240h-48" stroke="#334155" stroke-width="3" marker-end="url(#arrow)"></path>
            <defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#334155"></path></marker></defs>
            <text x="286" y="54">Start</text><text x="256" y="138">Process</text><text x="279" y="245">Decision</text><text x="480" y="246">Yes</text><text x="94" y="246">No</text>
          </svg>
          <figcaption>Flowcharts convert a process into readable steps and decisions.</figcaption>
        </figure>
      `;
    }
    return `
      <figure class="lesson-figure">
        <svg viewBox="0 0 620 320" role="img" aria-label="Story structure diagram">
          <rect width="620" height="320" fill="#ffffff"></rect>
          <path d="M80 250C150 120 230 95 310 160s160 70 230-80" fill="none" stroke="#7e57c2" stroke-width="5"></path>
          <g fill="#ede9fe" stroke="#7e57c2" stroke-width="3">
            <circle cx="95" cy="240" r="28"></circle><circle cx="220" cy="122" r="28"></circle><circle cx="330" cy="172" r="28"></circle><circle cx="455" cy="160" r="28"></circle><circle cx="540" cy="84" r="28"></circle>
          </g>
          <text x="58" y="292">Setting</text><text x="176" y="82">Conflict</text><text x="300" y="222">Climax</text><text x="422" y="212">Change</text><text x="504" y="42">Resolution</text>
        </svg>
        <figcaption>A story map shows how ideas move from situation to resolution.</figcaption>
      </figure>
    `;
  }

  function contentsHtml() {
    const items = [
      ["intro", "Introduction"],
      ["key-concepts", "Key Concepts"],
      ["formulae", "Formulae"],
      ["visuals", "Visuals"],
      ["examples", "Examples"],
      ["summary", "Summary"]
    ];
    return items.map(([id, label]) => `<a href="#${id}">${label}</a>`).join("");
  }

  function quickRevisionHtml(subject, chapter) {
    const concepts = chapter.concepts;
    return `
      <article class="textbook-document quick-document" id="lessonDocument">
        <header class="lesson-cover">
          <span>${escapeHtml(subject.name)}</span>
          <h1>${escapeHtml(chapter.title)}</h1>
          <p>Grade ${escapeHtml(localStorage.getItem("tutorly_grade") || "9")} | 5 Minute Revision | Updated ${todayLabel()}</p>
        </header>
        <section id="intro">
          <h2>Quick Revision Snapshot</h2>
          <p>This mode keeps only the fastest-revision material: key concepts, formulae, diagrams, exam insights, and the final summary.</p>
        </section>
        <section id="key-concepts" class="revision-grid">
          ${concepts.map((concept) => revisionBlock("key", "Key Concept", `${titleCase(concept)} is essential for understanding ${chapter.title}. Learn the meaning, one example, and one use.`)).join("")}
        </section>
        <section id="formulae">
          <h2>Formula Box and Memory Cards</h2>
          <div class="formula-card">${escapeHtml(formulaFor(subject.id, chapter))}</div>
          ${revisionBlock("remember", "Remember", `Connect every formula or rule to ${chapter.applications[0]} so it stays meaningful.`)}
        </section>
        <section id="visuals">
          <h2>Important Diagram</h2>
          ${diagram(subject.id, chapter)}
          ${diagram(subject.id, chapter)}
        </section>
        <section id="examples">
          <h2>Exam Insight</h2>
          ${revisionBlock("insight", "Exam Insight", `The most tested part of ${chapter.title} is usually the link between definition and application.`)}
          ${revisionBlock("mistake", "Common Mistake", `Do not write memorized lines without explaining the concept in the situation.`)}
        </section>
        <section id="summary">
          <h2>5-Minute Summary</h2>
          <ul>${concepts.slice(0, 5).map((concept) => `<li><mark>${escapeHtml(titleCase(concept))}</mark> - revise meaning, example, and use.</li>`).join("")}</ul>
        </section>
      </article>
    `;
  }

  function lessonHtml(subject, chapter) {
    const concepts = chapter.concepts;
    return `
      <article class="textbook-document" id="lessonDocument">
        <header class="lesson-cover">
          <span>${escapeHtml(subject.name)}</span>
          <h1>${escapeHtml(chapter.title)}</h1>
          <p>Grade ${escapeHtml(localStorage.getItem("tutorly_grade") || "9")} | ${chapter.minutes} Minute Revision | Updated ${todayLabel()}</p>
        </header>

        <section id="intro">
          <h2>Introduction</h2>
          <p>${escapeHtml(chapter.title)} introduces a set of connected ideas that help students understand ${escapeHtml(concepts.slice(0, 3).join(", "))}. The chapter is important because these ideas appear repeatedly in classroom explanations, homework, and real situations where careful reasoning is needed.</p>
          <p>In daily life, this chapter connects with ${escapeHtml(chapter.applications.join(", "))}. A strong understanding here makes later chapters easier because you can recognize patterns, explain relationships, and choose the right method with confidence.</p>
          <div class="revision-grid">
            ${revisionBlock("key", "Key Concept", `${titleCase(concepts[0])} is the anchor idea for this chapter.`)}
            ${revisionBlock("tip", "Quick Tip", `Read headings first, then use the diagram and table to revise ${chapter.title} quickly.`)}
          </div>
        </section>

        <section>
          <h2>Learning Objectives</h2>
          <p>By the end of this chapter you will understand:</p>
          <ul>${concepts.map((concept) => `<li>${escapeHtml(concept)}</li>`).join("")}</ul>
        </section>

        <section id="visuals">
          <h2>Visual Learning</h2>
          ${diagram(subject.id, chapter)}
        </section>

        <section id="key-concepts">
          <h2>Key Concepts</h2>
          ${concepts.map((concept, index) => `
            <section class="lesson-section">
              <h3>${index + 1}. ${escapeHtml(titleCase(concept))}</h3>
              <h4>Meaning and explanation</h4>
              <p>${escapeHtml(titleCase(concept))} is one of the central building blocks of ${escapeHtml(chapter.title)}. It gives the chapter a precise language, so instead of memorizing isolated facts, you can describe what is happening and why it happens.</p>
              <p>When studying ${escapeHtml(concept)}, first identify the important terms, then notice how they connect with the examples in the textbook. A concept becomes useful only when you can apply it to a new situation and explain your reasoning in your own words.</p>
              <div class="definition-box"><strong>Definition</strong><p>${escapeHtml(titleCase(concept))} refers to the idea in this chapter that helps organize observations, rules, and examples into a clear method of thinking.</p></div>
              ${revisionBlock("key", "Key Concept", `${titleCase(concept)} should be revised with one definition and one real example.`)}
              ${index === 0 ? callout("important", "Important", `Start this chapter by making ${concept} clear. It supports most of the later ideas in ${chapter.title}.`) : ""}
              ${index === 1 ? callout("tip", "Tip", `Create a one-line note for ${concept} and attach one example beside it. This makes revision much faster.`) : ""}
              ${index === 2 ? callout("remember", "Remember", `Do not learn ${concept} as a loose word. Always connect it to the situation where it is used.`) : ""}
              ${index === 3 ? callout("mistake", "Common Mistake", `Students often mix ${concept} with a nearby idea. Check the definition before using it in an answer.`) : ""}
              <h4>Example in context</h4>
              <p>Suppose a learner is reading a paragraph, diagram, or solved classroom example from ${escapeHtml(chapter.title)}. The learner should ask: which part shows ${escapeHtml(concept)}, what information is given, and what conclusion follows from it? This habit turns reading into active understanding.</p>
              ${index === 1 ? diagram(subject.id, chapter) : ""}
            </section>
          `).join("")}
        </section>

        <section id="formulae">
          <h2>Formula Box and Memory Cards</h2>
          <div class="formula-card">${escapeHtml(formulaFor(subject.id, chapter))}</div>
          <div class="revision-grid">
            ${revisionBlock("remember", "Remember Box", `Definitions become powerful only when joined with examples from ${chapter.title}.`)}
            ${revisionBlock("mistake", "Common Mistakes", `Mixing up keywords is common. Underline ${concepts.slice(0, 3).join(", ")} while revising.`)}
            ${revisionBlock("insight", "Exam Insight", `Frequently tested answers ask students to explain why the concept applies, not just name it.`)}
          </div>
        </section>

        <section>
          <h2>Revision Table</h2>
          <table>
            <thead><tr><th>Concept</th><th>What to notice</th><th>Where it helps</th></tr></thead>
            <tbody>${concepts.slice(0, 5).map((concept, index) => `<tr><td>${escapeHtml(titleCase(concept))}</td><td>Meaning, key terms, and relationships</td><td>${escapeHtml(chapter.applications[index % chapter.applications.length])}</td></tr>`).join("")}</tbody>
          </table>
        </section>

        ${callout("insight", "Exam Insight", "A strong textbook answer usually explains the concept, links it to the given situation, and ends with a clear conclusion.")}
        ${callout("fact", "Fun Fact", `${chapter.title} is easier to remember when you connect it with a real event, object, or decision from daily life.`)}

        <section id="examples">
          <h2>Worked Examples</h2>
          <article class="worked-example">
            <h3>Worked Example 1</h3>
            <p><strong>Problem</strong></p>
            <p>Explain how ${escapeHtml(concepts[0])} supports understanding of ${escapeHtml(chapter.title)}.</p>
            <p><strong>Step 1</strong> Identify the meaning of ${escapeHtml(concepts[0])} in the chapter.</p>
            <p><strong>Step 2</strong> Connect the idea to one real situation: ${escapeHtml(chapter.applications[0])}.</p>
            <p><strong>Step 3</strong> State how the concept helps organize information or solve a problem.</p>
            <p class="boxed-answer"><strong>Final Answer:</strong> ${escapeHtml(titleCase(concepts[0]))} is useful because it gives a clear way to understand and apply ${escapeHtml(chapter.title)} in schoolwork and real life.</p>
          </article>
          <article class="worked-example">
            <h3>Worked Example 2</h3>
            <p><strong>Problem</strong></p>
            <p>Create a short revision note using ${escapeHtml(concepts[1] || concepts[0])}.</p>
            <p><strong>Step 1</strong> Write the keyword.</p>
            <p><strong>Step 2</strong> Add one definition in your own words.</p>
            <p><strong>Step 3</strong> Add one example from ${escapeHtml(chapter.title)}.</p>
            <p class="boxed-answer"><strong>Final Answer:</strong> A good revision note is short, accurate, and connected to a concrete example.</p>
          </article>
        </section>

        <section id="summary">
          <h2>Chapter Summary</h2>
          <ul>
            <li>${escapeHtml(chapter.title)} explains ${escapeHtml(concepts.slice(0, 3).join(", "))} in a connected way.</li>
            <li>Definitions are important, but examples make the definitions meaningful.</li>
            <li>Diagrams, tables, and flowcharts help you revise faster and remember relationships.</li>
            <li>The best revision method is to read, explain aloud, and then write a short note.</li>
          </ul>
        </section>
      </article>
    `;
  }

  function titleCase(value) {
    return String(value).replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function highlight(html, term) {
    if (!term) return html;
    const safe = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return html.replace(new RegExp(`(${safe})`, "gi"), "<mark>$1</mark>");
  }

  function renderLesson() {
    const subject = Data.getSubject(state.subjectId);
    const chapter = Data.getChapter(state.subjectId, state.chapterId);
    $("readerTitle").textContent = chapter.title;
    $("readerMeta").textContent = `${subject.name} | ${chapter.minutes} min read | ${chapter.difficulty}`;
    $("lessonProgressText").textContent = `${getProgressFor(subject.id, chapter.id).percent || 0}% read`;
    $("lessonContent").style.setProperty("--reader-zoom", state.zoom);
    $("lessonContent").innerHTML = highlight(state.quickRevision ? quickRevisionHtml(subject, chapter) : lessonHtml(subject, chapter), state.searchTerm);
    $("readerContents").innerHTML = contentsHtml();
    $("quickModeBtn").textContent = state.quickRevision ? "Full Lesson" : "Quick Revision";
    $("quickModeBtn").classList.toggle("active", state.quickRevision);
    syncActionButtons();
  }

  function syncActionButtons() {
    const key = lessonKey(state.subjectId, state.chapterId);
    const bookmarks = readJson(BOOKMARK_KEY, {});
    const offline = readJson(OFFLINE_KEY, {});
    $("bookmarkBtn").classList.toggle("active", !!bookmarks[key]);
    $("bookmarkBtn").textContent = bookmarks[key] ? "Bookmarked" : "Bookmark";
    $("offlineBtn").classList.toggle("active", !!offline[key]);
    $("offlineBtn").textContent = offline[key] ? "Saved Offline" : "Save Offline";
    $("themeBtn").textContent = state.theme === "dark" ? "Light Mode" : "Dark Mode";
  }

  function setZoom(next) {
    state.zoom = Math.max(0.82, Math.min(1.32, next));
    $("lessonContent").style.setProperty("--reader-zoom", state.zoom);
  }

  function toggleFullscreen() {
    const reader = $("readerView");
    if (!document.fullscreenElement && reader.requestFullscreen) {
      reader.requestFullscreen();
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }

  function toggleTheme() {
    state.theme = state.theme === "dark" ? "light" : "dark";
    localStorage.setItem("tutorly_theme", state.theme);
    document.body.classList.toggle("lesson-dark", state.theme === "dark");
    syncActionButtons();
  }

  function toggleBookmark() {
    const subject = Data.getSubject(state.subjectId);
    const chapter = Data.getChapter(state.subjectId, state.chapterId);
    const key = lessonKey(subject.id, chapter.id);
    const bookmarks = readJson(BOOKMARK_KEY, {});
    if (bookmarks[key]) delete bookmarks[key];
    else bookmarks[key] = { subject: subject.name, chapter: chapter.title, savedAt: new Date().toISOString() };
    writeJson(BOOKMARK_KEY, bookmarks);
    syncActionButtons();
  }

  function saveOffline() {
    const subject = Data.getSubject(state.subjectId);
    const chapter = Data.getChapter(state.subjectId, state.chapterId);
    const key = lessonKey(subject.id, chapter.id);
    const offline = readJson(OFFLINE_KEY, {});
    offline[key] = {
      subject: subject.name,
      chapter: chapter.title,
      savedAt: new Date().toISOString(),
      html: lessonHtml(subject, chapter)
    };
    writeJson(OFFLINE_KEY, offline);
    syncActionButtons();
  }

  async function copyNotes() {
    const subject = Data.getSubject(state.subjectId);
    const chapter = Data.getChapter(state.subjectId, state.chapterId);
    const text = [
      `${subject.name} - ${chapter.title}`,
      "",
      "Learning objectives:",
      ...chapter.concepts.map((concept) => `- ${titleCase(concept)}`),
      "",
      "Summary:",
      `- ${chapter.title} connects ${chapter.concepts.slice(0, 3).join(", ")}.`,
      "- Revise definitions with examples and diagrams.",
      "- Use a short note for every concept."
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      $("copyNotesBtn").textContent = "Copied";
      setTimeout(() => { $("copyNotesBtn").textContent = "Copy Notes"; }, 1200);
    } catch (_error) {
      alert(text);
    }
  }

  function openPdfExport() {
    const subject = Data.getSubject(state.subjectId);
    const chapter = Data.getChapter(state.subjectId, state.chapterId);
    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) {
      window.print();
      return;
    }
    printWindow.document.write(`
      <!doctype html>
      <html>
      <head>
        <title>${escapeHtml(subject.name)} - ${escapeHtml(chapter.title)}</title>
        <style>${document.getElementById("lessonPrintStyles").textContent}</style>
      </head>
      <body class="pdf-export">
        ${lessonHtml(subject, chapter)}
        <script>window.onload=function(){window.print();};<\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }

  function saveScrollProgress() {
    if ($("readerView").hidden || !state.subjectId || !state.chapterId) return;
    const doc = $("lessonContent");
    const rect = doc.getBoundingClientRect();
    const total = Math.max(1, rect.height - window.innerHeight);
    const read = Math.max(0, -rect.top);
    const percent = Math.max(getProgressFor(state.subjectId, state.chapterId).percent || 0, Math.min(100, Math.round((read / total) * 100)));
    const progress = getProgress();
    const key = lessonKey(state.subjectId, state.chapterId);
    progress[key] = {
      ...(progress[key] || {}),
      percent,
      lastOpened: progress[key]?.lastOpened || new Date().toISOString()
    };
    writeJson(PROGRESS_KEY, progress);
    $("lessonProgressText").textContent = `${percent}% read`;
  }

  window.addEventListener("DOMContentLoaded", init);
})();
