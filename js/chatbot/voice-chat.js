(function (root) {
  "use strict";

  const VOICE_CONFIG = root.TutorlyVoiceConfig || null;

  const LANGUAGES = Object.freeze([
    { value: "auto", label: "Auto-detect", bcp: "" },
    { value: "en-US", label: "English", bcp: "en-US" },
    { value: "hi-IN", label: "Hindi", bcp: "hi-IN" },
    { value: "te-IN", label: "Telugu", bcp: "te-IN" },
    { value: "ta-IN", label: "Tamil", bcp: "ta-IN" },
    { value: "bn-IN", label: "Bengali", bcp: "bn-IN" },
    { value: "mr-IN", label: "Marathi", bcp: "mr-IN" },
    { value: "es-ES", label: "Spanish", bcp: "es-ES" },
    { value: "fr-FR", label: "French", bcp: "fr-FR" },
    { value: "de-DE", label: "German", bcp: "de-DE" }
  ]);

  const CONFIG = Object.freeze({
    calibrationMs: 750,
    silenceMs: 1250,
    maxUtteranceMs: 20000,
    startFrames: 8,
    bargeFrames: 18,
    minimumVoiceFrames: 14,
    minimumUtteranceMs: 320,
    echoGuardMs: 1400,
    thinkingTimeoutMs: 60000,
    voiceBandMinHz: 85,
    voiceBandMaxHz: 4200,
    analysisMaxHz: 8000,
    minimumVoiceBandRatio: 0.56,
    minimumZeroCrossingRate: 0.008,
    maximumZeroCrossingRate: 0.34
  });

  const STATE_COPY = Object.freeze({
    idle: ["Voice Chat", ""],
    connecting: ["Getting ready…", "Checking your microphone."],
    listening: ["I’m listening…", "What’s on your mind?"],
    "user-speaking": ["I’m listening…", "Go ahead — I’m with you."],
    processing: ["Thinking…", "Working through that."],
    speaking: ["Speaking…", "You can interrupt anytime."],
    muted: ["You’re muted.", "Turn your mic back on when you’re ready."],
    error: ["Couldn’t connect to Voice Chat.", "Please try again."],
    closed: ["Voice chat", ""]
  });

  const GREETINGS = Object.freeze({
    "en-US": "Hi — I’m Tutorly. Just talk to me and I’ll listen and reply. What would you like to learn today?",
    "hi-IN": "नमस्ते — मैं ट्यूटरली हूँ। बस मुझसे बात करो, मैं सुनूँगा और जवाब दूँगा। आज तुम क्या सीखना चाहोगे?",
    "te-IN": "నమస్తే — నేను ట్యూటర్లీ. నాతో మాట్లాడండి, నేను విని సమాధానం చెబుతాను. ఈ రోజు మీరు ఏమి నేర్చుకోవాలనుకుంటున్నారు?",
    "ta-IN": "வணக்கம் — நான் டியூட்டர்லி. என்னிடம் பேசுங்கள், நான் கேட்டு பதிலளிப்பேன். இன்று என்ன கற்க விரும்புகிறீர்கள்?",
    "bn-IN": "নমস্কার — আমি টিউটরলি। আমার সঙ্গে কথা বলো, আমি শুনে উত্তর দেব। আজ তুমি কী শিখতে চাও?",
    "mr-IN": "नमस्कार — मी ट्यूटरली आहे. माझ्याशी बोला, मी ऐकून उत्तर देईन. आज तुम्हाला काय शिकायचे आहे?",
    "es-ES": "Hola, soy Tutorly. Háblame y te escucharé y responderé. ¿Qué quieres aprender hoy?",
    "fr-FR": "Salut, je suis Tutorly. Parle-moi, je t’écoute et je te réponds. Que veux-tu apprendre aujourd’hui ?",
    "de-DE": "Hallo, ich bin Tutorly. Sprich mit mir, ich höre zu und antworte. Was möchtest du heute lernen?"
  });

  function normalizeLanguage(value) {
    const raw = String(value || "").trim();
    return LANGUAGES.some((item) => item.value === raw) ? raw : "auto";
  }

  function shortLanguage(value) {
    const normalized = normalizeLanguage(value);
    return normalized === "auto" ? "auto" : normalized.split("-", 1)[0].toLowerCase();
  }

  function speechLanguage(value, detectedLanguage) {
    const normalized = normalizeLanguage(value);
    if (normalized !== "auto") return normalized;
    const detected = String(detectedLanguage || "").toLowerCase().split("-", 1)[0];
    return LANGUAGES.find((item) => item.value.toLowerCase().startsWith(`${detected}-`))?.bcp || "en-US";
  }

  function cleanForSpeech(markdown, spokenAnswer) {
    const supplied = String(spokenAnswer || "").trim();
    if (supplied) return supplied.replace(/\s+/g, " ").trim().slice(0, 700);
    const source = String(markdown || "");
    if (/```writing\b/i.test(source)) {
      return "I’ve put the finished writing on screen so you can read or copy it there.";
    }
    return source
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/\$\$[\s\S]*?\$\$/g, " ")
      .replace(/^\s*\|.*\|\s*$/gm, " ")
      .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\$([^$]+)\$/g, "$1")
      .replace(/[#*_>~]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 520);
  }

  function friendlyVoiceError(status) {
    if (status === 429) return "Voice is busy for a moment. Please try again shortly.";
    if (status === 504) return "That took too long to transcribe. Try a shorter sentence.";
    if (status === 400 || status === 413 || status === 422) return "I couldn’t hear that clearly. Try saying it again.";
    return "Voice transcription is temporarily unavailable. You can still type your question.";
  }

  function create(options = {}) {
    const overlay = options.overlay || document.getElementById("voiceChatOverlay");
    if (!overlay) return null;
    const inline = options.inline === true;

    const stateLabel = overlay.querySelector("#voiceSessionState");
    const stateHint = overlay.querySelector("#voiceSessionHint");
    const transcriptNode = overlay.querySelector("#voiceSessionTranscript");
    const replyNode = overlay.querySelector("#voiceSessionReply");
    const languageSelect = overlay.querySelector("#voiceSessionLanguage");
    const closeButton = overlay.querySelector("#voiceSessionClose");
    const muteButton = overlay.querySelector("#voiceSessionMute");
    const photoButton = overlay.querySelector("#voiceSessionPhoto");
    const imageStatus = overlay.querySelector("#voiceSessionImageStatus");
    const orb = overlay.querySelector(".voice-session-orb");
    const announcer = overlay.querySelector("#voiceSessionAnnouncer");
    const errorActions = overlay.querySelector("#voiceSessionErrorActions");
    const enableMicButton = overlay.querySelector("#voiceSessionEnableMic");
    const retryButton = overlay.querySelector("#voiceSessionRetry");
    const chooseVoiceButton = overlay.querySelector("#voiceSessionChooseVoice");
    const exitButton = overlay.querySelector("#voiceSessionExit");
    const settingsOpenButton = overlay.querySelector("#voiceSettingsOpen");
    const settingsBackdrop = overlay.querySelector("#voiceSettingsBackdrop");
    const settingsCloseButton = overlay.querySelector("#voiceSettingsClose");
    const voiceSelector = overlay.querySelector(".voice-selector");
    const voiceVisual = overlay.querySelector("#voiceSelectorVisual");
    const voiceName = overlay.querySelector("#voiceSelectorName");
    const voiceDescription = overlay.querySelector("#voiceSelectorDescription");
    const voicePrevious = overlay.querySelector("#voiceSelectorPrevious");
    const voiceNext = overlay.querySelector("#voiceSelectorNext");
    const voiceDots = overlay.querySelector("#voiceSelectorDots");
    const voiceSelectorNote = overlay.querySelector("#voiceSelectorNote");
    const intelligenceSelect = overlay.querySelector("#voiceIntelligenceSelect");
    const onboardingBackdrop = overlay.querySelector("#voiceOnboardingBackdrop");
    const onboardingModal = overlay.querySelector("#voiceOnboardingModal");
    const onboardingGrid = overlay.querySelector("#voiceOnboardingGrid");
    const onboardingContinue = overlay.querySelector("#voiceOnboardingContinue");
    const onboardingExit = overlay.querySelector("#voiceOnboardingExit");
    const onboardingSaveError = overlay.querySelector("#voiceOnboardingSaveError");

    if (languageSelect && !languageSelect.options.length) {
      LANGUAGES.forEach((item) => {
        const option = document.createElement("option");
        option.value = item.value;
        option.textContent = item.label;
        languageSelect.appendChild(option);
      });
    }

    let open = false;
    let state = "closed";
    let mode = "voice";
    let stream = null;
    let audioContext = null;
    let analyser = null;
    let timeData = null;
    let frequencyData = null;
    let recorder = null;
    let chunks = [];
    let animationFrame = null;
    let transcriptionController = null;
    let responseTimer = null;
    let speechPulseTimer = null;
    let speaking = false;
    let speakingStartedAt = 0;
    let speechToken = 0;
    let startFrameCount = 0;
    let bargeFrameCount = 0;
    let utteranceVoiceFrames = 0;
    let utteranceStartedAt = 0;
    let lastVoiceAt = 0;
    let noiseFloor = 0.008;
    let speechThreshold = 0.022;
    let bargeThreshold = 0.06;
    let speakerEchoFloor = 0.008;
    let detectedLanguage = "en";
    let returnFocus = null;
    let providerSession = null;
    let providerVolumeFrame = null;
    let providerQuietFrames = 0;
    let muted = false;
    let settingsOpen = false;
    let settingsReturnFocus = null;
    let voiceIndex = 0;
    let activeVoice = null;
    let pendingOnboardingVoice = null;
    let onboardingOpen = false;
    let errorKind = "connection";

    function notify(message) {
      if (typeof options.onNotice === "function") options.onNotice(message);
    }

    function announce(message) {
      if (!announcer || !message || announcer.textContent === message) return;
      announcer.textContent = "";
      root.setTimeout(() => { if (announcer) announcer.textContent = message; }, 20);
    }

    function studentFirstName() {
      const value = String(options.getStudentName?.() || "").trim().split(/\s+/, 1)[0] || "";
      return /^[\p{L}'-]{1,32}$/u.test(value) ? value : "";
    }

    function setState(next, hintOverride = "", titleOverride = "") {
      const safeNext = muted && !["closed", "connecting", "error"].includes(next) ? "muted" : next;
      const previous = state;
      state = safeNext;
      overlay.dataset.voiceState = safeNext;
      const copy = STATE_COPY[safeNext] || STATE_COPY.error;
      const listeningName = safeNext === "listening" ? studentFirstName() : "";
      const label = titleOverride || (listeningName ? `I’m listening, ${listeningName}…` : copy[0]);
      const hint = hintOverride || copy[1];
      if (stateLabel) stateLabel.textContent = label;
      if (stateHint) stateHint.textContent = hint;
      if (errorActions) errorActions.hidden = safeNext !== "error";
      if (safeNext !== "error") {
        if (enableMicButton) enableMicButton.hidden = true;
        if (retryButton) retryButton.hidden = false;
      }
      if (previous !== safeNext && !["idle", "closed"].includes(safeNext)) announce(label);
      options.onStateChange?.(safeNext, { label, hint });
    }

    function showError(kind = "connection", hint = "", title = "") {
      errorKind = kind;
      const permission = kind === "microphone";
      const microphoneUnavailable = kind === "microphone-unavailable";
      if (enableMicButton) enableMicButton.hidden = !permission;
      if (retryButton) retryButton.hidden = permission;
      if (chooseVoiceButton) chooseVoiceButton.hidden = kind !== "connection" || !activeVoice;
      setState(
        "error",
        hint || (permission ? "Allow microphone access to start Voice Chat." : microphoneUnavailable ? "Connect a microphone and try again." : "Check your connection and try again."),
        title || (permission ? "Microphone access is off." : microphoneUnavailable ? "Microphone unavailable." : "Couldn’t connect to Voice Chat.")
      );
    }

    function renderVoiceSelection(options = {}) {
      const voices = VOICE_CONFIG?.VOICES || [];
      if (!voices.length) return;
      voiceIndex = (voiceIndex + voices.length) % voices.length;
      const voice = voices[voiceIndex];
      const apply = () => {
        if (voiceName) voiceName.textContent = voice.name;
        if (voiceDescription) voiceDescription.textContent = voice.description;
        if (voiceVisual) {
          voiceVisual.style.setProperty("--voice-color-a", voice.colors?.[0] || "#2377ff");
          voiceVisual.style.setProperty("--voice-color-b", voice.colors?.[1] || "#694cff");
          voiceVisual.style.setProperty("--voice-color-c", voice.colors?.[2] || "#25c6ff");
        }
        if (voiceDots) {
          voiceDots.setAttribute("aria-label", `Voice ${voiceIndex + 1} of ${voices.length}: ${voice.name}`);
          voiceDots.querySelectorAll(".voice-selector-dot").forEach((dot, index) => {
            dot.classList.toggle("active", index === voiceIndex);
          });
        }
        if (voiceSelectorNote) {
          voiceSelectorNote.textContent = activeVoice?.key === voice.key
            ? "Current voice"
            : `Selected for your next session${activeVoice ? ` · ${activeVoice.name} is speaking now` : ""}`;
        }
        if (options.save) saveVoicePreference(voice.key, true, { notifyFailure: true });
        if (options.announce !== false) announce(`Voice selected: ${voice.name}`);
        voiceSelector?.classList.remove("is-changing");
      };
      if (options.animate === false) apply();
      else {
        voiceSelector?.classList.add("is-changing");
        root.setTimeout(apply, 120);
      }
    }

    function initializeVoiceSettings() {
      const voices = VOICE_CONFIG?.VOICES || [];
      const preferred = VOICE_CONFIG?.getVoice?.();
      voiceIndex = Math.max(0, voices.findIndex((voice) => voice.key === preferred?.key));
      if (voiceDots && !voiceDots.children.length) {
        voices.forEach((voice, index) => {
          const dot = document.createElement("span");
          dot.className = "voice-selector-dot";
          dot.setAttribute("aria-hidden", "true");
          dot.dataset.voice = voice.key;
          if (index === voiceIndex) dot.classList.add("active");
          voiceDots.appendChild(dot);
        });
      }
      renderVoiceSelection({ animate: false, announce: false });
      if (intelligenceSelect) {
        intelligenceSelect.value = VOICE_CONFIG?.getIntelligence?.().key || "standard";
        const deepOption = intelligenceSelect.querySelector('option[value="deep"]');
        const deepCost = root.TutorlyPlanConfig?.CREDIT_COSTS?.deepSolve;
        if (deepOption && deepCost?.available && Number.isFinite(Number(deepCost.credits))) {
          deepOption.textContent = `${deepCost.label} · ${deepCost.credits} credits`;
        }
      }
    }

    async function loadVoicePreference() {
      try {
        const preference = await options.getVoicePreference?.();
        const key = VOICE_CONFIG?.normalizeVoice?.(preference?.preferred_voice_agent);
        if (key && preference?.voice_onboarding_completed === true) {
          VOICE_CONFIG?.saveLocalPreference?.(key, true);
          return { preferred_voice_agent: key, voice_onboarding_completed: true };
        }
        if (preference) return { preferred_voice_agent: "", voice_onboarding_completed: false };
      } catch (_error) {
        notify("Tutorly couldn’t load your saved voice. You can choose it again.");
      }
      return VOICE_CONFIG?.getLocalPreference?.() || { preferred_voice_agent: "", voice_onboarding_completed: false };
    }

    async function saveVoicePreference(key, completed = true, saveOptions = {}) {
      const voice = VOICE_CONFIG?.getVoice?.(key);
      if (!voice) return { saved: false, voice: null };
      VOICE_CONFIG?.saveLocalPreference?.(voice.key, completed);
      try {
        await options.saveVoicePreference?.(voice.key, completed);
        return { saved: true, voice };
      } catch (_error) {
        if (saveOptions.notifyFailure) {
          notify(`${voice.name} will be used now, but Tutorly couldn’t save it to your account.`);
        }
        return { saved: false, voice };
      }
    }

    function selectOnboardingVoice(key, focus = false) {
      const voice = VOICE_CONFIG?.getVoice?.(key);
      if (!voice) return;
      pendingOnboardingVoice = voice;
      onboardingGrid?.querySelectorAll(".voice-onboarding-card").forEach((card) => {
        const selected = card.dataset.voice === voice.key;
        const cardVoice = VOICE_CONFIG?.getVoice?.(card.dataset.voice);
        card.setAttribute("aria-checked", String(selected));
        if (cardVoice) card.setAttribute("aria-label", `${cardVoice.name}. ${cardVoice.description}. ${selected ? "Selected" : "Not selected"}.`);
        card.tabIndex = selected ? 0 : -1;
        if (selected && focus) card.focus();
      });
      if (onboardingContinue) {
        onboardingContinue.disabled = false;
        onboardingContinue.textContent = `Continue with ${voice.name}`;
        onboardingContinue.setAttribute("aria-label", `Continue with ${voice.name}`);
      }
      if (onboardingSaveError) onboardingSaveError.hidden = true;
      announce(`${voice.name} selected`);
    }

    function renderOnboardingGrid() {
      const voices = VOICE_CONFIG?.VOICES || [];
      if (!onboardingGrid || onboardingGrid.children.length || !voices.length) return;
      [{ key: "boy", label: "Boys" }, { key: "girl", label: "Girls" }].forEach((group) => {
        const section = document.createElement("section");
        section.className = "voice-onboarding-group";
        const label = document.createElement("p");
        label.className = "voice-onboarding-group-label";
        label.textContent = group.label;
        const grid = document.createElement("div");
        grid.className = "voice-onboarding-group-grid";
        voices.filter((voice) => voice.genderGroup === group.key).forEach((voice) => {
          const card = document.createElement("button");
          card.type = "button";
          card.className = "voice-onboarding-card";
          card.dataset.voice = voice.key;
          card.setAttribute("role", "radio");
          card.setAttribute("aria-checked", "false");
          card.setAttribute("aria-label", `${voice.name}. ${voice.description}. Not selected.`);
          card.tabIndex = -1;
          const colors = voice.colors || [];
          card.innerHTML = `<span class="voice-onboarding-card-check" aria-hidden="true">✓</span><span class="voice-onboarding-avatar" aria-hidden="true" style="--voice-color-a:${colors[0] || "#2377ff"};--voice-color-b:${colors[1] || "#694cff"};--voice-color-c:${colors[2] || "#25c6ff"}"></span><strong>${voice.name}</strong><small>${voice.description}</small>`;
          card.addEventListener("click", () => selectOnboardingVoice(voice.key));
          card.addEventListener("keydown", (event) => {
            if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
            event.preventDefault();
            const current = voices.findIndex((item) => item.key === voice.key);
            const delta = ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1;
            selectOnboardingVoice(voices[(current + delta + voices.length) % voices.length].key, true);
          });
          grid.appendChild(card);
        });
        section.append(label, grid);
        onboardingGrid.appendChild(section);
      });
      const firstCard = onboardingGrid.querySelector(".voice-onboarding-card");
      if (firstCard) firstCard.tabIndex = 0;
    }

    function setOnboardingOpen(next) {
      if (!onboardingBackdrop) return;
      onboardingOpen = !!next;
      overlay.classList.toggle("voice-onboarding-open", onboardingOpen);
      onboardingBackdrop.hidden = !onboardingOpen;
      onboardingBackdrop.setAttribute("aria-hidden", String(!onboardingOpen));
      [closeButton, muteButton, settingsOpenButton].forEach((button) => { if (button) button.disabled = onboardingOpen; });
      if (onboardingOpen) {
        setSettingsOpen(false);
        pendingOnboardingVoice = null;
        if (onboardingContinue) {
          onboardingContinue.disabled = true;
          onboardingContinue.textContent = "Choose a voice to continue";
        }
        onboardingGrid?.querySelectorAll(".voice-onboarding-card").forEach((card, index) => {
          const cardVoice = VOICE_CONFIG?.getVoice?.(card.dataset.voice);
          card.setAttribute("aria-checked", "false");
          if (cardVoice) card.setAttribute("aria-label", `${cardVoice.name}. ${cardVoice.description}. Not selected.`);
          card.tabIndex = index === 0 ? 0 : -1;
        });
        root.setTimeout(() => onboardingModal?.focus(), 30);
      }
    }

    function setSettingsOpen(next) {
      if (!settingsBackdrop || !settingsOpenButton) return;
      const shouldOpen = !!next;
      if (settingsOpen === shouldOpen) return;
      settingsOpen = shouldOpen;
      settingsOpenButton.setAttribute("aria-expanded", String(shouldOpen));
      if (shouldOpen) {
        settingsReturnFocus = document.activeElement;
        settingsBackdrop.hidden = false;
        settingsBackdrop.setAttribute("aria-hidden", "false");
        root.requestAnimationFrame(() => settingsBackdrop.classList.add("show"));
        root.setTimeout(() => settingsCloseButton?.focus(), 30);
        announce("Settings opened");
      } else {
        settingsBackdrop.classList.remove("show");
        settingsBackdrop.setAttribute("aria-hidden", "true");
        root.setTimeout(() => { if (!settingsOpen) settingsBackdrop.hidden = true; }, 210);
        announce("Settings closed");
        settingsReturnFocus?.focus?.();
        settingsReturnFocus = null;
      }
    }

    function setTranscript(text) {
      if (!transcriptNode) return;
      transcriptNode.textContent = text ? `You: “${text}”` : "";
      transcriptNode.hidden = !text;
    }

    function setReply(text) {
      if (!replyNode) return;
      replyNode.textContent = text ? `Tutorly: ${text}` : "";
      replyNode.hidden = !text;
    }

    function cancelResponseTimer() {
      root.clearTimeout(responseTimer);
      responseTimer = null;
    }

    function cancelTranscription() {
      transcriptionController?.abort();
      transcriptionController = null;
    }

    function cancelSpeech() {
      speechToken += 1;
      root.clearTimeout(speechPulseTimer);
      speechPulseTimer = null;
      orb?.style.setProperty("--speech-level", "0");
      try { root.speechSynthesis?.cancel(); } catch (error) {}
      speaking = false;
    }

    function stopRecorder() {
      if (recorder && recorder.state !== "inactive") {
        try { recorder.stop(); } catch (error) {}
      }
    }

    function releaseAudio() {
      if (animationFrame) root.cancelAnimationFrame(animationFrame);
      animationFrame = null;
      stopRecorder();
      recorder = null;
      chunks = [];
      try { stream?.getTracks().forEach((track) => track.stop()); } catch (error) {}
      try { audioContext?.close(); } catch (error) {}
      stream = null;
      audioContext = null;
      analyser = null;
      timeData = null;
      frequencyData = null;
    }

    function stopProviderSession() {
      if (providerVolumeFrame) root.cancelAnimationFrame(providerVolumeFrame);
      providerVolumeFrame = null;
      providerQuietFrames = 0;
      const session = providerSession;
      providerSession = null;
      if (session) Promise.resolve(session.end?.()).catch(() => {});
      orb?.style.setProperty("--voice-level", "0");
      orb?.style.setProperty("--speech-level", "0");
    }

    async function setMuted(next) {
      if (!open) return;
      const shouldMute = !!next;
      if (muted === shouldMute) return;
      muted = shouldMute;
      if (muteButton) {
        muteButton.setAttribute("aria-pressed", String(muted));
        muteButton.setAttribute("aria-label", muted ? "Unmute microphone" : "Mute microphone");
        muteButton.title = muted ? "Unmute microphone" : "Mute microphone";
      }
      try { stream?.getAudioTracks?.().forEach((track) => { track.enabled = !muted; }); } catch (_error) {}
      try { await Promise.resolve(providerSession?.setMicMuted?.(muted)); } catch (_error) {
        notify("Tutorly couldn’t change the microphone state. Please try again.");
      }
      if (muted) {
        stopRecorder();
        startFrameCount = 0;
        bargeFrameCount = 0;
        setState("muted");
        announce("Microphone muted");
      } else {
        setState(speaking ? "speaking" : "listening");
        announce("Microphone active");
      }
    }

    async function updateProviderVolume() {
      if (!open || !providerSession) return;
      try {
        const [inputLevel, outputLevel] = await Promise.all([
          Promise.resolve(providerSession.getInputVolume?.() || 0),
          Promise.resolve(providerSession.getOutputVolume?.() || 0)
        ]);
        const input = Math.max(0, Math.min(1, Number(inputLevel) || 0));
        const output = Math.max(0, Math.min(1, Number(outputLevel) || 0));
        orb?.style.setProperty("--voice-level", (muted ? 0 : input).toFixed(3));
        orb?.style.setProperty("--speech-level", output.toFixed(3));
        if (!muted && !speaking && ["listening", "user-speaking"].includes(state)) {
          if (input >= 0.075) {
            providerQuietFrames = 0;
            if (state !== "user-speaking") setState("user-speaking");
          } else if (state === "user-speaking") {
            providerQuietFrames += 1;
            if (providerQuietFrames >= 10) {
              providerQuietFrames = 0;
              setState("listening");
            }
          }
        }
      } catch (error) {}
      if (open && providerSession) providerVolumeFrame = root.requestAnimationFrame(updateProviderVolume);
    }

    function close() {
      if (!open && overlay.hidden) return;
      open = false;
      setOnboardingOpen(false);
      setSettingsOpen(false);
      muted = false;
      if (muteButton) {
        muteButton.setAttribute("aria-pressed", "false");
        muteButton.setAttribute("aria-label", "Mute microphone");
        muteButton.title = "Mute microphone";
      }
      setState("closed");
      cancelResponseTimer();
      cancelTranscription();
      cancelSpeech();
      stopProviderSession();
      releaseAudio();
      activeVoice = null;
      overlay.classList.remove("show");
      overlay.setAttribute("aria-hidden", "true");
      document.body.classList.remove("voice-session-open");
      root.setTimeout(() => { if (!open) overlay.hidden = true; }, 180);
      if (typeof options.onClose === "function") options.onClose();
      returnFocus?.focus?.();
      returnFocus = null;
    }

    function audioFeatures() {
      if (!analyser || !timeData || !frequencyData || !audioContext) {
        return { rms: 0, voiceRatio: 0, zeroCrossingRate: 0, voiceLike: false };
      }

      analyser.getFloatTimeDomainData(timeData);
      analyser.getFloatFrequencyData(frequencyData);
      let sum = 0;
      let crossings = 0;
      for (let index = 0; index < timeData.length; index += 1) {
        const sample = timeData[index];
        sum += sample * sample;
        if (index > 0 && (sample >= 0) !== (timeData[index - 1] >= 0)) crossings += 1;
      }
      const rms = Math.sqrt(sum / timeData.length);
      const zeroCrossingRate = crossings / Math.max(1, timeData.length - 1);
      const hzPerBin = audioContext.sampleRate / analyser.fftSize;
      let voiceEnergy = 0;
      let analyzedEnergy = 0;
      for (let index = 1; index < frequencyData.length; index += 1) {
        const frequency = index * hzPerBin;
        if (frequency > CONFIG.analysisMaxHz) break;
        const decibels = frequencyData[index];
        if (!Number.isFinite(decibels)) continue;
        const power = Math.pow(10, decibels / 10);
        analyzedEnergy += power;
        if (frequency >= CONFIG.voiceBandMinHz && frequency <= CONFIG.voiceBandMaxHz) voiceEnergy += power;
      }
      const voiceRatio = analyzedEnergy > 0 ? voiceEnergy / analyzedEnergy : 0;
      const voiceLike = (
        voiceRatio >= CONFIG.minimumVoiceBandRatio
        && zeroCrossingRate >= CONFIG.minimumZeroCrossingRate
        && zeroCrossingRate <= CONFIG.maximumZeroCrossingRate
      );
      return { rms, voiceRatio, zeroCrossingRate, voiceLike };
    }

    function updateOrb(features) {
      if (!orb) return;
      const strength = muted ? 0 : Math.max(0, Math.min(1, (features.rms - noiseFloor) / Math.max(speechThreshold * 2, 0.04)));
      orb.style.setProperty("--voice-level", strength.toFixed(3));
    }

    async function transcribe(blob, mimeType) {
      if (!open) return;
      cancelTranscription();
      const controller = new AbortController();
      transcriptionController = controller;
      setState("processing", "Turning your question into text…");
      const form = new FormData();
      const extension = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "webm";
      form.append("audio", blob, `voice.${extension}`);
      form.append("language", shortLanguage(languageSelect?.value || "auto"));
      form.append("session_id", String(options.getSessionId?.() || "voice-guest"));
      try {
        const response = await fetch(options.getTranscriptionEndpoint(), {
          method: "POST",
          body: form,
          signal: controller.signal
        });
        if (!response.ok) throw Object.assign(new Error("transcription_failed"), { status: response.status });
        const payload = await response.json();
        const text = String(payload.text || "").trim();
        if (!text) {
          setState("listening", "I didn’t catch words there. Try again when you’re ready.");
          return;
        }
        if (languageSelect?.value === "auto" && payload.language) {
          detectedLanguage = String(payload.language).toLowerCase().split("-", 1)[0];
        }
        setTranscript(text);
        setState("processing");
        cancelResponseTimer();
        responseTimer = root.setTimeout(() => {
          if (open && state === "processing") setState("listening", "That response took too long. Ask again when you’re ready.");
        }, CONFIG.thinkingTimeoutMs);
        await Promise.resolve(options.onTranscript?.(text, {
          mode,
          language: languageSelect?.value || "auto",
          detectedLanguage
        }));
      } catch (error) {
        if (error.name === "AbortError" || !open) return;
        const message = friendlyVoiceError(error.status);
        notify(message);
        setState("listening", message);
      } finally {
        if (transcriptionController === controller) transcriptionController = null;
      }
    }

    function startRecorder() {
      if (!open || muted || !stream || recorder?.state === "recording") return;
      const types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
      const mimeType = types.find((type) => root.MediaRecorder?.isTypeSupported?.(type)) || "";
      try {
        recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      } catch (error) {
        showError("microphone-unavailable", "This browser cannot record microphone audio for Voice Chat.");
        return;
      }
      chunks = [];
      utteranceVoiceFrames = 0;
      utteranceStartedAt = performance.now();
      lastVoiceAt = utteranceStartedAt;
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data?.size) chunks.push(event.data);
      });
      recorder.addEventListener("stop", () => {
        const duration = performance.now() - utteranceStartedAt;
        const enoughVoice = utteranceVoiceFrames >= CONFIG.minimumVoiceFrames;
        const blob = new Blob(chunks, { type: recorder?.mimeType || mimeType || "audio/webm" });
        chunks = [];
        recorder = null;
        startFrameCount = 0;
        if (!open) return;
        if (muted) {
          setState("muted");
          return;
        }
        if (!enoughVoice || duration < CONFIG.minimumUtteranceMs || blob.size < 1500) {
          setState("listening", "I’m waiting for your voice—not just background noise.");
          return;
        }
        transcribe(blob, blob.type);
      }, { once: true });
      recorder.start(200);
    }

    function interruptCurrentTurn(now) {
      if (muted) return;
      cancelSpeech();
      cancelResponseTimer();
      cancelTranscription();
      options.onInterrupt?.();
      setState("listening", "Go ahead—I’m listening to the interruption.");
      startRecorder();
      lastVoiceAt = now;
      utteranceVoiceFrames = CONFIG.startFrames;
      bargeFrameCount = 0;
    }

    function tick() {
      if (!open) return;
      const features = audioFeatures();
      updateOrb(features);
      if (muted) {
        animationFrame = root.requestAnimationFrame(tick);
        return;
      }
      const now = performance.now();
      const processingThreshold = Math.max(bargeThreshold, noiseFloor * 5.2);
      const speakingThreshold = Math.max(bargeThreshold, speakerEchoFloor * 2.15);
      const threshold = state === "speaking"
        ? speakingThreshold
        : state === "processing"
          ? processingThreshold
          : speechThreshold;
      const isVoice = features.voiceLike && features.rms >= threshold;

      if (state === "speaking" || state === "processing") {
        const echoGuardPassed = state !== "speaking" || now - speakingStartedAt >= CONFIG.echoGuardMs;
        if (state === "speaking" && (!echoGuardPassed || !isVoice)) {
          speakerEchoFloor = Math.max(noiseFloor, speakerEchoFloor * 0.92 + features.rms * 0.08);
        }
        bargeFrameCount = echoGuardPassed && isVoice ? bargeFrameCount + 1 : 0;
        if (bargeFrameCount >= CONFIG.bargeFrames) interruptCurrentTurn(now);
      } else if (state === "listening" || state === "user-speaking") {
        if (!recorder) {
          startFrameCount = isVoice ? startFrameCount + 1 : 0;
          if (startFrameCount >= CONFIG.startFrames) {
            startRecorder();
            utteranceVoiceFrames = CONFIG.startFrames;
            lastVoiceAt = now;
            setState("user-speaking");
          }
        } else if (recorder.state === "recording") {
          if (isVoice) {
            utteranceVoiceFrames += 1;
            lastVoiceAt = now;
            if (state !== "user-speaking") setState("user-speaking");
          }
          const silence = now - lastVoiceAt;
          const duration = now - utteranceStartedAt;
          if (silence >= CONFIG.silenceMs || duration >= CONFIG.maxUtteranceMs) {
            setState("listening");
            stopRecorder();
          }
        }
      }

      animationFrame = root.requestAnimationFrame(tick);
    }

    async function calibrate() {
      const startedAt = performance.now();
      const samples = [];
      while (open && performance.now() - startedAt < CONFIG.calibrationMs) {
        samples.push(audioFeatures().rms);
        await new Promise((resolve) => root.setTimeout(resolve, 25));
      }
      if (!samples.length) return;
      samples.sort((a, b) => a - b);
      const median = samples[Math.floor(samples.length / 2)] || 0.008;
      const upperQuiet = samples[Math.floor(samples.length * 0.85)] || median;
      noiseFloor = Math.max(0.004, median, upperQuiet * 0.85);
      speechThreshold = Math.max(0.018, noiseFloor * 3.1);
      bargeThreshold = Math.max(0.075, noiseFloor * 7.2, speechThreshold * 2.1);
      speakerEchoFloor = noiseFloor;
    }

    async function startVoiceTransport() {
      if (!open || !activeVoice) return;
      setTranscript("");
      setReply("");
      setState("connecting");
      try {
        const liveProvider = await root.TutorlyElevenLabsVoice?.start?.({
          configEndpoint: options.getVoiceConfigEndpoint?.(),
          sessionEndpoint: options.getVoiceSessionEndpoint?.(),
          voice: activeVoice,
          strictAgent: true,
          context: options.getConversationContext?.() || "",
          onConnect: () => {
            if (open) setState("listening");
          },
          onStatusChange: (status) => {
            if (!open) return;
            if (status === "connecting") setState("connecting", "Starting secure voice chat…");
          },
          onModeChange: (providerMode) => {
            if (!open) return;
            speaking = providerMode === "speaking";
            if (speaking) setState("speaking");
            else if (state !== "processing") setState("listening");
          },
          onMessage: ({ role, text, eventId }) => {
            if (!open) return;
            if (role === "user") {
              setTranscript(text);
              setState("processing");
            } else {
              setReply(text);
              if (state === "processing") {
                speaking = true;
                setState("speaking");
              }
            }
            options.onProviderMessage?.({ role, text, eventId });
          },
          onInterruption: () => {
            if (open) setState("listening", "Go ahead — I’m listening to the interruption.");
          },
          onDisconnect: ({ intentional } = {}) => {
            if (open && !intentional) showError("connection", `${activeVoice.name} disconnected. Try connecting again.`, `Couldn’t connect to ${activeVoice.name}.`);
          },
          onError: () => {
            if (open) showError("connection", "Voice Chat hit a problem. Try connecting again.", `Couldn’t connect to ${activeVoice.name}.`);
          },
          onFallback: (message, status) => {
            if (status !== 401 && status !== 503) notify(message);
          }
        });
        if (!open) {
          await liveProvider?.end?.();
          return;
        }
        if (liveProvider) {
          providerSession = liveProvider;
          if (muted) await Promise.resolve(providerSession.setMicMuted?.(true));
          providerVolumeFrame = root.requestAnimationFrame(updateProviderVolume);
          return;
        }
        if (!root.MediaRecorder || !(root.AudioContext || root.webkitAudioContext)) {
          throw Object.assign(new Error("standard_voice_unsupported"), { name: "NotSupportedError" });
        }
        const requestedStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        if (!open) {
          requestedStream.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = requestedStream;
        const AudioContextClass = root.AudioContext || root.webkitAudioContext;
        audioContext = new AudioContextClass();
        if (audioContext.state === "suspended") await audioContext.resume();
        if (!open) {
          releaseAudio();
          return;
        }
        const source = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.68;
        timeData = new Float32Array(analyser.fftSize);
        frequencyData = new Float32Array(analyser.frequencyBinCount);
        source.connect(analyser);
        animationFrame = root.requestAnimationFrame(tick);
        await calibrate();
        if (!open) return;
        const selectedLanguage = normalizeLanguage(languageSelect?.value || "auto");
        const greetingLanguage = selectedLanguage === "auto" ? "en-US" : selectedLanguage;
        const greeting = GREETINGS[greetingLanguage] || GREETINGS["en-US"];
        speak(mode === "vision" ? `${greeting} Your homework image is ready too.` : greeting);
      } catch (error) {
        stopProviderSession();
        releaseAudio();
        const denied = error?.name === "NotAllowedError" || error?.name === "SecurityError";
        const microphoneUnavailable = error?.name === "NotSupportedError" || error?.name === "NotFoundError";
        const message = denied
          ? "Allow microphone access in your browser, then choose Enable microphone."
          : microphoneUnavailable
            ? "No working microphone was found. You can still type your question."
            : `Tutorly couldn’t connect to ${activeVoice.name}. Try again or choose another voice.`;
        showError(
          denied ? "microphone" : microphoneUnavailable ? "microphone-unavailable" : "connection",
          message,
          denied ? "Microphone access is off." : microphoneUnavailable ? "Microphone unavailable." : `Couldn’t connect to ${activeVoice.name}.`
        );
        notify(message);
      }
    }

    async function openSession(nextMode = "voice", trigger = null) {
      if (open) return;
      if (!navigator.mediaDevices?.getUserMedia) {
        notify("Full voice chat is not supported in this browser. You can still dictate into the composer.");
        return;
      }
      open = true;
      muted = false;
      errorKind = "connection";
      if (muteButton) {
        muteButton.setAttribute("aria-pressed", "false");
        muteButton.setAttribute("aria-label", "Mute microphone");
        muteButton.title = "Mute microphone";
      }
      mode = nextMode === "vision" ? "vision" : "voice";
      returnFocus = trigger || document.activeElement;
      if (!inline) {
        overlay.hidden = false;
        overlay.setAttribute("aria-hidden", "false");
        document.body.classList.add("voice-session-open");
        root.requestAnimationFrame(() => overlay.classList.add("show"));
      }
      setState("connecting", "Loading your Tutorly voices…");
      try {
        await VOICE_CONFIG?.ready?.();
        renderOnboardingGrid();
        initializeVoiceSettings();
      } catch (_error) {
        showError("connection", "Tutorly couldn’t load the voice list. Check your connection and try again.");
        return;
      }
      if (!open) return;
      const preference = await loadVoicePreference();
      if (!open) return;
      const selected = preference?.voice_onboarding_completed
        ? VOICE_CONFIG?.getVoice?.(preference.preferred_voice_agent)
        : null;
      if (!selected) {
        setOnboardingOpen(true);
        return;
      }
      activeVoice = selected;
      voiceIndex = Math.max(0, (VOICE_CONFIG?.VOICES || []).findIndex((voice) => voice.key === activeVoice.key));
      renderVoiceSelection({ animate: false, announce: false });
      await startVoiceTransport();
    }

    async function retrySession() {
      if (!open) return;
      const trigger = returnFocus;
      const currentMode = mode;
      cancelResponseTimer();
      cancelTranscription();
      cancelSpeech();
      stopProviderSession();
      releaseAudio();
      open = false;
      await openSession(currentMode, trigger);
    }

    async function continueVoiceOnboarding() {
      const selected = pendingOnboardingVoice;
      if (!open || !onboardingOpen || !selected) return;
      if (onboardingContinue) {
        onboardingContinue.disabled = true;
        onboardingContinue.textContent = "Saving…";
      }
      const result = await saveVoicePreference(selected.key, true, { notifyFailure: true });
      if (!open) return;
      activeVoice = selected;
      voiceIndex = Math.max(0, (VOICE_CONFIG?.VOICES || []).findIndex((voice) => voice.key === selected.key));
      if (!result.saved && onboardingSaveError) {
        onboardingSaveError.textContent = `${selected.name} will be used for this session, but the account preference could not be saved.`;
        onboardingSaveError.hidden = false;
      }
      setOnboardingOpen(false);
      renderVoiceSelection({ animate: false, announce: false });
      await startVoiceTransport();
    }

    function speak(markdown, spokenAnswer = "") {
      if (!open) return;
      cancelResponseTimer();
      cancelSpeech();
      const text = cleanForSpeech(markdown, spokenAnswer);
      setReply(text);
      if (!text || !root.speechSynthesis || !root.SpeechSynthesisUtterance) {
        setState("listening", "The answer is on screen. Ask a follow-up when you’re ready.");
        return;
      }
      const token = speechToken;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = speechLanguage(languageSelect?.value || "auto", detectedLanguage);
      utterance.rate = 1;
      utterance.pitch = 1;
      const voices = root.speechSynthesis.getVoices?.() || [];
      const languagePrefix = utterance.lang.toLowerCase().split("-", 1)[0];
      const preferredVoice = voices.find((voice) => voice.lang?.toLowerCase().startsWith(languagePrefix));
      if (preferredVoice) utterance.voice = preferredVoice;
      utterance.addEventListener("start", () => {
        if (!open || token !== speechToken) return;
        speaking = true;
        speakingStartedAt = performance.now();
        speakerEchoFloor = Math.max(noiseFloor, speechThreshold);
        bargeFrameCount = 0;
        setState("speaking");
      });
      utterance.addEventListener("boundary", (event) => {
        if (!open || token !== speechToken || !orb) return;
        const remaining = text.slice(Number(event.charIndex) || 0);
        const wordLength = (remaining.match(/^\S+/)?.[0] || "").length;
        const cadence = Math.min(1, 0.38 + wordLength / 16);
        orb.style.setProperty("--speech-level", cadence.toFixed(2));
        root.clearTimeout(speechPulseTimer);
        speechPulseTimer = root.setTimeout(() => {
          orb?.style.setProperty("--speech-level", "0.12");
        }, 105);
      });
      const finish = () => {
        if (!open || token !== speechToken) return;
        root.clearTimeout(speechPulseTimer);
        speechPulseTimer = null;
        orb?.style.setProperty("--speech-level", "0");
        speaking = false;
        setState("listening");
      };
      utterance.addEventListener("end", finish, { once: true });
      utterance.addEventListener("error", finish, { once: true });
      speaking = true;
      speakingStartedAt = performance.now();
      speakerEchoFloor = Math.max(noiseFloor, speechThreshold);
      setState("speaking");
      root.speechSynthesis.speak(utterance);
    }

    function setImageReady(ready, label = "") {
      if (!imageStatus) return;
      imageStatus.hidden = !ready;
      imageStatus.textContent = ready ? `${label || "Homework image"} is ready for your next spoken question.` : "";
    }

    if (languageSelect) {
      languageSelect.value = normalizeLanguage(options.getLanguage?.() || "auto");
      languageSelect.addEventListener("change", () => {
        languageSelect.value = normalizeLanguage(languageSelect.value);
        options.setLanguage?.(languageSelect.value);
        announce(`Voice language: ${languageSelect.options[languageSelect.selectedIndex]?.text || "Auto-detect"}`);
      });
    }
    VOICE_CONFIG?.ready?.().then(() => {
      renderOnboardingGrid();
      initializeVoiceSettings();
    }).catch(() => {});
    intelligenceSelect?.addEventListener("change", () => {
      const intelligence = VOICE_CONFIG?.saveIntelligence?.(intelligenceSelect.value);
      intelligenceSelect.value = intelligence?.key || "standard";
      options.onIntelligenceChange?.(intelligence || { key: intelligenceSelect.value, model: "prime" });
      announce(`Intelligence: ${intelligence?.label || "Standard"}`);
    });
    voicePrevious?.addEventListener("click", () => {
      voiceIndex -= 1;
      renderVoiceSelection({ save: true });
    });
    voiceNext?.addEventListener("click", () => {
      voiceIndex += 1;
      renderVoiceSelection({ save: true });
    });
    settingsOpenButton?.addEventListener("click", () => setSettingsOpen(true));
    settingsCloseButton?.addEventListener("click", () => setSettingsOpen(false));
    settingsBackdrop?.addEventListener("click", (event) => {
      if (event.target === settingsBackdrop) setSettingsOpen(false);
    });
    closeButton?.addEventListener("click", close);
    muteButton?.addEventListener("click", () => setMuted(!muted));
    retryButton?.addEventListener("click", retrySession);
    chooseVoiceButton?.addEventListener("click", () => {
      stopProviderSession();
      releaseAudio();
      setOnboardingOpen(true);
    });
    enableMicButton?.addEventListener("click", retrySession);
    exitButton?.addEventListener("click", close);
    onboardingContinue?.addEventListener("click", continueVoiceOnboarding);
    onboardingExit?.addEventListener("click", close);
    photoButton?.addEventListener("click", () => {
      setSettingsOpen(false);
      options.onPhoto?.();
    });
    document.addEventListener("keydown", (event) => {
      if (open && onboardingOpen) {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        if (event.key === "Tab" && onboardingModal) {
          const focusable = Array.from(onboardingModal.querySelectorAll('button:not([disabled]), [tabindex="0"]'))
            .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
          if (focusable.length) {
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }
        }
        return;
      }
      if (open && settingsOpen && event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        setSettingsOpen(false);
      }
    });

    return {
      open: openSession,
      close,
      retry: retrySession,
      setMuted,
      isMuted: () => muted,
      openSettings: () => setSettingsOpen(true),
      closeSettings: () => setSettingsOpen(false),
      speak,
      isOpen: () => open,
      getState: () => state,
      getMode: () => mode,
      getEffectiveLanguage: () => speechLanguage(languageSelect?.value || "auto", detectedLanguage),
      setImageReady,
      config: CONFIG
    };
  }

  root.TutorlyVoiceChat = { create, LANGUAGES, CONFIG, normalizeLanguage, cleanForSpeech };
})(typeof window !== "undefined" ? window : globalThis);
