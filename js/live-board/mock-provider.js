(function () {
  "use strict";

  const root = window.TutorlyLiveBoard = window.TutorlyLiveBoard || {};
  const helper = () => root.helpers || {};

  function titleCase(value) {
    const text = String(value || "Study visual").replace(/[-_]/g, " ").trim();
    return text.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
  }

  function extractEquations(prompt) {
    const normalized = String(prompt || "").replace(/−/g, "-").replace(/²/g, "^2");
    const matches = normalized.match(/(?:y\s*=\s*[^\n,;]+|x\s*=\s*[+-]?\d+(?:\.\d+)?)/gi) || [];
    return matches
      .map((item) => item.replace(/\s+/g, " ").trim())
      .filter((item, index, list) => root.GraphEngine.parseExpression(item) && list.indexOf(item) === index)
      .slice(0, 3);
  }

  function inferFromSemanticRoute(route) {
    const visual = route?.visual || {};
    if (!visual.needed || visual.type === "none") return "";
    const type = String(visual.type || "").toLowerCase();
    if (type.includes("graph") || type.includes("coordinate")) return "graph";
    if (type.includes("geometry") || type.includes("construction")) return "geometry";
    return "diagram";
  }

  function inferVisualMode(prompt, route) {
    const semanticMode = inferFromSemanticRoute(route);
    if (semanticMode) return semanticMode;
    const text = String(prompt || "").toLowerCase();
    if (extractEquations(text).length || /\bgraph|plot|parabola|coordinate plane|x-axis|y-axis\b/.test(text)) return "graph";
    if (/\bconstruct|bisector|perpendicular|angle|triangle|circle|polygon|geometry\b/.test(text)) return "geometry";
    if (/\bshow|draw|diagram|visual|cycle|circuit|lens|mirror|ray|forces?|flow|path|process|structure\b/.test(text)) return "diagram";
    return "none";
  }

  function commonContext(request, visualMode) {
    const route = request.semanticRoute || request.chatContext?.semanticRoute || {};
    const topic = route.topic || request.currentLesson?.topic || request.prompt || "Tutorly visual";
    return {
      id: root.uid("lesson"),
      title: titleCase(topic).slice(0, 72),
      topic,
      subject: route.subject || "general",
      visualMode,
      summary: visualMode === "none"
        ? "Live visual is not available for this explanation yet."
        : `A step-by-step visual board for ${topic}.`,
      context: {
        source: "mock-visual-lesson-provider",
        conversationId: request.conversationId || "",
        semanticRoute: route,
        prompt: request.prompt || ""
      }
    };
  }

  function graphLesson(request) {
    const equations = extractEquations(request.prompt);
    const primary = equations[0] || "y = x^2";
    const context = commonContext(request, "graph");
    context.title = `Graph ${primary}`;
    context.topic = primary;
    context.steps = [
      {
        id: "graph-plane",
        title: "Set up the plane",
        instruction: "Start with the coordinate plane.",
        explanation: "The grid lets us place x-values horizontally and y-values vertically.",
        hint: "The origin is where both axes meet.",
        expectedTool: "graph",
        focus: { x: 70, y: 48, width: 840, height: 540 },
        commands: [
          { type: "clearTutorLayer" },
          { type: "drawCoordinatePlane", domain: { xMin: -5, xMax: 5, yMin: -6, yMax: 6 } },
          { type: "drawEquation", x: 118, y: 54, text: primary }
        ]
      },
      {
        id: "graph-function",
        title: "Plot the function",
        instruction: "Now draw the function using mathematical coordinates.",
        explanation: "Tutorly calculates the curve from the equation instead of guessing screen pixels.",
        hint: "For a quadratic, equal x-values on both sides often give matching y-values.",
        expectedTool: "graph",
        focus: { x: 80, y: 66, width: 820, height: 500 },
        commands: equations.length
          ? equations.map((equation, index) => ({ type: "plotFunction", equation, color: index === 0 ? "#2563eb" : index === 1 ? "#7c3aed" : "#0891b2", domain: { xMin: -5, xMax: 5, yMin: -6, yMax: 6 } }))
          : [{ type: "plotFunction", equation: primary, domain: { xMin: -5, xMax: 5, yMin: -6, yMax: 6 } }]
      },
      {
        id: "graph-read",
        title: "Read what changed",
        instruction: "Use the graph to compare position, slope, and intercepts.",
        explanation: "The visual helps you see where the function crosses the axes and how quickly it changes.",
        hint: "Ask Tutorly to zoom in or add another line if you want to compare.",
        expectedTool: "select",
        focus: { x: 116, y: 82, width: 760, height: 470 },
        commands: [{ type: "highlight", box: { x: 116, y: 82, width: 760, height: 470 } }]
      }
    ];
    return context;
  }

  function geometryLesson(request) {
    const text = String(request.prompt || "").toLowerCase();
    const context = commonContext(request, "geometry");
    const isAngle = /\bangle\b/.test(text) && !/\bperpendicular\b/.test(text);
    context.title = isAngle ? "Angle Bisector Construction" : "Perpendicular Bisector Construction";
    context.topic = context.title;
    context.steps = isAngle ? [
      {
        id: "angle-rays",
        title: "Draw the angle",
        instruction: "Begin with two rays from the same point.",
        explanation: "The shared endpoint is the vertex. A bisector will split this angle into two equal parts.",
        hint: "Both rays must start at the same vertex.",
        expectedTool: "ray",
        focus: { x: 230, y: 170, width: 520, height: 280 },
        commands: [
          { type: "clearTutorLayer" },
          { type: "constructAngleBisector", vertex: { x: 430, y: 380 }, rayA: { x: 260, y: 245 }, rayB: { x: 680, y: 260 } }
        ]
      },
      {
        id: "angle-check",
        title: "Check equal split",
        instruction: "The middle ray is the bisector.",
        explanation: "It is calculated from the two ray directions, so it sits halfway between them.",
        hint: "The two smaller angles should match.",
        expectedTool: "select",
        focus: { x: 250, y: 210, width: 460, height: 240 },
        commands: [{ type: "highlight", box: { x: 255, y: 220, width: 440, height: 230 } }]
      }
    ] : [
      {
        id: "segment",
        title: "Start with a segment",
        instruction: "Draw the segment whose middle you need.",
        explanation: "The perpendicular bisector must cross this segment exactly at its midpoint.",
        hint: "The segment endpoints stay fixed.",
        expectedTool: "line",
        focus: { x: 220, y: 210, width: 560, height: 210 },
        commands: [
          { type: "clearTutorLayer" },
          { type: "drawPoint", x: 285, y: 330, label: "A" },
          { type: "drawPoint", x: 705, y: 330, label: "B" },
          { type: "drawLine", x1: 285, y1: 330, x2: 705, y2: 330, label: "AB" }
        ]
      },
      {
        id: "construction",
        title: "Construct the bisector",
        instruction: "Use equal arcs from both endpoints.",
        explanation: "Where equal-radius arcs meet, the joining line is perpendicular and passes through the midpoint.",
        hint: "Equal arcs are the key idea.",
        expectedTool: "circle",
        focus: { x: 180, y: 80, width: 650, height: 500 },
        commands: [{ type: "constructPerpendicularBisector", x1: 285, y1: 330, x2: 705, y2: 330 }]
      }
    ];
    return context;
  }

  function flowDiagram(request) {
    const route = request.semanticRoute || {};
    const elements = Array.isArray(route.visual?.elements) && route.visual.elements.length
      ? route.visual.elements.slice(0, 6)
      : String(request.prompt || "Idea to result").split(/\b(?:to|then|and|through|with)\b/i).map((item) => item.trim()).filter(Boolean).slice(0, 5);
    const nodes = elements.length >= 3 ? elements : ["Main idea", "Important change", "Result"];
    const context = commonContext(request, "diagram");
    const gap = 720 / Math.max(1, nodes.length - 1);
    context.steps = nodes.map((node, index) => ({
      id: `flow-${index}`,
      title: index === 0 ? "Start with the first idea" : `Add ${node}`,
      instruction: index === 0 ? "Place the starting idea on the board." : "Connect the next idea in order.",
      explanation: index === 0 ? "A process diagram is easiest when the first box is clear." : "Each arrow shows what happens next, so the explanation follows the visual.",
      hint: "Follow the arrows from left to right.",
      expectedTool: "select",
      focus: { x: 100 + index * Math.min(gap, 180), y: 220, width: 210, height: 120 },
      commands: [
        ...(index === 0 ? [{ type: "clearTutorLayer" }] : []),
        { type: "drawRectangle", x: 120 + index * Math.min(gap, 180), y: 275, width: 148, height: 74, rx: 18, label: node },
        ...(index > 0 ? [{ type: "drawArrow", x1: 120 + (index - 1) * Math.min(gap, 180) + 148, y1: 312, x2: 120 + index * Math.min(gap, 180), y2: 312 }] : [])
      ]
    }));
    return context;
  }

  function componentDiagram(request) {
    const text = String(request.prompt || "").toLowerCase();
    const context = commonContext(request, "diagram");
    if (/\bcircuit|battery|bulb|resistor|switch\b/.test(text)) {
      context.title = "Simple Circuit";
      context.steps = [
        { id: "circuit-loop", title: "Build the loop", instruction: "A circuit needs a closed path.", explanation: "Charges can flow only when the path is complete.", hint: "Look for gaps in the wire.", expectedTool: "select", focus: { x: 170, y: 120, width: 660, height: 370 }, commands: [
          { type: "clearTutorLayer" },
          { type: "drawLine", x1: 210, y1: 220, x2: 780, y2: 220 },
          { type: "drawLine", x1: 780, y1: 220, x2: 780, y2: 470 },
          { type: "drawLine", x1: 780, y1: 470, x2: 210, y2: 470 },
          { type: "drawLine", x1: 210, y1: 470, x2: 210, y2: 220 }
        ] },
        { id: "circuit-parts", title: "Add components", instruction: "Place the battery, bulbs, and switch on the loop.", explanation: "The battery pushes charges; bulbs use electrical energy to glow.", hint: "Series components share one path.", expectedTool: "select", focus: { x: 160, y: 150, width: 700, height: 360 }, commands: [
          { type: "drawComponent", kind: "battery", x: 180, y: 285, width: 88, height: 100, label: "Battery" },
          { type: "drawComponent", kind: "bulb", x: 395, y: 175, width: 96, height: 96, label: "Bulb 1" },
          { type: "drawComponent", kind: "bulb", x: 590, y: 175, width: 96, height: 96, label: "Bulb 2" },
          { type: "drawComponent", kind: "switch", x: 560, y: 420, width: 120, height: 78, label: "Switch" }
        ] }
      ];
      return context;
    }
    if (/\blens|mirror|ray|refraction|reflection\b/.test(text)) {
      const reflection = /\breflection|mirror\b/.test(text);
      context.title = reflection ? "Reflection Ray Diagram" : "Convex Lens Ray Diagram";
      context.steps = [
        { id: "axis", title: "Set the reference line", instruction: "Start with the principal axis or surface normal.", explanation: "This line gives every ray a reference direction.", hint: "Rays are easier when the baseline is clear.", expectedTool: "line", focus: { x: 110, y: 220, width: 780, height: 150 }, commands: [
          { type: "clearTutorLayer" },
          { type: "drawLine", x1: 110, y1: 330, x2: 890, y2: 330, label: reflection ? "surface" : "principal axis", dashed: true },
          ...(reflection ? [{ type: "drawLine", x1: 500, y1: 150, x2: 500, y2: 510, label: "mirror" }] : [{ type: "drawComponent", kind: "lens", x: 455, y: 145, width: 90, height: 360, label: "convex lens" }])
        ] },
        { id: "ray-one", title: "Draw the first ray", instruction: "Show the ray path step by step.", explanation: reflection ? "A reflected ray leaves at the same angle it arrived." : "A parallel ray bends through the focus after a convex lens.", hint: "The bending happens at the lens or mirror.", expectedTool: "ray", focus: { x: 150, y: 180, width: 620, height: 260 }, commands: [
          { type: "drawArrow", x1: 205, y1: 250, x2: 500, y2: 250, label: "incident ray" },
          { type: "drawArrow", x1: 500, y1: 250, x2: reflection ? 785 : 760, y2: reflection ? 150 : 390, label: reflection ? "reflected ray" : "refracted ray", color: "#7c3aed" }
        ] }
      ];
      return context;
    }
    if (/\bforce|block|friction|normal|weight\b/.test(text)) {
      context.title = "Forces on a Block";
      context.steps = [
        { id: "block", title: "Place the object", instruction: "Draw the block and the table first.", explanation: "Forces act on the block, so it is the object we focus on.", hint: "Every arrow starts from the block.", expectedTool: "select", focus: { x: 300, y: 230, width: 400, height: 260 }, commands: [
          { type: "clearTutorLayer" },
          { type: "drawLine", x1: 210, y1: 440, x2: 790, y2: 440, label: "table" },
          { type: "drawComponent", kind: "block", x: 430, y: 330, width: 150, height: 105, label: "block" }
        ] },
        { id: "force-arrows", title: "Add the force arrows", instruction: "Now add weight, normal reaction, and any sideways force.", explanation: "Arrow direction shows force direction; arrow labels tell you what each force is.", hint: "Weight points down; normal reaction points up.", expectedTool: "arrow", focus: { x: 315, y: 160, width: 500, height: 390 }, commands: [
          { type: "drawArrow", x1: 505, y1: 328, x2: 505, y2: 180, label: "Normal", color: "#2563eb" },
          { type: "drawArrow", x1: 505, y1: 435, x2: 505, y2: 555, label: "Weight", color: "#7c3aed" },
          { type: "drawArrow", x1: 580, y1: 382, x2: 735, y2: 382, label: "Applied force", color: "#0891b2" }
        ] }
      ];
      return context;
    }
    return flowDiagram(request);
  }

  function noVisualLesson(request) {
    return {
      ...commonContext(request, "none"),
      steps: [{
        id: "text-only",
        title: "No live visual needed",
        instruction: "Tutorly can answer this in chat.",
        explanation: "Live visual isn't available for this explanation yet.",
        hint: "",
        expectedTool: "",
        commands: []
      }]
    };
  }

  function followUpLesson(request) {
    const lesson = request.currentLesson;
    if (!lesson?.steps?.length) return null;
    const stepIndex = Math.max(0, Math.min(lesson.steps.length - 1, Number(request.compactBoardState?.stepIndex || 0)));
    const focusBox = lesson.steps[stepIndex]?.focus || { x: 80, y: 70, width: 820, height: 500 };
    return {
      ...lesson,
      id: root.uid("lesson"),
      summary: `Updated for: ${request.prompt || lesson.topic}`,
      context: {
        ...(lesson.context || {}),
        prompt: request.prompt || lesson.context?.prompt || "",
        conversationId: request.conversationId || lesson.context?.conversationId || ""
      },
      steps: [
        ...lesson.steps,
        {
          id: root.uid("followup"),
          title: "Follow-up focus",
          instruction: "Keep the existing board visible while Tutorly answers in chat.",
          explanation: "This keeps the visual context from the same conversation instead of starting a separate Live Board chat.",
          hint: "Use the normal Tutorly chat to ask what to highlight, move, add, or replay.",
          expectedTool: "select",
          focus: focusBox,
          commands: [{ type: "highlight", box: focusBox }]
        }
      ].slice(-8)
    };
  }

  async function generateLesson(request = {}) {
    const prompt = helper().text ? helper().text(request.prompt, "") : String(request.prompt || "");
    const visualMode = inferVisualMode(prompt, request.semanticRoute || request.chatContext?.semanticRoute);
    await new Promise((resolve) => window.setTimeout(resolve, 90));
    if (request.followUp && request.currentLesson?.visualMode && request.currentLesson.visualMode !== "none" && visualMode === "none") {
      return followUpLesson(request) || noVisualLesson({ ...request, prompt });
    }
    if (visualMode === "graph") return graphLesson({ ...request, prompt });
    if (visualMode === "geometry") return geometryLesson({ ...request, prompt });
    if (visualMode === "diagram") return componentDiagram({ ...request, prompt });
    return noVisualLesson({ ...request, prompt });
  }

  root.MockVisualLessonProvider = { generateLesson, inferVisualMode, extractEquations };
})();
