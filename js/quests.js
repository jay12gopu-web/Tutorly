(function () {
  "use strict";

  const ROUTES = {
    practice_question_correct: "tests.html?mode=practice",
    practice_session_completed: "tests.html?mode=practice",
    test_completed: "tests.html",
    lesson_completed: "lessons.html",
    topic_mastered: "tests.html?mode=practice",
    weak_topic_improved: "tests.html?mode=practice"
  };

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  })[character]);

  function timeLabel(value) {
    const expiry = new Date(value);
    if (Number.isNaN(expiry.getTime())) return "";
    return `Ends ${expiry.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}`;
  }

  function questCard(quest) {
    const progress = Math.min(Number(quest.current_progress || 0), Number(quest.target_amount || 1));
    const target = Math.max(1, Number(quest.target_amount || 1));
    const percent = Math.round((progress / target) * 100);
    const completed = quest.status === "completed" || quest.status === "claimed";
    const coins = Number(quest.coin_reward || 0);
    // No page visit or material-only score is evidence of verified chapter mastery.
    const unavailable = !completed && ['lesson_completed','topic_mastered','weak_topic_improved'].includes(quest.target_event);
    return `
      <article class="quest-card${completed ? " is-complete" : ""}">
        <div class="quest-top">
          <span class="quest-level">${escapeHtml(quest.type === "weekly" ? "Weekly" : "Daily")}</span>
          <span class="coin-reward">+${Number(quest.xp_reward || 0)} XP${coins ? ` · ${coins} coins` : ""}</span>
        </div>
        <h3 class="quest-title">${escapeHtml(quest.title)}</h3>
        <p class="quest-desc">${escapeHtml(quest.description)}</p>
        <div class="quest-progress-copy"><span>${completed ? "Completed" : `${progress} / ${target}`}</span><span>${escapeHtml(timeLabel(quest.expires_at))}</span></div>
        <div class="quest-progress" role="progressbar" aria-label="${escapeHtml(quest.title)} progress" aria-valuemin="0" aria-valuemax="${target}" aria-valuenow="${progress}"><span style="width:${percent}%"></span></div>
        ${unavailable ? '<p class="quest-desc">Reviewed chapter assessments are not available yet. This objective cannot currently be completed; no reward is claimed.</p><button class="btn btn-soft quest-open" disabled>Unavailable yet</button>' : `<a class="btn ${completed ? "btn-soft" : "btn-primary"} quest-open" href="${ROUTES[quest.target_event] || "tests.html"}">${completed ? "Done" : "Continue"}</a>`}
      </article>
    `;
  }

  function render(payload) {
    const quests = Array.isArray(payload?.quests) ? payload.quests : [];
    const wallet = payload?.wallet || {};
    const grid = document.getElementById("questGrid");
    if (!grid) return;
    grid.innerHTML = quests.map(questCard).join("") || `<article class="quest-card"><h3 class="quest-title">No active quests</h3><p class="quest-desc">Your next quests will appear automatically.</p></article>`;
    const completed = quests.filter((quest) => ["completed", "claimed"].includes(quest.status)).length;
    document.getElementById("coinsBadge").textContent = String(Number(wallet.coins || 0));
    document.getElementById("weeklyXpBadge").textContent = String(Number(wallet.weekly_xp || 0));
    document.getElementById("totalXpBadge").textContent = String(Number(wallet.total_xp || 0));
    document.getElementById("doneBadge").textContent = `${completed}/${quests.length}`;
  }

  async function load() {
    const grid = document.getElementById("questGrid");
    if (!window.TutorlyAuth?.getSessionToken?.()) {
      if (grid) grid.innerHTML = `<article class="quest-card"><h3 class="quest-title">Log in to track quests</h3><p class="quest-desc">Quest progress and rewards are saved securely to your Tutorly account.</p><a class="btn btn-primary quest-open" href="login.html">Log in</a></article>`;
      return;
    }
    try {
      render(await window.TutorlyAuth.getQuests());
    } catch (error) {
      if (grid) grid.innerHTML = `<article class="quest-card"><h3 class="quest-title">Quests are taking a moment</h3><p class="quest-desc">Your activity is safe. Reopen this page in a moment to see the latest progress.</p></article>`;
    }
  }

  window.addEventListener("DOMContentLoaded", load);
  window.addEventListener("tutorly:quests-updated", (event) => render(event.detail));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
})();
