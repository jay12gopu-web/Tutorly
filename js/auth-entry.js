(function (root) {
  "use strict";

  const entry = document.getElementById("authEntry");
  if (!entry) return;
  const auth = root.TutorlyAuth;
  const emailForm = document.getElementById("emailForm");
  const codeForm = document.getElementById("codeForm");
  const passwordForm = document.getElementById("passwordForm");
  const email = document.getElementById("email");
  const code = document.getElementById("verificationCode");
  const password = document.getElementById("password");
  const back = document.getElementById("authBack");
  const title = document.getElementById("authTitle");
  const subtitle = document.getElementById("authSubtitle");
  const status = document.getElementById("authStatus");
  const resend = document.getElementById("resendCode");
  const social = entry.querySelector("[data-social-auth]");
  const controls = [...entry.querySelectorAll("form input, form button"), back];
  const cooldowns = new Map();
  let currentEmail = "";
  let step = "email";
  let busy = false;
  let timer;

  function setStatus(message, isError = false, field) {
    status.textContent = message;
    status.classList.toggle("error", isError);
    [email, code, password].forEach((input) => input.removeAttribute("aria-invalid"));
    if (isError && field) {
      field.setAttribute("aria-invalid", "true");
      field.focus();
    }
  }

  function safeError(error, action) {
    const message = String(error?.message || "");
    if (/too many incorrect/i.test(message)) return "Too many incorrect attempts. Please request a new code.";
    if (/too many|try again later/i.test(message)) return "Too many attempts. Please wait a while and try again.";
    if (/wait a minute/i.test(message)) return "Please wait a minute before requesting another code.";
    if (/expired/i.test(message) && action === "verify") return "That code has expired. Please request a new one.";
    if (/incorrect|invalid code/i.test(message) && action === "verify") return "That code is incorrect. Check all 6 digits and try again.";
    if (/incorrect|not found|not exist|password/i.test(message) && action === "password") return "We couldn’t sign you in with those details. Try again or use an email code.";
    if (/updating/i.test(message)) return "Sign-in is being updated. Please try again in a few minutes.";
    if (/unavailable|fetch|network|send the code/i.test(message)) return "We couldn’t reach the sign-in service. Please try again shortly.";
    if (action === "send") return "We couldn’t send your code. Please try again.";
    return "We couldn’t complete sign-in. Please try again.";
  }

  function updateCooldown() {
    const remaining = Math.max(0, Math.ceil(((cooldowns.get(currentEmail) || 0) - Date.now()) / 1000));
    resend.textContent = remaining ? `Resend in ${remaining}s` : "Resend code";
    resend.disabled = busy || remaining > 0;
    if (!remaining && timer) { root.clearInterval(timer); timer = undefined; }
  }

  function beginCooldown(seconds = 60) {
    cooldowns.set(currentEmail, Date.now() + seconds * 1000);
    if (timer) root.clearInterval(timer);
    timer = root.setInterval(updateCooldown, 1000);
    updateCooldown();
  }

  function setBusy(value) {
    busy = value;
    entry.setAttribute("aria-busy", String(value));
    controls.forEach((control) => { control.disabled = value; });
    updateCooldown();
  }

  function showStep(nextStep, focus = true) {
    step = nextStep;
    emailForm.hidden = step !== "email";
    codeForm.hidden = step !== "code";
    passwordForm.hidden = step !== "password";
    back.hidden = step === "email";
    social.hidden = step !== "email";
    social.dataset.authStep = step;
    setStatus("");
    if (step === "email") {
      title.textContent = "Welcome Back";
      subtitle.textContent = "Your next chapter starts here.";
    } else if (step === "code") {
      title.textContent = "Verify your email";
      subtitle.textContent = `Enter the 6-digit code for ${currentEmail}.`;
    } else {
      title.textContent = "Enter your password";
      subtitle.textContent = `Continue as ${currentEmail}.`;
      document.getElementById("passwordEmail").value = currentEmail;
    }
    updateCooldown();
    if (focus) ({ email, code, password })[step].focus();
  }

  async function completeLogin(payload) {
    const destination = payload.onboarding_required ? "info.html" : await auth.authenticatedDestination(payload);
    root.location.replace(destination);
  }

  async function sendCode() {
    if (busy) return;
    showStep("code", false);
    if ((cooldowns.get(currentEmail) || 0) > Date.now()) {
      setStatus("A code was recently requested. Check your inbox, or resend when the timer ends.");
      code.focus();
      return;
    }
    setBusy(true);
    setStatus("Sending your code…");
    try {
      const payload = await auth.requestOtp(currentEmail);
      beginCooldown();
      const minutes = Number(payload?.expires_in) > 0 ? Math.ceil(Number(payload.expires_in) / 60) : 10;
      document.getElementById("codeHelp").textContent = `Your code expires in ${minutes} minutes. Check your spam folder too.`;
      setStatus(`Code sent to ${currentEmail}.`);
    } catch (error) {
      if (/wait a minute|too many code requests/i.test(String(error?.message || ""))) beginCooldown();
      setStatus(safeError(error, "send"), true);
    } finally {
      setBusy(false);
      code.focus();
    }
  }

  emailForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (busy) return;
    email.value = email.value.trim();
    if (!email.value || !email.validity.valid) {
      setStatus("Enter a valid email address to continue.", true, email);
      return;
    }
    currentEmail = email.value.toLowerCase();
    code.value = "";
    password.value = "";
    sendCode();
  });

  codeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    const value = code.value.replace(/\s/g, "");
    if (!/^\d{6}$/.test(value)) {
      setStatus("Enter the complete 6-digit code from your email.", true, code);
      return;
    }
    setBusy(true);
    setStatus("Verifying your code…");
    try {
      const payload = await auth.verifyOtp(currentEmail, value);
      setStatus("You’re signed in. Getting your space ready…");
      await completeLogin(payload);
    } catch (error) {
      setBusy(false);
      setStatus(safeError(error, "verify"), true, code);
    }
  });

  passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    if (!password.value) {
      setStatus("Enter your password, or use an email code instead.", true, password);
      return;
    }
    setBusy(true);
    setStatus("Signing you in…");
    try {
      const payload = await auth.passwordLogin(currentEmail, password.value);
      setStatus("You’re signed in. Getting your space ready…");
      await completeLogin(payload);
    } catch (error) {
      setBusy(false);
      setStatus(safeError(error, "password"), true, password);
    }
  });

  code.addEventListener("input", () => { code.value = code.value.replace(/[^0-9]/g, "").slice(0, 6); });
  [email, code, password].forEach((input) => input.addEventListener("input", () => {
    if (input.hasAttribute("aria-invalid")) setStatus("");
  }));
  resend.addEventListener("click", sendCode);
  document.getElementById("usePassword").addEventListener("click", () => { if (!busy) showStep("password"); });
  document.getElementById("useCode").addEventListener("click", () => { if (!busy) showStep("code"); });
  back.addEventListener("click", () => {
    if (busy) return;
    password.value = "";
    showStep(step === "password" ? "code" : "email");
  });
  document.getElementById("togglePassword").addEventListener("click", (event) => {
    const show = password.type === "password";
    password.type = show ? "text" : "password";
    event.currentTarget.textContent = show ? "Hide" : "Show";
    event.currentTarget.setAttribute("aria-label", show ? "Hide password" : "Show password");
    event.currentTarget.setAttribute("aria-pressed", String(show));
  });
  root.addEventListener("tutorly:oauth-state", (event) => setBusy(Boolean(event.detail?.pending)));
  root.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    setBusy(false);
    if ((cooldowns.get(currentEmail) || 0) > Date.now()) timer = root.setInterval(updateCooldown, 1000);
  });
  root.addEventListener("pagehide", () => {
    if (timer) root.clearInterval(timer);
    timer = undefined;
    password.value = "";
  });

  if (!auth) {
    setBusy(true);
    setStatus("The sign-in page couldn’t load. Refresh the page to try again.", true);
  }
})(window);
