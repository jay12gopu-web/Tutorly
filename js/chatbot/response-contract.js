(function () {
  "use strict";

  const VALID_MODES = new Set(["spark", "prime"]);
  const VALID_DIFFICULTIES = new Set(["easy", "medium", "hard"]);
  const REQUIRED_TEXT_FIELDS = ["topic", "understanding", "solution", "finalAnswer"];

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

  function asArray(value) {
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (typeof item === "string") return item.trim();
          if (item && typeof item === "object") {
            return [item.work, item.why, item.text, item.label, item.value]
              .map(asString)
              .filter(Boolean)
              .join(" - ");
          }
          return asString(item);
        })
        .filter(Boolean);
    }
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

  function normalizeMode(mode) {
    const normalized = asString(mode).toLowerCase();
    return VALID_MODES.has(normalized) ? normalized : "prime";
  }

  function normalizeDifficulty(difficulty) {
    const normalized = asString(difficulty).toLowerCase();
    if (VALID_DIFFICULTIES.has(normalized)) return normalized;
    if (["basic", "beginner", "school"].includes(normalized)) return "easy";
    if (["advanced", "college", "exam"].includes(normalized)) return "hard";
    return "";
  }

  function normalizeTutorResponse(response, defaults = {}) {
    const source = response && typeof response === "object" ? response : {};
    const fallback = defaults && typeof defaults === "object" ? defaults : {};
    const normalized = {
      mode: normalizeMode(source.mode || fallback.mode),
      topic: asString(source.topic || fallback.topic),
      subtopic: asString(source.subtopic || fallback.subtopic),
      difficulty: normalizeDifficulty(source.difficulty || fallback.difficulty),
      understanding: asString(source.understanding || fallback.understanding),
      givenInfo: asArray(source.givenInfo || source.given || fallback.givenInfo || fallback.given),
      conceptRule: asString(source.conceptRule || source.rule || source.formula || fallback.conceptRule || fallback.rule || fallback.formula),
      steps: asArray(source.steps),
      equations: asArray(source.equations),
      solution: asString(source.solution || fallback.solution),
      finalAnswer: asString(source.finalAnswer || fallback.finalAnswer),
      check: asString(source.check || fallback.check),
      whyThisWorks: asString(source.whyThisWorks || source.why || fallback.whyThisWorks || fallback.why),
      commonMistakes: asArray(source.commonMistakes || source.mistakes || fallback.commonMistakes || fallback.mistakes),
      practiceQuestion: asString(source.practiceQuestion || source.practice || fallback.practiceQuestion || fallback.practice),
      confidence: clampConfidence(source.confidence ?? fallback.confidence ?? 0),
      fallbackUsed: Boolean(source.fallbackUsed || fallback.fallbackUsed)
    };

    if (!normalized.topic) normalized.topic = "Study Help";
    if (!normalized.givenInfo.length) normalized.givenInfo = inferGivenInfo(normalized);
    if (!normalized.conceptRule) normalized.conceptRule = inferConceptRule(normalized.topic);
    if (!normalized.solution && normalized.steps.length) normalized.solution = normalized.steps.join("\n");
    if (!normalized.finalAnswer && normalized.solution) normalized.finalAnswer = lastMeaningfulLine(normalized.solution);
    if (!normalized.understanding && normalized.topic) {
      normalized.understanding = `We need to answer the question using ${normalized.topic.toLowerCase()} clearly.`;
    }
    if (!normalized.whyThisWorks) normalized.whyThisWorks = inferWhyThisWorks(normalized);
    if (!normalized.commonMistakes.length) normalized.commonMistakes = inferCommonMistakes(normalized.topic);
    if (!normalized.practiceQuestion) normalized.practiceQuestion = inferPracticeQuestion(normalized.topic);

    return normalized;
  }

  function isValidTutorResponse(response) {
    const normalized = normalizeTutorResponse(response);
    if (!VALID_MODES.has(normalized.mode)) return false;
    if (!Array.isArray(normalized.steps) || !Array.isArray(normalized.equations)) return false;
    if (normalized.steps.length === 0) return false;
    if (normalized.confidence < 0.75) return false;
    return REQUIRED_TEXT_FIELDS.every((field) => Boolean(asString(normalized[field])));
  }

  function lastMeaningfulLine(text) {
    const lines = asString(text)
      .split(/\r?\n/)
      .map((line) => line.replace(/^#+\s*/, "").replace(/^[-*]\s*/, "").trim())
      .filter(Boolean);
    return lines[lines.length - 1] || "";
  }

  function stripMarkdownLabel(text) {
    return asString(text)
      .replace(/^>?\s*\*{0,2}final answer\*{0,2}\s*:?\s*/i, "")
      .replace(/^answer\s*:?\s*/i, "")
      .replace(/\*{1,2}/g, "")
      .trim();
  }

  function fallbackToPrime(response, rawText = "") {
    const normalized = normalizeTutorResponse(response, { mode: "prime", confidence: 0.76, fallbackUsed: true });
    const raw = asString(rawText);
    const seed = normalized.solution || raw || normalized.finalAnswer || "The answer needs a clearer structured explanation.";
    const step = normalized.steps[0] || firstUsefulSentence(seed) || seed;

    return normalizeTutorResponse({
      ...normalized,
      mode: "prime",
      topic: normalized.topic || "Study Help",
      understanding: normalized.understanding || "I converted the reply into a clean tutor format before showing it.",
      steps: normalized.steps.length ? normalized.steps : [step],
      solution: normalized.solution || seed,
      finalAnswer: normalized.finalAnswer || stripMarkdownLabel(lastMeaningfulLine(seed)) || seed,
      confidence: Math.max(normalized.confidence, 0.76),
      fallbackUsed: true
    });
  }

  function firstUsefulSentence(text) {
    const clean = asString(text).replace(/\s+/g, " ").trim();
    if (!clean) return "";
    const sentence = clean.match(/.*?[.!?](?:\s|$)/);
    return sentence ? sentence[0].trim() : clean.slice(0, 220).trim();
  }

  function inferGivenInfo(response) {
    const items = [];
    if (response.subtopic) items.push(`Subtopic: ${response.subtopic}`);
    if (response.equations && response.equations.length) items.push(...response.equations.slice(0, 3));
    if (!items.length && response.understanding) items.push(response.understanding);
    return items.length ? items : ["Use the important keywords, values, and task stated in the question."];
  }

  function inferConceptRule(topic) {
    const normalized = asString(topic).toLowerCase();
    if (normalized.includes("math")) return "Use the relevant formula or equation first, then substitute values carefully.";
    if (normalized.includes("science")) return "Start with the scientific concept, connect it to cause and effect, then apply it to the question.";
    if (normalized.includes("english")) return "Use the grammar, literature, or writing rule required by the question, then support the answer clearly.";
    if (normalized.includes("history")) return "Connect the event through cause, main event, result, and exam importance.";
    if (normalized.includes("geography")) return "Identify the place, location hierarchy, physical features, and human connection.";
    if (normalized.includes("coding") || normalized.includes("computer")) return "Understand the problem, design the logic, then explain the algorithm and code behavior clearly.";
    return "Identify the rule or concept behind the question, then apply it step by step.";
  }

  function inferWhyThisWorks(response) {
    if (response.check) return response.check;
    if (response.solution) return "This works because each step follows from the concept or rule and keeps the answer connected to the question.";
    return "This works because the answer is built from the given information instead of guessing.";
  }

  function inferCommonMistakes(topic) {
    const normalized = asString(topic).toLowerCase();
    if (normalized.includes("math")) {
      return ["Using a formula before checking what is given.", "Skipping substitution steps.", "Forgetting to verify the final answer."];
    }
    if (normalized.includes("science")) {
      return ["Memorizing words without understanding the process.", "Missing the cause-and-effect link.", "Forgetting a real-life example."];
    }
    if (normalized.includes("english")) {
      return ["Giving the answer without explaining the rule.", "Ignoring punctuation or tense.", "Writing a literature answer without evidence."];
    }
    if (normalized.includes("history")) {
      return ["Listing facts without cause and effect.", "Forgetting timeline order.", "Missing the result or impact."];
    }
    if (normalized.includes("geography")) {
      return ["Naming a place without explaining where it fits.", "Confusing country, state, and continent.", "Ignoring map context."];
    }
    if (normalized.includes("coding") || normalized.includes("computer")) {
      return ["Writing code before understanding the input and output.", "Skipping edge cases.", "Not explaining why the algorithm works."];
    }
    return ["Answering too quickly without identifying the task.", "Skipping the concept behind the answer.", "Not checking whether the final answer matches the question."];
  }

  function inferPracticeQuestion(topic) {
    const normalized = asString(topic).toLowerCase();
    if (normalized.includes("math")) return "Solve a similar problem using the same formula or method.";
    if (normalized.includes("science")) return "Explain one similar concept with a real-life example.";
    if (normalized.includes("english")) return "Create one similar sentence, paragraph, or exam-style answer using the same rule.";
    if (normalized.includes("history")) return "Write a cause-effect explanation for a related historical event.";
    if (normalized.includes("geography")) return "Locate a related place and describe its hierarchy from local area to continent.";
    if (normalized.includes("coding") || normalized.includes("computer")) return "Solve one similar problem and explain the input, logic, output, and one edge case.";
    return "Try one similar question and explain the steps in your own words.";
  }

  function fromAdvancedMathResult(result, options = {}) {
    if (!result || typeof result !== "object") {
      return normalizeTutorResponse({}, options);
    }

    const steps = asArray(result.steps);
    const equations = []
      .concat(asArray(result.equations))
      .concat(asArray(result.formulas))
      .concat(asArray(result.model))
      .filter(Boolean);
    const finalAnswer = asString(result.finalAnswer || result.answer || result.result);
    const solution = asString(result.solution) || steps.join("\n") || finalAnswer;

    return normalizeTutorResponse({
      mode: options.mode || "prime",
      topic: result.topic || options.topic || "Mathematics",
      subtopic: result.subtopic || options.subtopic,
      difficulty: result.difficulty || options.difficulty,
      understanding:
        result.understanding ||
        result.story ||
        result.goal ||
        `We identify the math structure, solve it, and verify the result.`,
      givenInfo: result.given || result.known || result.values || [],
      conceptRule: result.formula || result.method || "",
      steps,
      equations,
      solution,
      finalAnswer,
      check: result.verification || result.check || "",
      whyThisWorks: result.whyThisWorks || result.verification || "",
      commonMistakes: result.commonMistakes || result.mistakes || [],
      practiceQuestion: result.practiceQuestion || result.practice || "",
      confidence: result.confidence ?? result.confidenceScore ?? options.confidence ?? 0.95,
      fallbackUsed: options.fallbackUsed
    });
  }

  function fromMarkdown(markdown, options = {}) {
    const raw = asString(markdown);
    if (!raw) return normalizeTutorResponse({}, options);

    const lines = raw.split(/\r?\n/).map((line) => line.trim());
    const heading = lines.find((line) => /^#{1,3}\s+/.test(line));
    const topic = options.topic || (heading ? heading.replace(/^#{1,3}\s+/, "").trim() : "Study Help");
    const finalLine =
      lines.find((line) => /final answer\s*:/i.test(line)) ||
      lines.reverse().find((line) => /answer\s*:/i.test(line)) ||
      "";
    const cleanLines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const numberedSteps = cleanLines
      .filter((line) => /^\d+\.\s+/.test(line) || /^step\s+\d+/i.test(line))
      .map((line) => line.replace(/^\d+\.\s+/, "").replace(/^step\s+\d+\s*:?\s*/i, "").trim());
    const paragraphSteps = cleanLines
      .filter((line) => !/^#{1,6}\s+/.test(line))
      .filter((line) => !/final answer\s*:/i.test(line))
      .filter((line) => !/^[-*]\s*$/.test(line))
      .slice(0, 4);
    const steps = numberedSteps.length ? numberedSteps : paragraphSteps.slice(0, 3);
    const understanding =
      options.understanding ||
      paragraphSteps.find((line) => !/answer\s*:/i.test(line)) ||
      firstUsefulSentence(raw);
    const finalAnswer = stripMarkdownLabel(finalLine) || stripMarkdownLabel(lastMeaningfulLine(raw));

    return normalizeTutorResponse({
      mode: options.mode || "prime",
      topic,
      subtopic: options.subtopic,
      difficulty: options.difficulty,
      understanding,
      givenInfo: options.givenInfo || [],
      conceptRule: options.conceptRule || "",
      steps,
      equations: options.equations || [],
      solution: options.solution || raw,
      finalAnswer,
      check: options.check || "",
      whyThisWorks: options.whyThisWorks || "",
      commonMistakes: options.commonMistakes || [],
      practiceQuestion: options.practiceQuestion || "",
      confidence: options.confidence ?? 0.82,
      fallbackUsed: options.fallbackUsed
    });
  }

  function toSpark(primeResponse) {
    const prime = normalizeTutorResponse(primeResponse, { mode: "prime" });
    return normalizeTutorResponse({
      ...prime,
      mode: "spark",
      understanding: prime.understanding || "Here is the quick version.",
      givenInfo: prime.givenInfo.slice(0, 2),
      conceptRule: prime.conceptRule,
      steps: prime.steps.slice(0, 3),
      solution: prime.steps.slice(0, 3).join("\n") || prime.solution,
      finalAnswer: prime.finalAnswer,
      whyThisWorks: prime.whyThisWorks,
      commonMistakes: prime.commonMistakes.slice(0, 2),
      practiceQuestion: prime.practiceQuestion,
      confidence: prime.confidence
    });
  }

  function renderTutorResponse(response) {
    const normalized = normalizeTutorResponse(response);
    const lines = [];
    const title = normalized.mode === "spark" ? `# ${normalized.topic}` : `# ${normalized.topic}`;
    lines.push(title);

    const meta = [normalized.subtopic, normalized.difficulty].filter(Boolean).join(" - ");
    if (meta) {
      lines.push("");
      lines.push(`_${meta}_`);
    }

    lines.push("");
    lines.push("### 1. Understand the Question");
    lines.push(normalized.understanding);

    lines.push("");
    lines.push("### 2. Identify Given Information");
    normalized.givenInfo.forEach((item) => lines.push(`- ${item}`));

    lines.push("");
    lines.push("### 3. Concept or Rule");
    lines.push(`_${normalized.conceptRule}_`);

    lines.push("");
    lines.push("### 4. Step-by-Step Solution");
    normalized.steps.forEach((step, index) => {
      lines.push(`${index + 1}. ${step}`);
    });
    if (normalized.equations.length) {
      lines.push("");
      normalized.equations.forEach((equation) => lines.push(`- ${equation}`));
    }
    if (normalized.solution && normalized.solution !== normalized.steps.join("\n")) {
      lines.push("");
      lines.push(normalized.solution);
    }

    lines.push("");
    lines.push("### 5. Final Answer");
    lines.push(`> **Final answer: ${normalized.finalAnswer}**`);

    lines.push("");
    lines.push("### 6. Why This Works");
    lines.push(normalized.whyThisWorks);

    lines.push("");
    lines.push("### 7. Common Mistakes");
    normalized.commonMistakes.forEach((mistake) => lines.push(`- ${mistake}`));

    lines.push("");
    lines.push("### 8. Practice Question");
    lines.push(normalized.practiceQuestion);

    return lines.join("\n");
  }

  function createTutorResponseMarkdown(rawResponse, options = {}) {
    let response;
    if (typeof rawResponse === "string") {
      response = fromMarkdown(rawResponse, options);
    } else {
      response = normalizeTutorResponse(rawResponse, options);
    }

    if (!isValidTutorResponse(response)) {
      response = fallbackToPrime(response, typeof rawResponse === "string" ? rawResponse : "");
    }

    if (options.mode === "spark" || response.mode === "spark") {
      response = toSpark({ ...response, mode: "prime" });
      if (!isValidTutorResponse(response)) {
        response = fallbackToPrime(response, typeof rawResponse === "string" ? rawResponse : "");
      }
    }

    return renderTutorResponse(response);
  }

  window.TutorlyResponseContract = {
    normalizeTutorResponse,
    isValidTutorResponse,
    fallbackToPrime,
    fromAdvancedMathResult,
    fromMarkdown,
    toSpark,
    renderTutorResponse,
    createTutorResponseMarkdown
  };
})();
