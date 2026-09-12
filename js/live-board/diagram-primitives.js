(function () {
  "use strict";

  const root = window.TutorlyLiveBoard = window.TutorlyLiveBoard || {};

  function make(tag, attrs = {}, children = []) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value !== "" && value != null) node.setAttribute(key, String(value));
    });
    children.forEach((child) => node.appendChild(child));
    return node;
  }

  function textNode(x, y, value, cls = "lb-label") {
    const label = make("text", { x, y, class: cls });
    label.textContent = String(value || "");
    return label;
  }

  function component(command) {
    const { kind, x, y, width, height, label, rotation } = command;
    const group = make("g", { class: `lb-component lb-component-${kind.replace(/[^a-z0-9-]/g, "")}`, transform: `translate(${x} ${y}) rotate(${rotation || 0})` });
    const w = width;
    const h = height;
    if (kind.includes("lens")) {
      group.appendChild(make("path", { d: `M${w / 2} 0 C${w * 0.92} ${h * 0.2} ${w * 0.92} ${h * 0.8} ${w / 2} ${h} C${w * 0.08} ${h * 0.8} ${w * 0.08} ${h * 0.2} ${w / 2} 0Z`, class: "lb-glass" }));
    } else if (kind.includes("battery")) {
      group.appendChild(make("line", { x1: w * 0.28, y1: h * 0.2, x2: w * 0.28, y2: h * 0.8, class: "lb-line lb-thick" }));
      group.appendChild(make("line", { x1: w * 0.5, y1: h * 0.32, x2: w * 0.5, y2: h * 0.68, class: "lb-line" }));
      group.appendChild(textNode(w * 0.66, h * 0.52, "+", "lb-small-label"));
    } else if (kind.includes("bulb")) {
      group.appendChild(make("circle", { cx: w / 2, cy: h / 2, r: Math.min(w, h) * 0.36, class: "lb-component-fill" }));
      group.appendChild(make("path", { d: `M${w * 0.34} ${h * 0.5} C${w * 0.42} ${h * 0.25} ${w * 0.58} ${h * 0.75} ${w * 0.66} ${h * 0.5}`, class: "lb-line" }));
    } else if (kind.includes("switch")) {
      group.appendChild(make("circle", { cx: w * 0.25, cy: h * 0.66, r: 6, class: "lb-dot" }));
      group.appendChild(make("circle", { cx: w * 0.75, cy: h * 0.66, r: 6, class: "lb-dot" }));
      group.appendChild(make("line", { x1: w * 0.25, y1: h * 0.62, x2: w * 0.67, y2: h * 0.32, class: "lb-line lb-thick" }));
    } else if (kind.includes("block")) {
      group.appendChild(make("rect", { x: 0, y: 0, width: w, height: h, rx: 14, class: "lb-component-fill" }));
    } else if (kind.includes("sun")) {
      group.appendChild(make("circle", { cx: w / 2, cy: h / 2, r: Math.min(w, h) * 0.28, class: "lb-sun" }));
    } else if (kind.includes("cloud")) {
      group.appendChild(make("path", { d: `M${w * 0.18} ${h * 0.7} C${w * 0.12} ${h * 0.46} ${w * 0.34} ${h * 0.38} ${w * 0.44} ${h * 0.5} C${w * 0.54} ${h * 0.22} ${w * 0.86} ${h * 0.38} ${w * 0.78} ${h * 0.7} Z`, class: "lb-component-fill" }));
    } else {
      group.appendChild(make("rect", { x: 0, y: 0, width: w, height: h, rx: 16, class: "lb-component-fill" }));
    }
    if (label) group.appendChild(textNode(w / 2, h + 22, label, "lb-component-label"));
    return group;
  }

  root.DiagramPrimitives = { make, textNode, component };
})();
