(function () {
  if (window.TutorlyMathRenderer) return;

  const MULTIPLY_SIGNS = new Set(["*", "x", "X", "×"]);
  const DIVIDE_SIGNS = new Set(["/", "÷"]);

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalizeText(text) {
    return String(text || "")
      .replace(/[−–—]/g, "-")
      .replace(/[×✕]/g, "×")
      .replace(/[÷]/g, "÷")
      .replace(/,/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function formatNumber(value, options = {}) {
    if (typeof value === "string") return value;
    if (!Number.isFinite(value)) return String(value);
    const precision = options.precision ?? 8;
    const rounded = Number(value.toFixed(precision));
    if (Number.isInteger(rounded)) return String(rounded);
    return String(rounded).replace(/\.?0+$/, "");
  }

  function gcd(left, right) {
    let a = Math.abs(Math.trunc(left));
    let b = Math.abs(Math.trunc(right));
    while (b) {
      const next = a % b;
      a = b;
      b = next;
    }
    return a || 1;
  }

  function lcm(left, right) {
    if (!left || !right) return 0;
    return Math.abs(left * right) / gcd(left, right);
  }

  function simplifyFraction(numerator, denominator) {
    if (denominator === 0) return { numerator, denominator, text: "undefined" };
    const sign = denominator < 0 ? -1 : 1;
    const cleanNumerator = numerator * sign;
    const cleanDenominator = Math.abs(denominator);
    const divisor = gcd(cleanNumerator, cleanDenominator);
    const finalNumerator = cleanNumerator / divisor;
    const finalDenominator = cleanDenominator / divisor;
    return {
      numerator: finalNumerator,
      denominator: finalDenominator,
      text: finalDenominator === 1 ? String(finalNumerator) : `${finalNumerator}/${finalDenominator}`
    };
  }

  function isWholeNumber(value) {
    return Number.isInteger(value) && Math.abs(value) < 100000000;
  }

  function digitsOf(value) {
    return String(Math.abs(Math.trunc(value))).split("");
  }

  function padLeft(items, size, fill = "") {
    const output = Array.isArray(items) ? [...items] : String(items).split("");
    while (output.length < size) output.unshift(fill);
    return output;
  }

  function signedCoefficient(raw) {
    const clean = String(raw || "").replace(/\s+/g, "");
    if (!clean || clean === "+") return 1;
    if (clean === "-") return -1;
    return Number(clean);
  }

  function parseFractionExpression(text) {
    const normalized = normalizeText(text);
    const match = normalized.match(/(-?\d+)\s*\/\s*(-?\d+)\s*([+\-*xX×÷/])\s*(-?\d+)\s*\/\s*(-?\d+)/);
    if (!match) return null;

    const left = { numerator: Number(match[1]), denominator: Number(match[2]) };
    const operator = match[3];
    const right = { numerator: Number(match[4]), denominator: Number(match[5]) };
    if (!left.denominator || !right.denominator) return null;

    let rawNumerator = 0;
    let rawDenominator = 1;
    const commonDenominator = lcm(left.denominator, right.denominator);
    const steps = [`${left.numerator}/${left.denominator} ${operator} ${right.numerator}/${right.denominator}`];

    if (operator === "+") {
      rawNumerator = left.numerator * (commonDenominator / left.denominator) +
        right.numerator * (commonDenominator / right.denominator);
      rawDenominator = commonDenominator;
      if (left.denominator === right.denominator) {
        steps.push(`${left.numerator + right.numerator}/${left.denominator}`);
      } else {
        steps.push(`${left.numerator * (commonDenominator / left.denominator)}/${commonDenominator} + ${right.numerator * (commonDenominator / right.denominator)}/${commonDenominator}`);
        steps.push(`${rawNumerator}/${rawDenominator}`);
      }
    } else if (operator === "-") {
      rawNumerator = left.numerator * (commonDenominator / left.denominator) -
        right.numerator * (commonDenominator / right.denominator);
      rawDenominator = commonDenominator;
      steps.push(`${rawNumerator}/${rawDenominator}`);
    } else if (MULTIPLY_SIGNS.has(operator)) {
      rawNumerator = left.numerator * right.numerator;
      rawDenominator = left.denominator * right.denominator;
      steps.push(`${rawNumerator}/${rawDenominator}`);
    } else if (DIVIDE_SIGNS.has(operator)) {
      rawNumerator = left.numerator * right.denominator;
      rawDenominator = left.denominator * right.numerator;
      steps.push(`${left.numerator}/${left.denominator} × ${right.denominator}/${right.numerator}`);
      steps.push(`${rawNumerator}/${rawDenominator}`);
    } else {
      return null;
    }

    const simplified = simplifyFraction(rawNumerator, rawDenominator);
    if (simplified.text !== `${rawNumerator}/${rawDenominator}`) steps.push(simplified.text);

    return {
      kind: "fraction",
      label: "Fractions",
      expression: `${left.numerator}/${left.denominator} ${operator} ${right.numerator}/${right.denominator}`,
      left,
      right,
      operator,
      steps,
      answer: simplified.text,
      result: simplified.text
    };
  }

  function parseAlgebra(text) {
    const normalized = normalizeText(text).toLowerCase();
    const equation = normalized.match(/([+-]?\s*\d*\.?\d*)\s*\*?\s*x\s*([+-])\s*(\d+(?:\.\d+)?)\s*=\s*([+-]?\d+(?:\.\d+)?)/);
    if (!equation) return null;

    const coefficient = signedCoefficient(equation[1]);
    const sign = equation[2];
    const constant = Number(equation[3]);
    const right = Number(equation[4]);
    if (!Number.isFinite(coefficient) || !Number.isFinite(constant) || !Number.isFinite(right) || coefficient === 0) {
      return null;
    }

    const movedConstant = sign === "+" ? right - constant : right + constant;
    const exactFraction = simplifyFraction(movedConstant, coefficient);
    const answer = Number.isInteger(movedConstant / coefficient)
      ? formatNumber(movedConstant / coefficient)
      : exactFraction.text;
    const coeffText = coefficient === 1 ? "x" : coefficient === -1 ? "-x" : `${formatNumber(coefficient)}x`;

    return {
      kind: "algebra",
      label: "Algebra",
      expression: `${coeffText} ${sign} ${formatNumber(constant)} = ${formatNumber(right)}`,
      steps: [
        `${coeffText} ${sign} ${formatNumber(constant)} = ${formatNumber(right)}`,
        `${coeffText} = ${formatNumber(movedConstant)}`,
        coefficient === 1 ? `x = ${formatNumber(movedConstant)}` : `x = ${formatNumber(movedConstant)}/${formatNumber(coefficient)}`
      ],
      answer,
      result: answer
    };
  }

  function parseGeometry(text) {
    const normalized = normalizeText(text).toLowerCase();
    let match = normalized.match(/area(?:\s+of)?\s+(?:a\s+)?circle.*(?:radius|r)\s*(?:is|=|:)?\s*(\d+(?:\.\d+)?)/);
    if (match) {
      const radius = Number(match[1]);
      const area = Math.PI * radius * radius;
      return {
        kind: "geometry",
        label: "Geometry",
        topic: "Area of a circle",
        formula: "A = πr²",
        steps: [
          "A = πr²",
          `A = π × ${formatNumber(radius)}²`,
          `A = ${formatNumber(area, { precision: 2 })}`
        ],
        answer: formatNumber(area, { precision: 2 }),
        result: area
      };
    }

    match = normalized.match(/(?:area(?:\s+of)?\s+)?rectangle.*(?:length|l)\s*(?:is|=|:)?\s*(\d+(?:\.\d+)?).*(?:width|breadth|w|b)\s*(?:is|=|:)?\s*(\d+(?:\.\d+)?)/);
    if (match) {
      const length = Number(match[1]);
      const width = Number(match[2]);
      const area = length * width;
      return {
        kind: "geometry",
        label: "Geometry",
        topic: "Area of a rectangle",
        formula: "A = l × w",
        steps: [
          "A = l × w",
          `A = ${formatNumber(length)} × ${formatNumber(width)}`,
          `A = ${formatNumber(area)}`
        ],
        answer: formatNumber(area),
        result: area
      };
    }

    return null;
  }

  function parseTrigonometry(text) {
    const normalized = normalizeText(text).toLowerCase();
    const match = normalized.match(/\b(sin|cos|tan)\s*(\d+(?:\.\d+)?)\s*(?:degree|degrees|deg|°)?/);
    if (!match) return null;

    const fn = match[1];
    const angle = Number(match[2]);
    const key = `${fn}:${angle}`;
    const exactValues = {
      "sin:0": "0",
      "sin:30": "1/2",
      "sin:45": "√2/2",
      "sin:60": "√3/2",
      "sin:90": "1",
      "cos:0": "1",
      "cos:30": "√3/2",
      "cos:45": "√2/2",
      "cos:60": "1/2",
      "cos:90": "0",
      "tan:0": "0",
      "tan:30": "1/√3",
      "tan:45": "1",
      "tan:60": "√3"
    };
    const radians = angle * Math.PI / 180;
    const computed = fn === "sin" ? Math.sin(radians) : fn === "cos" ? Math.cos(radians) : Math.tan(radians);
    const answer = exactValues[key] || formatNumber(computed, { precision: 5 });

    return {
      kind: "trigonometry",
      label: "Trigonometry",
      expression: `${fn} ${formatNumber(angle)}°`,
      steps: [
        `${fn} ${formatNumber(angle)}°`,
        `Use the standard angle value.`,
        `${fn} ${formatNumber(angle)}° = ${answer}`
      ],
      answer,
      result: answer
    };
  }

  function parseStatistics(text) {
    const normalized = normalizeText(text).toLowerCase();
    if (!/\b(mean|average|median|mode)\b/.test(normalized)) return null;

    const numbers = normalized.match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
    if (numbers.length < 2) return null;

    if (/\b(median)\b/.test(normalized)) {
      const sorted = [...numbers].sort((a, b) => a - b);
      const middle = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
      return {
        kind: "statistics",
        label: "Statistics",
        topic: "Median",
        steps: [
          `Numbers: ${numbers.map(formatNumber).join(", ")}`,
          `Sorted: ${sorted.map(formatNumber).join(", ")}`,
          `Middle value = ${formatNumber(median)}`
        ],
        answer: formatNumber(median),
        result: median
      };
    }

    const sum = numbers.reduce((total, value) => total + value, 0);
    const mean = sum / numbers.length;
    return {
      kind: "statistics",
      label: "Statistics",
      topic: "Mean / Average",
      steps: [
        `Numbers: ${numbers.map(formatNumber).join(", ")}`,
        `Sum = ${formatNumber(sum)}`,
        `Mean = ${formatNumber(sum)} ÷ ${numbers.length} = ${formatNumber(mean)}`
      ],
      answer: formatNumber(mean),
      result: mean
    };
  }

  function parseArithmetic(text) {
    const normalized = normalizeText(text);
    const match = normalized.match(/(?:^|[^A-Za-z0-9/])(-?\d+(?:\.\d+)?)\s*([+\-*xX×÷/])\s*(-?\d+(?:\.\d+)?)(?:$|[^A-Za-z0-9/])/);
    if (!match) return null;

    const left = Number(match[1]);
    const operator = match[2];
    const right = Number(match[3]);
    if (!Number.isFinite(left) || !Number.isFinite(right)) return null;

    let result = null;
    let kind = "arithmetic";
    if (operator === "+") {
      result = left + right;
      kind = "addition";
    } else if (operator === "-") {
      result = left - right;
      kind = "subtraction";
    } else if (MULTIPLY_SIGNS.has(operator)) {
      result = left * right;
      kind = "multiplication";
    } else if (DIVIDE_SIGNS.has(operator)) {
      if (right === 0) return null;
      result = left / right;
      kind = "division";
    }

    return {
      kind,
      label: kind.charAt(0).toUpperCase() + kind.slice(1),
      operands: [left, right],
      operator,
      result,
      answer: formatNumber(result)
    };
  }

  function analyze(text, options = {}) {
    const prompt = normalizeText(text);
    if (!prompt) return null;

    const parsers = [
      parseFractionExpression,
      parseAlgebra,
      parseGeometry,
      parseTrigonometry,
      parseStatistics,
      parseArithmetic
    ];

    for (const parser of parsers) {
      const context = parser(prompt);
      if (context) {
        return {
          ...context,
          model: options.model || "spark",
          prompt
        };
      }
    }
    return null;
  }

  function getPlaceName(positionFromRight) {
    const names = ["ones", "tens", "hundreds", "thousands", "ten-thousands", "hundred-thousands", "millions"];
    return names[positionFromRight] || `10e${positionFromRight}`;
  }

  function renderCells(values, options = {}) {
    const cells = values.map((value, index) => {
      const classes = ["math-cell"];
      if (options.carry && value !== "") classes.push("math-carry");
      if (options.borrow && value !== "") classes.push("math-borrow");
      if (options.result) classes.push("math-result-cell");
      if (options.muted && value === "") classes.push("math-empty-cell");
      if (options.partial) classes.push("math-partial-cell");
      const place = getPlaceName(values.length - index - 1);
      const label = value === "" ? "&nbsp;" : escapeHtml(value);
      return `<span class="${classes.join(" ")}" data-index="${index}" data-place="${escapeHtml(place)}" style="--cell-index:${index};--row-index:${options.rowIndex || 0};">${label}</span>`;
    }).join("");
    return cells;
  }

  function renderVerticalRow(symbol, digits, maxDigits, classes = "", options = {}) {
    const rowIndex = options.rowIndex || 0;
    return `
      <div class="math-row ${classes}" style="--row-index:${rowIndex};">
        <span class="math-op" style="--row-index:${rowIndex};">${escapeHtml(symbol || "")}</span>
        ${renderCells(padLeft(digits, maxDigits), options)}
      </div>
    `;
  }

  function renderRule(maxDigits) {
    return `<div class="math-rule" style="grid-column: 1 / -1;"></div>`;
  }

  function renderColumnShell(kind, maxDigits, rows) {
    return `
      <div class="math-vertical ${kind}" style="--digit-count:${maxDigits};grid-template-columns:minmax(1.35em, 1.35em) repeat(${maxDigits}, minmax(1.1em, 1.1em));">
        ${rows.join("")}
      </div>
    `;
  }

  function buildAdditionCarry(left, right, maxDigits) {
    const leftDigits = padLeft(digitsOf(left).map(Number), maxDigits, 0);
    const rightDigits = padLeft(digitsOf(right).map(Number), maxDigits, 0);
    const carry = Array(maxDigits).fill("");
    let carryIn = 0;

    for (let index = maxDigits - 1; index >= 0; index -= 1) {
      const total = leftDigits[index] + rightDigits[index] + carryIn;
      const carryOut = total >= 10 ? Math.floor(total / 10) : 0;
      if (carryOut && index > 0) {
        carry[index - 1] = String(carryOut);
      }
      carryIn = carryOut;
    }

    if (carryIn && maxDigits > String(Math.abs(left + right)).length - 1) {
      carry.unshift(String(carryIn));
    }

    return carry.slice(-maxDigits);
  }

  function buildBorrowRow(left, right, maxDigits) {
    const top = padLeft(digitsOf(left).map(Number), maxDigits, 0);
    const bottom = padLeft(digitsOf(right).map(Number), maxDigits, 0);
    const borrow = Array(maxDigits).fill("");

    for (let index = maxDigits - 1; index > 0; index -= 1) {
      if (top[index] < bottom[index]) {
        top[index] += 10;
        top[index - 1] -= 1;
        borrow[index] = String(top[index]);
        borrow[index - 1] = String(top[index - 1]);
      }
    }

    return borrow;
  }

  function renderVerticalArithmetic(context) {
    const [left, right] = context.operands;
    const resultDigits = digitsOf(context.result);
    const maxDigits = Math.max(digitsOf(left).length, digitsOf(right).length, resultDigits.length);
    const rows = [];

    if (context.kind === "addition" && isWholeNumber(left) && isWholeNumber(right)) {
      const carry = buildAdditionCarry(left, right, maxDigits);
      if (carry.some(Boolean)) rows.push(renderVerticalRow("", carry, maxDigits, "math-carry-row", { carry: true, muted: true, rowIndex: 2 }));
      rows.push(renderVerticalRow("", digitsOf(left), maxDigits, "math-first-operand", { rowIndex: 0 }));
      rows.push(renderVerticalRow("+", digitsOf(right), maxDigits, "math-second-operand", { rowIndex: 1 }));
      rows.push(renderRule(maxDigits));
      rows.push(renderVerticalRow("", resultDigits, maxDigits, "math-answer-row", { result: true, rowIndex: 3 }));
      return renderColumnShell("math-addition", maxDigits, rows);
    }

    if (context.kind === "subtraction" && isWholeNumber(left) && isWholeNumber(right) && left >= right) {
      const borrow = buildBorrowRow(left, right, maxDigits);
      if (borrow.some(Boolean)) rows.push(renderVerticalRow("", borrow, maxDigits, "math-borrow-row", { borrow: true, muted: true, rowIndex: 2 }));
      rows.push(renderVerticalRow("", digitsOf(left), maxDigits, "math-first-operand", { rowIndex: 0 }));
      rows.push(renderVerticalRow("-", digitsOf(right), maxDigits, "math-second-operand", { rowIndex: 1 }));
      rows.push(renderRule(maxDigits));
      rows.push(renderVerticalRow("", resultDigits, maxDigits, "math-answer-row", { result: true, rowIndex: 3 }));
      return renderColumnShell("math-subtraction", maxDigits, rows);
    }

    if (context.kind === "multiplication" && isWholeNumber(left) && isWholeNumber(right)) {
      const rightDigits = digitsOf(right).map(Number);
      const partials = [...rightDigits].reverse().map((digit, index) => {
        return {
          value: left * digit * (10 ** index),
          digit,
          shift: index
        };
      });
      rows.push(renderVerticalRow("", digitsOf(left), maxDigits, "math-first-operand", { rowIndex: 0 }));
      rows.push(renderVerticalRow("×", digitsOf(right), maxDigits, "math-second-operand", { rowIndex: 1 }));
      rows.push(renderRule(maxDigits));
      if (partials.length > 1) {
        partials.forEach((partial, index) => rows.push(renderVerticalRow("", digitsOf(partial.value), maxDigits, "math-partial-row", { partial: true, rowIndex: index + 2 })));
        rows.push(renderRule(maxDigits));
      }
      rows.push(renderVerticalRow("", resultDigits, maxDigits, "math-answer-row", { result: true, rowIndex: partials.length + 3 }));
      return renderColumnShell("math-multiplication", maxDigits, rows);
    }

    return `
      <div class="math-equation-steps">
        <div>${escapeHtml(formatNumber(left))} ${escapeHtml(context.operator)} ${escapeHtml(formatNumber(right))}</div>
        <div class="math-answer">Answer: ${escapeHtml(context.answer)}</div>
      </div>
    `;
  }

  function buildDivisionSteps(dividend, divisor) {
    const digits = String(Math.abs(Math.trunc(dividend))).split("").map(Number);
    const steps = [];
    let current = 0;
    let quotient = "";

    digits.forEach((digit) => {
      current = current * 10 + digit;
      const qDigit = current >= divisor ? Math.floor(current / divisor) : (quotient ? 0 : "");
      if (qDigit !== "") {
        const product = qDigit * divisor;
        const remainder = current - product;
        quotient += String(qDigit);
        steps.push({ current, qDigit, product, remainder });
        current = remainder;
      }
    });

    return {
      quotient: quotient || "0",
      remainder: current,
      steps
    };
  }

  function renderDivision(context) {
    const [dividend, divisor] = context.operands;
    if (!isWholeNumber(dividend) || !isWholeNumber(divisor) || divisor === 0) {
      return renderVerticalArithmetic(context);
    }
    const division = buildDivisionSteps(dividend, divisor);
    const stepHtml = division.steps.map((step) => `
      <div class="math-division-step">
        <span>${escapeHtml(step.current)}</span>
        <span>- ${escapeHtml(step.product)}</span>
        <b>${escapeHtml(step.remainder)}</b>
      </div>
    `).join("");

    return `
      <div class="math-long-division">
        <div class="math-quotient">${escapeHtml(context.answer)}</div>
        <div class="math-division-body">
          <span class="math-divisor">${escapeHtml(formatNumber(divisor))}</span>
          <span class="math-dividend">${escapeHtml(formatNumber(dividend))}</span>
        </div>
        <div class="math-division-steps">${stepHtml}</div>
      </div>
    `;
  }

  function renderFractionSteps(context) {
    const steps = context.steps.map((step) => `<div>${escapeHtml(step)}</div>`).join("");
    return `<div class="math-equation-steps math-fraction-steps">${steps}</div>`;
  }

  function renderEquationSteps(context) {
    const steps = context.steps.map((step, index) => `
      <div class="${index === context.steps.length - 1 ? "math-step-final" : ""}">${escapeHtml(step)}</div>
    `).join("");
    return `<div class="math-equation-steps">${steps}</div>`;
  }

  function renderPanel(context) {
    if (!context) return "";
    const answer = context.answer ?? formatNumber(context.result);
    const modelLabel = context.model === "spark" ? "Spark Math" : "Notebook Math";
    let body = "";

    if (["addition", "subtraction", "multiplication"].includes(context.kind)) {
      body = renderVerticalArithmetic(context);
    } else if (context.kind === "division") {
      body = renderDivision(context);
    } else if (context.kind === "fraction") {
      body = renderFractionSteps(context);
    } else if (["algebra", "geometry", "trigonometry", "statistics"].includes(context.kind)) {
      body = renderEquationSteps(context);
    }

    return `
      <section class="math-solve-panel" data-math-kind="${escapeHtml(context.kind)}">
        <div class="math-panel-head">
          <span class="math-kicker">&#9889; ${escapeHtml(modelLabel)}</span>
          <h2>Quick Solve</h2>
        </div>
        <div class="math-notebook" aria-label="Notebook-style math working">
          ${body}
        </div>
        <div class="math-final-answer">Answer: <strong>${escapeHtml(answer)}</strong></div>
      </section>
    `;
  }

  function createSparkMarkdown(text, options = {}) {
    const context = analyze(text, { ...options, model: "spark" });
    if (!context) return "";
    return [
      "# Quick Solve",
      "",
      "_Notebook-style working is shown above._",
      "",
      `> **Answer: _${context.answer}_**`
    ].join("\n");
  }

  function hydrate(panel) {
    if (!panel) return;
    window.requestAnimationFrame?.(() => panel.classList.add("is-ready"));
  }

  window.TutorlyMathRenderer = {
    analyze,
    renderPanel,
    createSparkMarkdown,
    hydrate,
    formatNumber
  };
})();
