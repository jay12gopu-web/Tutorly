(function (root) {
  "use strict";

  const EVENT_TYPES = new Set([
    "practice_question_correct",
    "practice_session_completed",
    "test_completed",
    "lesson_completed",
    "topic_mastered",
    "weak_topic_improved"
  ]);

  function isAuthenticated() {
    return !!root.TutorlyAuth?.getSessionToken?.();
  }

  function ensureToastStyles() {
    if (document.getElementById("tutorlyQuestToastStyles")) return;
    const style = document.createElement("style");
    style.id = "tutorlyQuestToastStyles";
    style.textContent = `
      .tutorly-quest-toast{position:fixed;right:22px;bottom:22px;z-index:10020;display:flex;align-items:center;gap:12px;max-width:min(360px,calc(100vw - 32px));padding:14px 16px;border:1px solid rgba(79,124,255,.22);border-radius:16px;background:rgba(255,255,255,.97);box-shadow:0 18px 48px rgba(37,53,102,.18);color:#182039;font:700 14px/1.35 Inter,system-ui,sans-serif;animation:tutorlyQuestIn 260ms cubic-bezier(.2,.8,.2,1)}
      .tutorly-quest-toast::before{content:"";width:11px;height:11px;flex:0 0 auto;border-radius:50%;background:linear-gradient(135deg,#4f7cff,#8b5cf6);box-shadow:0 0 0 6px rgba(79,124,255,.1)}
      .tutorly-quest-toast strong{display:block;font-size:15px}.tutorly-quest-toast span{display:block;margin-top:2px;color:#66708a;font-weight:650}
      .tutorly-quest-toast.is-leaving{opacity:0;transform:translateY(6px);transition:opacity 180ms ease,transform 180ms ease}
      @keyframes tutorlyQuestIn{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
      @media(max-width:600px){.tutorly-quest-toast{left:16px;right:16px;bottom:18px;max-width:none}}
      @media(prefers-reduced-motion:reduce){.tutorly-quest-toast{animation:none}.tutorly-quest-toast.is-leaving{transition:none}}
    `;
    document.head.appendChild(style);
  }

  function showCompletion(completion) {
    if (!completion?.title) return;
    ensureToastStyles();
    document.querySelectorAll(".tutorly-quest-toast").forEach((node) => node.remove());
    const toast = document.createElement("div");
    toast.className = "tutorly-quest-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    const coins = Number(completion.coin_reward || 0);
    toast.innerHTML = `<div><strong>Quest complete: ${escapeHtml(completion.title)}</strong><span>+${Number(completion.xp_reward || 0)} XP${coins ? ` · +${coins} coins` : ""}</span></div>`;
    document.body.appendChild(toast);
    root.setTimeout(() => toast.classList.add("is-leaving"), 2800);
    root.setTimeout(() => toast.remove(), 3050);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    })[character]);
  }

  function handlePayload(payload) {
    (payload?.newly_completed || []).forEach(showCompletion);
    root.dispatchEvent(new CustomEvent("tutorly:quests-updated", { detail: payload || {} }));
    return payload;
  }

  async function recordBatch(events) {
    if (!isAuthenticated() || !root.TutorlyAuth?.recordQuestEvents) return { skipped: true };
    const clean = (Array.isArray(events) ? events : []).filter((event) =>
      EVENT_TYPES.has(event?.event_type) && event?.event_id
    );
    if (!clean.length) return { skipped: true };
    try {
      return handlePayload(await root.TutorlyAuth.recordQuestEvents(clean));
    } catch (error) {
      console.warn("Tutorly could not sync quest progress.");
      return { error: true };
    }
  }

  function record(eventType, eventId, metadata = {}) {
    return recordBatch([{ event_type: eventType, event_id: eventId, metadata }]);
  }

  root.TutorlyQuestEvents = Object.freeze({ record, recordBatch, showCompletion });
})(window);
