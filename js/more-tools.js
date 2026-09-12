(function () {
  "use strict";

  const config = {
    // Replace this preview with authenticated level/rank data when a leaderboard exists.
    progress: { level: "Beginner", rank: "5th", isDemo: true },
    routes: {
      // TODO: Connect the learning leaderboard route once live rankings are implemented.
      leaderboard: null,
      // TODO: Connect a real human-tutor doubt flow. ask_doubt.html currently opens AI chat.
      askDoubt: null,
      // TODO: Connect real tutor matching. Existing tutor directory pages use demo profiles.
      findTutor: null
    }
  };

  const details = {
    leaderboard: {
      title: "Leaderboard",
      description: "Live rankings are still being added. The level and rank shown here are sample values for this preview. You can see your actual learning activity in Progress.",
      link: "progress.html",
      linkLabel: "View my progress"
    },
    askDoubt: {
      title: "Ask a Doubt",
      description: "This will connect you with a human tutor for extra help. Human-tutor support isn't available here yet, and no request has been sent. Contact support if you need help with Tutorly today.",
      link: "contact.html",
      linkLabel: "Contact support"
    },
    findTutor: {
      title: "Find a Tutor",
      description: "Tutor matching is still being prepared. You'll be able to find a human tutor for your subjects and learning needs here. No search or booking has been made.",
      link: "contact.html",
      linkLabel: "Contact support"
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
