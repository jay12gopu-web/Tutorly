(function () {
  "use strict";
  const STORAGE_KEY = "tutorly_demo_doubts_v1";
  const demoDoubtData = [
    { id: "D-1023", subject: "Mathematics", topic: "Quadratic equations", createdAt: "Asked 10 mins ago", status: "Waiting for tutor" },
    { id: "D-1016", subject: "Physics", topic: "Motion graphs", createdAt: "Asked yesterday", status: "Tutor reviewing" }
  ];
  function readDoubts() { try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); return Array.isArray(saved) ? saved : demoDoubtData; } catch (_) { return demoDoubtData; } }
  function saveDoubts(doubts) { localStorage.setItem(STORAGE_KEY, JSON.stringify(doubts)); }
  function escapeHtml(value) { const node = document.createElement("span"); node.textContent = String(value || ""); return node.innerHTML; }
  function renderDoubts() {
    const list = document.getElementById("doubtHistory"); const doubts = readDoubts();
    if (!doubts.length) { list.innerHTML = '<div class="human-tools-empty"><strong>No doubts yet</strong>Your submitted doubts will show up here.</div>'; return; }
    list.innerHTML = doubts.map((doubt) => `<article class="doubt-entry"><div class="doubt-entry-head"><h3>${escapeHtml(doubt.subject)} · ${escapeHtml(doubt.topic)}</h3><span class="doubt-state" data-state="${escapeHtml(doubt.status)}">${escapeHtml(doubt.status)}</span></div><p>${escapeHtml(doubt.createdAt)} · ${escapeHtml(doubt.id)}</p></article>`).join("");
  }
  const attachment = document.getElementById("doubtAttachment");
  attachment?.addEventListener("change", () => { document.getElementById("doubtAttachmentName").textContent = attachment.files[0] ? `${attachment.files[0].name} · attached for demo preview` : "Image, PDF, or document · demo upload only"; });
  document.getElementById("doubtForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const subject = document.getElementById("doubtSubject").value; const topic = document.getElementById("doubtTopic").value.trim(); const question = document.getElementById("doubtQuestion").value.trim(); const status = document.getElementById("doubtFormStatus");
    if (!subject || !topic || !question) { status.textContent = "Choose a subject and add both the topic and your question."; status.hidden = false; return; }
    const id = `D-${Math.floor(1000 + Math.random() * 8999)}`;
    const doubts = readDoubts(); doubts.unshift({ id, subject, topic, question, tried: document.getElementById("doubtTried").value.trim(), attachmentName: attachment.files[0]?.name || "", createdAt: "Asked just now", status: "Waiting for tutor", demo: true }); saveDoubts(doubts);
    status.textContent = `Doubt submitted · Reference ${id} · Waiting for tutor. This is stored as a demo preview on this device.`; status.hidden = false; event.target.reset(); document.getElementById("doubtAttachmentName").textContent = "Image, PDF, or document · demo upload only"; renderDoubts();
  });
  window.TutorlyDoubts = { demoDoubtData, readDoubts, renderDoubts };
  renderDoubts();
})();
