(function () {
  "use strict";

  const root = window.TutorlyLiveBoard = window.TutorlyLiveBoard || {};
  const ns = "http://www.w3.org/2000/svg";

  function el(tag, attrs = {}) {
    const node = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value !== "" && value != null) node.setAttribute(key, String(value));
    });
    return node;
  }

  function pointsToPath(points, closed = false) {
    if (!points.length) return "";
    return points.map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`).join(" ") + (closed ? " Z" : "");
  }

  function label(group, x, y, value, cls = "lb-label") {
    if (!value) return;
    const node = el("text", { x, y, class: cls });
    node.textContent = value;
    group.appendChild(node);
  }

  function createSvg(container) {
    container.innerHTML = "";
    const svg = el("svg", { viewBox: "0 0 1000 650", class: "live-board-svg", role: "img", "aria-label": "Tutorly Live Board" });
    svg.innerHTML = `
      <defs>
        <marker id="lb-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10Z" class="lb-arrow-head"></path>
        </marker>
      </defs>
      <g class="lb-background"></g>
      <g class="lb-tutorly-layer"></g>
      <g class="lb-student-layer"></g>
      <g class="lb-focus-layer"></g>
    `;
    container.appendChild(svg);
    return svg;
  }

  class BoardEngine {
    constructor(container, options = {}) {
      this.container = container;
      this.svg = createSvg(container);
      this.tutorlyLayer = this.svg.querySelector(".lb-tutorly-layer");
      this.studentLayer = this.svg.querySelector(".lb-student-layer");
      this.focusLayer = this.svg.querySelector(".lb-focus-layer");
      this.lesson = null;
      this.stepIndex = 0;
      this.studentCommands = [];
      this.redoStack = [];
      this.tool = "select";
      this.currentStroke = null;
      this.onStudentChange = options.onStudentChange || (() => {});
      this.bindPointer();
      this.bindViewport();
    }

    setLesson(lesson) {
      this.lesson = lesson;
      this.stepIndex = 0;
      this.studentCommands = [];
      this.redoStack = [];
      this.render();
    }

    compactState() {
      return {
        lessonId: this.lesson?.id || "",
        stepIndex: this.stepIndex,
        studentCommandCount: this.studentCommands.length,
        topic: this.lesson?.topic || ""
      };
    }

    setStep(index) {
      if (!this.lesson) return;
      this.stepIndex = Math.max(0, Math.min(index, this.lesson.steps.length - 1));
      this.render();
    }

    next() { this.setStep(this.stepIndex + 1); }
    previous() { this.setStep(this.stepIndex - 1); }
    replay() { this.setStep(0); }

    setTool(tool) {
      this.tool = tool || "select";
    }

    undo() {
      const item = this.studentCommands.pop();
      if (item) this.redoStack.push(item);
      this.renderStudentLayer();
      this.onStudentChange(this.compactState());
    }

    redo() {
      const item = this.redoStack.pop();
      if (item) this.studentCommands.push(item);
      this.renderStudentLayer();
      this.onStudentChange(this.compactState());
    }

    clearStudentLayer() {
      this.studentCommands = [];
      this.redoStack = [];
      this.renderStudentLayer();
      this.onStudentChange(this.compactState());
    }

    render() {
      if (!this.lesson) return;
      const steps = this.lesson.steps.slice(0, this.stepIndex + 1);
      this.tutorlyLayer.innerHTML = "";
      let pending = [];
      let focus = null;
      steps.forEach((step) => {
        step.commands.forEach((command) => {
          if (command.type === "clearTutorLayer") pending = [];
          else pending.push(command);
        });
        if (step.focus) focus = step.focus;
      });
      pending.forEach((command) => this.renderCommand(command, this.tutorlyLayer));
      this.renderStudentLayer();
      this.renderFocus(focus || steps.at(-1)?.commands?.find((command) => command.type === "focus")?.box || null);
    }

    renderStudentLayer() {
      this.studentLayer.innerHTML = "";
      this.studentCommands.forEach((command) => this.renderCommand(command, this.studentLayer, true));
    }

    renderFocus(box) {
      this.focusLayer.innerHTML = "";
      if (!box) return;
      const pad = 18;
      this.focusLayer.appendChild(el("rect", {
        x: box.x - pad,
        y: box.y - pad,
        width: box.width + pad * 2,
        height: box.height + pad * 2,
        rx: 18,
        class: "lb-focus-box"
      }));
    }

    renderCommand(command, group, student = false) {
      const cls = student ? "lb-student-mark" : "lb-tutor-mark";
      const color = command.color || "";
      const common = color ? { style: `--lb-command-color:${color}` } : {};
      if (command.type === "drawPoint" || command.type === "plotPoint") {
        group.appendChild(el("circle", { cx: command.x, cy: command.y, r: command.r || 7, class: `${cls} lb-point`, ...common }));
        label(group, command.x + 12, command.y - 10, command.label);
        return;
      }
      if (command.type === "drawLine" || command.type === "drawRay" || command.type === "drawArrow") {
        const marker = command.type === "drawLine" ? "" : "url(#lb-arrow)";
        group.appendChild(el("line", { x1: command.x1, y1: command.y1, x2: command.x2, y2: command.y2, class: `${cls} lb-line ${command.dashed ? "lb-dashed" : ""}`, "marker-end": marker, ...common }));
        label(group, (command.x1 + command.x2) / 2 + 8, (command.y1 + command.y2) / 2 - 8, command.label);
        return;
      }
      if (command.type === "drawCircle") {
        group.appendChild(el("circle", { cx: command.x, cy: command.y, r: command.r, class: `${cls} lb-circle ${command.dashed ? "lb-dashed" : ""}`, ...common }));
        label(group, command.x + command.r + 8, command.y, command.label);
        return;
      }
      if (command.type === "drawArc") {
        const start = (command.start * Math.PI) / 180;
        const end = (command.end * Math.PI) / 180;
        const x1 = command.x + command.r * Math.cos(start);
        const y1 = command.y + command.r * Math.sin(start);
        const x2 = command.x + command.r * Math.cos(end);
        const y2 = command.y + command.r * Math.sin(end);
        const large = Math.abs(command.end - command.start) > 180 ? 1 : 0;
        group.appendChild(el("path", { d: `M${x1} ${y1} A${command.r} ${command.r} 0 ${large} 1 ${x2} ${y2}`, class: `${cls} lb-line`, ...common }));
        return;
      }
      if (command.type === "drawRectangle") {
        group.appendChild(el("rect", { x: command.x, y: command.y, width: command.width, height: command.height, rx: command.rx || 12, class: `${cls} lb-rect`, ...common }));
        label(group, command.x + command.width / 2, command.y + command.height + 20, command.label, "lb-centered-label");
        return;
      }
      if (command.type === "drawPath") {
        group.appendChild(el("path", { d: pointsToPath(command.points || [], command.closed), class: `${cls} lb-path ${command.dashed ? "lb-dashed" : ""}`, ...common }));
        return;
      }
      if (command.type === "drawPolygon") {
        const polygon = el("polygon", { points: (command.points || []).map((point) => `${point.x},${point.y}`).join(" "), class: `${cls} lb-polygon`, ...common });
        group.appendChild(polygon);
        return;
      }
      if (command.type === "drawText" || command.type === "drawEquation") {
        label(group, command.x, command.y, command.text, command.type === "drawEquation" ? "lb-equation" : "lb-label");
        return;
      }
      if (command.type === "drawComponent") {
        group.appendChild(root.DiagramPrimitives.component(command));
        return;
      }
      if (command.type === "drawCoordinatePlane") {
        this.renderCoordinatePlane(command, group);
        return;
      }
      if (command.type === "plotFunction") {
        this.renderFunction(command, group);
        return;
      }
      if (command.type === "constructPerpendicularBisector") {
        this.renderPerpendicularBisector(command, group);
        return;
      }
      if (command.type === "constructAngleBisector") {
        this.renderAngleBisector(command, group);
        return;
      }
      if (command.type === "highlight" && command.box) {
        group.appendChild(el("rect", { x: command.box.x, y: command.box.y, width: command.box.width, height: command.box.height, rx: 20, class: "lb-highlight" }));
      }
    }

    renderCoordinatePlane(command, group) {
      const mapper = root.GraphEngine.createMapper(command.domain);
      const { xMin, xMax, yMin, yMax, box, map } = mapper;
      const plane = el("g", { class: "lb-graph-plane" });
      for (let x = Math.ceil(xMin); x <= Math.floor(xMax); x += 1) {
        const a = map(x, yMin);
        const b = map(x, yMax);
        plane.appendChild(el("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: x === 0 ? "lb-axis" : "lb-grid" }));
      }
      for (let y = Math.ceil(yMin); y <= Math.floor(yMax); y += 1) {
        const a = map(xMin, y);
        const b = map(xMax, y);
        plane.appendChild(el("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: y === 0 ? "lb-axis" : "lb-grid" }));
      }
      plane.appendChild(el("rect", { x: box.x, y: box.y, width: box.width, height: box.height, class: "lb-graph-frame" }));
      label(plane, box.x + box.width + 12, map(0, 0).y - 8, "x", "lb-axis-label");
      label(plane, map(0, 0).x + 10, box.y - 12, "y", "lb-axis-label");
      group.appendChild(plane);
    }

    renderFunction(command, group) {
      const result = root.GraphEngine.functionPoints(command.equation, command.domain || { xMin: -5, xMax: 5, yMin: -5, yMax: 5 }, command.samples);
      if (!result.ok) {
        label(group, 180, 120, result.error || "Unsupported expression.", "lb-error-label");
        return;
      }
      const d = pointsToPath(result.points, false);
      group.appendChild(el("path", { d, class: "lb-graph-function", style: command.color ? `--lb-command-color:${command.color}` : "" }));
      label(group, result.points.at(-1).x + 8, result.points.at(-1).y - 8, command.label || command.equation, "lb-equation-label");
    }

    renderPerpendicularBisector(command, group) {
      const built = root.GeometryEngine.perpendicularBisector(command);
      this.renderCommand({ type: "drawLine", x1: command.x1, y1: command.y1, x2: command.x2, y2: command.y2, label: "segment" }, group);
      built.arcs.forEach((arc) => this.renderCommand({ type: "drawCircle", x: arc.x, y: arc.y, r: arc.r, dashed: true }, group));
      this.renderCommand({ type: "drawLine", ...built.line, label: "perpendicular bisector", dashed: true, color: "#7c3aed" }, group);
      this.renderCommand({ type: "drawPoint", x: built.mid.x, y: built.mid.y, label: "midpoint", color: "#2563eb" }, group);
    }

    renderAngleBisector(command, group) {
      const built = root.GeometryEngine.angleBisector(command);
      this.renderCommand({ type: "drawRay", x1: built.vertex.x, y1: built.vertex.y, x2: built.rayA.x, y2: built.rayA.y }, group);
      this.renderCommand({ type: "drawRay", x1: built.vertex.x, y1: built.vertex.y, x2: built.rayB.x, y2: built.rayB.y }, group);
      this.renderCommand({ type: "drawRay", ...built.bisector, label: "angle bisector", color: "#7c3aed" }, group);
    }

    svgPoint(event) {
      const point = this.svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      return point.matrixTransform(this.svg.getScreenCTM().inverse());
    }

    bindPointer() {
      this.svg.addEventListener("pointerdown", (event) => {
        if (this.tool === "select" || event.button !== 0) return;
        const p = this.svgPoint(event);
        if (this.tool === "point") {
          this.pushStudent({ type: "drawPoint", x: p.x, y: p.y, label: "" });
          return;
        }
        this.currentStroke = { tool: this.tool, start: p, points: [p] };
        this.svg.setPointerCapture(event.pointerId);
      });
      this.svg.addEventListener("pointermove", (event) => {
        if (!this.currentStroke) return;
        const p = this.svgPoint(event);
        if (["pen", "highlighter", "eraser"].includes(this.currentStroke.tool)) {
          this.currentStroke.points.push(p);
          this.renderPreview();
        }
      });
      this.svg.addEventListener("pointerup", (event) => {
        if (!this.currentStroke) return;
        const p = this.svgPoint(event);
        const { tool, start, points } = this.currentStroke;
        this.currentStroke = null;
        if (tool === "pen" || tool === "highlighter" || tool === "eraser") {
          this.pushStudent({ type: "drawPath", points, width: tool === "highlighter" ? 12 : tool === "eraser" ? 18 : 3, color: tool === "highlighter" ? "rgba(250, 204, 21, .56)" : tool === "eraser" ? "#f8fbff" : "#1d4ed8" });
        } else if (tool === "line" || tool === "ray" || tool === "arrow") {
          this.pushStudent({ type: tool === "line" ? "drawLine" : tool === "ray" ? "drawRay" : "drawArrow", x1: start.x, y1: start.y, x2: p.x, y2: p.y });
        } else if (tool === "rectangle") {
          this.pushStudent({ type: "drawRectangle", x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), width: Math.abs(p.x - start.x), height: Math.abs(p.y - start.y) });
        } else if (tool === "circle") {
          this.pushStudent({ type: "drawCircle", x: start.x, y: start.y, r: Math.max(6, Math.hypot(p.x - start.x, p.y - start.y)) });
        } else if (tool === "text") {
          this.pushStudent({ type: "drawText", x: p.x, y: p.y, text: document.getElementById("studentTextValue")?.value || "Note" });
        }
      });
    }

    bindViewport() {
      this.svg.addEventListener("wheel", (event) => {
        event.preventDefault();
        const current = this.svg.viewBox.baseVal;
        const factor = event.deltaY > 0 ? 1.08 : 0.92;
        const nextWidth = Math.max(420, Math.min(1300, current.width * factor));
        const nextHeight = nextWidth * 0.65;
        this.svg.setAttribute("viewBox", `${current.x + (current.width - nextWidth) / 2} ${current.y + (current.height - nextHeight) / 2} ${nextWidth} ${nextHeight}`);
      }, { passive: false });
    }

    renderPreview() {
      this.renderStudentLayer();
      if (!this.currentStroke) return;
      this.renderCommand({ type: "drawPath", points: this.currentStroke.points, width: this.currentStroke.tool === "highlighter" ? 12 : 3 }, this.studentLayer, true);
    }

    pushStudent(command) {
      const validated = root.validateCommand({ ...command, layer: "student" });
      if (!validated.ok) return;
      this.studentCommands.push(validated.value);
      this.redoStack = [];
      this.renderStudentLayer();
      this.onStudentChange(this.compactState());
    }

    resetView() {
      this.svg.setAttribute("viewBox", "0 0 1000 650");
    }
  }

  root.BoardEngine = BoardEngine;
})();
