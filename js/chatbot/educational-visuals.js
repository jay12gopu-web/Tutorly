(function () {
  "use strict";

  const scienceFlows = {
    photosynthesis: {
      title: "Photosynthesis",
      nodes: ["Sunlight", "Water + CO₂", "Leaf (chlorophyll)", "Glucose + O₂"],
      caption: "Light energy helps the leaf turn water and carbon dioxide into glucose and oxygen."
    },
    respiration: {
      title: "Cellular Respiration",
      nodes: ["Glucose + O₂", "Cell", "Energy (ATP)", "CO₂ + Water"],
      caption: "Cells release usable energy from glucose, usually using oxygen."
    },
    "water cycle": {
      title: "Water Cycle",
      nodes: ["Evaporation", "Condensation", "Precipitation", "Collection"],
      cycle: true,
      caption: "Water continuously moves between Earth’s surface and the atmosphere."
    },
    sublimation: {
      title: "Sublimation",
      nodes: ["Solid", "Heat absorbed", "Gas"],
      skipped: "Liquid state is skipped",
      caption: "During sublimation, a solid changes directly into gas without becoming liquid."
    },
    "change of state": {
      title: "Changes of State",
      nodes: ["Solid", "Liquid", "Gas"],
      caption: "Heating and cooling move matter between solid, liquid, and gas states."
    },
    digestion: {
      title: "Digestive Path",
      nodes: ["Mouth", "Oesophagus", "Stomach", "Small intestine", "Large intestine"],
      caption: "Food is broken down, nutrients are absorbed, and remaining waste moves onward."
    },
    "blood circulation": {
      title: "Double Circulation",
      nodes: ["Heart", "Lungs", "Heart", "Body"],
      cycle: true,
      caption: "Blood travels through the pulmonary circuit and the body circuit."
    },
    circulation: {
      title: "Blood Circulation",
      nodes: ["Heart", "Arteries", "Body tissues", "Veins"],
      cycle: true,
      caption: "The heart pumps blood out through arteries and receives it back through veins."
    },
    "carbon cycle": {
      title: "Carbon Cycle",
      nodes: ["Atmospheric CO₂", "Plants", "Animals", "Respiration / decay"],
      cycle: true,
      caption: "Carbon moves among the atmosphere, living things, soil, and oceans."
    },
    "nitrogen cycle": {
      title: "Nitrogen Cycle",
      nodes: ["Atmospheric N₂", "Fixation", "Plant uptake", "Animals", "Decomposition"],
      cycle: true,
      caption: "Microorganisms make atmospheric nitrogen usable and return it through decomposition."
    },
    "rock cycle": {
      title: "Rock Cycle",
      nodes: ["Igneous", "Sedimentary", "Metamorphic", "Magma"],
      cycle: true,
      caption: "Cooling, weathering, pressure, heat, and melting transform rocks over time."
    },
    "food chain": {
      title: "Food Chain",
      nodes: ["Sun", "Plant", "Herbivore", "Carnivore", "Decomposer"],
      caption: "Arrows show the direction in which energy moves."
    },
    "food web": {
      title: "Simple Food Web",
      nodes: ["Plants", "Insects", "Rabbit", "Bird", "Fox"],
      network: true,
      caption: "A food web links several feeding relationships in one ecosystem."
    }
  };

  const structureLabels = {
    "plant cell": ["Cell wall", "Cell membrane", "Nucleus", "Chloroplasts", "Large vacuole"],
    "animal cell": ["Cell membrane", "Cytoplasm", "Nucleus", "Mitochondria"],
    cell: ["Cell membrane", "Cytoplasm", "Nucleus", "Organelles"],
    "human heart": ["Right atrium", "Right ventricle", "Left atrium", "Left ventricle", "Major blood vessels"],
    heart: ["Right side", "Left side", "Atria", "Ventricles", "Major blood vessels"],
    nephron: ["Bowman’s capsule", "Glomerulus", "Tubule", "Loop of Henle", "Collecting duct"],
    "atom structure": ["Nucleus", "Protons", "Neutrons", "Electron shell", "Electron"],
    atom: ["Nucleus", "Protons", "Neutrons", "Electron shell", "Electron"],
    eye: ["Cornea", "Iris", "Lens", "Retina", "Optic nerve"],
    ear: ["Outer ear", "Eardrum", "Ossicles", "Cochlea", "Auditory nerve"]
  };

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function titleCase(value) {
    return String(value || "Concept").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function markerDefs() {
    return `
      <defs>
        <marker id="tutorly-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" class="edu-arrow-head"></path>
        </marker>
      </defs>
    `;
  }

  function flowSvg(config) {
    const nodes = config.nodes || [];
    const width = 720;
    const boxWidth = Math.min(142, Math.max(104, (width - 80) / Math.max(nodes.length, 1) - 18));
    const gap = (width - 48 - boxWidth * nodes.length) / Math.max(nodes.length - 1, 1);
    const y = 82;
    const boxes = nodes.map((node, index) => {
      const x = 24 + index * (boxWidth + gap);
      const arrow = index < nodes.length - 1
        ? `<line x1="${x + boxWidth + 5}" y1="${y + 34}" x2="${x + boxWidth + gap - 7}" y2="${y + 34}" class="edu-arrow" marker-end="url(#tutorly-arrow)"></line>`
        : "";
      return `
        <g>
          <rect x="${x}" y="${y}" width="${boxWidth}" height="68" rx="16" class="edu-node"></rect>
          <text x="${x + boxWidth / 2}" y="${y + 38}" text-anchor="middle" class="edu-node-label">${escapeHtml(node)}</text>
          ${arrow}
        </g>
      `;
    }).join("");
    const returnArrow = config.cycle
      ? `<path d="M ${width - 42} 164 C ${width - 42} 220, 42 220, 42 164" class="edu-arrow edu-cycle-arrow" fill="none" marker-end="url(#tutorly-arrow)"></path>`
      : "";
    const skipped = config.skipped
      ? `<text x="360" y="190" text-anchor="middle" class="edu-note-label">${escapeHtml(config.skipped)}</text>`
      : "";
    return `<svg viewBox="0 0 ${width} 240" role="img" aria-label="${escapeHtml(config.title)} diagram">${markerDefs()}${boxes}${returnArrow}${skipped}</svg>`;
  }

  function networkSvg(config) {
    const points = [[360, 44], [160, 115], [560, 115], [245, 210], [475, 210]];
    const edges = [[0, 1], [0, 2], [1, 3], [1, 4], [2, 3], [2, 4]];
    return `
      <svg viewBox="0 0 720 260" role="img" aria-label="${escapeHtml(config.title)} diagram">
        ${markerDefs()}
        ${edges.map(([from, to]) => `<line x1="${points[from][0]}" y1="${points[from][1] + 18}" x2="${points[to][0]}" y2="${points[to][1] - 18}" class="edu-arrow" marker-end="url(#tutorly-arrow)"></line>`).join("")}
        ${config.nodes.map((node, index) => `<g><circle cx="${points[index][0]}" cy="${points[index][1]}" r="43" class="edu-node"></circle><text x="${points[index][0]}" y="${points[index][1] + 5}" text-anchor="middle" class="edu-node-label">${escapeHtml(node)}</text></g>`).join("")}
      </svg>
    `;
  }

  function structureSvg(topic, semanticElements = []) {
    const labels = semanticElements.length
      ? semanticElements.slice(0, 5)
      : structureLabels[topic] || ["Main part", "Input", "Process", "Output"];
    const plant = topic === "plant cell";
    const atom = topic.includes("atom");
    const shape = atom
      ? `<circle cx="360" cy="132" r="38" class="edu-core"></circle><ellipse cx="360" cy="132" rx="165" ry="72" class="edu-orbit"></ellipse><ellipse cx="360" cy="132" rx="82" ry="120" class="edu-orbit" transform="rotate(54 360 132)"></ellipse><circle cx="520" cy="116" r="9" class="edu-particle"></circle><circle cx="278" cy="29" r="9" class="edu-particle"></circle>`
      : `<rect x="245" y="42" width="230" height="180" rx="${plant ? 28 : 90}" class="edu-structure-body"></rect><circle cx="360" cy="126" r="38" class="edu-core"></circle><circle cx="300" cy="88" r="13" class="edu-organelle"></circle><circle cx="425" cy="178" r="13" class="edu-organelle"></circle>`;
    const positions = [[90, 46], [82, 104], [76, 170], [535, 72], [530, 164]];
    const anchors = [[270, 82], [320, 112], [342, 152], [450, 90], [430, 176]];
    return `
      <svg viewBox="0 0 720 270" role="img" aria-label="Labeled ${escapeHtml(topic)} diagram">
        ${shape}
        ${labels.map((label, index) => {
          const pos = positions[index] || [535, 205];
          const anchor = anchors[index] || [445, 195];
          const right = pos[0] > 360;
          return `<g><line x1="${anchor[0]}" y1="${anchor[1]}" x2="${right ? pos[0] - 10 : pos[0] + 110}" y2="${pos[1] - 4}" class="edu-label-line"></line><text x="${pos[0]}" y="${pos[1]}" class="edu-label">${escapeHtml(label)}</text></g>`;
        }).join("")}
      </svg>
    `;
  }

  function circuitSvg() {
    return `
      <svg viewBox="0 0 720 260" role="img" aria-label="Simple electric circuit diagram">
        ${markerDefs()}
        <path d="M150 65 H570 V200 H150 Z" class="edu-wire"></path>
        <line x1="150" y1="110" x2="150" y2="160" class="edu-gap"></line>
        <line x1="132" y1="120" x2="168" y2="120" class="edu-battery-long"></line>
        <line x1="140" y1="148" x2="160" y2="148" class="edu-battery-short"></line>
        <circle cx="360" cy="65" r="34" class="edu-component"></circle>
        <path d="M342 65 C350 45 370 85 378 65" class="edu-filament"></path>
        <rect x="500" y="177" width="70" height="46" rx="8" class="edu-component"></rect>
        <text x="360" y="118" text-anchor="middle" class="edu-label">Lamp</text>
        <text x="92" y="142" text-anchor="middle" class="edu-label">Battery</text>
        <text x="535" y="246" text-anchor="middle" class="edu-label">Resistor</text>
      </svg>
    `;
  }

  function raysSvg(topic) {
    const refraction = topic.includes("refract") || topic.includes("lens");
    return `
      <svg viewBox="0 0 720 270" role="img" aria-label="${escapeHtml(titleCase(topic))} ray diagram">
        ${markerDefs()}
        <line x1="80" y1="140" x2="640" y2="140" class="edu-boundary"></line>
        <line x1="360" y1="30" x2="360" y2="240" class="edu-normal"></line>
        <line x1="150" y1="50" x2="356" y2="137" class="edu-ray" marker-end="url(#tutorly-arrow)"></line>
        ${refraction
          ? `<line x1="364" y1="143" x2="490" y2="238" class="edu-ray edu-ray-secondary" marker-end="url(#tutorly-arrow)"></line><text x="500" y="224" class="edu-label">Refracted ray</text>`
          : `<line x1="364" y1="137" x2="570" y2="50" class="edu-ray edu-ray-secondary" marker-end="url(#tutorly-arrow)"></line><text x="520" y="42" class="edu-label">Reflected ray</text>`}
        <text x="120" y="42" class="edu-label">Incident ray</text>
        <text x="372" y="34" class="edu-label">Normal</text>
        <text x="520" y="164" class="edu-label">Boundary</text>
      </svg>
    `;
  }

  function geometrySvg(text) {
    if (/corresponding|alternate|transversal|parallel/.test(text)) {
      return {
        title: "Parallel Lines and a Transversal",
        caption: "Angles in matching corner positions are corresponding angles; when the lines are parallel, they are equal.",
        svg: `
          <svg viewBox="0 0 720 300" role="img" aria-label="Parallel lines cut by a transversal with corresponding angles marked">
            <line x1="90" y1="85" x2="630" y2="85" class="edu-geometry-line"></line>
            <line x1="90" y1="220" x2="630" y2="220" class="edu-geometry-line"></line>
            <line x1="235" y1="20" x2="470" y2="285" class="edu-transversal"></line>
            <path d="M292 85 A42 42 0 0 1 274 52" class="edu-angle-mark"></path>
            <path d="M412 220 A42 42 0 0 1 394 187" class="edu-angle-mark"></path>
            <text x="302" y="61" class="edu-angle-label">∠1</text>
            <text x="423" y="197" class="edu-angle-label">∠2</text>
            <text x="610" y="72" class="edu-label">line a</text>
            <text x="610" y="207" class="edu-label">line b</text>
            <text x="475" y="278" class="edu-label">transversal</text>
          </svg>
        `
      };
    }
    if (/circle|chord|tangent/.test(text)) {
      return {
        title: "Circle Relationships",
        caption: "The radius runs from the centre to the circle; a chord joins two points on the circle; a tangent touches once.",
        svg: `<svg viewBox="0 0 720 300" role="img" aria-label="Labeled circle diagram"><circle cx="340" cy="150" r="105" class="edu-circle"></circle><circle cx="340" cy="150" r="6" class="edu-point"></circle><line x1="340" y1="150" x2="425" y2="89" class="edu-radius"></line><line x1="260" y1="95" x2="420" y2="205" class="edu-chord"></line><line x1="445" y1="35" x2="445" y2="265" class="edu-tangent"></line><text x="365" y="120" class="edu-label">radius</text><text x="285" y="105" class="edu-label">chord</text><text x="458" y="58" class="edu-label">tangent</text><text x="320" y="172" class="edu-label">centre</text></svg>`
      };
    }
    return {
      title: /triangle/.test(text) ? "Triangle" : "Geometry Figure",
      caption: "Use the labels and spatial relationships before choosing a formula or angle rule.",
      svg: `<svg viewBox="0 0 720 300" role="img" aria-label="Labeled triangle diagram"><polygon points="360,38 150,245 575,245" class="edu-triangle"></polygon><text x="350" y="28" class="edu-label">A</text><text x="128" y="264" class="edu-label">B</text><text x="585" y="264" class="edu-label">C</text><line x1="360" y1="38" x2="360" y2="245" class="edu-height"></line><path d="M360 225 h20 v20" class="edu-right-angle"></path><text x="375" y="137" class="edu-label">height</text><text x="335" y="270" class="edu-label">base</text></svg>`
    };
  }

  function parseLinearEquation(text) {
    const normalized = String(text || "").replace(/\s+/g, "").replace(/−/g, "-").toLowerCase();
    const quadratic = normalized.match(/y=([+-]?(?:\d+(?:\.\d+)?|\.\d+)?)x(?:\^2|²)(?:([+-](?:\d+(?:\.\d+)?|\.\d+)?)x)?(?:([+-](?:\d+(?:\.\d+)?|\.\d+)))?/);
    if (quadratic) {
      const coefficient = (value, implicit = 0) => {
        if (value === "" || value === "+") return 1;
        if (value === "-") return -1;
        return value == null ? implicit : Number(value);
      };
      const a = coefficient(quadratic[1], 1);
      const b = coefficient(quadratic[2], 0);
      const c = coefficient(quadratic[3], 0);
      const bLabel = b ? `${b > 0 ? " + " : " - "}${Math.abs(b) === 1 ? "" : Math.abs(b)}x` : "";
      const cLabel = c ? `${c > 0 ? " + " : " - "}${Math.abs(c)}` : "";
      return {
        kind: "quadratic",
        a,
        b,
        c,
        intercept: c,
        label: `y = ${a === 1 ? "" : a === -1 ? "−" : a}x²${bLabel}${cLabel}`,
        evaluate: (x) => a * x * x + b * x + c
      };
    }
    const match = normalized.match(/y=([+-]?(?:\d+(?:\.\d+)?|\.\d+)?)x(?:([+-]\d+(?:\.\d+)?))?/);
    if (!match) return null;
    const slopeText = match[1];
    const slope = slopeText === "" || slopeText === "+" ? 1 : slopeText === "-" ? -1 : Number(slopeText);
    const intercept = Number(match[2] || 0);
    const sign = intercept > 0 ? ` + ${intercept}` : intercept < 0 ? ` - ${Math.abs(intercept)}` : "";
    return {
      kind: "linear",
      slope,
      intercept,
      label: `y = ${slope === 1 ? "" : slope === -1 ? "−" : slope}x${sign}`,
      evaluate: (x) => slope * x + intercept
    };
  }

  function graphSvg(text) {
    const equation = parseLinearEquation(text);
    if (!equation) return null;
    const width = 720;
    const height = 390;
    const originX = 360;
    const originY = 195;
    const scaleX = 55;
    const scaleY = 32;
    const point = (x, y) => [originX + x * scaleX, originY - y * scaleY];
    const candidateXs = [];
    for (let x = -5; x <= 5; x += 1) {
      const y = equation.evaluate(x);
      if (y >= -5.5 && y <= 5.5) candidateXs.push(x);
    }
    const startX = candidateXs[0] ?? -5;
    const endX = candidateXs[candidateXs.length - 1] ?? 5;
    const start = point(startX, equation.evaluate(startX));
    const end = point(endX, equation.evaluate(endX));
    const points = [-2, -1, 0, 1, 2]
      .map((x) => ({ x, y: equation.evaluate(x) }))
      .filter(({ y }) => y >= -5 && y <= 5);
    const curve = equation.kind === "quadratic"
      ? Array.from({ length: 101 }, (_, index) => -5 + index / 10)
        .map((x) => ({ x, y: equation.evaluate(x) }))
        .filter(({ y }) => y >= -5.5 && y <= 5.5)
        .map(({ x, y }) => point(x, y).join(","))
        .join(" ")
      : "";
    const grid = [];
    for (let value = -5; value <= 5; value += 1) {
      const x = originX + value * scaleX;
      const y = originY - value * scaleY;
      grid.push(`<line x1="${x}" y1="30" x2="${x}" y2="360" class="edu-grid-line"></line>`);
      grid.push(`<line x1="70" y1="${y}" x2="650" y2="${y}" class="edu-grid-line"></line>`);
      if (value !== 0) {
        grid.push(`<text x="${x}" y="${originY + 20}" text-anchor="middle" class="edu-axis-label">${value}</text>`);
        grid.push(`<text x="${originX - 14}" y="${y + 5}" text-anchor="end" class="edu-axis-label">${value}</text>`);
      }
    }
    return {
      title: `Graph of ${equation.label}`,
      caption: equation.kind === "linear"
        ? `The gradient is ${equation.slope}; the line crosses the y-axis at ${equation.intercept}.`
        : `The curve is a parabola and crosses the y-axis at ${equation.intercept}.`,
      svg: `
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Coordinate graph of ${escapeHtml(equation.label)}">
          ${markerDefs()}
          ${grid.join("")}
          <line x1="70" y1="${originY}" x2="654" y2="${originY}" class="edu-axis" marker-end="url(#tutorly-arrow)"></line>
          <line x1="${originX}" y1="360" x2="${originX}" y2="26" class="edu-axis" marker-end="url(#tutorly-arrow)"></line>
          <text x="665" y="${originY - 10}" class="edu-axis-title">x</text>
          <text x="${originX + 12}" y="25" class="edu-axis-title">y</text>
          ${equation.kind === "linear"
            ? `<line x1="${start[0]}" y1="${start[1]}" x2="${end[0]}" y2="${end[1]}" class="edu-graph-line"></line>`
            : `<polyline points="${curve}" class="edu-graph-line" fill="none"></polyline>`}
          ${points.map(({ x, y }) => { const p = point(x, y); return `<g><circle cx="${p[0]}" cy="${p[1]}" r="6" class="edu-graph-point"></circle><text x="${p[0] + 9}" y="${p[1] - 9}" class="edu-point-label">(${x}, ${y})</text></g>`; }).join("")}
        </svg>
      `
    };
  }

  function fromSemanticRoute(route, prompt = "") {
    const visual = route?.visual;
    if (!visual?.needed || visual.type === "none") return null;
    const type = String(visual.type || "none");
    const topic = String(route.topic || visual.title || "Educational visual").toLowerCase();
    const elements = Array.isArray(visual.elements)
      ? visual.elements.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 7)
      : [];
    const base = {
      level: 3,
      kind: type,
      subject: route.subject || "general",
      title: visual.title || titleCase(route.topic || type.replace(/_/g, " ")),
      caption: elements.length
        ? "Use the labels and arrows to connect the main parts of the explanation."
        : "Use this visual to follow the main relationship in the explanation."
    };

    if (["graph", "coordinate_plane", "motion_graph", "climate_graph", "supply_demand_graph"].includes(type)) {
      const graph = graphSvg(prompt);
      if (graph) return { ...base, ...graph };
    }
    if (type === "geometry_diagram") {
      return { ...base, ...geometrySvg(topic) };
    }
    if (type === "circuit_diagram") {
      return { ...base, svg: circuitSvg() };
    }
    if (type === "ray_diagram") {
      return { ...base, svg: raysSvg(topic) };
    }
    if (["biology_diagram", "cell_diagram", "organ_diagram", "system_diagram", "chemical_structure"].includes(type)) {
      return { ...base, svg: structureSvg(topic, elements) };
    }

    const knownFlow = scienceFlows[topic];
    const config = knownFlow || {
      title: base.title,
      nodes: elements.length >= 2 ? elements : ["Starting point", "Key change", "Result"],
      cycle: ["timeline", "food_chain"].includes(type) ? false : undefined,
      caption: base.caption
    };
    return {
      ...base,
      title: config.title || base.title,
      caption: config.caption || base.caption,
      svg: config.network ? networkSvg(config) : flowSvg(config)
    };
  }

  function analyze(prompt, options = {}) {
    return fromSemanticRoute(options.semanticRoute || options.route || null, prompt);
  }

  function renderPanel(context) {
    if (!context) return "";
    return `
      <section class="edu-visual-panel" data-visual-level="${Number(context.level) || 1}" data-visual-kind="${escapeHtml(context.kind)}">
        <header class="edu-visual-head">
          <div>
            <span>Visual guide · Level ${Number(context.level) || 1}</span>
            <h3>${escapeHtml(context.title)}</h3>
          </div>
        </header>
        <div class="edu-visual-canvas">${context.svg}</div>
        <p class="edu-visual-caption">${escapeHtml(context.caption)}</p>
      </section>
    `.trim();
  }

  function hydrate(panel) {
    if (!panel) return;
    window.requestAnimationFrame(() => panel.classList.add("is-ready"));
  }

  window.TutorlyEducationalVisuals = { analyze, fromSemanticRoute, renderPanel, hydrate, parseLinearEquation };
})();
