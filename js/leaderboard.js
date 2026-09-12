(function () {
  "use strict";

  // Demo adapter only. Replace this object with GET /api/leaderboard when rankings are available.
  const leaderboardData = {
    levels: [
      { name: "Beginner", minXp: 0 }, { name: "Learner", minXp: 500 },
      { name: "Scholar", minXp: 1200 }, { name: "Expert", minXp: 2500 }, { name: "Master", minXp: 5000 }
    ],
    periods: {
      weekly: [
        ["Aarav", 2180], ["Meera", 1890], ["Kabir", 1650], ["Ishita", 1380], ["You", 1240], ["Dev", 1120], ["Riya", 980], ["Arjun", 860]
      ],
      monthly: [
        ["Meera", 8160], ["Aarav", 7920], ["You", 6430], ["Ishita", 6100], ["Kabir", 5780], ["Riya", 5320], ["Dev", 4910], ["Arjun", 4450]
      ],
      allTime: [
        ["Aarav", 14420], ["Meera", 13960], ["Ishita", 12810], ["Kabir", 11470], ["You", 9320], ["Riya", 9060], ["Dev", 8810], ["Arjun", 8260]
      ]
    }
  };
  let period = "weekly";
  const ownName = String(localStorage.getItem("tutorly_name") || localStorage.getItem("tutorly_user_name") || "Jayvardhan").trim() || "Jayvardhan";

  function levelFor(xp) {
    return leaderboardData.levels.slice().reverse().find((level) => xp >= level.minXp) || leaderboardData.levels[0];
  }
  function initials(name) { return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }
  function dataset() {
    return leaderboardData.periods[period].map(([name, xp], index) => ({ rank: index + 1, name: name === "You" ? ownName : name, xp, isCurrent: name === "You", level: levelFor(xp).name }));
  }
  function render() {
    const rows = dataset();
    const current = rows.find((entry) => entry.isCurrent);
    const position = document.getElementById("leaderboardPosition");
    const xpCard = document.getElementById("leaderboardXpCard");
    const topThree = document.getElementById("leaderboardTopThree");
    const list = document.getElementById("leaderboardRows");
    const listTitle = document.getElementById("leaderboardListTitle");
    if (!current) {
      document.getElementById("leaderboardState").hidden = false;
      document.getElementById("leaderboardState").textContent = "No ranking data is available for this period yet.";
      return;
    }
    const labels = { weekly: "This week", monthly: "This month", allTime: "All time" };
    position.innerHTML = `<div class="leaderboard-rank">#${current.rank}</div><div><h2>${escapeHtml(current.name)}</h2><p>Your position ${period === "weekly" ? "is up 2 places this week" : "in the Tutorly demo ranking"}.</p><div class="leaderboard-meta"><span>${current.level}</span><span>${current.xp.toLocaleString()} XP</span></div></div>`;
    xpCard.innerHTML = `<small>${labels[period]} learning XP</small><strong>${current.xp.toLocaleString()} XP</strong><span class="human-tools-note">Level: ${current.level}</span>`;
    topThree.innerHTML = rows.slice(0, 3).map((entry, index) => `<article class="human-tools-card leaderboard-podium"><span class="leaderboard-medal">#${index + 1}</span><h3>${escapeHtml(entry.name)}</h3><p>${entry.xp.toLocaleString()} XP · ${entry.level}</p></article>`).join("");
    listTitle.textContent = labels[period];
    list.innerHTML = rows.slice(3).map((entry) => `<article class="leaderboard-row ${entry.isCurrent ? "is-current" : ""}"><span class="leaderboard-row-rank">#${entry.rank}</span><div class="leaderboard-user"><span class="leaderboard-avatar">${initials(entry.name)}</span><span><strong>${escapeHtml(entry.name)}${entry.isCurrent ? " · You" : ""}</strong><small>${entry.isCurrent ? "Your study activity" : "Tutorly learner"}</small></span></div><span class="leaderboard-level">${entry.level}</span><span class="leaderboard-row-xp">${entry.xp.toLocaleString()} XP</span></article>`).join("");
  }
  function escapeHtml(value) { const node = document.createElement("span"); node.textContent = String(value || ""); return node.innerHTML; }
  document.querySelectorAll("[data-period]").forEach((button) => button.addEventListener("click", () => { period = button.dataset.period; document.querySelectorAll("[data-period]").forEach((item) => item.setAttribute("aria-selected", String(item === button))); render(); }));
  document.getElementById("xpInfoButton")?.addEventListener("click", () => document.getElementById("xpInfo").toggleAttribute("hidden"));
  window.TutorlyLeaderboard = { leaderboardData, render };
  render();
})();
