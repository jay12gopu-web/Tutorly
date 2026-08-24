"use strict";

const assert = require("node:assert/strict");
const renderer = require("../js/chatbot/rich-response-renderer.js");
const markdown = require("../js/chatbot/markdown-renderer.js");

const chart = renderer.parseChartSpec(JSON.stringify({
  type: "bar",
  title: "Planet sizes",
  xKey: "planet",
  series: [{ key: "diameter", label: "Diameter" }],
  data: [
    { planet: "Earth", diameter: 12742 },
    { planet: "Mars", diameter: 6779 },
  ],
}));
assert.equal(chart.type, "bar");
assert.equal(chart.data.length, 2);
assert.match(renderer.renderChart(chart), /tutorly-chart-block/);

assert.match(
  renderer.validateMermaid("flowchart TD\n  A[Water] --> B[Vapour]"),
  /^flowchart/
);
assert.throws(
  () => renderer.validateMermaid("flowchart TD\n  A --> B\n  click A javascript:alert(1)"),
  /unsupported/i
);
assert.throws(
  () => renderer.validateMermaid("flowchart TD\n  A --> B\n  classDef danger fill:red"),
  /unsupported/i
);
assert.throws(
  () => renderer.parseChartSpec('{"type":"bar","data":[{"name":"A","value":"not-a-number"}]}'),
  /not numeric/i
);

assert.match(renderer.renderCodeBlock("python", "for i in range(3):\n    print(i)"), /data-copy-source/);
assert.match(renderer.renderMath("x^2 + y^2 = z^2", true), /tutorly-katex/);

const writingMarkup = renderer.renderCodeBlock(
  "writing",
  "TITLE: Protecting Our Environment\nGood morning everyone. <script>alert('no')</script>"
);
assert.match(writingMarkup, /tutorly-writing-block/);
assert.match(writingMarkup, /Protecting Our Environment/);
assert.match(writingMarkup, /data-copy-source/);
assert.ok(writingMarkup.includes("&lt;script&gt;"), "writing content must be escaped");
assert.ok(!writingMarkup.includes("<script>"), "writing content must not inject HTML");
const renderedWriting = markdown.render(
  "Here is the speech:\n\n```writing\nTITLE: Assembly Speech\nGood morning, everyone.\n```",
  { richResponse: renderer }
);
assert.ok(renderedWriting.includes("tutorly-writing-block"));
assert.ok(renderedWriting.includes("Assembly Speech"));

const inlineLatex = String.raw`\frac{-8}{2\cdot2} + \boxed{x=2} + \sqrt{16}`;
const matrixLatex = String.raw`\begin{bmatrix}1 & 2 \\ 3 & 4\end{bmatrix}`;
const projectileLatex = String.raw`x(t)=v_{0x}t,\quad v_y=v_0\sin(\theta)-gt,\quad \text{units: m/s}`;
const inlineMarkup = renderer.renderMath(inlineLatex, false);
const displayMarkup = renderer.renderMath(matrixLatex, true);
const projectileMarkup = renderer.renderMath(projectileLatex, true);
assert.match(inlineMarkup, /^<span/);
assert.match(displayMarkup, /^<div/);
assert.equal((inlineMarkup.match(/\\/g) || []).length, (inlineLatex.match(/\\/g) || []).length);
assert.equal((displayMarkup.match(/\\/g) || []).length, (matrixLatex.match(/\\/g) || []).length);
assert.ok(inlineMarkup.includes(String.raw`\frac{-8}{2\cdot2}`));
assert.ok(inlineMarkup.includes(String.raw`\boxed{x=2}`));
assert.ok(inlineMarkup.includes(String.raw`\sqrt{16}`));
assert.ok(displayMarkup.includes(String.raw`\begin{bmatrix}`));
assert.ok(displayMarkup.includes(String.raw`\\ 3 &amp; 4\end{bmatrix}`));
assert.ok(projectileMarkup.includes(String.raw`x(t)=v_{0x}t`));
assert.ok(projectileMarkup.includes(String.raw`\text{units: m/s}`));
assert.ok(projectileMarkup.includes(String.raw`\theta`));
assert.ok(!projectileMarkup.includes("v_{0x},t"));
assert.ok(!/[\u0008\u0009\u000c]/.test(inlineMarkup + displayMarkup + projectileMarkup));

