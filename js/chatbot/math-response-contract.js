(function () {
  "use strict";

  const TOPIC = "math_word_problem";
  const REQUIRED_ARRAY_FIELDS = ["given", "unknowns", "solve_steps"];

  function asString(value) {
    if (value === undefined || value === null) return "";
    if (typeof value === "string") return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    try {
      return JSON.stringify(value);
    } catch (error) {
      return String(value);
    }
  }

  function stepToString(step) {
    if (typeof step === "string") return step.trim();
    if (step && typeof step === "object") {
      return [step.work, step.why, step.text, step.label, step.value]
        .map(asString)
        .filter(Boolean)
        .join(" - ");
    }
    return asString(step);
  }

  function asArray(value) {
    if (Array.isArray(value)) return value.map(stepToString).filter(Boolean);
    const text = asString(value);
    return text ? [text] : [];
  }

  function clampConfidence(value) {
    if (typeof value === "string") {
      const named = value.toLowerCase().trim();
      if (named === "high") return 0.95;
      if (named === "medium") return 0.72;
      if (named === "low") return 0.3;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    const normalized = numeric > 1 ? numeric / 100 : numeric;
    return Math.max(0, Math.min(1, normalized));
  }

  function lastMeaningfulLine(text) {
    const lines = asString(text)
      .split(/\r?\n/)
      .map((line) => line.replace(/^#+\s*/, "").replace(/^[-*]\s*/, "").trim())
      .filter(Boolean);
    return lines[lines.length - 1] || "";
  }

  function cleanFinalAnswer(text) {
    return asString(text)
      .replace(/^>?\s*\*{0,2}final answer\*{0,2}\s*:?\s*/i, "")
      .replace(/^answer\s*:?\s*/i, "")
      .replace(/\*{1,2}/g, "")
      .trim();
  }

  function escapeHtml(value) {
    return asString(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderList(items) {
    return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
  }

  function splitCheckLines(value) {
    return asString(value)
      .split(/\r?\n|;\s*/)
      .map((line) => line.replace(/^[-*]\s*/, "").trim())
      .filter(Boolean)
      .filter((line) => !/^undefined|null|\[\]|\{\}$/i.test(line));
  }

  function renderEquationCards(equations) {
    return `<div class="math-equation-stack">${equations
      .map((equation) => `<div class="math-equation-line">${escapeHtml(equation)}</div>`)
      .join("")}</div>`;
  }

  function practiceQuestionFor(response) {
    const subtopic = asString(response.subtopic).toLowerCase();
    if (subtopic.includes("ratio")) {
      return "The ratio of red balls to blue balls is 3:5. There are 40 balls in total. Find each amount.";
    }
    if (subtopic.includes("age")) {
      return "A is 6 years older than B. Their total age is 34 years. Find both ages.";
    }
    if (subtopic.includes("speed") || subtopic.includes("distance")) {
      return "A car travels 180 km in 3 hours. What is its average speed?";
    }
    if (subtopic.includes("profit") || subtopic.includes("loss")) {
      return "An item is bought for 600 and sold for 750. Find the profit percentage.";
    }
    return "Create a similar story problem with a total amount and two related quantities, then solve it.";
  }

  function mistakeWarningFor(response) {
    const subtopic = asString(response.subtopic).toLowerCase();
    if (subtopic.includes("algebra") || subtopic.includes("word")) {
      return [
        "Students often skip defining the variable first.",
        "Another common mistake is building the equation before checking what the total represents.",
        "Always substitute the answer back into the story before trusting it."
      ];
    }
    if (subtopic.includes("ratio")) {
      return ["Do not divide by only one ratio part. Add all ratio parts first, then find one share."];
    }
    if (subtopic.includes("percent") || subtopic.includes("discount")) {
      return ["Convert the percent correctly before calculating. For example, 20% means 20/100."];
    }
    return [];
  }

  function createCard({ key, title, icon, body, answer = false, hidden = false, stepLabel = "", compact = false, noContinue = false }) {
    return `
      <article class="math-learn-card ${answer ? "math-answer-card" : ""} ${compact ? "math-compact-card" : ""}" data-math-card="${escapeHtml(key)}" ${hidden ? "hidden" : ""}>
        <header class="math-card-head">
          <span class="math-card-icon" aria-hidden="true">${escapeHtml(icon)}</span>
          <div>
            ${stepLabel ? `<p>${escapeHtml(stepLabel)}</p>` : ""}
            <h3>${escapeHtml(title)}</h3>
          </div>
        </header>
        <div class="math-card-body">${body}</div>
        ${answer || noContinue ? "" : `<button class="math-card-continue" type="button" data-math-action="next">Continue</button>`}
      </article>
    `;
  }

  function createLearnMoreCard(response, hidden = true) {
    return `
      <article class="math-learn-card math-learn-more-card" data-math-card="learn-more" ${hidden ? "hidden" : ""}>
        <details>
          <summary>
            <span class="math-card-icon" aria-hidden="true">L</span>
            <span>Learn More</span>
          </summary>
          <div class="math-card-body">
            <p>Try explaining each equation in words. If the story and equation match, the solution is usually on the right track.</p>
            <p>${escapeHtml(practiceQuestionFor(response))}</p>
          </div>
        </details>
      </article>
    `;
  }

  function firstUsefulSentence(text) {
    const clean = asString(text).replace(/\s+/g, " ").trim();
    if (!clean) return "";
    const sentence = clean.match(/.*?[.!?](?:\s|$)/);
    return sentence ? sentence[0].trim() : clean.slice(0, 240).trim();
  }

  function normalizeMathResponse(response, defaults = {}) {
    const source = response && typeof response === "object" ? response : {};
    const fallback = defaults && typeof defaults === "object" ? defaults : {};
    const setup = source.setup && typeof source.setup === "object" ? source.setup : {};
    const given = asArray(source.given ?? fallback.given);
    const unknowns = asArray(source.unknowns ?? source.unknown ?? fallback.unknowns ?? fallback.unknown);
    const equations = asArray(
      setup.equations ??
        source.equations ??
        source.model ??
        source.translation ??
        fallback.equations ??
        fallback.model
    );
    const solveSteps = asArray(source.solve_steps ?? source.solveSteps ?? source.steps ?? fallback.solve_steps);
    const checkItems = asArray(source.check ?? source.verification ?? fallback.check);
    const finalAnswer = cleanFinalAnswer(source.final_answer ?? source.finalAnswer ?? source.answer ?? fallback.final_answer);
    const formulas = asArray(source.formula_used ?? source.formulas ?? fallback.formula_used ?? fallback.formulas);

    return {
      topic: TOPIC,
      subtopic: asString(source.subtopic || fallback.subtopic),
      understanding:
        asString(source.understanding || source.story || source.goal || fallback.understanding) ||
        "Translate the story into math, solve the equation, then check the answer in the original situation.",
      given,
      unknowns,
      setup: {
        equations
      },
      solve_steps: solveSteps,
      final_answer: finalAnswer || cleanFinalAnswer(lastMeaningfulLine(solveSteps.join("\n"))),
      check: checkItems.join("\n"),
      formula_used: formulas,
      confidence: clampConfidence(source.confidence ?? source.confidenceScore ?? fallback.confidence ?? 0),
      fallbackUsed: Boolean(source.fallbackUsed || fallback.fallbackUsed)
    };
  }

  function isValidMathResponse(response) {
    const normalized = normalizeMathResponse(response);
    if (normalized.topic !== TOPIC) return false;
    if (!normalized.setup || !Array.isArray(normalized.setup.equations)) return false;
    if (normalized.setup.equations.length === 0) return false;
    if (!normalized.final_answer) return false;
    if (normalized.confidence < 0.75) return false;
    return REQUIRED_ARRAY_FIELDS.every((field) => Array.isArray(normalized[field]) && normalized[field].length > 0);
  }

  function fallbackToPrime(response, rawText = "", options = {}) {
    const normalized = normalizeMathResponse(response, {
      confidence: 0.76,
      fallbackUsed: true,
      ...options
    });
    const raw = asString(rawText || options.question || options.raw);
    const sentence = firstUsefulSentence(raw || normalized.final_answer || normalized.understanding);

    return normalizeMathResponse({
      ...normalized,
      given: normalized.given.length ? normalized.given : [options.question ? `Problem: ${options.question}` : sentence || "Information from the problem statement"],
      unknowns: normalized.unknowns.length ? normalized.unknowns : ["The quantity asked in the question"],
      setup: {
        equations: normalized.setup.equations.length
          ? normalized.setup.equations
          : ["Use the relationship in the word problem to form an equation."]
      },
      solve_steps: normalized.solve_steps.length
        ? normalized.solve_steps
        : [sentence || "Convert the story into an equation and solve it carefully."],
      final_answer: normalized.final_answer || cleanFinalAnswer(lastMeaningfulLine(raw)) || "Needs a complete final answer",
      check: normalized.check || "",
      confidence: Math.max(normalized.confidence, 0.76),
      fallbackUsed: true
    });
  }

  function fromAdvancedMathResult(result, options = {}) {
    if (!result || typeof result !== "object") {
      return normalizeMathResponse({}, options);
    }

    const equations = []
      .concat(asArray(result.model))
      .concat(asArray(result.translation))
      .concat(asArray(result.equations))
      .filter(Boolean);

    return normalizeMathResponse({
      subtopic: result.subtopic || options.subtopic || "Math Word Problem",
      understanding:
        result.story ||
        result.goal ||
        "This is a word problem, so we convert the story into equations before solving.",
      given: result.given,
      unknowns: result.unknown || result.unknowns,
      setup: {
        equations
      },
      solve_steps: result.steps,
      final_answer: result.finalAnswer,
      check: result.verification,
      formula_used: result.formulas,
      confidence: result.confidence ?? options.confidence ?? 0.95,
      fallbackUsed: options.fallbackUsed
    });
  }

  function collectSection(lines, labelPattern) {
    const section = [];
    let active = false;
    lines.forEach((line) => {
      if (labelPattern.test(line)) {
        active = true;
        return;
      }
      if (active && /^#{1,6}\s+|^[A-Z][A-Za-z\s]+:$/.test(line)) {
        active = false;
      }
      if (active && line) {
        section.push(line.replace(/^[-*]\s*/, "").replace(/^\d+\.\s*/, "").trim());
      }
    });
    return section.filter(Boolean);
  }

  function fromMarkdown(markdown, options = {}) {
    const raw = asString(markdown);
    const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const finalLine =
      lines.find((line) => /final answer\s*:/i.test(line)) ||
      lines.find((line) => /^answer\s*:/i.test(line)) ||
      "";
    const numbered = lines
      .filter((line) => /^\d+\.\s+/.test(line) || /^step\s+\d+/i.test(line))
      .map((line) => line.replace(/^\d+\.\s+/, "").replace(/^step\s+\d+\s*:?\s*/i, "").trim());
    const equations = lines
      .filter((line) => /=/.test(line) || /\bformula\b|\bequation\b/i.test(line))
      .map((line) => line.replace(/^[-*]\s*/, "").trim())
      .slice(0, 4);

    return normalizeMathResponse({
      subtopic: options.subtopic || "Math Word Problem",
      understanding: options.understanding || firstUsefulSentence(raw),
      given: collectSection(lines, /^#{0,6}\s*given\b|^given\s*:/i),
      unknowns: collectSection(lines, /^#{0,6}\s*unknown\b|^unknowns?\s*:/i),
      setup: {
        equations
      },
      solve_steps: numbered.length ? numbered : lines.filter((line) => !/^#{1,6}\s+/.test(line)).slice(0, 3),
      final_answer: cleanFinalAnswer(finalLine) || cleanFinalAnswer(lastMeaningfulLine(raw)),
      check: collectSection(lines, /^#{0,6}\s*check\b|^verification\s*:/i),
      formula_used: collectSection(lines, /^#{0,6}\s*formula\b|^formula used\s*:/i),
      confidence: options.confidence ?? 0.82,
      fallbackUsed: options.fallbackUsed
    });
  }

  function toSpark(primeResponse) {
    const prime = normalizeMathResponse(primeResponse);
    return normalizeMathResponse({
      ...prime,
      given: prime.given.slice(0, 2),
      unknowns: prime.unknowns.slice(0, 2),
      setup: {
        equations: prime.setup.equations.slice(0, 1)
      },
      solve_steps: prime.solve_steps.slice(0, 3),
      final_answer: prime.final_answer,
      confidence: prime.confidence
    });
  }

  function renderMathResponse(response, options = {}) {
    let normalized = normalizeMathResponse(response);
    if (!isValidMathResponse(normalized)) {
      normalized = fallbackToPrime(normalized);
    }

    const mode = options.mode === "spark" ? "spark" : "prime";
    const cards = [];

    if (mode === "spark") {
      const checkLine = splitCheckLines(normalized.check)[0] || "Substitute the answer back into the equation.";
      cards.push(createCard({
        key: "quick-solve",
        title: "Quick Solve",
        icon: "Q",
        body: `
          <div class="math-quick-solve">
            ${renderEquationCards(normalized.setup.equations.slice(0, 1))}
            <ol class="math-quick-steps">${normalized.solve_steps.slice(0, 3).map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
          </div>
        `,
        compact: true,
        noContinue: true
      }));
      cards.push(createCard({
        key: "mini-check",
        title: "Mini Check",
        icon: "C",
        body: `<p>${escapeHtml(checkLine)}</p>`,
        compact: true,
        noContinue: true,
        hidden: true
      }));
      cards.push(createCard({
        key: "answer",
        title: "Final Answer",
        icon: "✓",
        stepLabel: "Step 3",
        body: `<p>${escapeHtml(normalized.final_answer)}</p>`,
        answer: true,
        hidden: true
      }));
    } else {
      const mistakeWarnings = mistakeWarningFor(normalized);
      const formulaItems = normalized.formula_used || [];
      const checkLines = splitCheckLines(normalized.check);
      cards.push(createCard({
        key: "understand",
        title: "Understand the Problem",
        icon: "U",
        stepLabel: "Step 1",
        body: `<p>${escapeHtml(normalized.understanding)}</p>`
      }));
      cards.push(createCard({
        key: "given",
        title: "Given Information",
        icon: "G",
        stepLabel: "Step 2",
        body: renderList(normalized.given),
        hidden: true
      }));
      cards.push(createCard({
        key: "unknowns",
        title: "Unknowns",
        icon: "?",
        stepLabel: "Step 3",
        body: renderList(normalized.unknowns),
        hidden: true
      }));
      cards.push(createCard({
        key: "setup",
        title: "Equation Setup",
        icon: "=",
        stepLabel: "Step 4",
        body: renderEquationCards(normalized.setup.equations),
        hidden: true
      }));
      normalized.solve_steps.forEach((step, index) => {
        cards.push(createCard({
          key: `solve-${index + 1}`,
          title: `Step ${index + 1}`,
          icon: "S",
          stepLabel: "Step-by-Step Solution",
          body: `<p>${escapeHtml(step)}</p>`,
          hidden: true
        }));
      });
      if (formulaItems.length) {
        cards.push(createCard({
          key: "formula",
          title: "Formula Used",
          icon: "F",
          body: renderList(formulaItems),
          hidden: true
        }));
      }
      if (checkLines.length) {
        cards.push(createCard({
          key: "check",
          title: "Check Answer",
          icon: "C",
          body: renderList(checkLines),
          hidden: true
        }));
      }
      if (mistakeWarnings.length) {
        cards.push(createCard({
          key: "mistake",
          title: "Common Mistake",
          icon: "!",
          body: renderList(mistakeWarnings),
          hidden: true
        }));
      }
      cards.push(createCard({
        key: "answer",
        title: "Final Answer",
        icon: "✓",
        body: `<p>${escapeHtml(normalized.final_answer)}</p>`,
        answer: true,
        hidden: true
      }));
      cards.push(createCard({
        key: "practice",
        title: "Practice Challenge",
        icon: "P",
        body: `<p>${escapeHtml(practiceQuestionFor(normalized))}</p>`,
        hidden: true
      }));
      cards.push(createLearnMoreCard(normalized, true));
    }

    return `
      <section class="math-learning-flow" data-tutorly-math-response data-mode="${escapeHtml(mode)}">
        <header class="math-flow-head">
          <div>
            <p>${mode === "spark" ? "Spark fast answer" : "Prime learning mode"}</p>
            <h2>${mode === "spark" ? "Quick Math Solve" : "Math Word Problem"}</h2>
            ${normalized.subtopic ? `<span>${escapeHtml(normalized.subtopic)}</span>` : ""}
          </div>
          ${mode === "spark" ? "" : `
            <div class="math-flow-actions" aria-label="Math step controls">
              <button type="button" data-math-action="all">Reveal all</button>
              <button type="button" data-math-action="collapse">Collapse</button>
            </div>
          `}
        </header>
        <div class="math-card-stack">
          ${cards.join("")}
        </div>
      </section>
    `.trim();
  }

  function createMathResponseMarkdown(rawResponse, options = {}) {
    let response = typeof rawResponse === "string"
      ? fromMarkdown(rawResponse, options)
      : normalizeMathResponse(rawResponse, options);

    if (!isValidMathResponse(response)) {
      response = fallbackToPrime(response, typeof rawResponse === "string" ? rawResponse : "", options);
    }

    if (options.mode === "spark") {
      response = toSpark(response);
      if (!isValidMathResponse(response)) {
        response = fallbackToPrime(response, typeof rawResponse === "string" ? rawResponse : "", options);
      }
    }

    return renderMathResponse(response, options);
  }

  window.TutorlyMathResponseContract = {
    normalizeMathResponse,
    isValidMathResponse,
    fallbackToPrime,
    fromAdvancedMathResult,
    fromMarkdown,
    toSpark,
    renderMathResponse,
    createMathResponseMarkdown
  };
})();
