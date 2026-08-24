(function (root, factory) {
  const api = factory(root || {});
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TutorlyRichResponse = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  const MAX_DIAGRAM_LENGTH = 8000;
  const MAX_CHART_ROWS = 24;
  const MAX_CHART_SERIES = 4;
  const MAX_REMEMBERED_SOURCES = 500;
  const COLORS = ["#4f7cff", "#7c5cff", "#22b8cf", "#6c8cff"];
  const sources = new Map();
  let sourceCounter = 0;
  let mermaidLoader = null;
  let katexLoader = null;

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function clampText(value, limit) {
    return String(value == null ? "" : value).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, limit);
  }

  function remember(prefix, value) {
    sourceCounter += 1;
    const id = `${prefix}-${Date.now().toString(36)}-${sourceCounter.toString(36)}`;
    sources.set(id, String(value || ""));
    if (sources.size > MAX_REMEMBERED_SOURCES) {
      sources.delete(sources.keys().next().value);
    }
    return id;
  }

  function normalizeLanguage(language) {
    return String(language || "").trim().toLowerCase().replace(/[^a-z0-9_+-]/g, "").slice(0, 24);
  }

  function validateMermaid(source) {
    const code = String(source || "").trim();
    if (!code || code.length > MAX_DIAGRAM_LENGTH) throw new Error("Diagram source is empty or too large.");
    if (/<\/?[a-z][^>]*>/i.test(code) || /javascript:/i.test(code) || /^\s*%%\{/m.test(code) || /\b(?:click|classDef|linkStyle|style)\s+/i.test(code)) {
      throw new Error("Diagram contains unsupported interactive content.");
    }
    if (!/^\s*(?:graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|pie|gantt|mindmap|timeline|erDiagram|journey)\b/i.test(code)) {
      throw new Error("Unsupported diagram type.");
    }
    return code;
  }

  function parseChartSpec(source) {
    const parsed = typeof source === "string" ? JSON.parse(source) : source;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Chart data must be an object.");

    const type = String(parsed.type || "").toLowerCase();
    if (!["bar", "line", "pie"].includes(type)) throw new Error("Chart type must be bar, line, or pie.");
    if (!Array.isArray(parsed.data) || parsed.data.length === 0 || parsed.data.length > MAX_CHART_ROWS) {
      throw new Error(`Chart data must contain 1-${MAX_CHART_ROWS} rows.`);
    }

    const xKey = clampText(parsed.xKey || "name", 40) || "name";
    const rawSeries = Array.isArray(parsed.series) && parsed.series.length
      ? parsed.series.slice(0, MAX_CHART_SERIES)
      : [{ key: "value", label: "Value" }];
    const series = rawSeries.map((item, index) => {
      const key = clampText(item && item.key, 40);
      if (!key) throw new Error(`Chart series ${index + 1} is missing a key.`);
      return { key, label: clampText(item.label || key, 60) || key };
    });

    const data = parsed.data.map((row, rowIndex) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error(`Chart row ${rowIndex + 1} is invalid.`);
      const normalized = { [xKey]: clampText(row[xKey], 60) || `Item ${rowIndex + 1}` };
      series.forEach((item) => {
        const value = Number(row[item.key]);
        if (!Number.isFinite(value)) throw new Error(`Chart value ${item.key} in row ${rowIndex + 1} is not numeric.`);
        normalized[item.key] = value;
      });
      return normalized;
    });

    return {
      type,
      title: clampText(parsed.title || "Educational chart", 100),
      xKey,
      series,
      data,
    };
  }

  function chartHeader(spec) {
    return `<figcaption class="edu-visual-head"><span><span>Chart</span><strong>${escapeHtml(spec.title)}</strong></span></figcaption>`;
  }

  function chartLegend(spec) {
    return `<div class="tutorly-chart-legend">${spec.series.map((item, index) => (
      `<span><i style="background:${COLORS[index % COLORS.length]}"></i>${escapeHtml(item.label)}</span>`
    )).join("")}</div>`;
  }

  function renderCartesianChart(spec) {
    const width = 720;
    const height = 360;
    const margin = { top: 22, right: 24, bottom: 72, left: 64 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const values = spec.data.flatMap((row) => spec.series.map((item) => row[item.key]));
    let minimum = Math.min(0, ...values);
    let maximum = Math.max(0, ...values);
    if (minimum === maximum) maximum = minimum + 1;
    const scaleY = (value) => margin.top + ((maximum - value) / (maximum - minimum)) * plotHeight;
    const zeroY = scaleY(0);
    const ticks = Array.from({ length: 5 }, (_, index) => minimum + ((maximum - minimum) * index) / 4);
    const labelStep = Math.max(1, Math.ceil(spec.data.length / 9));

    const grid = ticks.map((tick) => {
      const y = scaleY(tick);
      const label = Math.abs(tick) >= 1000 ? tick.toLocaleString("en-US", { maximumFractionDigits: 1 }) : Number(tick.toFixed(2));
      return `<line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" class="tutorly-chart-grid"></line><text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" class="tutorly-chart-label">${escapeHtml(label)}</text>`;
    }).join("");

    const xLabels = spec.data.map((row, index) => {
      if (index % labelStep !== 0 && index !== spec.data.length - 1) return "";
      const x = margin.left + ((index + 0.5) * plotWidth) / spec.data.length;
      return `<text x="${x}" y="${height - 38}" text-anchor="middle" class="tutorly-chart-label">${escapeHtml(row[spec.xKey])}</text>`;
    }).join("");

    let marks = "";
    if (spec.type === "bar") {
      const groupWidth = plotWidth / spec.data.length;
      const barWidth = Math.max(3, Math.min(34, (groupWidth * 0.72) / spec.series.length));
      marks = spec.data.map((row, rowIndex) => spec.series.map((item, seriesIndex) => {
        const valueY = scaleY(row[item.key]);
        const x = margin.left + rowIndex * groupWidth + (groupWidth - barWidth * spec.series.length) / 2 + seriesIndex * barWidth;
        const y = Math.min(valueY, zeroY);
        const barHeight = Math.max(1, Math.abs(zeroY - valueY));
        return `<rect x="${x}" y="${y}" width="${barWidth - 1}" height="${barHeight}" rx="4" fill="${COLORS[seriesIndex % COLORS.length]}"><title>${escapeHtml(row[spec.xKey])}: ${escapeHtml(item.label)} ${escapeHtml(row[item.key])}</title></rect>`;
      }).join("")).join("");
    } else {
      marks = spec.series.map((item, seriesIndex) => {
        const points = spec.data.map((row, rowIndex) => {
          const x = margin.left + ((rowIndex + 0.5) * plotWidth) / spec.data.length;
          return `${x},${scaleY(row[item.key])}`;
        });
        const circles = spec.data.map((row, rowIndex) => {
          const x = margin.left + ((rowIndex + 0.5) * plotWidth) / spec.data.length;
          const y = scaleY(row[item.key]);
          return `<circle cx="${x}" cy="${y}" r="4" fill="${COLORS[seriesIndex % COLORS.length]}"><title>${escapeHtml(row[spec.xKey])}: ${escapeHtml(item.label)} ${escapeHtml(row[item.key])}</title></circle>`;
        }).join("");
        return `<polyline points="${points.join(" ")}" fill="none" stroke="${COLORS[seriesIndex % COLORS.length]}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"></polyline>${circles}`;
      }).join("");
    }

    return `<figure class="edu-visual-panel tutorly-chart-block is-ready" role="group" aria-label="${escapeHtml(spec.title)}">${chartHeader(spec)}<div class="tutorly-chart-canvas"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(spec.title)}">${grid}<line x1="${margin.left}" y1="${zeroY}" x2="${width - margin.right}" y2="${zeroY}" class="tutorly-chart-axis"></line>${marks}${xLabels}</svg></div>${chartLegend(spec)}</figure>`;
  }

  function renderPieChart(spec) {
    const item = spec.series[0];
    const rows = spec.data.map((row, index) => ({
      label: row[spec.xKey],
      value: Math.max(0, row[item.key]),
      color: COLORS[index % COLORS.length],
    }));
    const total = rows.reduce((sum, row) => sum + row.value, 0);
    if (total <= 0) throw new Error("Pie chart values must include a positive number.");
    let position = 0;
    const stops = rows.map((row) => {
      const start = position;
      position += (row.value / total) * 100;
      return `${row.color} ${start.toFixed(3)}% ${position.toFixed(3)}%`;
    });
    const legend = rows.map((row) => `<span><i style="background:${row.color}"></i>${escapeHtml(row.label)} — ${escapeHtml(row.value)}</span>`).join("");
    return `<figure class="edu-visual-panel tutorly-chart-block is-ready" role="group" aria-label="${escapeHtml(spec.title)}">${chartHeader(spec)}<div class="tutorly-pie-layout"><div class="tutorly-pie-chart" style="background:conic-gradient(${stops.join(",")})" role="img" aria-label="${escapeHtml(spec.title)}"></div><div class="tutorly-chart-legend tutorly-pie-legend">${legend}</div></div></figure>`;
  }

  function renderChart(source) {
    const spec = parseChartSpec(source);
    return spec.type === "pie" ? renderPieChart(spec) : renderCartesianChart(spec);
  }

  function richError(kind, message) {
    return `<div class="tutorly-rich-error" role="status"><strong>${escapeHtml(kind)} unavailable.</strong> ${escapeHtml(message)}</div>`;
  }

  function renderUnavailableVisual(label, inline = false) {
    const safeLabel = clampText(label, 120) || "Requested diagram";
    const tag = inline ? "span" : "div";
    return `<${tag} class="tutorly-rich-notice tutorly-attachment-placeholder" role="status" data-unavailable-visual="true"><strong>${escapeHtml(safeLabel)} unavailable.</strong> No generated image was attached; the written explanation is still available.</${tag}>`;
  }

  function renderWritingBlock(source, customEscape) {
    const escape = typeof customEscape === "function" ? customEscape : escapeHtml;
    const lines = String(source || "").replace(/\r\n?/g, "\n").split("\n");
    const titleMatch = lines[0]?.match(/^\s*TITLE\s*:\s*(.+?)\s*$/i);
    const title = clampText(titleMatch?.[1] || "Writing sample", 100) || "Writing sample";
    const body = (titleMatch ? lines.slice(1) : lines).join("\n").trim();
    const id = remember("writing", body);
    return `<section class="tutorly-writing-block" role="group" aria-label="${escape(title)}"><header class="tutorly-writing-head"><div class="tutorly-writing-title"><span>Writing sample</span><strong title="${escape(title)}">${escape(title)}</strong></div><button type="button" data-copy-source="${id}" aria-label="Copy writing sample">Copy</button></header><pre class="tutorly-writing-body">${escape(body)}</pre></section>`;
  }

  function renderCodeBlock(language, source, customEscape) {
    const escape = typeof customEscape === "function" ? customEscape : escapeHtml;
    const normalized = normalizeLanguage(language);
    if (normalized === "mermaid") {
      try {
        const code = validateMermaid(source);
        const id = remember("diagram", code);
        return `<figure class="edu-visual-panel tutorly-diagram-block is-ready" role="group"><figcaption class="edu-visual-head"><span><span>Diagram</span><strong>Visual explanation</strong></span></figcaption><div class="tutorly-mermaid-canvas" data-rich-source="${id}" aria-live="polite"><span class="tutorly-rich-loading">Rendering diagram…</span></div></figure>`;
      } catch (error) {
        return richError("Diagram", "The explanation is still available as text.");
      }
    }
    if (normalized === "chart") {
      try {
        return renderChart(source);
      } catch (error) {
        return richError("Chart", "The chart data could not be rendered safely.");
      }
    }
    if (normalized === "writing") {
      return renderWritingBlock(source, escape);
    }

    const id = remember("code", source);
    const label = normalized || "code";
    return `<div class="tutorly-code-block"><div class="tutorly-code-head"><span>${escape(label)}</span><button type="button" data-copy-source="${id}" aria-label="Copy code">Copy</button></div><pre data-language="${escape(normalized)}"><code>${escape(source)}</code></pre></div>`;
  }

  function renderMath(expression, display, customEscape) {
    const escape = typeof customEscape === "function" ? customEscape : escapeHtml;
    const source = String(expression || "").trim().slice(0, 4000);
    const id = remember("math", source);
    const tag = display ? "div" : "span";
    const className = display ? "math-display tutorly-katex" : "math-inline tutorly-katex";
    return `<${tag} class="${className}" data-rich-source="${id}" data-display="${display ? "true" : "false"}">${escape(source)}</${tag}>`;
  }

  function loadScriptOnce(id, source, globalName) {
    if (root[globalName]) return Promise.resolve(root[globalName]);
    if (typeof document === "undefined") return Promise.reject(new Error("Browser document unavailable"));
    const existing = document.getElementById(id);
    if (existing) {
      return new Promise((resolve, reject) => {
        existing.addEventListener("load", () => resolve(root[globalName]), { once: true });
        existing.addEventListener("error", reject, { once: true });
      });
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.id = id;
      script.src = source;
      script.defer = true;
      script.onload = () => root[globalName] ? resolve(root[globalName]) : reject(new Error(`${globalName} unavailable`));
      script.onerror = () => reject(new Error(`${globalName} failed to load`));
      document.head.appendChild(script);
    });
  }

  function ensureMermaid() {
    if (!mermaidLoader) {
      mermaidLoader = loadScriptOnce(
        "tutorly-mermaid-script",
        "https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js",
        "mermaid"
      );
    }
    return mermaidLoader;
  }

  function ensureKatex() {
    if (!katexLoader) {
      if (typeof document !== "undefined" && !document.getElementById("tutorly-katex-style")) {
        const link = document.createElement("link");
        link.id = "tutorly-katex-style";
        link.rel = "stylesheet";
        link.href = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css";
        document.head.appendChild(link);
      }
      katexLoader = loadScriptOnce(
        "tutorly-katex-script",
        "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js",
        "katex"
      );
    }
    return katexLoader;
  }

  function hydrateMath(container) {
    const nodes = Array.from(container.querySelectorAll(".tutorly-katex[data-rich-source]:not([data-rich-ready])"));
    if (!nodes.length) return;
    ensureKatex().then((katex) => {
      nodes.forEach((node) => {
        const source = sources.get(node.dataset.richSource) || node.textContent || "";
        try {
          katex.render(source, node, {
            displayMode: node.dataset.display === "true",
            throwOnError: false,
            strict: "ignore",
            trust: false,
            output: "htmlAndMathml",
          });
          node.dataset.richReady = "true";
        } catch (error) {
          node.dataset.richReady = "error";
        }
      });
    }).catch(() => {
      nodes.forEach((node) => { node.dataset.richReady = "fallback"; });
    });
  }

  function hydrateDiagrams(container) {
    const nodes = Array.from(container.querySelectorAll(".tutorly-mermaid-canvas[data-rich-source]:not([data-rich-ready])"));
    if (!nodes.length) return;
    ensureMermaid().then(async (mermaid) => {
      const dark = document.documentElement.classList.contains("dark") || document.body?.dataset?.theme === "dark";
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: dark ? "dark" : "base",
        suppressErrorRendering: true,
        flowchart: { htmlLabels: false, useMaxWidth: true },
        themeVariables: {
          primaryColor: dark ? "#25335f" : "#e8efff",
          primaryTextColor: dark ? "#f4f6ff" : "#17255a",
          primaryBorderColor: "#6c63ff",
          lineColor: dark ? "#9baaf5" : "#5065ba",
          background: "transparent",
          fontFamily: "Inter, system-ui, sans-serif",
        },
      });
      for (const node of nodes) {
        const source = sources.get(node.dataset.richSource) || "";
        try {
          const renderId = `tutorly-mmd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
          const result = await mermaid.render(renderId, source);
          node.innerHTML = result.svg;
          node.dataset.richReady = "true";
        } catch (error) {
          node.innerHTML = richError("Diagram", "The explanation is still available as text.");
          node.dataset.richReady = "error";
        }
      }
    }).catch(() => {
      nodes.forEach((node) => {
        node.innerHTML = richError("Diagram", "The diagram renderer could not be loaded.");
        node.dataset.richReady = "error";
      });
    });
  }

  function hydrateCopyButtons(container) {
    container.querySelectorAll("button[data-copy-source]:not([data-copy-ready])").forEach((button) => {
      button.dataset.copyReady = "true";
      button.addEventListener("click", async () => {
        const value = sources.get(button.dataset.copySource) || "";
        try {
          await navigator.clipboard.writeText(value);
          const previous = button.textContent;
          button.textContent = "Copied";
          root.setTimeout(() => { button.textContent = previous; }, 1200);
        } catch (error) {
          button.textContent = "Copy failed";
        }
      });
    });
  }

  function hydrate(container) {
    if (!container || typeof container.querySelectorAll !== "function") return;
    hydrateCopyButtons(container);
    hydrateMath(container);
    hydrateDiagrams(container);
  }

  return {
    escapeHtml,
    validateMermaid,
    parseChartSpec,
    renderChart,
    renderCodeBlock,
    renderWritingBlock,
    renderMath,
    renderUnavailableVisual,
    hydrate,
  };
});
