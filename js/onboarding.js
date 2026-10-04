(function (root) {
  "use strict";
  const form = document.getElementById("onboardingForm");
  if (!form) return;
  const element = (id) => document.getElementById(id);
  const content = element("stepContent");
  const title = element("stepTitle");
  const next = element("setupContinue");
  const back = element("setupBack");
  const skip = element("setupSkip");
  const error = element("stepError");
  const MAX_DEGREE_BYTES = 5 * 1024 * 1024;
  const state = { role: "", full_name: "", age: "", grade: "", board: "", school: "", subjects: [], boards: [], grade_min: 1, grade_max: 12, degree: null, gender: "", teaching_personality: [], preferred_days: [], start_minutes: 360, end_minutes: 480 };
  const personalities = ["Caring", "Focused", "Funny", "Strict", "Patient", "Calm", "Energetic", "Friendly", "Encouraging", "Practical", "Detailed", "Straightforward"];
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  let roleSelection = true;
  let steps = ["role"];
  let index = 0;
  let busy = false;
  let picker = null;
  let pickers = [];
  let choicesPending = 0;
  let renderVersion = 0;
  let pendingFile = null;
  let uploadError = "";
  let previewUrl = "";
  let loadedUserId = "";

  const teacherSteps = ["basic", "preferences", "availability", "confirm"];
  const stepsForRole = () => [...(roleSelection ? ["role"] : []), ...(state.role === "teacher" ? teacherSteps : ["name", "age", "grade", "board", "school"])];
  const isAuthError = (failure) => failure?.status === 401 || failure?.statusCode === 401;
  function signIn() { root.location.replace("login.html?return=info.html"); }
  function showError(message, target) {
    error.textContent = message; error.hidden = false;
    if (target) { target.setAttribute("aria-invalid", "true"); target.focus(); }
  }
  function clearError() {
    error.hidden = true; error.textContent = "";
    content.querySelectorAll('[aria-invalid="true"]').forEach((input) => input.removeAttribute("aria-invalid"));
  }
  function revokePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = "";
  }
  function setBusy(value) {
    busy = value;
    form.setAttribute("aria-busy", String(value));
    form.querySelectorAll("button, input, select").forEach((control) => { control.disabled = value; });
    element("setupLogout").disabled = value;
    pickers.forEach((control) => control.setDisabled(value));
  }
  function heading(text, description) { title.textContent = text; element("stepDescription").textContent = description; }
  function field(key, label, options = {}) {
    const group = document.createElement("div"); group.className = "setup-field";
    const caption = document.createElement("label"); caption.htmlFor = `setup-${key}`; caption.textContent = label;
    const input = document.createElement("input"); input.id = `setup-${key}`; input.name = key; input.type = options.type || "text";
    input.value = state[key]; input.autocomplete = options.autocomplete || "off";
    input.maxLength = options.maxLength || 160; input.required = !options.optional;
    input.setAttribute("aria-describedby", "stepError");
    if (options.placeholder) input.placeholder = options.placeholder;
    if (options.type === "number") { input.min = "5"; input.max = "120"; input.step = "1"; input.inputMode = "numeric"; }
    input.addEventListener("input", () => { state[key] = input.value; clearError(); });
    group.append(caption, input);
    if (options.hint) { const hint = document.createElement("p"); hint.className = "setup-hint"; hint.textContent = options.hint; group.append(hint); }
    content.append(group);
  }
  function choices(name, values, className) {
    const group = document.createElement("fieldset"); group.className = "setup-options";
    const legend = document.createElement("legend"); legend.className = "setup-visually-hidden"; legend.textContent = title.textContent;
    const grid = document.createElement("div"); grid.className = className;
    values.forEach((option) => {
      const label = document.createElement("label"); label.className = "setup-choice";
      const input = document.createElement("input"); input.type = "radio"; input.name = name; input.value = option.value; input.checked = state[name] === option.value;
      const face = document.createElement("span"); face.className = "setup-choice-face";
      if (option.description) {
        const caption = document.createElement("span"); caption.className = "setup-choice-title"; caption.textContent = option.label;
        const description = document.createElement("span"); description.className = "setup-choice-description"; description.textContent = option.description;
        face.append(caption, description);
      } else face.textContent = option.label;
      input.addEventListener("change", () => { state[name] = option.value; clearError(); if (name === "role") { steps = stepsForRole(); updateProgress(); } });
      label.append(input, face); grid.append(label);
    });
    group.append(legend, grid); content.append(group);
  }
  function updateProgress() {
    element("stepLabel").textContent = state.role === "teacher" ? "Teacher profile" : state.role === "student" ? "Student profile" : "Your profile";
    const teacherPage = state.role === "teacher" ? teacherSteps.indexOf(steps[index]) : -1;
    element("stepCount").textContent = teacherPage >= 0 ? `Page ${teacherPage + 1} of 4` : steps[index] === "role" ? "Choose your role" : `Step ${index + 1} of ${steps.length}`;
    element("setupProgress").value = teacherPage >= 0 ? ((teacherPage + 1) / 4) * 100 : ((index + 1) / steps.length) * 100;
  }
  async function educationPicker(kind, multiple) {
    const version = renderVersion;
    const host = document.createElement("div"); host.className = "setup-picker-host"; content.append(host);
    const loading = document.createElement("p"); loading.className = "setup-hint"; loading.setAttribute("role", "status"); loading.textContent = `Loading ${kind === "subjects" ? "subjects" : "education boards"}…`;
    host.append(loading); choicesPending++; next.disabled = true;
    try {
      const registry = await root.TutorlyEducation.load();
      if (version !== renderVersion) return;
      const items = kind === "subjects" ? registry.subjects : registry.boards;
      if (!Array.isArray(items) || !items.length) throw new Error("There are no options available. Please try again.");
      picker = root.TutorlyEducationSelect.mount(host, {
        id: `setup-${kind}`, label: kind === "subjects" ? "Subjects you teach" : multiple ? "Education boards you teach" : "Education board",
        placeholder: kind === "subjects" ? "Search subjects" : "Search board, state or abbreviation",
        items, multiple, value: state[kind],
        onChange(value, selectedItems) {
          state[kind] = kind === "subjects" ? selectedItems.map((item) => item.name) : multiple ? selectedItems.map((item) => item.curriculumValue || item.id) : selectedItems[0]?.curriculumValue || selectedItems[0]?.id || "";
          clearError();
        }
      });
      pickers.push(picker); loading.remove();
      // Resolve legacy aliases against the same registry, without silently choosing a board.
      const chosen = picker.getValue();
      if (multiple) state[kind] = (Array.isArray(chosen) ? chosen : []).map((id) => items.find((item) => item.id === id)).filter(Boolean).map((item) => kind === "subjects" ? item.name : item.curriculumValue || item.id);
      else { const match = items.find((item) => item.id === chosen); state[kind] = match ? match.curriculumValue || match.id : ""; }
      choicesPending--; next.disabled = busy || choicesPending > 0;
    } catch (failure) {
      if (version !== renderVersion) return;
      loading.textContent = failure.message || "We couldn’t load the choices. Please try again.";
      const retry = document.createElement("button"); retry.type = "button"; retry.className = "auth-secondary"; retry.textContent = "Reload choices";
      retry.addEventListener("click", () => render()); host.append(retry);
    }
  }

  function degreeStep() {
    content.insertAdjacentHTML("beforeend", '<div class="degree-picker"><label for="degreeFile">Your degree · required</label><p class="setup-hint" id="degreeHelp">Add files · PDF, JPG, JPEG or PNG · Up to 5 MB</p><input id="degreeFile" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" aria-describedby="degreeHelp stepError" /></div><div id="degreeDetails"></div><p class="setup-hint">Your degree is private. Uploading is not verification; your review status stays pending.</p>');
    element("degreeFile").addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      clearError();
      if (!/\.(pdf|jpe?g|png)$/i.test(file.name) || !["", "application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
        event.target.value = ""; showError("Choose a PDF, JPG, JPEG or PNG certificate.", event.target); return;
      }
      if (!file.size || file.size > MAX_DEGREE_BYTES) {
        event.target.value = ""; showError(file.size ? "Your file is larger than 5 MB. Choose a smaller certificate." : "This file is empty. Choose another certificate.", event.target); return;
      }
      pendingFile = file; uploadError = ""; uploadDegree();
    });
    renderDegree();
  }
  function degreeButton(text, id, action) {
    const button = document.createElement("button"); button.type = "button"; button.className = "auth-text-button"; button.id = id; button.textContent = text; button.disabled = busy; button.addEventListener("click", action); return button;
  }
  function renderDegree() {
    const area = element("degreeDetails"); if (!area) return;
    revokePreview(); area.replaceChildren();
    if (!state.degree && !pendingFile) return;
    const card = document.createElement("div"); card.className = "degree-file";
    const name = document.createElement("p"); name.className = "degree-filename"; name.textContent = pendingFile?.name || state.degree?.name || "Degree certificate";
    const status = document.createElement("p"); status.className = "degree-status"; status.setAttribute("role", "status");
    const size = pendingFile?.size || state.degree?.size || 0;
    status.textContent = busy ? "Uploading certificate…" : uploadError ? "Upload didn’t finish. Retry or choose another file." : `${(size / 1024).toFixed(0)} KB · Private · used only for teacher verification · Pending review`;
    const actions = document.createElement("div"); actions.className = "degree-actions";
    if (uploadError && pendingFile) actions.append(degreeButton("Retry upload", "degreeRetry", uploadDegree));
    if (state.degree && !pendingFile) actions.append(degreeButton("Preview", "degreePreview", previewDegree));
    actions.append(degreeButton("Replace", "degreeReplace", () => element("degreeFile").click()));
    actions.append(degreeButton("Remove", "degreeRemove", removeDegree));
    card.append(name, status, actions); area.append(card);
  }
  async function uploadDegree() {
    if (!pendingFile || busy) return;
    clearError(); setBusy(true); renderDegree();
    try {
      const payload = await root.TutorlyAuth.uploadTeacherDegree(pendingFile);
      if (!payload?.degree?.id) throw new Error("The upload wasn’t confirmed. Please try again.");
      state.degree = payload.degree; pendingFile = null; uploadError = "";
      element("degreeFile").value = "";
    } catch (failure) {
      if (isAuthError(failure)) { signIn(); return; }
      uploadError = failure.message || "We couldn’t upload your certificate. Please try again."; showError(uploadError);
    } finally { setBusy(false); renderDegree(); }
  }
  async function removeDegree() {
    if (busy) return;
    clearError(); setBusy(true);
    try {
      if (state.degree) await root.TutorlyAuth.removeTeacherDegree();
      state.degree = null; pendingFile = null; uploadError = ""; revokePreview(); element("degreeFile").value = "";
    } catch (failure) { if (isAuthError(failure)) signIn(); else showError(failure.message || "We couldn’t remove the certificate. Try again."); }
    finally { setBusy(false); renderDegree(); }
  }
  async function previewDegree() {
    if (busy || !state.degree) return;
    const version = renderVersion; const degreeId = state.degree.id;
    const previewButton = element("degreePreview"); previewButton.disabled = true; previewButton.textContent = "Loading preview…"; clearError();
    try {
      const result = await root.TutorlyAuth.teacherDegreeBlob();
      if (version !== renderVersion || state.degree?.id !== degreeId) return;
      const blob = result instanceof Blob ? result : result.blob;
      if (!(blob instanceof Blob)) throw new Error("We couldn’t open the certificate preview.");
      revokePreview(); previewUrl = URL.createObjectURL(blob);
      const card = element("degreeDetails").querySelector(".degree-file");
      card.querySelectorAll(".degree-preview, .degree-preview-close").forEach((node) => node.remove());
      const isImage = /^image\/(png|jpeg)$/.test(blob.type || state.degree.content_type || "");
      const preview = document.createElement(isImage ? "img" : "iframe"); preview.className = "degree-preview"; preview.src = previewUrl;
      if (isImage) preview.alt = "Your degree certificate"; else { preview.title = "Private degree certificate preview"; preview.setAttribute("sandbox", ""); }
      const close = degreeButton("Close preview", "degreeClosePreview", () => { preview.remove(); close.remove(); revokePreview(); }); close.classList.add("degree-preview-close");
      card.append(preview, close);
    } catch (failure) { if (isAuthError(failure)) signIn(); else if (version === renderVersion) showError(failure.message || "We couldn’t open the preview. Please try again."); }
    finally { if (version === renderVersion && element("degreePreview")) { element("degreePreview").disabled = busy; element("degreePreview").textContent = "Preview"; } }
  }
  const normalizedTime = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  const displayTime = (minutes) => `${Math.floor(minutes / 60) % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${minutes < 720 ? "AM" : "PM"}`;
  function rangeStep(timing = false) {
    const prefix = timing ? "time" : "grade";
    const lowKey = timing ? "start_minutes" : "grade_min";
    const highKey = timing ? "end_minutes" : "grade_max";
    const low = timing ? 0 : 1; const high = timing ? 1425 : 12; const step = timing ? 15 : 1; const gap = timing ? 15 : 0;
    const label = timing ? displayTime : (value) => `Grade ${value}`;
    const section = document.createElement("section"); section.className = "setup-range-section";
    const headingNode = document.createElement("h2"); headingNode.textContent = timing ? "Preferred timings" : "Preferred grade range";
    section.append(headingNode);
    section.insertAdjacentHTML("beforeend", `<div class="grade-range" id="${prefix}Range"><div class="grade-range-track"><div class="grade-range-fill"></div></div><output id="${prefix}MinLabel" class="grade-range-label minimum" for="${prefix}Min"></output><output id="${prefix}MaxLabel" class="grade-range-label maximum" for="${prefix}Max"></output><label class="setup-visually-hidden" for="${prefix}Min">${timing ? "Preferred start time" : "Lowest grade you teach"}</label><input id="${prefix}Min" data-range="min" type="range" min="${low}" max="${high}" step="${step}" aria-describedby="${prefix}RangeHelp" /><label class="setup-visually-hidden" for="${prefix}Max">${timing ? "Preferred end time" : "Highest grade you teach"}</label><input id="${prefix}Max" data-range="max" type="range" min="${low}" max="${high}" step="${step}" aria-describedby="${prefix}RangeHelp" /><div class="grade-range-ticks" aria-hidden="true"></div></div><p id="${prefix}RangeSummary" class="grade-range-summary" role="status"></p><p id="${prefix}RangeHelp" class="setup-hint">${timing ? "India Standard Time (Asia/Kolkata). Choose a same-day range in 15-minute steps." : "Grades 1–12. Both handles may select the same grade."} Drag a handle or use the arrow keys.</p>`);
    content.append(section);
    const range = element(`${prefix}Range`);
    const ticks = timing ? [0, 360, 720, 1080, 1425] : Array.from({ length: 12 }, (_, i) => i + 1);
    ticks.forEach((value) => { const tick = document.createElement("span"); tick.textContent = timing ? displayTime(value) : value; range.querySelector(".grade-range-ticks").append(tick); });
    const minimum = element(`${prefix}Min`); const maximum = element(`${prefix}Max`);
    const update = () => {
      minimum.value = state[lowKey]; maximum.value = state[highKey];
      range.style.setProperty("--range-min", `${((state[lowKey] - low) / (high - low)) * 100}%`);
      range.style.setProperty("--range-max", `${((state[highKey] - low) / (high - low)) * 100}%`);
      range.classList.toggle("is-close", state[highKey] - state[lowKey] <= (high - low) * .22);
      range.classList.toggle("is-equal", state[lowKey] === state[highKey]);
      element(`${prefix}MinLabel`).textContent = label(state[lowKey]); element(`${prefix}MaxLabel`).textContent = label(state[highKey]);
      minimum.setAttribute("aria-valuetext", label(state[lowKey])); maximum.setAttribute("aria-valuetext", label(state[highKey]));
      minimum.setAttribute("aria-valuemax", String(timing ? high - gap : state[highKey])); maximum.setAttribute("aria-valuemin", String(timing ? low + gap : state[lowKey]));
      element(`${prefix}RangeSummary`).textContent = `${label(state[lowKey])} – ${label(state[highKey])}`;
    };
    minimum.addEventListener("input", () => {
      state[lowKey] = Math.max(low, Math.min(Number(minimum.value), timing ? high - gap : state[highKey]));
      if (timing) state[highKey] = Math.min(state[lowKey] + 120, Math.max(state[lowKey] + gap, state[highKey]));
      update(); clearError();
    });
    maximum.addEventListener("input", () => {
      state[highKey] = Math.min(high, Math.max(Number(maximum.value), timing ? low + gap : state[lowKey]));
      if (timing) state[lowKey] = Math.max(state[highKey] - 120, Math.min(state[highKey] - gap, state[lowKey]));
      update(); clearError();
    });
    if (timing) element(`${prefix}RangeHelp`).textContent = "India Standard Time (Asia/Kolkata). Select 15 minutes to 2 hours, in 15-minute steps. Drag either handle or use arrow keys; the other handle adjusts to keep the range valid.";
    [minimum, maximum].forEach((handle) => handle.addEventListener("focus", () => { minimum.style.zIndex = handle === minimum ? "3" : "2"; maximum.style.zIndex = handle === maximum ? "3" : "2"; }));
    update();
  }

  function pills(key, label, values) {
    const fieldset = document.createElement("fieldset"); fieldset.className = "setup-pill-container";
    const legend = document.createElement("legend"); legend.textContent = label; fieldset.append(legend);
    const wrap = document.createElement("div"); wrap.className = "setup-pills";
    values.forEach((text) => {
      const value = text.toLowerCase(); const button = document.createElement("button"); button.type = "button"; button.className = "setup-pill"; button.textContent = text;
      button.setAttribute("aria-pressed", String(state[key].includes(value)));
      button.addEventListener("click", () => {
        state[key] = state[key].includes(value) ? state[key].filter((item) => item !== value) : [...state[key], value];
        button.setAttribute("aria-pressed", String(state[key].includes(value))); clearError();
      }); wrap.append(button);
    }); fieldset.append(wrap); content.append(fieldset);
  }

  function basicStep() {
    field("full_name", "Full name", { autocomplete: "name", maxLength: 120 });
    const group = document.createElement("div"); group.className = "setup-field";
    group.innerHTML = '<label for="teacherGender">Gender</label><select id="teacherGender" required aria-describedby="genderHelp stepError"><option value="">Select an option</option><option value="male">Male</option><option value="female">Female</option><option value="non_binary">Non-binary / another identity</option><option value="prefer_not_to_say">Prefer not to say</option></select><p class="setup-hint" id="genderHelp">This does not affect verification, ranking, eligibility or teacher quality.</p>';
    content.append(group); element("teacherGender").value = state.gender;
    element("teacherGender").addEventListener("change", (event) => { state.gender = event.target.value; clearError(); });
    degreeStep();
  }

  function render(focus = true) {
    renderVersion++; pickers.forEach((control) => control.destroy()); pickers = []; picker = null; choicesPending = 0; revokePreview(); content.replaceChildren(); clearError();
    const step = steps[index];
    document.body.classList.toggle("setup-confirm-page", step === "confirm");
    element("teacherConfirmLegal").hidden = step !== "confirm";
    updateProgress(); back.hidden = index === 0; skip.hidden = step !== "school";
    next.disabled = false; next.textContent = index === steps.length - 1 ? (state.role === "teacher" ? "Confirm" : "Start learning") : "Continue";
    if (step === "role") {
      heading("How will you use Tutorly?", "Choose the profile that feels right for you.");
      choices("role", [{ value: "student", label: "Student", description: "Understand your lessons and learn at your own pace." }, { value: "teacher", label: "Teacher", description: "Share what you know and support your students." }], "setup-role-grid");
    } else if (step === "name") {
      heading("What should we call you?", "Check your name so we can make your profile yours."); field("full_name", "Your name", { autocomplete: "name", placeholder: "Your full name", maxLength: 120 });
    } else if (step === "age") {
      heading("How old are you?", "This helps us make your learning experience age appropriate."); field("age", "Your age", { type: "number", placeholder: "Age in years" });
    } else if (step === "grade") {
      heading("Which grade are you in?", "We’ll match your learning to your class."); choices("grade", Array.from({ length: 12 }, (_, offset) => ({ value: String(offset + 1), label: `Grade ${offset + 1}` })), "setup-grade-grid");
    } else if (step === "board") {
      heading("Which board do you study?", "Find your board by name, state or abbreviation."); educationPicker("board", false);
    } else if (step === "school") {
      heading("Where do you go to school?", "Add your school, or skip this for now."); field("school", "School name (optional)", { optional: true, placeholder: "Your school", autocomplete: "organization", maxLength: 200 });
    } else if (step === "basic") {
      heading("Basic details", "Your authenticated email is already linked to this profile."); basicStep();
    } else if (step === "preferences") {
      heading("Teaching preferences", "Tell us how and what you prefer to teach."); pills("teaching_personality", "Personality · choose one or more", personalities); rangeStep(); educationPicker("subjects", true); educationPicker("boards", true);
    } else if (step === "availability") {
      heading("Your availability", "Choose your preferred days and teaching hours."); pills("preferred_days", "Preferred days", weekdays); rangeStep(true);
    } else if (step === "confirm") {
      heading("Confirm your teacher profile", "");
    }
    if (focus) title.focus({ preventScroll: true });
  }
  function validate() {
    const step = steps[index]; clearError();
    if (step === "role" && !["student", "teacher"].includes(state.role)) { showError("Choose Student or Teacher to continue.", content.querySelector("input")); return false; }
    if (step === "name" && (state.full_name.trim().length < 2 || state.full_name.trim().length > 120)) { showError("Enter your name using 2 to 120 characters.", element("setup-full_name")); return false; }
    if (step === "age" && (!/^\d+$/.test(String(state.age)) || Number(state.age) < 5 || Number(state.age) > 120)) { showError("Enter your age as a whole number from 5 to 120.", element("setup-age")); return false; }
    if (step === "grade" && !/^(?:[1-9]|1[0-2])$/.test(state.grade)) { showError("Choose a grade from 1 to 12.", content.querySelector("input")); return false; }
    if (["board", "boards", "subjects"].includes(step) && (!picker || (Array.isArray(state[step]) ? !state[step].length : !state[step]))) { showError(`Choose ${step === "subjects" ? "at least one subject" : step === "boards" ? "at least one education board" : "an education board"} from the list.`); picker?.setInvalid(true); picker?.focus(); return false; }
    if (state.role === "teacher") {
      const invalidPage = (page, message, target) => {
        if (step === "confirm") { index = steps.indexOf(page); render(); }
        showError(message, target ? element(target) : null); return false;
      };
      if (["basic", "confirm"].includes(step)) {
        if (state.full_name.trim().length < 2) return invalidPage("basic", "Enter your full name.", "setup-full_name");
        if (!["male", "female", "non_binary", "prefer_not_to_say"].includes(state.gender)) return invalidPage("basic", "Select a gender option. You can choose Prefer not to say.", "teacherGender");
        if (!state.degree?.id || pendingFile || uploadError) return invalidPage("basic", "Upload your degree before continuing.", "degreeFile");
      }
      if (["preferences", "confirm"].includes(step)) {
        if (!state.teaching_personality.length || !state.subjects.length || !state.boards.length) return invalidPage("preferences", "Choose at least one personality, subject and board.");
        if (state.grade_min < 1 || state.grade_max > 12 || state.grade_min > state.grade_max) return invalidPage("preferences", "Choose a grade range between 1 and 12.");
      }
      if (["availability", "confirm"].includes(step)) {
        if (!state.preferred_days.length) return invalidPage("availability", "Choose at least one preferred day.");
        if (state.end_minutes - state.start_minutes < 15 || state.end_minutes - state.start_minutes > 120) return invalidPage("availability", "Choose a time range of 15 minutes to 2 hours.");
      }
    }
    return true;
  }
  async function advance() {
    if (busy || !validate()) return;
    steps = stepsForRole();
    if (index < steps.length - 1) { index++; render(); return; }
    const payload = state.role === "student" ? { role: "student", full_name: state.full_name.trim(), age: Number(state.age), grade: state.grade, board: state.board, school: state.school.trim() } : { role: "teacher", full_name: state.full_name.trim(), gender: state.gender, teaching_personality: [...state.teaching_personality], subjects: [...state.subjects], boards: [...state.boards], grade_min: state.grade_min, grade_max: state.grade_max, preferred_days: [...state.preferred_days], preferred_start_time: normalizedTime(state.start_minutes), preferred_end_time: normalizedTime(state.end_minutes), consent: true };
    setBusy(true); next.textContent = "Saving your profile…";
    try {
      const response = await root.TutorlyAuth.completeOnboarding(payload);
      if (response?.onboarding_required) throw new Error("Some profile details still need attention. Go back and check your answers.");
      root.location.replace(await root.TutorlyAuth.authenticatedDestination(response));
    } catch (failure) { if (isAuthError(failure)) signIn(); else showError(failure.message || "We couldn’t save your profile. Your answers are still here; please try again."); }
    finally { setBusy(false); next.textContent = state.role === "teacher" ? "Confirm" : "Start learning"; }
  }
  async function restore() {
    element("setupLoading").hidden = false; element("setupLoadError").hidden = true; form.hidden = true;
    try {
      const payload = await root.TutorlyAuth.currentUser();
      if (!payload?.user || payload.authenticated === false) { signIn(); return; }
      if (payload.onboarding_required === false || payload.user.onboarding_completed === true) { root.location.replace(await root.TutorlyAuth.authenticatedDestination(payload)); return; }
      const user = payload.user; const teacher = user.teacher_profile || {};
      loadedUserId = user.id;
      roleSelection = payload.role_selection_required === true || !["student", "teacher"].includes(user.role);
      Object.assign(state, { role: roleSelection ? "" : user.role, full_name: user.full_name || "", age: user.age == null ? "" : String(user.age), grade: user.grade ? String(user.grade) : "", board: user.board || "", school: user.school || "", subjects: Array.isArray(teacher.subjects) ? teacher.subjects : [], boards: Array.isArray(teacher.boards) ? teacher.boards : [], grade_min: Math.max(1, Math.min(12, Number(teacher.grade_min) || 1)), grade_max: Math.max(1, Math.min(12, Number(teacher.grade_max) || 12)), degree: teacher.degree || null });
      if (state.grade_max < state.grade_min) state.grade_max = state.grade_min;
      pendingFile = null; uploadError = ""; steps = roleSelection ? ["role", "name", "age", "grade", "board", "school"] : stepsForRole(); index = 0;
      element("setupLoading").hidden = true; form.hidden = false; render(false);
    } catch (failure) {
      if (isAuthError(failure)) { signIn(); return; }
      element("setupLoading").hidden = true; element("setupLoadError").hidden = false;
      element("setupLoadErrorText").textContent = failure.message || "The service is unavailable. Try again in a moment.";
    }
  }
  form.addEventListener("submit", (event) => { event.preventDefault(); advance(); });
  back.addEventListener("click", () => { if (!busy && index > 0) { index--; render(); } });
  skip.addEventListener("click", () => { if (!busy) { state.school = ""; advance(); } });
  element("setupRetry").addEventListener("click", restore);
  element("setupLogout").addEventListener("click", async () => {
    if (busy) return;
    element("setupLogout").disabled = true;
    try { await root.TutorlyAuth.logout(); revokePreview(); loadedUserId = ""; root.location.replace("login.html"); }
    catch (failure) { element("setupLogout").disabled = false; if (form.hidden) element("setupLoadErrorText").textContent = failure.message; else showError(failure.message || "We couldn’t sign you out. Try again."); }
  });
  root.addEventListener("pagehide", revokePreview);
  // An account switch in another tab must never submit this draft to a different user.
  root.addEventListener("storage", (event) => { if (event.key === "tutorly_session_token" && loadedUserId) root.location.reload(); });
  restore();
})(window);
