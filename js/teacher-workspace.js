(function () {
  "use strict";
  const auth = window.TutorlyAuth;
  const byId = (id) => document.getElementById(id);
  async function load() {
    byId("teacherRetry").hidden = true;
    byId("teacherStatus").textContent = "Loading your Tutorly profile…";
    if (!auth?.getSessionToken()) { location.replace("login.html"); return; }
    try {
      const payload = await auth.currentUser();
      if (payload.onboarding_required || payload.user.role !== "teacher") {
        location.replace(await auth.authenticatedDestination(payload)); return;
      }
      const user = payload.user;
      const teacher = user.teacher_profile || {};
      const education = await window.TutorlyEducation.load().catch(() => null);
      byId("teacherGreeting").textContent = `Welcome, ${user.full_name}.`;
      const status = teacher.verification_status || "pending";
      byId("teacherVerification").textContent = { pending: "Pending verification", verified: "Verified", rejected: "Needs attention" }[status] || "Pending verification";
      byId("teacherVerificationHelp").textContent = status === "verified" ? "Your degree has been approved by Tutorly." : status === "rejected" ? "Contact Tutorly support about your degree review." : "Uploading your degree does not verify it. Trusted teacher access remains restricted until Tutorly approves it.";
      byId("teacherSubjects").textContent = (teacher.subjects || []).map((id) => education?.subjects.find((subject) => subject.id === id)?.name || id).join(", ") || "Not set";
      byId("teacherBoards").textContent = (teacher.boards || []).map((id) => (education && window.TutorlyEducation.board(id)?.shortName) || id).join(", ") || "Not set";
      byId("teacherGrades").textContent = teacher.grade_min && teacher.grade_max ? `Grades ${teacher.grade_min}–${teacher.grade_max}` : "Not set";
      byId("teacherLoading").hidden = true;
      byId("teacherWorkspace").hidden = false;
    } catch (error) {
      if (error.status === 401) { auth.clearSession(); location.replace("login.html"); return; }
      byId("teacherStatus").textContent = "Tutorly couldn’t load your workspace. Please retry.";
      byId("teacherRetry").hidden = false;
    }
  }
  byId("teacherRetry").addEventListener("click", load);
  byId("teacherLogout").addEventListener("click", async () => { await auth.logout(); location.replace("login.html"); });
  load();
})();