const mermaidBlock = [
  "```mermaid",
  "flowchart LR",
  "A[Launch] --> B[Projectile rises]",
  "B --> C[Maximum height]",
  "C --> D[Projectile falls]",
  "```",
].join("\n");
const tableBlock = [
  "| Component | Acceleration |",
  "|---|---|",
  "| Horizontal | 0 |",
  "| Vertical | $-g$ |",
].join("\n");
const latexBlock = [
  "Inline velocity: $v_y = u_y - gt$.",
  "",
  "$$",
  "y = u_y t - \\frac{1}{2}gt^2",
  "$$",
].join("\n");
const codeBlock = "```python\nprint('projectile')\n```";

const combinations = [
  { source: `Text before.\n\n${latexBlock}`, expected: ["tutorly-katex"] },
  { source: `Text before.\n\n${mermaidBlock}`, expected: ["tutorly-diagram-block"] },
  { source: `Text before.\n\n${tableBlock}`, expected: ["markdown-table-wrap"] },
  { source: `${latexBlock}\n\n${mermaidBlock}`, expected: ["tutorly-katex", "tutorly-diagram-block"] },
  { source: `${latexBlock}\n\n${tableBlock}\n\n${mermaidBlock}`, expected: ["tutorly-katex", "markdown-table-wrap", "tutorly-diagram-block"] },
  { source: `${codeBlock}\n\n${mermaidBlock}`, expected: ["tutorly-code-block", "tutorly-diagram-block"] },
];
combinations.forEach(({ source, expected }) => {
  const html = markdown.render(source, { richResponse: renderer });
  if (source.includes("Text before")) assert.ok(html.includes("Text before"));
  expected.forEach((className) => assert.ok(html.includes(className), `${className} should render`));
  assert.ok(!html.includes("couldn't process that question"));
});

const malformedMermaid = markdown.render(
  "Explanation remains visible.\n\n```mermaid\nthis is not mermaid\n```\n\nText after diagram.",
  { richResponse: renderer }
);
assert.ok(malformedMermaid.includes("Explanation remains visible"));
assert.ok(malformedMermaid.includes("Text after diagram"));
assert.ok(malformedMermaid.includes("Diagram unavailable"));

const malformedChart = markdown.render(
  "Valid chart explanation.\n\n```chart\n{not valid json}\n```\n\nValid conclusion.",
  { richResponse: renderer }
);
assert.ok(malformedChart.includes("Valid chart explanation"));
assert.ok(malformedChart.includes("Valid conclusion"));
assert.ok(malformedChart.includes("Chart unavailable"));

const unavailableAttachment = markdown.render(
  "Explanation remains visible.\n\n![Projectile Path](attachment://projectile_path.png)",
  { richResponse: renderer }
);
assert.ok(unavailableAttachment.includes("tutorly-attachment-placeholder"));
assert.ok(unavailableAttachment.includes("Projectile Path unavailable"));
assert.ok(!unavailableAttachment.includes("attachment://"));

const mermaidWithFakeAttachment = markdown.render(
  `${mermaidBlock}\n\n![Projectile Path](attachment://projectile_path.png)`,
  { richResponse: renderer }
);
assert.ok(mermaidWithFakeAttachment.includes("tutorly-diagram-block"));
assert.ok(!mermaidWithFakeAttachment.includes("tutorly-attachment-placeholder"));
assert.ok(!mermaidWithFakeAttachment.includes("attachment://"));

const projectilePromptResponse = [
  "# Projectile motion",
  "",
  "A projectile has constant horizontal velocity and vertical acceleration $-g$.",
  "",
  "$$x(t)=v_{0x}t$$",
  "$$y = u\\sin(\\theta)t - \\frac{1}{2}gt^2$$",
  "",
  "## Worked example",
  "For $u=20\\,\\text{m/s}$ and $\\theta=30^\\circ$, calculate the initial vertical velocity:",
  "$$u_y = 20\\sin(30^\\circ)=10\\,\\text{m/s}$$",
  "",
  tableBlock,
  "",
  mermaidBlock,
].join("\n");
const projectileHtml = markdown.render(projectilePromptResponse, { richResponse: renderer });
assert.ok(projectileHtml.includes("Projectile motion"));
assert.ok(projectileHtml.includes("Worked example"));
assert.ok(projectileHtml.includes("tutorly-katex"));
assert.ok(projectileHtml.includes("markdown-table-wrap"));
assert.ok(projectileHtml.includes("tutorly-diagram-block"));
assert.ok(!projectileHtml.includes("couldn't process that question"));

console.log("Tutorly rich response renderer checks passed.");
