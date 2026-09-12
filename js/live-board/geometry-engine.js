(function () {
  "use strict";

  const root = window.TutorlyLiveBoard = window.TutorlyLiveBoard || {};

  function midpoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function perpendicularBisector(command) {
    const a = { x: command.x1, y: command.y1 };
    const b = { x: command.x2, y: command.y2 };
    const mid = midpoint(a, b);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    const radius = Math.max(90, length * 0.72);
    return {
      mid,
      line: {
        x1: mid.x - nx * 260,
        y1: mid.y - ny * 260,
        x2: mid.x + nx * 260,
        y2: mid.y + ny * 260
      },
      arcs: [
        { x: a.x, y: a.y, r: radius, start: -60, end: 60 },
        { x: b.x, y: b.y, r: radius, start: 120, end: 240 }
      ]
    };
  }

  function angleBisector(command) {
    const vertex = command.vertex;
    const rayA = command.rayA;
    const rayB = command.rayB;
    const va = { x: rayA.x - vertex.x, y: rayA.y - vertex.y };
    const vb = { x: rayB.x - vertex.x, y: rayB.y - vertex.y };
    const la = Math.hypot(va.x, va.y) || 1;
    const lb = Math.hypot(vb.x, vb.y) || 1;
    const ux = va.x / la + vb.x / lb;
    const uy = va.y / la + vb.y / lb;
    const scale = 230 / (Math.hypot(ux, uy) || 1);
    return {
      vertex,
      rayA,
      rayB,
      bisector: { x1: vertex.x, y1: vertex.y, x2: vertex.x + ux * scale, y2: vertex.y + uy * scale }
    };
  }

  root.GeometryEngine = { midpoint, perpendicularBisector, angleBisector };
})();
