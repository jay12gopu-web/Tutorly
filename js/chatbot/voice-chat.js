(function (root) {
  "use strict";

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
    connecting: ["Getting ready…", "Checking your microphone."],
    listening: ["Listening — just talk", "Speak naturally. I’ll respond when you finish."],
    processing: ["Processing…", "You can interrupt and ask something else."],
    speaking: ["Tutorly is speaking", "Start talking to interrupt."],
    error: ["Voice unavailable", "Check microphone permission, then try again."],
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
    const photoButton = overlay.querySelector("#voiceSessionPhoto");
    const imageStatus = overlay.querySelector("#voiceSessionImageStatus");
    const orb = overlay.querySelector(".voice-session-orb");

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

    function notify(message) {
      if (typeof options.onNotice === "function") options.onNotice(message);
    }

    function setState(next, hintOverride = "") {
      state = next;
      overlay.dataset.voiceState = next;
      const copy = STATE_COPY[next] || STATE_COPY.error;
      if (stateLabel) stateLabel.textContent = copy[0];
      if (stateHint) stateHint.textContent = hintOverride || copy[1];
      options.onStateChange?.(next, {
        label: copy[0],
        hint: hintOverride || copy[1]
      });
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

    function close() {
      if (!open && overlay.hidden) return;
      open = false;
      setState("closed");
      cancelResponseTimer();
      cancelTranscription();
      cancelSpeech();
      releaseAudio();
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
      const strength = Math.max(0, Math.min(1, (features.rms - noiseFloor) / Math.max(speechThreshold * 2, 0.04)));
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
      if (!open || !stream || recorder?.state === "recording") return;
      const types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
      const mimeType = types.find((type) => root.MediaRecorder?.isTypeSupported?.(type)) || "";
      try {
        recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      } catch (error) {
        setState("error", "This browser cannot record audio for voice chat.");
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
        if (!enoughVoice || duration < CONFIG.minimumUtteranceMs || blob.size < 1500) {
          setState("listening", "I’m waiting for your voice—not just background noise.");
          return;
        }
        transcribe(blob, blob.type);
      }, { once: true });
      recorder.start(200);
    }

    function interruptCurrentTurn(now) {
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
      } else if (state === "listening") {
        if (!recorder) {
          startFrameCount = isVoice ? startFrameCount + 1 : 0;
          if (startFrameCount >= CONFIG.startFrames) {
            startRecorder();
            utteranceVoiceFrames = CONFIG.startFrames;
            lastVoiceAt = now;
          }
        } else if (recorder.state === "recording") {
          if (isVoice) {
            utteranceVoiceFrames += 1;
            lastVoiceAt = now;
          }
          const silence = now - lastVoiceAt;
          const duration = now - utteranceStartedAt;
          if (silence >= CONFIG.silenceMs || duration >= CONFIG.maxUtteranceMs) stopRecorder();
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

    async function openSession(nextMode = "voice", trigger = null) {
      if (open) return;
      if (!navigator.mediaDevices?.getUserMedia || !root.MediaRecorder || !(root.AudioContext || root.webkitAudioContext)) {
        notify("Full voice chat is not supported in this browser. You can still dictate into the composer.");
        return;
      }
      open = true;
      mode = nextMode === "vision" ? "vision" : "voice";
      returnFocus = trigger || document.activeElement;
      if (!inline) {
        overlay.hidden = false;
        overlay.setAttribute("aria-hidden", "false");
        document.body.classList.add("voice-session-open");
        root.requestAnimationFrame(() => overlay.classList.add("show"));
      }
      setTranscript("");
      setReply("");
      setState("connecting");
      try {
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
        releaseAudio();
        const message = error?.name === "NotAllowedError"
          ? "Microphone permission was denied. Allow it in your browser and reopen Voice Chat."
          : "No working microphone was found. You can still type your question.";
        setState("error", message);
        notify(message);
      }
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
      });
    }
    closeButton?.addEventListener("click", close);
    photoButton?.addEventListener("click", () => options.onPhoto?.());
    document.addEventListener("keydown", (event) => {
      if (open && event.key === "Escape") close();
    });

    return {
      open: openSession,
      close,
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
