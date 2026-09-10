(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TutorlyGeneratedImages = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  const IMAGE_PATH = /^\/uploads\/generated\/study-[a-f0-9]{32}\.png$/;

  function imageUrl(path, endpoint) {
    if (typeof path !== "string" || !IMAGE_PATH.test(path)) return null;
    try {
      const base = new URL(endpoint, typeof location === "object" ? location.href : "http://localhost");
      if (!["http:", "https:"].includes(base.protocol)) return null;
      return new URL(path, base.origin).href;
    } catch (_) { return null; }
  }

  function createState(request) {
    if (!request?.requested || request.action !== "educationalImage") return null;
    const uuid = typeof crypto === "object" && crypto.randomUUID
      ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return { request, idempotencyKey: `study-image:${uuid}`, status: "ready", image: null };
  }

  function requestBody(state) {
    const request = state.request;
    return {
      idempotency_key: state.idempotencyKey,
      action: "educationalImage",
      visual_type: "educational_illustration",
      topic: request.topic,
      description: request.description,
      required_labels: request.required_labels || [],
      educational_context: request.educational_context || "",
      style: request.style || "clean_educational",
      aspect_ratio: request.aspect_ratio || "landscape",
      alt_text: request.alt_text || request.topic
    };
  }

  function createManager(options) {
    const active = new Map();
    let preview = null;
    let generationEpoch = 0;

    function element(tag, className, text) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text) node.textContent = text;
      return node;
    }

    function closePreview() {
      if (!preview) return;
      const { dialog, returnFocus } = preview;
      preview = null;
      if (dialog.open) dialog.close();
      dialog.remove();
      if (returnFocus?.isConnected) returnFocus.focus();
    }

    function openPreview(url, alt, returnFocus) {
      closePreview();
      const dialog = element("dialog", "tutorly-generated-image-preview");
      dialog.setAttribute("aria-label", "Generated study illustration");
      const close = element("button", "generated-image-close", "Close image");
      close.type = "button";
      const image = element("img");
      image.src = url;
      image.alt = alt;
      dialog.append(close, image);
      document.body.appendChild(dialog);
      preview = { dialog, returnFocus };
      close.addEventListener("click", closePreview);
      dialog.addEventListener("cancel", (event) => { event.preventDefault(); closePreview(); });
      dialog.addEventListener("click", (event) => { if (event.target === dialog) closePreview(); });
      dialog.showModal();
      close.focus();
    }

    function mount(content, savedState, settings = {}) {
      if (!savedState?.request?.requested || !savedState.idempotencyKey || !content) return;
      const key = savedState.idempotencyKey;
      const existing = active.get(key);
      const state = existing?.state || savedState;
      const panel = element("figure", "tutorly-generated-image");
      panel.setAttribute("aria-label", "Study illustration");
      const cost = Number(options.getCost());
      if (!Number.isFinite(cost) || cost <= 0) return;
      const current = () => content.isConnected && options.isCurrent(settings);
      const save = () => settings.onChange?.({ ...state });
      const render = () => {
        panel.replaceChildren();
        const url = state.image && imageUrl(state.image.url, options.getEndpoint());
        if (state.status === "completed" && url) {
          const open = element("button", "generated-image-open");
          open.type = "button";
          open.setAttribute("aria-label", "Enlarge generated study illustration");
          const image = element("img");
          image.src = url;
          image.alt = state.image.alt_text || state.request.alt_text || state.request.topic || "Generated study illustration";
          image.loading = "lazy";
          image.decoding = "async";
          image.addEventListener("error", () => {
            if (!current()) return;
            panel.replaceChildren(element("p", "generated-image-status", "This saved image isn't available right now. The explanation is still here."));
            const reload = element("button", "generated-image-action", "Reload image");
            reload.type = "button";
            reload.addEventListener("click", render);
            panel.appendChild(reload);
          }, { once: true });
          open.appendChild(image);
          open.addEventListener("click", () => openPreview(url, image.alt, open));
          panel.append(open, element("figcaption", "generated-image-caption", "AI-generated study illustration · Tap to enlarge"));
          return;
        }
        const busy = active.has(key);
        const status = element("p", "generated-image-status");
        status.setAttribute("role", "status");
        status.textContent = busy ? "Creating your study illustration…"
          : state.status === "paused" ? "Image request paused. Resume to check the same request."
          : state.error || "An illustration can help picture this idea.";
        panel.append(status, element("p", "generated-image-cost", `${cost} premium credits · charged once on success`));
        if (busy) {
          panel.setAttribute("aria-busy", "true");
          return;
        }
        panel.removeAttribute("aria-busy");
        const button = element("button", "generated-image-action", state.status === "paused" ? "Resume image" : state.status === "failed" ? `Retry · ${cost} credits` : `Generate · ${cost} credits`);
        button.type = "button";
        button.addEventListener("click", start);
        panel.appendChild(button);
      };

      async function start() {
        if (!current() || active.has(key)) return;
        const token = options.getToken();
        if (!token) {
          state.error = "Log in to generate a study illustration.";
          state.status = "ready";
          render();
          return;
        }
        const controller = new AbortController();
        const entry = { controller, cancel: null, render, state };
        active.set(key, entry);
        state.status = "generating";
        state.error = "";
        save();
        render();
        entry.cancel = () => {
          controller.abort();
          state.status = "paused";
          state.error = "";
          save();
          active.delete(key);
          if (current()) render();
        };
        const timeout = setTimeout(() => controller.abort(), 135000);
        try {
          const response = await fetch(options.getEndpoint(), {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(requestBody(state)),
            signal: controller.signal
          });
          const data = await response.json().catch(() => ({}));
          if (!current() || controller.signal.aborted || options.getToken() !== token) return;
          if (!response.ok) {
            if (response.status === 402) options.onInsufficient?.(data.detail || {});
            const error = new Error("image_request_failed");
            error.status = response.status;
            throw error;
          }
          if (!data.ok || !imageUrl(data.image?.url, options.getEndpoint())) throw new Error("invalid_image");
          state.image = { url: data.image.url, alt_text: data.image.alt_text || state.request.alt_text || state.request.topic };
          state.status = "completed";
          state.error = "";
          if (data.credits) options.onCredits?.(data.credits);
        } catch (error) {
          if (!current() || options.getToken() !== token || active.get(key) !== entry) return;
          state.status = error?.name === "AbortError" ? "paused" : "failed";
          state.error = error?.status === 402 ? "There aren't enough premium credits for this image. You can keep studying with the explanation."
            : error?.status === 401 ? "Please log in again to generate this image."
            : error?.status === 409 ? "This illustration is still being created. Retry shortly to retrieve the same request."
            : error?.status === 503 ? "Image generation is temporarily unavailable. Your explanation is still here."
            : error?.status === 429 ? "Please wait a moment before trying the image again."
            : "The image couldn't be loaded. Retry checks the same request, so a successful image is only charged once.";
        } finally {
          clearTimeout(timeout);
          if (active.get(key) === entry) {
            active.delete(key);
            if (current() && options.getToken() === token) { save(); entry.render(); }
          }
        }
      }

      if (existing) existing.render = render;
      else if (state.status === "generating") state.status = "paused";
      render();
      if (options.place) options.place(content, panel, state.request.placement || "after_answer");
      else content.appendChild(panel);
      // Only a freshly requested illustration may start automatically. Reopening
      // history, rendering Markdown again, and retrying never create a new key.
      if (settings.autoStart && state.status === "ready" && state.request.explicit_request === true) {
        const mountedEpoch = generationEpoch;
        requestAnimationFrame(() => { if (current() && mountedEpoch === generationEpoch) start(); });
      }
    }

    function cancelAll() {
      generationEpoch += 1;
      for (const entry of Array.from(active.values())) entry.cancel?.();
      closePreview();
    }

    return { mount, cancelAll };
  }

  return { imageUrl, createState, requestBody, createManager };
});
