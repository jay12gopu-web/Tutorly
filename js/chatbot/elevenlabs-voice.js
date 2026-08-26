(function (root) {
  "use strict";

  const FRIENDLY_START_ERROR = "Live Voice Chat couldn't connect. Please try again.";
  let sdkLoadPromise = null;

  function loadSdk(url = "js/vendor/elevenlabs-client.js?v=1.22.0") {
    if (root.ElevenLabsClient?.Conversation) return Promise.resolve(root.ElevenLabsClient);
    if (sdkLoadPromise) return sdkLoadPromise;
    sdkLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      script.addEventListener("load", () => {
        if (root.ElevenLabsClient?.Conversation) resolve(root.ElevenLabsClient);
        else reject(new Error("voice_sdk_invalid"));
      }, { once: true });
      script.addEventListener("error", () => reject(new Error("voice_sdk_unavailable")), { once: true });
      document.head.appendChild(script);
    }).catch((error) => {
      sdkLoadPromise = null;
      throw error;
    });
    return sdkLoadPromise;
  }

  function authHeaders() {
    const token = root.TutorlyAuth?.getSessionToken?.() || "";
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function readJson(response) {
    try { return await response.json(); }
    catch (error) { return {}; }
  }

  async function requestConversationAccess(options) {
    const voiceKey = String(options.voice?.key || "").trim().toLowerCase();
    const selectedAgentId = String(options.voice?.agentId || "").trim();
    if (!voiceKey || !/^agent_[a-z0-9]+$/.test(selectedAgentId)) {
      throw new Error("voice_agent_invalid");
    }
    let configResponse;
    try {
      configResponse = await fetch(options.configEndpoint, {
        method: "GET",
        headers: { Accept: "application/json" }
      });
    } catch (error) {
      return { agentId: selectedAgentId, conversationId: "", voice: voiceKey };
    }
    const config = await readJson(configResponse);
    if (!configResponse.ok || !config.enabled) {
      return { agentId: selectedAgentId, conversationId: "", voice: voiceKey };
    }

    const response = await fetch(options.sessionEndpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...authHeaders()
      },
      body: JSON.stringify({ voice: voiceKey })
    });
    const payload = await readJson(response);
    if (!response.ok) {
      if ([401, 404, 503].includes(response.status)) {
        return { agentId: selectedAgentId, conversationId: "", voice: voiceKey };
      }
      const error = new Error("voice_session_unavailable");
      error.status = response.status;
      throw error;
    }
    const conversationToken = String(payload.conversation_token || "").trim();
    if (!conversationToken) throw new Error("voice_session_invalid");
    return { conversationToken, conversationId: String(payload.conversation_id || ""), voice: voiceKey };
  }

  async function confirmMicrophoneAccess() {
    if (!navigator.mediaDevices?.getUserMedia) {
      const error = new Error("microphone_unsupported");
      error.name = "NotSupportedError";
      throw error;
    }
    const permissionStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1
      }
    });
    permissionStream.getTracks().forEach((track) => track.stop());
  }

  async function start(options = {}) {
    if (!options.configEndpoint || !options.sessionEndpoint) return null;

    try {
      const session = await requestConversationAccess(options);
      const sdk = await loadSdk(options.sdkUrl);
      const Conversation = sdk?.Conversation;
      if (!Conversation) throw new Error("voice_sdk_invalid");
      await confirmMicrophoneAccess();

      let intentionalEnd = false;
      const connection = session.conversationToken
        ? { conversationToken: session.conversationToken }
        : { agentId: session.agentId };
      const conversation = await Conversation.startSession({
        ...connection,
        connectionType: "webrtc",
        onConnect: ({ conversationId } = {}) => options.onConnect?.({
          conversationId: String(conversationId || session.conversationId || "")
        }),
        onDisconnect: (details = {}) => {
          options.onDisconnect?.({ ...details, intentional: intentionalEnd });
        },
        onStatusChange: ({ status } = {}) => options.onStatusChange?.(String(status || "")),
        onModeChange: ({ mode } = {}) => options.onModeChange?.(String(mode || "")),
        onMessage: (message = {}) => {
          const role = message.role === "agent" || message.source === "ai" ? "assistant" : "user";
          const text = String(message.message || "").trim();
          if (text) options.onMessage?.({ role, text, eventId: message.event_id || null });
        },
        onInterruption: () => options.onInterruption?.(),
        onError: () => options.onError?.("voice_provider_error")
      });

      const context = String(options.context || "").trim();
      if (context && typeof conversation.sendContextualUpdate === "function") {
        conversation.sendContextualUpdate(context.slice(0, 12_000));
      }

      return {
        provider: "elevenlabs",
        conversationId: session.conversationId || conversation.getId?.() || "",
        end: async () => {
          intentionalEnd = true;
          await conversation.endSession?.();
        },
        getInputVolume: () => conversation.getInputVolume?.() || 0,
        getOutputVolume: () => conversation.getOutputVolume?.() || 0,
        sendContextualUpdate: (text) => conversation.sendContextualUpdate?.(String(text || "")),
        setMicMuted: (muted) => conversation.setMicMuted?.(!!muted)
      };
    } catch (error) {
      if (error?.name === "NotAllowedError") throw error;
      options.onFallback?.(FRIENDLY_START_ERROR, error?.status || 0);
      if (options.strictAgent) throw error;
      return null;
    }
  }

  root.TutorlyElevenLabsVoice = Object.freeze({ start });
})(window);
