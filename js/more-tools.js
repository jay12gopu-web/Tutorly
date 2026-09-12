(function () {
  "use strict";

  const config = {
    // Replace this preview with authenticated level/rank data when a leaderboard exists.
    progress: { level: "Beginner", rank: "5th", isDemo: true },
    routes: {
      leaderboard: "leaderboard.html",
      askDoubt: "ask-doubt.html",
      findTutor: "find-tutor.html"
    }
  };

  const details = {
    leaderboard: {
      title: "Leaderboard",
      description: "See your Tutorly rank, XP, levels, and a clear explanation of how learning activity earns XP.",
      link: "leaderboard.html",
      linkLabel: "Open leaderboard"
    },
    askDoubt: {
      title: "Ask a Doubt",
      description: "Prepare a difficult schoolwork question for a human tutor. The current preview saves demo requests only on this device.",
      link: "ask-doubt.html",
      linkLabel: "Ask a doubt"
    },
    findTutor: {
      title: "Find a Tutor",
      description: "Browse structured demo tutor profiles, filter by subject and grade, then prepare a help request.",
      link: "find-tutor.html",
      linkLabel: "Find a tutor"
    }
  };

  const dialog = document.getElementById("toolsDetailDialog");
  let returnFocus = null;

  function setProgress(progress = config.progress) {
    document.getElementById("toolsStudentLevel").textContent = String(progress.level || "Not available");
    document.getElementById("toolsStudentRank").textContent = String(progress.rank || "Unranked");
    document.getElementById("toolsProgressSource").textContent = progress.isDemo === false
      ? "Your learning activity"
      : "Preview · sample level & rank";
  }

  function showDetails(key, trigger) {
    const detail = details[key];
    if (!detail || !dialog || dialog.open) return;
    returnFocus = trigger;
    document.getElementById("toolsDetailTitle").textContent = detail.title;
    document.getElementById("toolsDetailDescription").textContent = detail.description;
    const link = document.getElementById("toolsDetailLink");
    link.href = detail.link;
    link.textContent = detail.linkLabel;
    dialog.showModal();
  }

  document.querySelectorAll("[data-tools-action], [data-tools-info]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.toolsAction || button.dataset.toolsInfo;
      const route = config.routes[key];
      if (button.dataset.toolsAction && route) {
        window.location.assign(route);
        return;
      }
      showDetails(key, button);
    });
  });

  // Native dialog supplies keyboard focus containment and Escape dismissal.
  dialog?.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
      dialog.close();
    }
  });
  dialog?.addEventListener("close", () => {
    if (returnFocus?.isConnected) returnFocus.focus();
    returnFocus = null;
  });

  // A future authenticated data adapter can update the strip without changing its markup.
  window.TutorlyMoreTools = { config, setProgress };
  setProgress();
})();
