(function () {
  "use strict";

  const root = window.TutorlyLiveBoard = window.TutorlyLiveBoard || {};

  function coefficient(value, fallback) {
    if (value == null) return fallback;
    if (value === "" || value === "+") return 1;
    if (value === "-") return -1;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function parseExpression(expression) {
    const normalized = String(expression || "")
      .replace(/\s+/g, "")
      .replace(/−/g, "-")
      .replace(/\*\*/g, "^")
      .toLowerCase();
    let match = normalized.match(/^y=([+-]?(?:\d+(?:\.\d+)?|\.\d+)?)x(?:\^2|²)(?:([+-](?:\d+(?:\.\d+)?|\.\d+)?)x)?(?:([+-](?:\d+(?:\.\d+)?|\.\d+)))?$/);
    if (match) {
      const a = coefficient(match[1], 1);
      const b = coefficient(match[2], 0);
      const c = coefficient(match[3], 0);
      return { kind: "quadratic", expression, evaluate: (x) => a * x * x + b * x + c, a, b, c };
    }
    match = normalized.match(/^y=([+-]?(?:\d+(?:\.\d+)?|\.\d+)?)x(?:([+-](?:\d+(?:\.\d+)?|\.\d+)))?$/);
    if (match) {
      const m = coefficient(match[1], 1);
      const b = coefficient(match[2], 0);
      return { kind: "linear", expression, evaluate: (x) => m * x + b, m, b };
    }
    match = normalized.match(/^y=([+-]?(?:\d+(?:\.\d+)?|\.\d+))$/);
    if (match) {
      const y = Number(match[1]);
      return { kind: "horizontal", expression, evaluate: () => y, y };
    }
    match = normalized.match(/^x=([+-]?(?:\d+(?:\.\d+)?|\.\d+))$/);
    if (match) return { kind: "vertical", expression, x: Number(match[1]) };
    return null;
  }

  function createMapper(domain = {}) {
    const xMin = Number.isFinite(Number(domain.xMin)) ? Number(domain.xMin) : -5;
    const xMax = Number.isFinite(Number(domain.xMax)) ? Number(domain.xMax) : 5;
    const yMin = Number.isFinite(Number(domain.yMin)) ? Number(domain.yMin) : -5;
    const yMax = Number.isFinite(Number(domain.yMax)) ? Number(domain.yMax) : 5;
    const box = { x: 96, y: 80, width: 760, height: 470 };
    const map = (x, y) => ({
      x: box.x + ((x - xMin) / (xMax - xMin || 1)) * box.width,
      y: box.y + box.height - ((y - yMin) / (yMax - yMin || 1)) * box.height
    });
    return { xMin, xMax, yMin, yMax, box, map };
  }

  function functionPoints(expression, domain = {}, samples = 120) {
    const parsed = parseExpression(expression);
    const mapper = createMapper(domain);
    if (!parsed) return { ok: false, error: `Unsupported expression: ${expression}` };
    if (parsed.kind === "vertical") {
      const top = mapper.map(parsed.x, mapper.yMax);
      const bottom = mapper.map(parsed.x, mapper.yMin);
      return { ok: true, parsed, mapper, points: [top, bottom], vertical: true };
    }
    const points = [];
    for (let index = 0; index <= samples; index += 1) {
      const x = mapper.xMin + ((mapper.xMax - mapper.xMin) * index) / samples;
      const y = parsed.evaluate(x);
      if (Number.isFinite(y) && y >= mapper.yMin - 1 && y <= mapper.yMax + 1) points.push(mapper.map(x, y));
    }
    return { ok: points.length >= 2, parsed, mapper, points, error: points.length < 2 ? "No visible graph points in this range." : "" };
  }

  root.GraphEngine = { parseExpression, createMapper, functionPoints };
})();
