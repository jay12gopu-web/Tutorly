(function () {
  "use strict";

  const root = window.TutorlyLiveBoard = window.TutorlyLiveBoard || {};

  const VISUAL_MODES = Object.freeze(["none", "diagram", "graph", "geometry"]);
  const COMMAND_TYPES = Object.freeze([
    "clearTutorLayer",
    "drawPoint",
    "drawLine",
    "drawRay",
    "drawArrow",
    "drawCircle",
    "drawArc",
    "drawRectangle",
    "drawPath",
    "drawText",
    "drawEquation",
    "drawComponent",
    "drawCoordinatePlane",
    "plotFunction",
    "plotPoint",
    "drawPolygon",
    "constructPerpendicularBisector",
    "constructAngleBisector",
    "highlight",
    "focus"
  ]);

  function uid(prefix = "lb") {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function text(value, fallback = "") {
    return String(value ?? fallback).replace(/\s+/g, " ").trim().slice(0, 900);
  }

  function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function bool(value) {
    return value === true;
  }

  function points(value) {
    if (!Array.isArray(value)) return [];
    return value
      .map((point) => ({ x: number(point?.x), y: number(point?.y) }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
      .slice(0, 160);
  }

  function rect(value) {
    if (!value || typeof value !== "object") return null;
    const box = {
      x: number(value.x),
      y: number(value.y),
      width: Math.max(1, number(value.width, 220)),
      height: Math.max(1, number(value.height, 160))
    };
    return box;
  }

  function color(value, fallback = "") {
    const next = String(value || "").trim();
    if (!next) return fallback;
    if (/^#[0-9a-f]{3,8}$/i.test(next) || /^rgba?\(/i.test(next) || /^[a-z]+$/i.test(next)) return next.slice(0, 32);
    return fallback;
  }

  function validateCommand(command, index = 0) {
    if (!command || typeof command !== "object") {
      return { ok: false, error: `Command ${index + 1} is not an object.` };
    }
    const type = text(command.type);
    if (!COMMAND_TYPES.includes(type)) {
      return { ok: false, error: `Unsupported command: ${type || "(missing)"}.` };
    }
    const base = {
      id: text(command.id) || uid("cmd"),
      type,
      layer: command.layer === "student" ? "student" : "tutorly",
      label: text(command.label),
      color: color(command.color),
      emphasis: bool(command.emphasis)
    };

    if (type === "clearTutorLayer") return { ok: true, value: base };
    if (type === "focus") return { ok: true, value: { ...base, box: rect(command.box) || { x: 0, y: 0, width: 1000, height: 650 } } };
    if (type === "highlight") return { ok: true, value: { ...base, targetId: text(command.targetId), box: rect(command.box) } };
    if (type === "drawPoint" || type === "plotPoint") return { ok: true, value: { ...base, x: number(command.x), y: number(command.y), r: Math.max(3, number(command.r, 7)) } };
    if (["drawLine", "drawRay", "drawArrow"].includes(type)) {
      return { ok: true, value: { ...base, x1: number(command.x1), y1: number(command.y1), x2: number(command.x2), y2: number(command.y2), dashed: bool(command.dashed) } };
    }
    if (type === "drawCircle") return { ok: true, value: { ...base, x: number(command.x), y: number(command.y), r: Math.max(2, number(command.r, 50)), dashed: bool(command.dashed) } };
    if (type === "drawArc") {
      return { ok: true, value: { ...base, x: number(command.x), y: number(command.y), r: Math.max(2, number(command.r, 50)), start: number(command.start), end: number(command.end, 90) } };
    }
    if (type === "drawRectangle") {
      return { ok: true, value: { ...base, x: number(command.x), y: number(command.y), width: Math.max(2, number(command.width, 120)), height: Math.max(2, number(command.height, 80)), rx: Math.max(0, number(command.rx, 12)) } };
    }
    if (type === "drawPath") return { ok: true, value: { ...base, points: points(command.points), closed: bool(command.closed), dashed: bool(command.dashed), width: Math.max(1, number(command.width, 3)) } };
    if (type === "drawPolygon") return { ok: true, value: { ...base, points: points(command.points), fill: color(command.fill) } };
    if (type === "drawText" || type === "drawEquation") return { ok: true, value: { ...base, x: number(command.x), y: number(command.y), text: text(command.text || command.equation, base.label), size: Math.max(10, Math.min(34, number(command.size, type === "drawEquation" ? 20 : 15))) } };
    if (type === "drawComponent") {
      return { ok: true, value: { ...base, kind: text(command.kind, "block").toLowerCase(), x: number(command.x), y: number(command.y), width: Math.max(18, number(command.width, 120)), height: Math.max(18, number(command.height, 80)), rotation: number(command.rotation) } };
    }
    if (type === "drawCoordinatePlane") {
      const domain = command.domain || {};
      return { ok: true, value: { ...base, domain: { xMin: number(domain.xMin, -5), xMax: number(domain.xMax, 5), yMin: number(domain.yMin, -5), yMax: number(domain.yMax, 5) }, grid: command.grid !== false } };
    }
    if (type === "plotFunction") return { ok: true, value: { ...base, equation: text(command.equation), domain: command.domain || null, samples: Math.max(16, Math.min(240, number(command.samples, 120))) } };
    if (type === "constructPerpendicularBisector") return { ok: true, value: { ...base, x1: number(command.x1), y1: number(command.y1), x2: number(command.x2), y2: number(command.y2) } };
    if (type === "constructAngleBisector") {
      return { ok: true, value: { ...base, vertex: { x: number(command.vertex?.x, 450), y: number(command.vertex?.y, 350) }, rayA: { x: number(command.rayA?.x, 280), y: number(command.rayA?.y, 260) }, rayB: { x: number(command.rayB?.x, 620), y: number(command.rayB?.y, 250) } } };
    }
    return { ok: false, error: `Command ${type} is not handled.` };
  }

  function validateStep(step, index = 0) {
    if (!step || typeof step !== "object") return { ok: false, error: `Step ${index + 1} is not an object.` };
    const commands = Array.isArray(step.commands) ? step.commands : [];
    const accepted = [];
    const rejected = [];
    commands.forEach((command, commandIndex) => {
      const result = validateCommand(command, commandIndex);
      if (result.ok) accepted.push(result.value);
      else rejected.push(result.error);
    });
    return {
      ok: true,
      value: {
        id: text(step.id) || uid("step"),
        title: text(step.title, `Step ${index + 1}`),
        instruction: text(step.instruction),
        explanation: text(step.explanation),
        hint: text(step.hint),
        expectedTool: text(step.expectedTool),
        focus: rect(step.focus),
        commands: accepted,
        rejectedCommands: rejected
      }
    };
  }

  function validateLesson(input) {
    if (!input || typeof input !== "object") {
      return { ok: false, error: "Lesson is not an object." };
    }
    const visualMode = VISUAL_MODES.includes(input.visualMode) ? input.visualMode : "none";
    const rawSteps = Array.isArray(input.steps) ? input.steps : [];
    const steps = rawSteps.map(validateStep).filter((item) => item.ok).map((item) => item.value);
    const lesson = {
      id: text(input.id) || uid("lesson"),
      title: text(input.title, "Tutorly Live Board"),
      topic: text(input.topic, input.title || "Study visual"),
      subject: text(input.subject, "general").toLowerCase(),
      visualMode,
      summary: text(input.summary, "A step-by-step visual explanation."),
      steps,
      context: input.context && typeof input.context === "object" ? input.context : {},
      validation: {
        rejectedSteps: Math.max(0, rawSteps.length - steps.length),
        rejectedCommands: steps.flatMap((step) => step.rejectedCommands || [])
      }
    };
    if (!steps.length && visualMode !== "none") {
      return { ok: false, error: "No usable visual steps were returned." };
    }
    return { ok: true, value: lesson };
  }

  Object.assign(root, {
    VISUAL_MODES,
    COMMAND_TYPES,
    uid,
    validateCommand,
    validateStep,
    validateLesson,
    helpers: { text, number, color, points, rect }
  });
})();
