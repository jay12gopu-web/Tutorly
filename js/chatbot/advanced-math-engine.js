(function () {
  if (window.TutorlyAdvancedMath) return;

  const numberFormat = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 10
  });

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[−–—]/g, "-")
      .replace(/[×✕]/g, "*")
      .replace(/[÷]/g, "/")
      .replace(/\^/g, "^")
      .replace(/,/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function formatNumber(value, precision = 10) {
    if (typeof value === "string") return value;
    if (!Number.isFinite(value)) return String(value);
    const rounded = Number(value.toFixed(precision));
    if (Object.is(rounded, -0)) return "0";
    return numberFormat.format(rounded);
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
    return Math.abs(left * right) / gcd(left, right);
  }

  function factorial(value) {
    if (!Number.isInteger(value) || value < 0 || value > 170) return NaN;
    let result = 1;
    for (let index = 2; index <= value; index += 1) result *= index;
    return result;
  }

  function nCr(n, r) {
    if (r < 0 || r > n) return 0;
    return factorial(n) / (factorial(r) * factorial(n - r));
  }

  function nPr(n, r) {
    if (r < 0 || r > n) return 0;
    return factorial(n) / factorial(n - r);
  }

  function extractNumbers(text) {
    return (normalize(text).match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  }

  function exactFraction(value, denominator = null) {
    if (Number.isFinite(value) && Number.isFinite(denominator) && denominator !== 0) {
      const divisor = gcd(value, denominator);
      return `${value / divisor}/${denominator / divisor}`;
    }
    if (!Number.isFinite(value)) return String(value);
    if (Number.isInteger(value)) return String(value);
    const sign = value < 0 ? -1 : 1;
    const abs = Math.abs(value);
    const denominatorLimit = 100000;
    let bestNum = 1;
    let bestDen = 1;
    let bestError = Math.abs(abs - 1);
    for (let den = 1; den <= 2000; den += 1) {
      const num = Math.round(abs * den);
      const error = Math.abs(abs - num / den);
      if (error < bestError) {
        bestNum = num;
        bestDen = den;
        bestError = error;
        if (error < 1e-10) break;
      }
    }
    if (bestDen > denominatorLimit) return formatNumber(value);
    const divisor = gcd(bestNum, bestDen);
    return `${sign * (bestNum / divisor)}/${bestDen / divisor}`;
  }

  function safeEvalArithmetic(expression) {
    const clean = normalize(expression)
      .replace(/\bof\b/g, "*")
      .replace(/[^0-9+\-*/().\s^]/g, "")
      .replace(/\^/g, "**");
    if (!/\d/.test(clean) || !/[+\-*/]|\*\*/.test(clean)) return null;
    try {
      const value = Function(`"use strict"; return (${clean});`)();
      return Number.isFinite(value) ? value : null;
    } catch (error) {
      return null;
    }
  }

  function makeResult({
    topic,
    subtopic,
    difficulty = "School",
    goal,
    formulas = [],
    method = "Formula method",
    given = [],
    unknown = [],
    conditions = [],
    units = "",
    steps = [],
    verification = [],
    finalAnswer,
    alternative = "",
    mistake = "",
    practice = "",
    confidence = "high",
    isWordProblem = false,
    story = "",
    translation = [],
    model = []
  }) {
    return {
      topic,
      subtopic,
      difficulty,
      goal,
      formulas,
      method,
      given,
      unknown,
      conditions,
      units,
      steps,
      verification,
      finalAnswer,
      alternative,
      mistake,
      practice,
      confidence,
      isWordProblem,
      story,
      translation,
      model
    };
  }

  function lineList(items, emptyText = "Not required for this question.") {
    const list = (items || []).filter(Boolean);
    return list.length ? list.map((item) => `- ${item}`).join("\n") : `- ${emptyText}`;
  }

  function render(result) {
    if (!result) return "";
    const formulas = result.formulas?.length ? result.formulas.map((item) => `- _${item}_`).join("\n") : "- _No special formula needed._";
    const steps = result.steps?.length
      ? result.steps.map((step, index) => {
        const why = step.why ? `\n   _Why:_ ${step.why}` : "";
        return `${index + 1}. ${step.work}${why}`;
      }).join("\n\n")
      : "1. I need one more detail before solving.";
    const verification = result.verification?.length
      ? result.verification.map((item) => `- ${item}`).join("\n")
      : "- Verification needs the exact original expression.";

    const title = result.isWordProblem ? "Word Problem Solver" : "Advanced Math Solution";
    const analysisTitle = result.isWordProblem ? "## 🔍 Step 1: Understand the Story" : "## 🔍 Analysis";
    const extractionTitle = result.isWordProblem ? "## 📌 Step 2: Extract Information" : "";
    const conversion = result.isWordProblem && result.translation?.length
      ? ["", "## 🔁 Step 3: Convert Words into Math", "", lineList(result.translation)]
      : [];
    const model = result.isWordProblem && result.model?.length
      ? ["", "## 🧩 Step 4: Build the Mathematical Model", "", lineList(result.model)]
      : [];
    const solutionTitle = result.isWordProblem ? "## ⚡ Step 5: Solve Step-by-Step" : "## ⚡ Step-by-Step Solution";
    const verificationTitle = result.isWordProblem ? "## ✅ Step 6: Check Reasonableness" : "## ✅ Verification";
    const finalTitle = result.isWordProblem ? "## 🎯 Step 7: Answer in a Sentence" : "## 🎯 Final Answer";

    const sections = [
      `# ${title}`,
      "",
      `📚 Topic: ${result.topic}`,
      `📖 Subtopic: ${result.subtopic}`,
      `🎯 Goal: ${result.goal || "Solve the given problem"}`,
      `Level: ${result.difficulty}`,
      "",
      analysisTitle,
      "",
      result.story ? result.story : "We identify the mathematical structure in the question.",
      "",
      ...(result.isWordProblem ? [extractionTitle, ""] : []),
      "**Given values**",
      lineList(result.given),
      "",
      "**Unknown values**",
      lineList(result.unknown),
      "",
      "**Conditions / Units**",
      lineList([...(result.conditions || []), result.units ? `Units: ${result.units}` : ""], "No special condition stated."),
      ...conversion,
      ...model,
      "",
      "## 📝 Formula Used",
      "",
      formulas,
      "",
      `**Method:** _${result.method}_`,
      "",
      solutionTitle,
      "",
      steps,
      "",
      verificationTitle,
      "",
      verification,
      "",
      finalTitle,
      "",
      `> **${result.finalAnswer || "Need one clarifying detail."}**`
    ];

    if (result.alternative) {
      sections.push("", "## 💡 Alternative Method", "", result.alternative);
    }

    if (result.mistake) {
      sections.push("", "## ⚠ Common Mistake", "", `_${result.mistake}_`);
    }

    if (result.practice) {
      sections.push("", "## 🧠 Practice Question", "", result.practice);
    }

    if (result.confidence && result.confidence !== "high") {
      sections.push("", `_Confidence: ${result.confidence}. Some details may need confirmation from the exact question wording._`);
    }

    return sections.join("\n");
  }

  function solveArithmetic(text) {
    const value = normalize(text);
    const expression = value.match(/-?\d+(?:\.\d+)?(?:\s*[+\-*/^]\s*-?\d+(?:\.\d+)?)+/)?.[0];
    if (!expression) return null;
    const result = safeEvalArithmetic(expression);
    if (result === null) return null;

    return makeResult({
      topic: "Arithmetic",
      subtopic: "Expression Evaluation",
      difficulty: "Elementary / Middle School",
      goal: "Calculate the value of the expression",
      formulas: ["Use order of operations: brackets, exponents, multiplication/division, addition/subtraction."],
      method: "Order of Operations",
      given: [`Expression: ${expression}`],
      unknown: ["Value of the expression"],
      steps: [
        { work: `${expression} = ${formatNumber(result)}`, why: "After applying the operation rules, this is the simplified value." }
      ],
      verification: [`Recalculate the expression: ${expression} gives ${formatNumber(result)}.`],
      finalAnswer: `Answer = ${formatNumber(result)}`,
      mistake: "Do not solve strictly left-to-right when multiplication, division, or exponents are present.",
      practice: `Practice: Evaluate ${expression.replace(/\d+/, "12")}.`
    });
  }

  function makeWordProblemResult(config) {
    return makeResult({
      ...config,
      isWordProblem: true,
      story: config.story || "This is a real-life scenario, so we first identify the quantities and what must be found."
    });
  }

  function solveSpeedDistanceTimeWord(text) {
    const value = normalize(text);
    if (!/\b(speed|distance|time|train|car|bus|bike|walk|travels?|km\/h|m\/s)\b/.test(value)) return null;
    const distanceMatch = value.match(/(\d+(?:\.\d+)?)\s*(km|kilometers?|metres?|meters?|miles?|m)\b/);
    const timeMatch = value.match(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|hr|minutes?|mins?|min|seconds?|secs?|s)\b/);
    const speedMatch = value.match(/(\d+(?:\.\d+)?)\s*(km\/h|kmph|m\/s|mph)\b/);
    const wantsSpeed = /\b(speed|how fast)\b/.test(value);
    const wantsDistance = /\b(distance|how far)\b/.test(value);
    const wantsTime = /\b(time|how long)\b/.test(value);

    if (distanceMatch && timeMatch && (wantsSpeed || !speedMatch)) {
      const distance = Number(distanceMatch[1]);
      let time = Number(timeMatch[1]);
      const timeUnit = timeMatch[2];
      if (/min/.test(timeUnit)) time /= 60;
      if (/sec|^s$/.test(timeUnit)) time /= 3600;
      const speed = distance / time;
      return makeWordProblemResult({
        topic: "Word Problems",
        subtopic: "Speed, Distance, Time",
        difficulty: "Middle School",
        goal: "Find the speed",
        formulas: ["Speed = Distance / Time"],
        method: "Speed Formula",
        given: [`Distance = ${distance} ${distanceMatch[2]}`, `Time = ${formatNumber(time)} hours`],
        unknown: ["Speed"],
        units: `${distanceMatch[2]}/hour`,
        translation: [`"${distance} ${distanceMatch[2]}" becomes distance.`, `"${timeMatch[1]} ${timeMatch[2]}" becomes time.`],
        model: [`speed = distance / time = ${distance} / ${formatNumber(time)}`],
        steps: [
          { work: `Speed = ${distance} / ${formatNumber(time)}`, why: "Speed tells how much distance is covered in one unit of time." },
          { work: `Speed = ${formatNumber(speed)} ${distanceMatch[2]}/hour` }
        ],
        verification: [`Distance check: ${formatNumber(speed)} × ${formatNumber(time)} = ${formatNumber(distance)} ${distanceMatch[2]}.`],
        finalAnswer: `The speed is ${formatNumber(speed)} ${distanceMatch[2]}/hour.`,
        mistake: "Make sure minutes are converted to hours when speed is in km/h.",
        practice: "Practice: A bus travels 180 km in 3 hours. Find its speed."
      });
    }

    if (speedMatch && timeMatch && wantsDistance) {
      const speed = Number(speedMatch[1]);
      let time = Number(timeMatch[1]);
      const timeUnit = timeMatch[2];
      if (/min/.test(timeUnit)) time /= 60;
      if (/sec|^s$/.test(timeUnit)) time /= 3600;
      const distance = speed * time;
      return makeWordProblemResult({
        topic: "Word Problems",
        subtopic: "Speed, Distance, Time",
        difficulty: "Middle School",
        goal: "Find the distance",
        formulas: ["Distance = Speed × Time"],
        method: "Distance Formula",
        given: [`Speed = ${speed} ${speedMatch[2]}`, `Time = ${formatNumber(time)} hours`],
        unknown: ["Distance"],
        translation: ["Speed and time are given, so multiply them to get distance."],
        model: [`distance = ${speed} × ${formatNumber(time)}`],
        steps: [
          { work: `Distance = ${speed} × ${formatNumber(time)}` },
          { work: `Distance = ${formatNumber(distance)}` }
        ],
        verification: [`Speed check: ${formatNumber(distance)} / ${formatNumber(time)} = ${formatNumber(speed)}.`],
        finalAnswer: `The distance travelled is ${formatNumber(distance)} km.`,
        mistake: "Use matching time units before multiplying.",
        practice: "Practice: A car moves at 70 km/h for 2 hours. Find the distance."
      });
    }

    if (distanceMatch && speedMatch && wantsTime) {
      const distance = Number(distanceMatch[1]);
      const speed = Number(speedMatch[1]);
      const time = distance / speed;
      return makeWordProblemResult({
        topic: "Word Problems",
        subtopic: "Speed, Distance, Time",
        difficulty: "Middle School",
        goal: "Find the time",
        formulas: ["Time = Distance / Speed"],
        method: "Time Formula",
        given: [`Distance = ${distance} ${distanceMatch[2]}`, `Speed = ${speed} ${speedMatch[2]}`],
        unknown: ["Time"],
        translation: ["Distance and speed are given, so divide distance by speed."],
        model: [`time = ${distance} / ${speed}`],
        steps: [
          { work: `Time = ${distance} / ${speed}` },
          { work: `Time = ${formatNumber(time)} hours` }
        ],
        verification: [`Distance check: ${speed} × ${formatNumber(time)} = ${formatNumber(distance)}.`],
        finalAnswer: `The time taken is ${formatNumber(time)} hours.`,
        mistake: "Do not multiply distance and speed when time is asked.",
        practice: "Practice: A train covers 300 km at 60 km/h. Find the time."
      });
    }
    return null;
  }

  function solveAgeWord(text) {
    const value = normalize(text);
    if (!/\bage\b|years? old|older|younger/.test(value)) return null;
    const match = value.match(/(\w+)\s+is\s+(\d+)\s+years?\s+older\s+than\s+(\w+).*in\s+(\d+)\s+years?.*sum.*ages?.*will\s+be\s+(\d+)/);
    if (!match) return null;
    const olderName = match[1];
    const difference = Number(match[2]);
    const youngerName = match[3];
    const yearsLater = Number(match[4]);
    const futureSum = Number(match[5]);
    const youngerAge = (futureSum - difference - 2 * yearsLater) / 2;
    const olderAge = youngerAge + difference;
    return makeWordProblemResult({
      topic: "Word Problems",
      subtopic: "Age Problem",
      difficulty: "High School",
      goal: "Find present ages",
      formulas: ["If one age is x, the other can be written using the age difference."],
      method: "Variable Equation Method",
      given: [`${olderName} is ${difference} years older than ${youngerName}.`, `In ${yearsLater} years, their age sum will be ${futureSum}.`],
      unknown: [`${youngerName}'s present age`, `${olderName}'s present age`],
      translation: [`Let ${youngerName}'s age = x.`, `${olderName}'s age = x + ${difference}.`],
      model: [`(x + ${yearsLater}) + (x + ${difference} + ${yearsLater}) = ${futureSum}`],
      steps: [
        { work: `2x + ${difference + 2 * yearsLater} = ${futureSum}` },
        { work: `2x = ${futureSum - difference - 2 * yearsLater}` },
        { work: `x = ${formatNumber(youngerAge)}` },
        { work: `${olderName}'s age = ${formatNumber(youngerAge)} + ${difference} = ${formatNumber(olderAge)}` }
      ],
      verification: [`In ${yearsLater} years: ${formatNumber(youngerAge + yearsLater)} + ${formatNumber(olderAge + yearsLater)} = ${futureSum}.`],
      finalAnswer: `${youngerName} is ${formatNumber(youngerAge)} years old and ${olderName} is ${formatNumber(olderAge)} years old.`,
      mistake: "Do not add the future years to only one person's age; both people age by the same amount.",
      practice: "Practice: A is 4 years older than B. In 3 years, their ages sum to 30. Find their present ages."
    });
  }

  function solveWorkWord(text) {
    const value = normalize(text);
    if (!/\b(work|complete|finish|together|pipe|tank)\b/.test(value)) return null;
    const match = value.match(/(?:a|one|person\s*a|worker\s*a|pipe\s*a).*?(\d+(?:\.\d+)?)\s*(?:hours?|days?).*?(?:b|person\s*b|worker\s*b|pipe\s*b).*?(\d+(?:\.\d+)?)\s*(?:hours?|days?)/);
    if (!match) return null;
    const a = Number(match[1]);
    const b = Number(match[2]);
    const together = 1 / (1 / a + 1 / b);
    return makeWordProblemResult({
      topic: "Word Problems",
      subtopic: "Work Problem",
      difficulty: "High School",
      goal: "Find time taken together",
      formulas: ["Combined rate = 1/a + 1/b", "Time together = 1 / combined rate"],
      method: "Work Rate Method",
      given: [`First person/pipe time = ${a}`, `Second person/pipe time = ${b}`],
      unknown: ["Time together"],
      translation: [`First rate = 1/${a}`, `Second rate = 1/${b}`],
      model: [`combined rate = 1/${a} + 1/${b}`],
      steps: [
        { work: `Combined rate = 1/${a} + 1/${b}` },
        { work: `Time = 1 / combined rate = ${formatNumber(together)}` }
      ],
      verification: [`In ${formatNumber(together)} time units, total work completed is 1 whole job.`],
      finalAnswer: `Together, they finish the work in ${formatNumber(together)} time units.`,
      mistake: "Do not add the times directly. Add work rates.",
      practice: "Practice: A finishes a job in 6 hours and B in 12 hours. How long together?"
    });
  }

  function solveProfitDiscountWord(text) {
    const value = normalize(text);
    const nums = extractNumbers(value);
    if (nums.length < 2) return null;
    if (/\b(discount|marked price|sale price)\b/.test(value)) {
      const price = nums[0];
      const discount = nums[1];
      const discountAmount = price * discount / 100;
      const salePrice = price - discountAmount;
      return makeWordProblemResult({
        topic: "Word Problems",
        subtopic: "Discount Problem",
        difficulty: "Middle School",
        goal: "Find the sale price",
        formulas: ["Discount amount = Marked price × discount% / 100", "Sale price = Marked price - Discount amount"],
        method: "Discount Formula",
        given: [`Marked price = ${price}`, `Discount = ${discount}%`],
        unknown: ["Sale price"],
        translation: [`${discount}% discount means subtract ${discount}% of ${price}.`],
        model: [`sale price = ${price} - (${discount}/100 × ${price})`],
        steps: [
          { work: `Discount amount = ${price} × ${discount}/100 = ${formatNumber(discountAmount)}` },
          { work: `Sale price = ${price} - ${formatNumber(discountAmount)} = ${formatNumber(salePrice)}` }
        ],
        verification: [`Sale price is less than marked price, which is reasonable for a discount.`],
        finalAnswer: `The sale price is ${formatNumber(salePrice)}.`,
        mistake: "Do not add the discount amount to the marked price.",
        practice: `Practice: Find sale price of ${price + 100} with ${discount}% discount.`
      });
    }
    if (/\b(profit|loss|cost price|selling price|cp|sp)\b/.test(value)) {
      const cost = nums[0];
      const selling = nums[1];
      const diff = selling - cost;
      const percent = Math.abs(diff) / cost * 100;
      const label = diff >= 0 ? "profit" : "loss";
      return makeWordProblemResult({
        topic: "Word Problems",
        subtopic: "Profit and Loss",
        difficulty: "Middle School",
        goal: `Find ${label} and percentage`,
        formulas: ["Profit = SP - CP", "Loss = CP - SP", "Percent = amount / CP × 100"],
        method: "Profit-Loss Formula",
        given: [`Cost price = ${cost}`, `Selling price = ${selling}`],
        unknown: [`${label} amount`, `${label} percent`],
        translation: ["Compare selling price with cost price."],
        model: [`${label} = |${selling} - ${cost}|`],
        steps: [
          { work: `${label} amount = ${formatNumber(Math.abs(diff))}` },
          { work: `${label} percent = ${formatNumber(Math.abs(diff))} / ${cost} × 100 = ${formatNumber(percent)}%` }
        ],
        verification: [diff >= 0 ? "Selling price is greater than cost price, so it is profit." : "Selling price is less than cost price, so it is loss."],
        finalAnswer: `There is a ${label} of ${formatNumber(Math.abs(diff))}, which is ${formatNumber(percent)}%.`,
        mistake: "Always divide by cost price when finding profit or loss percent.",
        practice: `Practice: CP = ${cost}, SP = ${selling + 20}. Find profit/loss percent.`
      });
    }
    return null;
  }

  function solveMixtureWord(text) {
    const value = normalize(text);
    if (!/\b(mixture|mix|solution|acid|water|concentration)\b/.test(value)) return null;
    const nums = extractNumbers(value);
    if (nums.length < 5) return null;
    const [amountA, percentA, amountB, percentB, targetPercent] = nums;
    const totalPure = amountA * percentA / 100 + amountB * percentB / 100;
    const totalAmount = amountA + amountB;
    const finalPercent = totalPure / totalAmount * 100;
    return makeWordProblemResult({
      topic: "Word Problems",
      subtopic: "Mixture Problem",
      difficulty: "High School",
      goal: "Find final concentration",
      formulas: ["Pure amount = quantity × percent / 100", "Final percent = total pure amount / total quantity × 100"],
      method: "Concentration Table Method",
      given: [`${amountA} units at ${percentA}%`, `${amountB} units at ${percentB}%`],
      unknown: ["Final concentration"],
      conditions: targetPercent ? [`Target mentioned: ${targetPercent}%`] : [],
      translation: ["Convert each mixture into pure component amount."],
      model: [`final percent = (${amountA}×${percentA}/100 + ${amountB}×${percentB}/100) / (${amountA}+${amountB}) × 100`],
      steps: [
        { work: `Pure amount = ${formatNumber(amountA * percentA / 100)} + ${formatNumber(amountB * percentB / 100)} = ${formatNumber(totalPure)}` },
        { work: `Total mixture = ${amountA} + ${amountB} = ${totalAmount}` },
        { work: `Final percent = ${formatNumber(totalPure)} / ${totalAmount} × 100 = ${formatNumber(finalPercent)}%` }
      ],
      verification: [`Final percent ${formatNumber(finalPercent)}% lies between ${percentA}% and ${percentB}%, which is reasonable.`],
      finalAnswer: `The final concentration is ${formatNumber(finalPercent)}%.`,
      mistake: "Do not average percentages directly unless the quantities are equal.",
      practice: "Practice: Mix 10 L of 20% solution with 5 L of 50% solution. Find the final percent."
    });
  }

  function solveWordProblem(text) {
    const value = normalize(text);
    const looksLikeStory = value.split(" ").length >= 8 || /\b(a|an|the|person|train|shop|farmer|student|worker|pipe|tank|book|class|bag)\b/.test(value);
    if (!looksLikeStory) return null;
    const solvers = [
      solveAgeWord,
      solveSpeedDistanceTimeWord,
      solveWorkWord,
      solveProfitDiscountWord,
      solveMixtureWord
    ];
    for (const solver of solvers) {
      const result = solver(text);
      if (result) return result;
    }
    return null;
  }

  function solveFraction(text) {
    const match = normalize(text).match(/(-?\d+)\s*\/\s*(-?\d+)\s*([+\-*/])\s*(-?\d+)\s*\/\s*(-?\d+)/);
    if (!match) return null;
    const a = Number(match[1]);
    const b = Number(match[2]);
    const op = match[3];
    const c = Number(match[4]);
    const d = Number(match[5]);
    if (!b || !d || (op === "/" && c === 0)) return null;
    let numerator;
    let denominator;
    const steps = [];

    if (op === "+" || op === "-") {
      const common = lcm(b, d);
      const left = a * (common / b);
      const right = c * (common / d);
      numerator = op === "+" ? left + right : left - right;
      denominator = common;
      steps.push({ work: `LCM of ${b} and ${d} = ${common}`, why: "Fractions need a common denominator before adding or subtracting." });
      steps.push({ work: `${a}/${b} ${op} ${c}/${d} = ${left}/${common} ${op} ${right}/${common}` });
      steps.push({ work: `= ${numerator}/${denominator}` });
    } else if (op === "*") {
      numerator = a * c;
      denominator = b * d;
      steps.push({ work: `${a}/${b} × ${c}/${d} = (${a} × ${c}) / (${b} × ${d})`, why: "Multiply numerators together and denominators together." });
      steps.push({ work: `= ${numerator}/${denominator}` });
    } else {
      numerator = a * d;
      denominator = b * c;
      steps.push({ work: `${a}/${b} ÷ ${c}/${d} = ${a}/${b} × ${d}/${c}`, why: "Dividing by a fraction means multiplying by its reciprocal." });
      steps.push({ work: `= ${numerator}/${denominator}` });
    }

    const divisor = gcd(numerator, denominator);
    const simpleNum = numerator / divisor;
    const simpleDen = denominator / divisor;
    const answer = simpleDen === 1 ? String(simpleNum) : `${simpleNum}/${simpleDen}`;
    steps.push({ work: `Simplify by ${divisor}: ${numerator}/${denominator} = ${answer}` });

    return makeResult({
      topic: "Fractions",
      subtopic: "Fraction Operations",
      difficulty: "Middle School",
      goal: "Simplify the fraction expression",
      formulas: ["a/b + c/d = (ad + bc) / bd", "a/b × c/d = ac / bd", "a/b ÷ c/d = a/b × d/c"],
      method: op === "+" || op === "-" ? "Common Denominator Method" : "Fraction Operation Rule",
      given: [`Expression: ${a}/${b} ${op} ${c}/${d}`],
      unknown: ["Simplified value"],
      steps,
      verification: [`Decimal check: ${formatNumber(a / b)} ${op} ${formatNumber(c / d)} = ${formatNumber(simpleNum / simpleDen)}.`],
      finalAnswer: `Answer = ${answer}`,
      mistake: "Do not add denominators directly. Only numerators combine after making denominators the same.",
      practice: `Practice: Solve ${a + 1}/${b} ${op} ${c}/${d}.`
    });
  }

  function solvePercentage(text) {
    const value = normalize(text);
    let match = value.match(/(-?\d+(?:\.\d+)?)\s*%\s*of\s*(-?\d+(?:\.\d+)?)/);
    if (match) {
      const percent = Number(match[1]);
      const base = Number(match[2]);
      const answer = percent / 100 * base;
      return makeResult({
        topic: "Percentages",
        subtopic: "Percent of a Number",
        difficulty: "Middle School",
        goal: "Find the percentage value",
        formulas: ["Percentage value = (percent / 100) × base"],
        method: "Percent Formula",
        given: [`Percent: ${percent}%`, `Base: ${base}`],
        unknown: ["Percentage value"],
        steps: [
          { work: `${percent}% = ${percent}/100 = ${formatNumber(percent / 100)}`, why: "A percent means out of 100." },
          { work: `${formatNumber(percent / 100)} × ${base} = ${formatNumber(answer)}` }
        ],
        verification: [`${formatNumber(answer)} / ${base} × 100 = ${formatNumber(percent)}%.`],
        finalAnswer: `Answer = ${formatNumber(answer)}`,
        mistake: "Do not multiply by the percent directly; convert it to a decimal first.",
        practice: `Practice: Find ${percent + 5}% of ${base}.`
      });
    }

    match = value.match(/(-?\d+(?:\.\d+)?)\s+is\s+what\s+percent\s+of\s+(-?\d+(?:\.\d+)?)/);
    if (match) {
      const part = Number(match[1]);
      const whole = Number(match[2]);
      if (!whole) return null;
      const answer = part / whole * 100;
      return makeResult({
        topic: "Percentages",
        subtopic: "Finding Percent",
        difficulty: "Middle School",
        goal: "Find what percent one number is of another",
        formulas: ["Percent = (part / whole) × 100"],
        method: "Part-Whole Percent Method",
        given: [`Part: ${part}`, `Whole: ${whole}`],
        unknown: ["Percent"],
        steps: [
          { work: `Percent = (${part} / ${whole}) × 100`, why: "A percent compares the part to the whole." },
          { work: `= ${formatNumber(answer)}%` }
        ],
        verification: `${formatNumber(answer)}% of ${whole} = ${formatNumber(part)}.`.split("\n"),
        finalAnswer: `Answer = ${formatNumber(answer)}%`,
        mistake: "Make sure the whole number goes in the denominator.",
        practice: `Practice: ${part + 5} is what percent of ${whole}?`
      });
    }
    return null;
  }

  function solveLinearEquation(text) {
    const equation = normalize(text).match(/([+-]?\d*\.?\d*)\s*\*?\s*x\s*([+-])\s*(\d+(?:\.\d+)?)\s*=\s*([+-]?\d+(?:\.\d+)?)/);
    if (!equation) return null;
    const coefficient = equation[1] === "" || equation[1] === "+" ? 1 : equation[1] === "-" ? -1 : Number(equation[1]);
    const sign = equation[2];
    const constant = Number(equation[3]);
    const right = Number(equation[4]);
    const moved = sign === "+" ? right - constant : right + constant;
    const x = moved / coefficient;
    const expression = `${coefficient === 1 ? "" : coefficient === -1 ? "-" : coefficient}x ${sign} ${constant} = ${right}`.trim();

    return makeResult({
      topic: "Algebra",
      subtopic: "Linear Equation",
      difficulty: "Middle School / High School",
      goal: "Solve for x",
      formulas: ["For ax + b = c, x = (c - b) / a"],
      method: "Isolation Method",
      given: [`Equation: ${expression}`],
      unknown: ["x"],
      steps: [
        { work: `${expression}`, why: "Start with the original equation." },
        { work: `${formatNumber(coefficient)}x = ${formatNumber(moved)}`, why: sign === "+" ? `Subtract ${constant} from both sides.` : `Add ${constant} to both sides.` },
        { work: `x = ${formatNumber(moved)} / ${formatNumber(coefficient)}` },
        { work: `x = ${exactFraction(x)}` }
      ],
      verification: [
        `Substitute x = ${exactFraction(x)} into the original equation.`,
        `${formatNumber(coefficient)}(${exactFraction(x)}) ${sign} ${constant} = ${formatNumber(right)}.`,
        "Both sides match, so the solution is correct."
      ],
      finalAnswer: `x = ${exactFraction(x)}`,
      alternative: "You can also move all terms to one side first, then simplify to isolate x.",
      mistake: "When moving a number across the equals sign, use the inverse operation.",
      practice: `Practice: Solve ${formatNumber(coefficient + 1)}x ${sign} ${constant} = ${formatNumber(right + 2)}.`
    });
  }

  function coefficient(raw) {
    if (!raw || raw === "+") return 1;
    if (raw === "-") return -1;
    return Number(raw);
  }

  function solveRatioProportion(text) {
    const value = normalize(text).replace(/\s+/g, "");
    let match = value.match(/(-?\d+(?:\.\d+)?):(-?\d+(?:\.\d+)?)=(-?\d+(?:\.\d+)?):x/);
    if (match) {
      const a = Number(match[1]);
      const b = Number(match[2]);
      const c = Number(match[3]);
      const x = b * c / a;
      return makeResult({
        topic: "Ratios and Proportions",
        subtopic: "Missing Term in a Proportion",
        difficulty: "Middle School",
        goal: "Find x",
        formulas: ["If a:b = c:x, then a/b = c/x and ax = bc."],
        method: "Cross Multiplication",
        given: [`${a}:${b} = ${c}:x`],
        unknown: ["x"],
        steps: [
          { work: `${a}/${b} = ${c}/x`, why: "Rewrite the ratio as fractions." },
          { work: `${a}x = ${b} × ${c}` },
          { work: `x = ${formatNumber(b * c)} / ${a} = ${formatNumber(x)}` }
        ],
        verification: [`${a}:${b} and ${c}:${formatNumber(x)} reduce to the same ratio.`],
        finalAnswer: `x = ${formatNumber(x)}`,
        mistake: "Keep the matching ratio positions in the same order before cross multiplying.",
        practice: `Practice: Solve ${a}:${b} = ${c + 1}:x.`
      });
    }
    match = value.match(/x:(-?\d+(?:\.\d+)?)=(-?\d+(?:\.\d+)?):(-?\d+(?:\.\d+)?)/);
    if (match) {
      const b = Number(match[1]);
      const c = Number(match[2]);
      const d = Number(match[3]);
      const x = b * c / d;
      return makeResult({
        topic: "Ratios and Proportions",
        subtopic: "Missing Term in a Proportion",
        difficulty: "Middle School",
        goal: "Find x",
        formulas: ["If x:b = c:d, then x/b = c/d and xd = bc."],
        method: "Cross Multiplication",
        given: [`x:${b} = ${c}:${d}`],
        unknown: ["x"],
        steps: [
          { work: `x/${b} = ${c}/${d}` },
          { work: `${d}x = ${b} × ${c}` },
          { work: `x = ${formatNumber(b * c)} / ${d} = ${formatNumber(x)}` }
        ],
        verification: [`${formatNumber(x)}:${b} and ${c}:${d} reduce to the same ratio.`],
        finalAnswer: `x = ${formatNumber(x)}`,
        mistake: "Do not swap one side of the ratio unless you swap the other side too.",
        practice: `Practice: Solve x:${b + 1} = ${c}:${d}.`
      });
    }
    return null;
  }

  function solvePowersRootsAndExponents(text) {
    const n = normalize(text)
      .replace(/²/g, "^2")
      .replace(/³/g, "^3")
      .replace(/√/g, "sqrt ");

    if (/\bsquare\s+(?:meters?|metres?|feet|units?|centimeters?|centimetres?|kilometers?|kilometres?|yards?)\b/.test(n) && hasWordProblemCue(n)) {
      return null;
    }

    let match = n.match(/\b(?:square root|sqrt)\s*(?:of)?\s*(-?\d+(?:\.\d+)?)/);
    if (match) {
      const value = Number(match[1]);
      if (value < 0) {
        return makeResult({
          topic: "Exponents and Roots",
          subtopic: "Square Roots",
          difficulty: "Intermediate",
          goal: "Find the square root.",
          given: [`Number = ${formatNumber(value)}`],
          unknown: ["Square root"],
          conditions: ["A negative number has no real square root."],
          formulas: ["If x² = a, then √a = x"],
          steps: [
            `We need √${formatNumber(value)}.`,
            "Since the number is negative, the answer is not real.",
            `√${formatNumber(value)} = ${formatNumber(Math.sqrt(Math.abs(value)))}i`
          ],
          verification: [`(${formatNumber(Math.sqrt(Math.abs(value)))}i)² = ${formatNumber(value)}`],
          finalAnswer: `√${formatNumber(value)} = ${formatNumber(Math.sqrt(Math.abs(value)))}i`,
          alternative: ["For real-number answers, say: no real square root."],
          practice: "Find √49."
        });
      }
      const root = Math.sqrt(value);
      return makeResult({
        topic: "Exponents and Roots",
        subtopic: "Square Roots",
        difficulty: "Basic",
        goal: "Find the number that squares back to the given value.",
        given: [`Number = ${formatNumber(value)}`],
        unknown: ["Square root"],
        conditions: ["The principal square root is the positive root."],
        formulas: ["If x² = a, then √a = x"],
        steps: [
          `√${formatNumber(value)} means: which number times itself gives ${formatNumber(value)}?`,
          `${formatNumber(root)} × ${formatNumber(root)} = ${formatNumber(value)}`,
          `So, √${formatNumber(value)} = ${formatNumber(root)}`
        ],
        verification: [`${formatNumber(root)}² = ${formatNumber(value)}`],
        finalAnswer: `√${formatNumber(value)} = ${formatNumber(root)}`,
        practice: "Find √144."
      });
    }

    match = n.match(/\b(?:cube root|cbrt)\s*(?:of)?\s*(-?\d+(?:\.\d+)?)/);
    if (match) {
      const value = Number(match[1]);
      const root = Math.cbrt(value);
      return makeResult({
        topic: "Exponents and Roots",
        subtopic: "Cube Roots",
        difficulty: "Basic",
        goal: "Find the number that cubes back to the given value.",
        given: [`Number = ${formatNumber(value)}`],
        unknown: ["Cube root"],
        conditions: ["Cube roots can be positive, negative, or zero."],
        formulas: ["If x³ = a, then ∛a = x"],
        steps: [
          `∛${formatNumber(value)} means: which number multiplied 3 times gives ${formatNumber(value)}?`,
          `${formatNumber(root)} × ${formatNumber(root)} × ${formatNumber(root)} = ${formatNumber(value)}`,
          `So, ∛${formatNumber(value)} = ${formatNumber(root)}`
        ],
        verification: [`${formatNumber(root)}³ = ${formatNumber(value)}`],
        finalAnswer: `∛${formatNumber(value)} = ${formatNumber(root)}`,
        practice: "Find ∛125."
      });
    }

    match = n.match(/\b(?:square of|square)\s*(-?\d+(?:\.\d+)?)/) || n.match(/\b(-?\d+(?:\.\d+)?)\s*(?:squared|square)\b/);
    if (match) {
      const value = Number(match[1]);
      const result = value ** 2;
      return makeResult({
        topic: "Exponents and Roots",
        subtopic: "Squares",
        difficulty: "Basic",
        goal: "Find the square of a number.",
        given: [`Number = ${formatNumber(value)}`],
        unknown: ["Square"],
        conditions: ["Squaring means multiplying the number by itself."],
        formulas: ["a² = a × a"],
        steps: [
          `${formatNumber(value)}² = ${formatNumber(value)} × ${formatNumber(value)}`,
          `${formatNumber(value)}² = ${formatNumber(result)}`
        ],
        verification: [`${formatNumber(value)} × ${formatNumber(value)} = ${formatNumber(result)}`],
        finalAnswer: `${formatNumber(value)}² = ${formatNumber(result)}`,
        practice: "Find the square of 15."
      });
    }

    match = n.match(/\b(?:cube of|cube)\s*(-?\d+(?:\.\d+)?)/) || n.match(/\b(-?\d+(?:\.\d+)?)\s*(?:cubed|cube)\b/);
    if (match) {
      const value = Number(match[1]);
      const result = value ** 3;
      return makeResult({
        topic: "Exponents and Roots",
        subtopic: "Cubes",
        difficulty: "Basic",
        goal: "Find the cube of a number.",
        given: [`Number = ${formatNumber(value)}`],
        unknown: ["Cube"],
        conditions: ["Cubing means multiplying the number by itself 3 times."],
        formulas: ["a³ = a × a × a"],
        steps: [
          `${formatNumber(value)}³ = ${formatNumber(value)} × ${formatNumber(value)} × ${formatNumber(value)}`,
          `${formatNumber(value)}³ = ${formatNumber(result)}`
        ],
        verification: [`${formatNumber(value)} × ${formatNumber(value)} × ${formatNumber(value)} = ${formatNumber(result)}`],
        finalAnswer: `${formatNumber(value)}³ = ${formatNumber(result)}`,
        practice: "Find the cube of 6."
      });
    }

    match = n.match(/\b(-?\d+(?:\.\d+)?)\s*(?:\^|\*\*|raised to|to the power of|power)\s*(-?\d+(?:\.\d+)?)/);
    if (match) {
      const base = Number(match[1]);
      const exponent = Number(match[2]);
      const result = base ** exponent;
      const repeated = Number.isInteger(exponent) && exponent > 0 && exponent <= 6
        ? Array.from({ length: exponent }, () => formatNumber(base)).join(" × ")
        : "";
      const steps = repeated
        ? [`${formatNumber(base)}^${formatNumber(exponent)} = ${repeated}`, `${formatNumber(base)}^${formatNumber(exponent)} = ${formatNumber(result)}`]
        : [`${formatNumber(base)}^${formatNumber(exponent)} means ${formatNumber(base)} raised to power ${formatNumber(exponent)}.`, `${formatNumber(base)}^${formatNumber(exponent)} = ${formatNumber(result)}`];

      return makeResult({
        topic: "Exponents and Roots",
        subtopic: "Exponents",
        difficulty: exponent < 0 || !Number.isInteger(exponent) ? "Intermediate" : "Basic",
        goal: "Evaluate a power expression.",
        given: [`Base = ${formatNumber(base)}`, `Exponent = ${formatNumber(exponent)}`],
        unknown: ["Power value"],
        conditions: ["An exponent tells how many times the base is used as a factor."],
        formulas: ["aⁿ = a multiplied by itself n times"],
        steps,
        verification: [`The result follows the exponent rule for ${formatNumber(base)}^${formatNumber(exponent)}.`],
        finalAnswer: `${formatNumber(base)}^${formatNumber(exponent)} = ${formatNumber(result)}`,
        alternative: exponent === 2 ? ["This is also called a square."] : exponent === 3 ? ["This is also called a cube."] : [],
        practice: "Evaluate 3^4."
      });
    }

    return null;
  }

  function solveExponentsRoots(text) {
    const value = normalize(text);
    let match = value.match(/(?:sqrt|square root|root)\s*(?:of)?\s*(-?\d+(?:\.\d+)?)/);
    if (match) {
      const n = Number(match[1]);
      if (n < 0) return null;
      const answer = Math.sqrt(n);
      return makeResult({
        topic: "Exponents and Roots",
        subtopic: "Square Root",
        difficulty: "Middle School",
        goal: "Find the square root",
        formulas: ["√a is the number whose square is a."],
        method: "Root Definition",
        given: [`Number: ${n}`],
        unknown: [`√${n}`],
        steps: [
          { work: `√${n} = ${formatNumber(answer)}`, why: `${formatNumber(answer)} × ${formatNumber(answer)} = ${formatNumber(n)}.` }
        ],
        verification: [`${formatNumber(answer)}² = ${formatNumber(n)}.`],
        finalAnswer: `√${n} = ${formatNumber(answer)}`,
        mistake: "The square root asks for the number that squares back to the original.",
        practice: `Practice: Find √${n + 25}.`
      });
    }
    match = value.match(/(-?\d+(?:\.\d+)?)\s*\^\s*(-?\d+(?:\.\d+)?)/);
    if (match) {
      const base = Number(match[1]);
      const power = Number(match[2]);
      const answer = base ** power;
      return makeResult({
        topic: "Exponents and Roots",
        subtopic: "Exponents",
        difficulty: "Middle School",
        goal: "Evaluate the power",
        formulas: ["a^n means multiply a by itself n times."],
        method: "Power Evaluation",
        given: [`Base = ${base}`, `Power = ${power}`],
        unknown: [`${base}^${power}`],
        steps: [
          { work: `${base}^${power} = ${formatNumber(answer)}` }
        ],
        verification: [`Recalculating the power gives ${formatNumber(answer)}.`],
        finalAnswer: `${base}^${power} = ${formatNumber(answer)}`,
        mistake: "Do not multiply base × power; exponent means repeated multiplication.",
        practice: `Practice: Evaluate ${base}^${power + 1}.`
      });
    }
    return null;
  }

  function parseLinearXY(raw) {
    const compact = normalize(raw).replace(/\s+/g, "");
    const match = compact.match(/([+-]?\d*)x([+-]?\d*)y=([+-]?\d+(?:\.\d+)?)/);
    if (!match) return null;
    return {
      a: coefficient(match[1]),
      b: coefficient(match[2]),
      c: Number(match[3]),
      text: compact
    };
  }

  function solveSystem(text) {
    const compact = normalize(text).replace(/\s+/g, "");
    const matches = [...compact.matchAll(/([+-]?\d*)x([+-]?\d*)y=([+-]?\d+(?:\.\d+)?)/g)];
    if (matches.length < 2) return null;
    const first = parseLinearXY(matches[0][0]);
    const second = parseLinearXY(matches[1][0]);
    if (!first || !second) return null;
    const determinant = first.a * second.b - second.a * first.b;
    if (determinant === 0) return null;
    const x = (first.c * second.b - second.c * first.b) / determinant;
    const y = (first.a * second.c - second.a * first.c) / determinant;
    return makeResult({
      topic: "Algebra",
      subtopic: "System of Linear Equations",
      difficulty: "High School",
      goal: "Solve for x and y",
      formulas: ["For ax + by = c and dx + ey = f, use elimination or determinants."],
      method: "Elimination / Determinant Method",
      given: [`${first.text}`, `${second.text}`],
      unknown: ["x", "y"],
      steps: [
        { work: `Determinant = (${first.a} × ${second.b}) - (${second.a} × ${first.b}) = ${formatNumber(determinant)}` },
        { work: `x = (${first.c} × ${second.b} - ${second.c} × ${first.b}) / ${formatNumber(determinant)} = ${formatNumber(x)}` },
        { work: `y = (${first.a} × ${second.c} - ${second.a} × ${first.c}) / ${formatNumber(determinant)} = ${formatNumber(y)}` }
      ],
      verification: [
        `Substitute x = ${formatNumber(x)}, y = ${formatNumber(y)} into both equations.`,
        "Both equations balance."
      ],
      finalAnswer: `x = ${formatNumber(x)}, y = ${formatNumber(y)}`,
      alternative: "You can also solve by substitution: isolate one variable, then substitute into the other equation.",
      mistake: "When eliminating, multiply the whole equation, not just one term.",
      practice: "Practice: Solve x + y = 10 and x - y = 2."
    });
  }

  function solveInequality(text) {
    const match = normalize(text).match(/([+-]?\d*\.?\d*)\s*\*?\s*x\s*([+-])\s*(\d+(?:\.\d+)?)\s*(<=|>=|<|>)\s*([+-]?\d+(?:\.\d+)?)/);
    if (!match) return null;
    const a = coefficient(match[1]);
    const sign = match[2];
    const b = Number(match[3]);
    const relation = match[4];
    const right = Number(match[5]);
    const moved = sign === "+" ? right - b : right + b;
    let finalRelation = relation;
    if (a < 0) {
      finalRelation = relation === "<" ? ">" : relation === ">" ? "<" : relation === "<=" ? ">=" : "<=";
    }
    const x = moved / a;
    return makeResult({
      topic: "Algebra",
      subtopic: "Linear Inequality",
      difficulty: "High School",
      goal: "Solve the inequality",
      formulas: ["Use inverse operations. If multiplying/dividing by a negative number, reverse the inequality sign."],
      method: "Isolation Method",
      given: [`${a}x ${sign} ${b} ${relation} ${right}`],
      unknown: ["Range of x"],
      steps: [
        { work: `${a}x ${relation} ${formatNumber(moved)}`, why: sign === "+" ? `Subtract ${b} from both sides.` : `Add ${b} to both sides.` },
        { work: `x ${finalRelation} ${formatNumber(x)}`, why: a < 0 ? "Dividing by a negative reverses the inequality sign." : "Divide both sides by the coefficient of x." }
      ],
      verification: [`Choose a test value that satisfies x ${finalRelation} ${formatNumber(x)} and substitute it back.`],
      finalAnswer: `x ${finalRelation} ${formatNumber(x)}`,
      mistake: "Remember to flip the inequality sign when dividing by a negative number.",
      practice: `Practice: Solve ${a}x ${sign} ${b} ${relation} ${right + 2}.`
    });
  }

  function solveCoordinateGeometry(text) {
    const raw = String(text || "");
    const value = normalize(text);
    if (!/\b(distance|slope|coordinate)\b/.test(value)) return null;
    const pointMatches = [...raw.matchAll(/\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g)];
    const nums = pointMatches.length >= 2
      ? [Number(pointMatches[0][1]), Number(pointMatches[0][2]), Number(pointMatches[1][1]), Number(pointMatches[1][2])]
      : (raw.replace(/,/g, " ").match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    if (nums.length < 4) return null;
    const [x1, y1, x2, y2] = nums;
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (value.includes("slope")) {
      const slope = dx === 0 ? "undefined" : formatNumber(dy / dx);
      return makeResult({
        topic: "Geometry",
        subtopic: "Coordinate Geometry - Slope",
        difficulty: "High School",
        goal: "Find the slope between two points",
        formulas: ["m = (y₂ - y₁) / (x₂ - x₁)"],
        method: "Slope Formula",
        given: [`Point 1 = (${x1}, ${y1})`, `Point 2 = (${x2}, ${y2})`],
        unknown: ["Slope"],
        steps: [
          { work: `m = (${y2} - ${y1}) / (${x2} - ${x1})` },
          { work: `m = ${dy} / ${dx} = ${slope}` }
        ],
        verification: ["Slope compares vertical change to horizontal change."],
        finalAnswer: `Slope = ${slope}`,
        mistake: "Keep the same point order in numerator and denominator.",
        practice: `Practice: Find slope between (${x1}, ${y1}) and (${x2 + 1}, ${y2}).`
      });
    }
    const distance = Math.sqrt(dx * dx + dy * dy);
    return makeResult({
      topic: "Geometry",
      subtopic: "Coordinate Geometry - Distance",
      difficulty: "High School",
      goal: "Find the distance between two points",
      formulas: ["d = √((x₂-x₁)² + (y₂-y₁)²)"],
      method: "Distance Formula",
      given: [`Point 1 = (${x1}, ${y1})`, `Point 2 = (${x2}, ${y2})`],
      unknown: ["Distance"],
      steps: [
        { work: `d = √((${x2}-${x1})² + (${y2}-${y1})²)` },
        { work: `d = √(${dx ** 2} + ${dy ** 2}) = ${formatNumber(distance)}` }
      ],
      verification: ["Distance is non-negative and uses the Pythagorean theorem."],
      finalAnswer: `Distance = ${formatNumber(distance)}`,
      mistake: "Do not forget to square both coordinate differences.",
      practice: `Practice: Find distance between (${x1}, ${y1}) and (${x2 + 1}, ${y2}).`
    });
  }

  function solveVolume(text) {
    const value = normalize(text);
    let match = value.match(/volume.*cube.*(?:side|s)\s*(?:=|is|:)?\s*(\d+(?:\.\d+)?)/);
    if (match) {
      const side = Number(match[1]);
      const volume = side ** 3;
      return makeResult({
        topic: "Geometry",
        subtopic: "Volume of a Cube",
        difficulty: "Middle School",
        goal: "Find volume",
        formulas: ["V = side³"],
        method: "Formula Method",
        given: [`Side = ${side}`],
        unknown: ["Volume"],
        units: "cubic units",
        steps: [{ work: `V = ${side}³ = ${formatNumber(volume)}` }],
        verification: ["Volume uses cubic units because side × side × side is three-dimensional."],
        finalAnswer: `Volume = ${formatNumber(volume)} cubic units`,
        mistake: "Do not use area formula when volume is asked.",
        practice: `Practice: Find volume of a cube with side ${side + 1}.`
      });
    }
    match = value.match(/volume.*cylinder.*(?:radius|r)\s*(?:=|is|:)?\s*(\d+(?:\.\d+)?).*(?:height|h)\s*(?:=|is|:)?\s*(\d+(?:\.\d+)?)/);
    if (match) {
      const r = Number(match[1]);
      const h = Number(match[2]);
      const volume = Math.PI * r * r * h;
      return makeResult({
        topic: "Geometry",
        subtopic: "Volume of a Cylinder",
        difficulty: "High School",
        goal: "Find volume",
        formulas: ["V = πr²h"],
        method: "Formula Method",
        given: [`Radius = ${r}`, `Height = ${h}`],
        unknown: ["Volume"],
        units: "cubic units",
        steps: [
          { work: `V = π × ${r}² × ${h}` },
          { work: `V = ${formatNumber(volume, 4)}` }
        ],
        verification: ["The unit is cubic because area of base is multiplied by height."],
        finalAnswer: `Volume = ${formatNumber(volume, 4)} cubic units`,
        mistake: "Do not forget to square the radius.",
        practice: `Practice: Find volume of a cylinder with radius ${r + 1} and height ${h}.`
      });
    }
    return null;
  }

  function solveLogExp(text) {
    const value = normalize(text);
    let match = value.match(/log\s*base\s*(\d+(?:\.\d+)?)\s*(?:of)?\s*(\d+(?:\.\d+)?)/);
    if (match) {
      const base = Number(match[1]);
      const argument = Number(match[2]);
      const answer = Math.log(argument) / Math.log(base);
      return makeResult({
        topic: "Algebra",
        subtopic: "Logarithms",
        difficulty: "High School",
        goal: "Evaluate the logarithm",
        formulas: ["log_b(a) = x means b^x = a"],
        method: "Log Definition",
        given: [`Base = ${base}`, `Argument = ${argument}`],
        unknown: [`log base ${base} of ${argument}`],
        steps: [
          { work: `log_${base}(${argument}) = x means ${base}^x = ${argument}` },
          { work: `x = ${formatNumber(answer)}` }
        ],
        verification: [`${base}^${formatNumber(answer)} ≈ ${argument}.`],
        finalAnswer: `log_${base}(${argument}) = ${formatNumber(answer)}`,
        mistake: "A logarithm asks for the exponent, not a normal division.",
        practice: `Practice: Find log base ${base} of ${argument * base}.`
      });
    }
    match = value.match(/(\d+(?:\.\d+)?)\s*\^\s*x\s*=\s*(\d+(?:\.\d+)?)/);
    if (match) {
      const base = Number(match[1]);
      const target = Number(match[2]);
      const x = Math.log(target) / Math.log(base);
      return makeResult({
        topic: "Algebra",
        subtopic: "Exponential Equation",
        difficulty: "High School",
        goal: "Solve for x",
        formulas: ["If a^x = b, then x = log(b) / log(a)."],
        method: "Logarithm Method",
        given: [`${base}^x = ${target}`],
        unknown: ["x"],
        steps: [
          { work: `x = log(${target}) / log(${base})` },
          { work: `x = ${formatNumber(x)}` }
        ],
        verification: [`${base}^${formatNumber(x)} ≈ ${target}.`],
        finalAnswer: `x = ${formatNumber(x)}`,
        mistake: "Do not divide target by base; use logarithms for unknown exponents.",
        practice: `Practice: Solve ${base}^x = ${target * base}.`
      });
    }
    return null;
  }

  function solveComplex(text) {
    const compact = normalize(text).replace(/\s+/g, "");
    const match = compact.match(/\(?(-?\d+(?:\.\d+)?)([+-])(\d+(?:\.\d+)?)i\)?([+-])\(?(-?\d+(?:\.\d+)?)([+-])(\d+(?:\.\d+)?)i\)?/);
    if (!match) return null;
    const a = Number(match[1]);
    const b = Number(match[3]) * (match[2] === "-" ? -1 : 1);
    const operation = match[4];
    const c = Number(match[5]);
    const d = Number(match[7]) * (match[6] === "-" ? -1 : 1);
    const real = operation === "+" ? a + c : a - c;
    const imag = operation === "+" ? b + d : b - d;
    const answer = `${formatNumber(real)} ${imag < 0 ? "-" : "+"} ${formatNumber(Math.abs(imag))}i`;
    return makeResult({
      topic: "Advanced Mathematics",
      subtopic: "Complex Numbers",
      difficulty: "High School / University Foundation",
      goal: "Add or subtract complex numbers",
      formulas: ["(a + bi) ± (c + di) = (a ± c) + (b ± d)i"],
      method: "Combine Like Parts",
      given: [`${a} ${b < 0 ? "-" : "+"} ${Math.abs(b)}i`, `${c} ${d < 0 ? "-" : "+"} ${Math.abs(d)}i`],
      unknown: ["Simplified complex number"],
      steps: [
        { work: `Real parts: ${a} ${operation} ${c} = ${formatNumber(real)}` },
        { work: `Imaginary parts: ${b} ${operation} ${d} = ${formatNumber(imag)}` },
        { work: `Result = ${answer}` }
      ],
      verification: ["Real parts combine with real parts; imaginary parts combine with imaginary parts."],
      finalAnswer: answer,
      mistake: "Do not combine real and imaginary parts together.",
      practice: `Practice: Simplify (${a + 1}+${Math.abs(b)}i)+(${c}+${Math.abs(d)}i).`
    });
  }

  function solveQuadratic(text) {
    const value = normalize(text).replace(/\s+/g, "");
    const match = value.match(/([+-]?\d*)x\^?2([+-]\d*)x([+-]\d+)=0/);
    if (!match) return null;
    const a = match[1] === "" || match[1] === "+" ? 1 : match[1] === "-" ? -1 : Number(match[1]);
    const b = Number(match[2]);
    const c = Number(match[3]);
    const discriminant = b * b - 4 * a * c;
    const rootText = discriminant >= 0
      ? [`${formatNumber((-b + Math.sqrt(discriminant)) / (2 * a))}`, `${formatNumber((-b - Math.sqrt(discriminant)) / (2 * a))}`]
      : [`${formatNumber(-b / (2 * a))} + ${formatNumber(Math.sqrt(-discriminant) / (2 * a))}i`, `${formatNumber(-b / (2 * a))} - ${formatNumber(Math.sqrt(-discriminant) / (2 * a))}i`];

    return makeResult({
      topic: "Algebra",
      subtopic: "Quadratic Equation",
      difficulty: "High School",
      goal: "Find the roots of the quadratic equation",
      formulas: ["Quadratic formula: x = (-b ± √(b² - 4ac)) / 2a"],
      method: "Quadratic Formula",
      given: [`a = ${a}`, `b = ${b}`, `c = ${c}`],
      unknown: ["x values / roots"],
      steps: [
        { work: `D = b² - 4ac = (${b})² - 4(${a})(${c})`, why: "The discriminant tells us the root type." },
        { work: `D = ${formatNumber(discriminant)}` },
        { work: `x = (-(${b}) ± √${formatNumber(discriminant)}) / (2 × ${a})` },
        { work: `x = ${rootText[0]} or ${rootText[1]}` }
      ],
      verification: [
        `Substitute each root into ${a}x² + ${b}x + ${c} = 0.`,
        "The expression becomes 0 for both roots."
      ],
      finalAnswer: `x = ${rootText[0]} or x = ${rootText[1]}`,
      alternative: discriminant >= 0 ? "If the quadratic factors cleanly, factoring may be faster." : "Completing the square also works and shows why complex roots appear.",
      mistake: "Do not forget the ± sign in the quadratic formula.",
      practice: `Practice: Solve x² + ${Math.abs(b + 1)}x + ${Math.abs(c + 1)} = 0.`
    });
  }

  function solveGeometry(text) {
    const value = normalize(text);
    let match = value.match(/area.*circle.*(?:radius|r)\s*(?:=|is|:)?\s*(\d+(?:\.\d+)?)/);
    if (match) {
      const r = Number(match[1]);
      const area = Math.PI * r * r;
      return makeResult({
        topic: "Geometry",
        subtopic: "Area of a Circle",
        difficulty: "Middle School",
        goal: "Find the area",
        formulas: ["A = πr²"],
        method: "Formula Method",
        given: [`Radius r = ${r}`],
        unknown: ["Area A"],
        units: "square units",
        steps: [
          { work: `A = πr²`, why: "This is the standard area formula for a circle." },
          { work: `A = π × ${r}²` },
          { work: `A = ${formatNumber(area, 4)}` }
        ],
        verification: ["Area units are square units because radius × radius is squared."],
        finalAnswer: `Area = ${formatNumber(area, 4)} square units`,
        alternative: "If diameter is given, first use r = d / 2, then apply A = πr².",
        mistake: "Do not use circumference formula 2πr when the question asks for area.",
        practice: `Practice: Find the area of a circle with radius ${r + 1}.`
      });
    }

    match = value.match(/area.*triangle.*(?:base|b)\s*(?:=|is|:)?\s*(\d+(?:\.\d+)?).*(?:height|h)\s*(?:=|is|:)?\s*(\d+(?:\.\d+)?)/);
    if (match) {
      const base = Number(match[1]);
      const height = Number(match[2]);
      const area = 0.5 * base * height;
      return makeResult({
        topic: "Geometry",
        subtopic: "Area of a Triangle",
        difficulty: "Middle School",
        goal: "Find the area",
        formulas: ["A = 1/2 × base × height"],
        method: "Formula Method",
        given: [`Base = ${base}`, `Height = ${height}`],
        unknown: ["Area"],
        units: "square units",
        steps: [
          { work: `A = 1/2 × ${base} × ${height}` },
          { work: `A = ${formatNumber(area)}` }
        ],
        verification: ["The answer is in square units because area measures surface covered."],
        finalAnswer: `Area = ${formatNumber(area)} square units`,
        mistake: "Do not forget the 1/2 in the triangle area formula.",
        practice: `Practice: Find the area of a triangle with base ${base + 2} and height ${height}.`
      });
    }

    return null;
  }

  function solveTrigonometry(text) {
    const value = normalize(text);
    const match = value.match(/\b(sin|cos|tan)\s*(\d+(?:\.\d+)?)\b/);
    if (!match) return null;
    const fn = match[1];
    const angle = Number(match[2]);
    const exact = {
      "sin:0": "0", "sin:30": "1/2", "sin:45": "√2/2", "sin:60": "√3/2", "sin:90": "1",
      "cos:0": "1", "cos:30": "√3/2", "cos:45": "√2/2", "cos:60": "1/2", "cos:90": "0",
      "tan:0": "0", "tan:30": "1/√3", "tan:45": "1", "tan:60": "√3"
    }[`${fn}:${angle}`];
    const radians = angle * Math.PI / 180;
    const decimal = fn === "sin" ? Math.sin(radians) : fn === "cos" ? Math.cos(radians) : Math.tan(radians);
    const answer = exact || formatNumber(decimal, 6);
    return makeResult({
      topic: "Trigonometry",
      subtopic: `${fn.toUpperCase()} of an Angle`,
      difficulty: "High School",
      goal: "Find the trigonometric value",
      formulas: [`Use standard angle table for ${fn} θ`],
      method: "Standard Angle Value",
      given: [`Angle = ${angle}°`, `Function = ${fn}`],
      unknown: [`${fn} ${angle}°`],
      steps: [
        { work: `${fn} ${angle}°`, why: "Recognize this as a standard trigonometric angle if possible." },
        { work: `${fn} ${angle}° = ${answer}` }
      ],
      verification: [`Decimal check gives approximately ${formatNumber(decimal, 6)}.`],
      finalAnswer: `${fn} ${angle}° = ${answer}`,
      mistake: "Make sure the calculator is in degree mode if using decimals.",
      practice: `Practice: Find ${fn} ${angle === 30 ? 60 : 30}°.`
    });
  }

  function solveStatistics(text) {
    const value = normalize(text);
    if (!/\b(mean|average|median|mode|variance|standard deviation|std)\b/.test(value)) return null;
    const nums = extractNumbers(value);
    if (nums.length < 2) return null;
    const sorted = [...nums].sort((a, b) => a - b);
    const sum = nums.reduce((total, item) => total + item, 0);
    const mean = sum / nums.length;
    const median = sorted.length % 2 ? sorted[Math.floor(sorted.length / 2)] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
    const counts = new Map();
    nums.forEach((num) => counts.set(num, (counts.get(num) || 0) + 1));
    const maxCount = Math.max(...counts.values());
    const modes = [...counts.entries()].filter(([, count]) => count === maxCount && count > 1).map(([num]) => num);
    const variance = nums.reduce((total, num) => total + (num - mean) ** 2, 0) / nums.length;
    const std = Math.sqrt(variance);
    const target = value.includes("median") ? "Median" : value.includes("mode") ? "Mode" : value.includes("variance") ? "Variance" : value.includes("standard deviation") || value.includes("std") ? "Standard Deviation" : "Mean";
    const answer = target === "Median" ? formatNumber(median)
      : target === "Mode" ? (modes.length ? modes.map(formatNumber).join(", ") : "No mode")
        : target === "Variance" ? formatNumber(variance)
          : target === "Standard Deviation" ? formatNumber(std)
            : formatNumber(mean);

    return makeResult({
      topic: "Statistics",
      subtopic: target,
      difficulty: "Middle School / High School",
      goal: `Find the ${target.toLowerCase()}`,
      formulas: ["Mean = sum / number of values", "Variance = Σ(x - mean)² / n", "Standard deviation = √variance"],
      method: "Data Summary Method",
      given: [`Data: ${nums.join(", ")}`],
      unknown: [target],
      steps: [
        { work: `Sorted data: ${sorted.join(", ")}` },
        { work: `Sum = ${formatNumber(sum)}, n = ${nums.length}` },
        { work: `Mean = ${formatNumber(sum)} / ${nums.length} = ${formatNumber(mean)}` },
        { work: `${target} = ${answer}` }
      ],
      verification: [`The computed ${target.toLowerCase()} matches the data list and formula.`],
      finalAnswer: `${target} = ${answer}`,
      mistake: "For variance, do not forget to square each deviation before averaging.",
      practice: `Practice: Find the mean of ${nums.map((num) => num + 1).join(", ")}.`
    });
  }

  function solveProbability(text) {
    const value = normalize(text);
    let match = value.match(/\b(\d+)\s*c\s*(\d+)\b|combination.*?(\d+).*?(\d+)/);
    if (match) {
      const n = Number(match[1] || match[3]);
      const r = Number(match[2] || match[4]);
      const answer = nCr(n, r);
      return makeResult({
        topic: "Probability",
        subtopic: "Combinations",
        difficulty: "High School",
        goal: "Count selections where order does not matter",
        formulas: ["nCr = n! / (r!(n-r)!)"],
        method: "Combination Formula",
        given: [`n = ${n}`, `r = ${r}`],
        unknown: ["Number of combinations"],
        steps: [
          { work: `${n}C${r} = ${n}! / (${r}!(${n}-${r})!)` },
          { work: `= ${formatNumber(answer)}` }
        ],
        verification: ["Since order does not matter, combination formula is appropriate."],
        finalAnswer: `${n}C${r} = ${formatNumber(answer)}`,
        mistake: "Use permutations only when order matters.",
        practice: `Practice: Find ${n + 1}C${r}.`
      });
    }

    match = value.match(/\b(\d+)\s*p\s*(\d+)\b|permutation.*?(\d+).*?(\d+)/);
    if (match) {
      const n = Number(match[1] || match[3]);
      const r = Number(match[2] || match[4]);
      const answer = nPr(n, r);
      return makeResult({
        topic: "Probability",
        subtopic: "Permutations",
        difficulty: "High School",
        goal: "Count arrangements where order matters",
        formulas: ["nPr = n! / (n-r)!"],
        method: "Permutation Formula",
        given: [`n = ${n}`, `r = ${r}`],
        unknown: ["Number of permutations"],
        steps: [
          { work: `${n}P${r} = ${n}! / (${n}-${r})!` },
          { work: `= ${formatNumber(answer)}` }
        ],
        verification: ["Order matters, so permutation formula is appropriate."],
        finalAnswer: `${n}P${r} = ${formatNumber(answer)}`,
        mistake: "Do not use combinations when arrangement/order matters.",
        practice: `Practice: Find ${n + 1}P${r}.`
      });
    }
    return null;
  }

  function solveFinancial(text) {
    const value = normalize(text);
    const nums = extractNumbers(value);
    if (!/\b(simple interest|compound interest|emi|loan|investment|principal|rate)\b/.test(value) || nums.length < 3) return null;
    const principal = nums[0];
    const rate = nums[1];
    const time = nums[2];
    if (value.includes("compound")) {
      const amount = principal * (1 + rate / 100) ** time;
      const interest = amount - principal;
      return makeResult({
        topic: "Financial Mathematics",
        subtopic: "Compound Interest",
        difficulty: "High School",
        goal: "Find compound amount and interest",
        formulas: ["A = P(1 + r/100)^t", "CI = A - P"],
        method: "Compound Interest Formula",
        given: [`P = ${principal}`, `r = ${rate}%`, `t = ${time}`],
        unknown: ["Amount and compound interest"],
        steps: [
          { work: `A = ${principal}(1 + ${rate}/100)^${time}` },
          { work: `A = ${formatNumber(amount)}` },
          { work: `CI = ${formatNumber(amount)} - ${principal} = ${formatNumber(interest)}` }
        ],
        verification: ["Amount is greater than principal when the rate is positive."],
        finalAnswer: `Amount = ${formatNumber(amount)}, Compound Interest = ${formatNumber(interest)}`,
        mistake: "Do not use simple interest formula when compounding is mentioned.",
        practice: `Practice: Find compound interest for P=${principal}, r=${rate + 1}%, t=${time}.`
      });
    }
    const interest = principal * rate * time / 100;
    return makeResult({
      topic: "Financial Mathematics",
      subtopic: "Simple Interest",
      difficulty: "Middle School",
      goal: "Find simple interest",
      formulas: ["SI = (P × R × T) / 100"],
      method: "Simple Interest Formula",
      given: [`P = ${principal}`, `R = ${rate}%`, `T = ${time}`],
      unknown: ["Simple interest"],
      steps: [
        { work: `SI = (${principal} × ${rate} × ${time}) / 100` },
        { work: `SI = ${formatNumber(interest)}` }
      ],
      verification: [`Amount would be P + SI = ${formatNumber(principal + interest)}.`],
      finalAnswer: `Simple Interest = ${formatNumber(interest)}`,
      mistake: "Keep rate as percent in the formula by dividing by 100.",
      practice: `Practice: Find simple interest for P=${principal}, R=${rate + 2}%, T=${time}.`
    });
  }

  function solveCalculus(text) {
    const value = normalize(text).replace(/\s+/g, "");
    let match = value.match(/(?:differentiate|derivative|d\/dx)(?:of)?([+-]?\d*)x\^(\d+)/);
    if (match) {
      const coefficient = match[1] === "" || match[1] === "+" ? 1 : match[1] === "-" ? -1 : Number(match[1]);
      const power = Number(match[2]);
      const newCoefficient = coefficient * power;
      const newPower = power - 1;
      return makeResult({
        topic: "Calculus",
        subtopic: "Derivative",
        difficulty: "University Foundation",
        goal: "Differentiate the function",
        formulas: ["d/dx(ax^n) = anx^(n-1)"],
        method: "Power Rule",
        given: [`Function: ${coefficient === 1 ? "" : coefficient}x^${power}`],
        unknown: ["Derivative"],
        steps: [
          { work: `d/dx(${coefficient === 1 ? "" : coefficient}x^${power}) = ${coefficient} × ${power} × x^${power - 1}`, why: "Apply the power rule." },
          { work: `= ${newCoefficient}x^${newPower}` }
        ],
        verification: ["Integrating the derivative gives the original power form plus a constant."],
        finalAnswer: `dy/dx = ${newCoefficient}x^${newPower}`,
        mistake: "Do not forget to reduce the power by 1.",
        practice: `Practice: Differentiate ${coefficient}x^${power + 1}.`
      });
    }

    match = value.match(/(?:integrate|integral)(?:of)?([+-]?\d*)x\^(\d+)/);
    if (match) {
      const coefficient = match[1] === "" || match[1] === "+" ? 1 : match[1] === "-" ? -1 : Number(match[1]);
      const power = Number(match[2]);
      const newPower = power + 1;
      const newCoefficient = coefficient / newPower;
      return makeResult({
        topic: "Calculus",
        subtopic: "Indefinite Integral",
        difficulty: "University Foundation",
        goal: "Integrate the function",
        formulas: ["∫ ax^n dx = ax^(n+1)/(n+1) + C, for n ≠ -1"],
        method: "Power Rule for Integration",
        given: [`Function: ${coefficient === 1 ? "" : coefficient}x^${power}`],
        unknown: ["Antiderivative"],
        steps: [
          { work: `∫ ${coefficient === 1 ? "" : coefficient}x^${power} dx = ${coefficient}x^${newPower}/${newPower} + C` },
          { work: `= ${exactFraction(newCoefficient)}x^${newPower} + C` }
        ],
        verification: [`Differentiate ${exactFraction(newCoefficient)}x^${newPower} + C to get ${coefficient}x^${power}.`],
        finalAnswer: `∫ f(x) dx = ${exactFraction(newCoefficient)}x^${newPower} + C`,
        mistake: "Do not forget the + C for indefinite integrals.",
        practice: `Practice: Integrate ${coefficient}x^${power + 1}.`
      });
    }
    return null;
  }

  function solveLinearAlgebra(text) {
    const value = normalize(text);
    if (!/\b(determinant|det)\b/.test(value)) return null;
    const nums = extractNumbers(value);
    if (nums.length < 4) return null;
    const [a, b, c, d] = nums;
    const det = a * d - b * c;
    return makeResult({
      topic: "Linear Algebra",
      subtopic: "2×2 Determinant",
      difficulty: "University Foundation",
      goal: "Find the determinant",
      formulas: ["For [[a,b],[c,d]], determinant = ad - bc"],
      method: "Determinant Formula",
      given: [`Matrix entries: ${a}, ${b}, ${c}, ${d}`],
      unknown: ["Determinant"],
      steps: [
        { work: `det = (${a} × ${d}) - (${b} × ${c})` },
        { work: `det = ${formatNumber(det)}` }
      ],
      verification: ["The determinant uses diagonal product minus the other diagonal product."],
      finalAnswer: `determinant = ${formatNumber(det)}`,
      mistake: "Do not add the diagonal products; subtract the second from the first.",
      practice: `Practice: Find det [[${a + 1}, ${b}], [${c}, ${d}]].`
    });
  }

  function solveFactors(text) {
    const value = normalize(text);
    const nums = extractNumbers(value).filter(Number.isInteger);
    if (!nums.length) return null;
    if (/\b(lcm|least common multiple)\b/.test(value) && nums.length >= 2) {
      const answer = nums.reduce((acc, item) => lcm(acc, item));
      return makeResult({
        topic: "Pre-Algebra",
        subtopic: "LCM",
        difficulty: "Middle School",
        goal: "Find the least common multiple",
        formulas: ["LCM(a,b) = |ab| / HCF(a,b)"],
        method: "LCM using HCF",
        given: [`Numbers: ${nums.join(", ")}`],
        unknown: ["LCM"],
        steps: [{ work: `LCM of ${nums.join(", ")} = ${answer}` }],
        verification: [`${answer} is divisible by all given numbers.`],
        finalAnswer: `LCM = ${answer}`,
        mistake: "LCM is a common multiple, not a common factor.",
        practice: `Practice: Find LCM of ${nums[0]} and ${nums[1] + 1}.`
      });
    }
    if (/\b(hcf|gcd|highest common factor)\b/.test(value) && nums.length >= 2) {
      const answer = nums.reduce((acc, item) => gcd(acc, item));
      return makeResult({
        topic: "Pre-Algebra",
        subtopic: "HCF / GCD",
        difficulty: "Middle School",
        goal: "Find the highest common factor",
        formulas: ["HCF is the greatest number that divides all given numbers."],
        method: "Common Factor Method",
        given: [`Numbers: ${nums.join(", ")}`],
        unknown: ["HCF"],
        steps: [{ work: `HCF of ${nums.join(", ")} = ${answer}` }],
        verification: [`${answer} divides all given numbers.`],
        finalAnswer: `HCF = ${answer}`,
        mistake: "Do not confuse HCF with LCM.",
        practice: `Practice: Find HCF of ${nums[0]} and ${nums[1] + 2}.`
      });
    }
    if (/\bprime\b/.test(value)) {
      const n = nums[0];
      if (n < 2) {
        return makeResult({
          topic: "Pre-Algebra",
          subtopic: "Prime Numbers",
          goal: "Check if a number is prime",
          formulas: ["A prime number has exactly two factors: 1 and itself."],
          given: [`Number: ${n}`],
          unknown: ["Prime or not"],
          steps: [{ work: `${n} is not prime because prime numbers must be greater than 1.` }],
          verification: ["Definition check confirms it is not prime."],
          finalAnswer: `${n} is not prime.`,
          practice: "Practice: Check whether 29 is prime."
        });
      }
      const divisor = Array.from({ length: Math.floor(Math.sqrt(n)) - 1 }, (_, index) => index + 2).find((candidate) => n % candidate === 0);
      return makeResult({
        topic: "Pre-Algebra",
        subtopic: "Prime Numbers",
        goal: "Check if a number is prime",
        formulas: ["Test divisibility up to √n."],
        method: "Prime Test",
        given: [`Number: ${n}`],
        unknown: ["Prime or composite"],
        steps: [
          { work: `√${n} ≈ ${formatNumber(Math.sqrt(n), 3)}`, why: "Only factors up to the square root need checking." },
          { work: divisor ? `${n} is divisible by ${divisor}.` : `No divisor from 2 to ${Math.floor(Math.sqrt(n))} divides ${n}.` }
        ],
        verification: [divisor ? `${divisor} × ${n / divisor} = ${n}.` : "No smaller factor exists, so it has only 1 and itself."],
        finalAnswer: divisor ? `${n} is composite.` : `${n} is prime.`,
        mistake: "Do not stop after checking only 2 unless the number is even.",
        practice: `Practice: Check whether ${n + 2} is prime.`
      });
    }
    return null;
  }

  function fallbackMath(text) {
    const value = normalize(text);
    if (!/[0-9xπ+\-*/^=()]|\b(area|mean|median|probability|interest|derivative|integral|matrix|determinant|lcm|hcf|prime)\b/.test(value)) {
      return null;
    }
    return makeResult({
      topic: "Mathematics",
      subtopic: "Needs Clarification",
      difficulty: "Unknown",
      goal: "Understand the exact mathematical task",
      formulas: [],
      method: "Clarifying Question",
      given: [text],
      unknown: ["Exact operation or target value"],
      steps: [
        { work: "Please send the exact expression, equation, diagram values, or formula target.", why: "The current question looks mathematical, but it is not specific enough to solve safely." }
      ],
      verification: ["I will verify once the exact problem is available."],
      finalAnswer: "Please send the exact math problem.",
      alternative: "You can type it like `solve 2x + 4 = 10`, `area of circle radius 7`, or `mean of 2, 4, 6`.",
      mistake: "A vague math question can lead to the wrong formula.",
      practice: "",
      confidence: "low"
    });
  }

  function wordProblemResult({
    topic,
    subtopic,
    difficulty = "Word Problem",
    goal,
    given,
    unknown,
    conditions = [],
    formulas = [],
    steps = [],
    verification = [],
    finalAnswer,
    alternative = [],
    practice = "",
    confidence = "high",
    story = "This is a real-life math situation, so we first translate the story into a clean equation.",
    translation = [],
    model = []
  }) {
    return makeResult({
      topic: topic === "Word Problems" ? "Math Word Problem" : topic,
      subtopic,
      difficulty,
      goal,
      given,
      unknown,
      conditions,
      formulas,
      steps,
      verification,
      finalAnswer,
      alternative,
      practice,
      confidence,
      isWordProblem: true,
      story,
      translation,
      model
    });
  }

  function hasWordProblemCue(n) {
    return /\b(train|car|bus|bike|travels?|journey|speed|distance|time|hours?|minutes?|seconds?|days?|age|older|younger|together|work|work rate|pipe|tank|profit|loss|cost price|selling price|bought|sold|discount|marked price|mixture|solution|ratio|boys|girls|students|area|perimeter|length|width|breadth|rectangular|rectangle|garden|field|room|plot|circle|triangle|probability|chance|bag|balls|cards|dice|scores?|marks?|data|interest|principal|amount|rate|number|real[-\s]?life|twice|thrice|double|triple|times as many|shared equally|sum of|difference between)\b/.test(n);
  }

  function numberBeforeUnit(n, unitPattern) {
    const match = n.match(new RegExp("(\\d+(?:\\.\\d+)?)\\s*(?:" + unitPattern + ")\\b"));
    return match ? Number(match[1]) : null;
  }

  function numberAfterLabel(n, labelPattern) {
    const match = n.match(new RegExp("(?:" + labelPattern + ")\\D{0,20}(\\d+(?:\\.\\d+)?)"));
    return match ? Number(match[1]) : null;
  }

  function findTotal(n) {
    const totalMatch = n.match(/\b(?:total|sum|altogether|in all|together)\D{0,30}(\d+(?:\.\d+)?)/);
    if (totalMatch) return Number(totalMatch[1]);
    const reverseMatch = n.match(/(\d+(?:\.\d+)?)\D{0,20}\b(?:total|sum|altogether|in all)\b/);
    return reverseMatch ? Number(reverseMatch[1]) : null;
  }

  const wordNumbers = {
    one: 1,
    two: 2,
    twice: 2,
    double: 2,
    three: 3,
    thrice: 3,
    triple: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10
  };

  function parseWordNumber(value) {
    const clean = String(value || "").trim().toLowerCase();
    if (!clean) return null;
    if (/^\d+(?:\.\d+)?$/.test(clean)) return Number(clean);
    return wordNumbers[clean] || null;
  }

  function titleName(name) {
    const clean = String(name || "").trim();
    return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : clean;
  }

  function solveMultiplicativeComparisonWordProblem(text) {
    const n = normalize(text);
    if (!/\b(as many|together|total|altogether|in all)\b/.test(n)) return null;

    const comparison =
      n.match(/\b([a-z]+)\s+(?:has|have|owns?|gets?)\s+(twice|thrice|double|triple)\s+as\s+many(?:\s+[a-z]+){0,5}?\s+as\s+([a-z]+)\b/) ||
      n.match(/\b([a-z]+)\s+(?:has|have|owns?|gets?)\s+(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\s+times\s+as\s+many(?:\s+[a-z]+){0,5}?\s+as\s+([a-z]+)\b/);

    const total = findTotal(n);
    if (!comparison || total === null) return null;

    const firstName = titleName(comparison[1]);
    const multiplier = parseWordNumber(comparison[2]);
    const secondName = titleName(comparison[3]);
    if (!multiplier || multiplier <= 0) return null;

    const itemMatch = n.match(/as many\s+([a-z]+)\s+as/) || n.match(/\b(\d+(?:\.\d+)?)\s+([a-z]+)\s+(?:in all|altogether|total)\b/);
    const item = itemMatch ? itemMatch[1] : "items";
    const secondValue = total / (multiplier + 1);
    const firstValue = multiplier * secondValue;
    const isClean = Number.isInteger(secondValue) && Number.isInteger(firstValue);

    return wordProblemResult({
      topic: "Math Word Problem",
      subtopic: "Algebra Word Problem",
      difficulty: "School",
      goal: `Find how many ${item} each person has.`,
      given: [
        `${firstName} has ${formatNumber(multiplier)} times as many ${item} as ${secondName}.`,
        `Together they have ${formatNumber(total)} ${item}.`
      ],
      unknown: [`${secondName}'s ${item}`, `${firstName}'s ${item}`],
      conditions: ["One person's amount is a multiple of the other's amount.", "The two amounts add to the total."],
      formulas: ["Let the smaller/unknown amount be x.", "Total = x + multiplier × x"],
      story: "This is an algebra word problem because the story compares two unknown amounts and gives their total.",
      translation: [
        `Let ${secondName}'s ${item} be x.`,
        `${firstName}'s ${item} are ${formatNumber(multiplier)}x.`,
        `Together means add both amounts.`
      ],
      model: [`x + ${formatNumber(multiplier)}x = ${formatNumber(total)}`],
      steps: [
        `x + ${formatNumber(multiplier)}x = ${formatNumber(total)}`,
        `${formatNumber(multiplier + 1)}x = ${formatNumber(total)}`,
        `x = ${formatNumber(total)} ÷ ${formatNumber(multiplier + 1)} = ${formatNumber(secondValue)}`,
        `${firstName} = ${formatNumber(multiplier)} × ${formatNumber(secondValue)} = ${formatNumber(firstValue)}`
      ],
      verification: [
        `${formatNumber(secondValue)} + ${formatNumber(firstValue)} = ${formatNumber(total)}.`,
        `${formatNumber(firstValue)} is ${formatNumber(multiplier)} times ${formatNumber(secondValue)}.`
      ],
      finalAnswer: `${secondName} = ${formatNumber(secondValue)} ${item}; ${firstName} = ${formatNumber(firstValue)} ${item}.`,
      alternative: ["You can also solve it using ratio parts: 1 part and multiplier parts."],
      practice: "Maya has twice as many books as Ravi. Together they have 45 books. How many books does each have?",
      confidence: isClean ? 0.97 : 0.86
    });
  }

  function solveSpeedWordProblem(text) {
    const n = normalize(text);
    if (!/\b(speed|distance|time|travels?|journey|km\/h|kmph|m\/s)\b/.test(n)) return null;

    const distance = numberBeforeUnit(n, "km|kilometers?|kilometres?|m|meters?|metres?|miles?");
    const time = numberBeforeUnit(n, "hours?|hrs?|hr|h|minutes?|mins?|min|seconds?|secs?|sec|s");
    const speed = numberBeforeUnit(n, "km\\/h|kmph|m\\/s|mph");
    const asksSpeed = /\b(speed|how fast|velocity)\b/.test(n);
    const asksDistance = /\b(distance|how far)\b/.test(n) && speed !== null && time !== null;
    const asksTime = /\b(time|how long)\b/.test(n) && distance !== null && speed !== null;

    if (asksSpeed && distance !== null && time !== null) {
      const timeUnit = (n.match(/\d+(?:\.\d+)?\s*(hours?|hrs?|hr|h|minutes?|mins?|min|seconds?|secs?|sec|s)\b/) || [])[1] || "hours";
      let timeInHours = time;
      let unit = "km/h";
      if (/min/.test(timeUnit)) timeInHours = time / 60;
      if (/sec|^s$/.test(timeUnit)) {
        timeInHours = time;
        unit = "m/s";
      }
      const value = distance / timeInHours;
      return wordProblemResult({
        topic: "Word Problems",
        subtopic: "Speed, Distance, and Time",
        goal: "Find the speed from distance and time.",
        given: [`Distance = ${formatNumber(distance)}`, `Time = ${formatNumber(time)} ${timeUnit}`],
        unknown: ["Speed"],
        conditions: ["Speed is distance covered per unit time."],
        formulas: ["Speed = Distance ÷ Time"],
        story: "The story gives how far something travelled and how long it took. That means we need speed.",
        translation: [`${formatNumber(distance)} distance units travelled in ${formatNumber(time)} ${timeUnit}.`, "The question asks how fast it travelled."],
        model: [`Speed = ${formatNumber(distance)} ÷ ${formatNumber(timeInHours)}`],
        steps: [
          `Speed = Distance ÷ Time`,
          `Speed = ${formatNumber(distance)} ÷ ${formatNumber(timeInHours)}`,
          `Speed = ${formatNumber(value)} ${unit}`
        ],
        verification: [`${formatNumber(value)} × ${formatNumber(timeInHours)} = ${formatNumber(distance)}, so the distance matches the story.`],
        finalAnswer: `The speed is ${formatNumber(value)} ${unit}.`,
        practice: "A bus travels 180 km in 3 hours. Find its speed."
      });
    }

    if (asksDistance) {
      const value = speed * time;
      return wordProblemResult({
        topic: "Word Problems",
        subtopic: "Speed, Distance, and Time",
        goal: "Find the distance from speed and time.",
        given: [`Speed = ${formatNumber(speed)}`, `Time = ${formatNumber(time)}`],
        unknown: ["Distance"],
        conditions: ["Distance is how far the object travels."],
        formulas: ["Distance = Speed × Time"],
        story: "The story gives speed and time, so the missing value is distance.",
        translation: ["Speed tells us distance covered in one unit of time.", "Multiplying by total time gives the full distance."],
        model: [`Distance = ${formatNumber(speed)} × ${formatNumber(time)}`],
        steps: [`Distance = Speed × Time`, `Distance = ${formatNumber(speed)} × ${formatNumber(time)}`, `Distance = ${formatNumber(value)}`],
        verification: [`${formatNumber(value)} ÷ ${formatNumber(time)} = ${formatNumber(speed)}, so the speed matches.`],
        finalAnswer: `The distance travelled is ${formatNumber(value)}.`,
        practice: "A car moves at 50 km/h for 4 hours. Find the distance."
      });
    }

    if (asksTime) {
      const value = distance / speed;
      return wordProblemResult({
        topic: "Word Problems",
        subtopic: "Speed, Distance, and Time",
        goal: "Find the time from distance and speed.",
        given: [`Distance = ${formatNumber(distance)}`, `Speed = ${formatNumber(speed)}`],
        unknown: ["Time"],
        conditions: ["Time tells how long the journey takes."],
        formulas: ["Time = Distance ÷ Speed"],
        story: "The story gives distance and speed, so the missing value is time.",
        translation: ["Divide the full distance by the distance covered per unit time."],
        model: [`Time = ${formatNumber(distance)} ÷ ${formatNumber(speed)}`],
        steps: [`Time = Distance ÷ Speed`, `Time = ${formatNumber(distance)} ÷ ${formatNumber(speed)}`, `Time = ${formatNumber(value)}`],
        verification: [`${formatNumber(speed)} × ${formatNumber(value)} = ${formatNumber(distance)}, so the distance checks out.`],
        finalAnswer: `The time taken is ${formatNumber(value)} hours.`,
        practice: "A train covers 240 km at 80 km/h. Find the time."
      });
    }

    return null;
  }

  function solveAgeWordProblem(text) {
    const n = normalize(text);
    if (!/\b(age|older|younger|years old|years older|years younger)\b/.test(n)) return null;

    const relation = n.match(/\b([a-z]+)\s+is\s+(\d+(?:\.\d+)?)\s+years?\s+(older|younger)\s+than\s+([a-z]+)\b/);
    const total = findTotal(n);
    if (relation && total !== null) {
      const first = relation[1];
      const diff = Number(relation[2]);
      const direction = relation[3];
      const second = relation[4];
      const younger = (total - diff) / 2;
      const older = younger + diff;
      const firstAge = direction === "older" ? older : younger;
      const secondAge = direction === "older" ? younger : older;

      return wordProblemResult({
        topic: "Word Problems",
        subtopic: "Age Problems",
        goal: "Find both ages using the age difference and total age.",
        given: [`Age difference = ${formatNumber(diff)} years`, `Total age = ${formatNumber(total)} years`],
        unknown: [`${first}'s age`, `${second}'s age`],
        conditions: [`${first} is ${formatNumber(diff)} years ${direction} than ${second}.`],
        formulas: ["Younger age = (Total age - Difference) ÷ 2", "Older age = Younger age + Difference"],
        story: "The story compares two ages and gives their total, so one age can be written in terms of the other.",
        translation: [`Let the younger age be x.`, `The older age is x + ${formatNumber(diff)}.`, `Their total is ${formatNumber(total)}.`],
        model: [`x + (x + ${formatNumber(diff)}) = ${formatNumber(total)}`],
        steps: [
          `2x + ${formatNumber(diff)} = ${formatNumber(total)}`,
          `2x = ${formatNumber(total - diff)}`,
          `x = ${formatNumber(younger)}`,
          `Older age = ${formatNumber(younger)} + ${formatNumber(diff)} = ${formatNumber(older)}`
        ],
        verification: [`${formatNumber(firstAge)} + ${formatNumber(secondAge)} = ${formatNumber(total)}, and the difference is ${formatNumber(diff)}.`],
        finalAnswer: `${first} is ${formatNumber(firstAge)} years old and ${second} is ${formatNumber(secondAge)} years old.`,
        practice: "A is 4 years older than B. Their ages add to 30. Find both ages."
      });
    }

    const times = n.match(/\b([a-z]+)\s+is\s+(\d+(?:\.\d+)?)\s+times\s+([a-z]+)\b/);
    if (times && total !== null) {
      const first = times[1];
      const multiplier = Number(times[2]);
      const second = times[3];
      const base = total / (multiplier + 1);
      const firstAge = multiplier * base;
      return wordProblemResult({
        topic: "Word Problems",
        subtopic: "Age Problems",
        goal: "Find ages using a ratio-style age comparison.",
        given: [`${first} = ${formatNumber(multiplier)} × ${second}`, `Total age = ${formatNumber(total)}`],
        unknown: [`${first}'s age`, `${second}'s age`],
        conditions: ["Both ages are parts of the same total."],
        formulas: ["Base age = Total ÷ Sum of ratio parts"],
        story: "The story says one person is a multiple of another person's age, so we treat the ages like ratio parts.",
        translation: [`Let ${second}'s age be x.`, `${first}'s age is ${formatNumber(multiplier)}x.`],
        model: [`x + ${formatNumber(multiplier)}x = ${formatNumber(total)}`],
        steps: [
          `${formatNumber(multiplier + 1)}x = ${formatNumber(total)}`,
          `x = ${formatNumber(total)} ÷ ${formatNumber(multiplier + 1)} = ${formatNumber(base)}`,
          `${first}'s age = ${formatNumber(multiplier)} × ${formatNumber(base)} = ${formatNumber(firstAge)}`
        ],
        verification: [`${formatNumber(firstAge)} + ${formatNumber(base)} = ${formatNumber(total)}.`],
        finalAnswer: `${first} is ${formatNumber(firstAge)} years old and ${second} is ${formatNumber(base)} years old.`,
        practice: "A father is 3 times his son's age. Their total age is 48. Find both ages."
      });
    }

    return null;
  }

  function solveWorkWordProblem(text) {
    const n = normalize(text);
    if (!/\b(work|complete|finish|pipe|tank|together)\b/.test(n)) return null;
    const times = [...n.matchAll(/(\d+(?:\.\d+)?)\s*(days?|hours?|hrs?)\b/g)].map((match) => ({
      value: Number(match[1]),
      unit: match[2]
    }));
    if (times.length < 2 || !/\btogether\b/.test(n)) return null;
    const a = times[0].value;
    const b = times[1].value;
    const unit = times[0].unit;
    const combinedRate = 1 / a + 1 / b;
    const togetherTime = 1 / combinedRate;

    return wordProblemResult({
      topic: "Word Problems",
      subtopic: "Work Problems",
      goal: "Find how long two workers or pipes take together.",
      given: [`First time = ${formatNumber(a)} ${unit}`, `Second time = ${formatNumber(b)} ${unit}`],
      unknown: ["Time taken together"],
      conditions: ["Each person or pipe completes a fraction of the work per unit time."],
      formulas: ["Combined rate = 1/a + 1/b", "Time together = 1 ÷ Combined rate"],
      story: "The story gives individual work times and asks for the combined time.",
      translation: [`First rate = 1/${formatNumber(a)} work per ${unit}`, `Second rate = 1/${formatNumber(b)} work per ${unit}`],
      model: [`Time = 1 ÷ (1/${formatNumber(a)} + 1/${formatNumber(b)})`],
      steps: [
        `Combined rate = 1/${formatNumber(a)} + 1/${formatNumber(b)}`,
        `Combined rate = ${formatNumber(combinedRate)}`,
        `Time = 1 ÷ ${formatNumber(combinedRate)} = ${formatNumber(togetherTime)} ${unit}`
      ],
      verification: [`In ${formatNumber(togetherTime)} ${unit}, the completed work is about ${formatNumber(togetherTime / a + togetherTime / b)} whole job.`],
      finalAnswer: `Working together, they finish the work in ${formatNumber(togetherTime)} ${unit}.`,
      practice: "A can finish a job in 6 days and B can finish it in 12 days. How long together?"
    });
  }

  function solveDiscountWordProblem(text) {
    const n = normalize(text);
    if (!/\b(discount|sale price|marked price)\b/.test(n)) return null;
    const discountMatch = n.match(/(\d+(?:\.\d+)?)\s*(?:%|percent|percentage)/);
    const discount = discountMatch ? Number(discountMatch[1]) : null;
    const price = numberAfterLabel(n, "marked price|price|costs?|cost|mrp") ?? extractNumbers(n).find((value) => value !== discount);
    if (price == null || discount == null) return null;
    const discountAmount = price * discount / 100;
    const salePrice = price - discountAmount;

    return wordProblemResult({
      topic: "Word Problems",
      subtopic: "Discount Problems",
      goal: "Find the sale price after discount.",
      given: [`Original price = ${formatNumber(price)}`, `Discount = ${formatNumber(discount)}%`],
      unknown: ["Sale price"],
      conditions: ["Discount reduces the original price."],
      formulas: ["Discount amount = Price × Discount% ÷ 100", "Sale price = Price - Discount amount"],
      story: "The story gives a price and a discount percentage, so we first find how much money is removed.",
      translation: [`${formatNumber(discount)}% discount means ${formatNumber(discount)} out of every 100 is subtracted.`],
      model: [`Sale price = ${formatNumber(price)} - (${formatNumber(price)} × ${formatNumber(discount)} ÷ 100)`],
      steps: [
        `Discount amount = ${formatNumber(price)} × ${formatNumber(discount)} ÷ 100 = ${formatNumber(discountAmount)}`,
        `Sale price = ${formatNumber(price)} - ${formatNumber(discountAmount)}`,
        `Sale price = ${formatNumber(salePrice)}`
      ],
      verification: [`${formatNumber(salePrice)} is less than ${formatNumber(price)}, so the answer is reasonable for a discount.`],
      finalAnswer: `The sale price is ${formatNumber(salePrice)}.`,
      practice: "A bag costs 1200 and has a 25% discount. Find the sale price."
    });
  }

  function solveProfitLossWordProblem(text) {
    const n = normalize(text);
    if (!/\b(profit|loss|cost price|selling price|bought|sold)\b/.test(n)) return null;
    let cp = numberAfterLabel(n, "cost price|cp|bought for|cost");
    let sp = numberAfterLabel(n, "selling price|sp|sold for|sold");
    const boughtSold = n.match(/bought\D{0,20}(\d+(?:\.\d+)?).*sold\D{0,20}(\d+(?:\.\d+)?)/);
    if (boughtSold) {
      cp = Number(boughtSold[1]);
      sp = Number(boughtSold[2]);
    }
    if (cp == null || sp == null) return null;
    const change = sp - cp;
    const percent = Math.abs(change) / cp * 100;
    const type = change >= 0 ? "profit" : "loss";

    return wordProblemResult({
      topic: "Word Problems",
      subtopic: "Profit and Loss",
      goal: `Find the ${type} and ${type} percentage.`,
      given: [`Cost price = ${formatNumber(cp)}`, `Selling price = ${formatNumber(sp)}`],
      unknown: [`${type} amount`, `${type} percentage`],
      conditions: ["Profit happens when selling price is greater than cost price. Loss happens when selling price is less."],
      formulas: [`${type} = |Selling price - Cost price|`, `${type}% = ${type} ÷ Cost price × 100`],
      story: "The story gives buying and selling prices, so we compare them.",
      translation: [`Cost price is what was paid.`, `Selling price is what was received.`],
      model: [`${type} = |${formatNumber(sp)} - ${formatNumber(cp)}|`],
      steps: [
        `${type} = ${formatNumber(Math.abs(change))}`,
        `${type}% = ${formatNumber(Math.abs(change))} ÷ ${formatNumber(cp)} × 100`,
        `${type}% = ${formatNumber(percent)}%`
      ],
      verification: [`Since ${formatNumber(sp)} ${change >= 0 ? ">" : "<"} ${formatNumber(cp)}, it is a ${type}.`],
      finalAnswer: `There is a ${type} of ${formatNumber(Math.abs(change))}, which is ${formatNumber(percent)}%.`,
      practice: "An item is bought for 500 and sold for 650. Find the profit percentage."
    });
  }

  function solveInterestWordProblem(text) {
    const n = normalize(text);
    if (!/\b(simple interest|compound interest|principal|interest|rate)\b/.test(n)) return null;
    const rateMatch = n.match(/(\d+(?:\.\d+)?)\s*(?:%|percent|percentage)/);
    const principalLabel = n.match(/\b(?:principal|p)\b\D{0,20}(\d+(?:\.\d+)?)/);
    const rateLabel = n.match(/\b(?:rate|r)\b\D{0,20}(\d+(?:\.\d+)?)/);
    const principal = principalLabel ? Number(principalLabel[1]) : extractNumbers(n)[0];
    const rate = rateMatch ? Number(rateMatch[1]) : rateLabel ? Number(rateLabel[1]) : null;
    const time = numberBeforeUnit(n, "years?|yrs?|months?");
    if (principal == null || rate == null || time == null) return null;
    const isCompound = /\bcompound interest\b/.test(n);
    if (isCompound) {
      const amount = principal * Math.pow(1 + rate / 100, time);
      const interest = amount - principal;
      return wordProblemResult({
        topic: "Word Problems",
        subtopic: "Compound Interest",
        goal: "Find compound interest from principal, rate, and time.",
        given: [`Principal = ${formatNumber(principal)}`, `Rate = ${formatNumber(rate)}%`, `Time = ${formatNumber(time)} years`],
        unknown: ["Compound interest", "Amount"],
        conditions: ["Interest is added to the principal each year."],
        formulas: ["Amount = P(1 + R/100)^T", "Compound interest = Amount - Principal"],
        story: "The story uses compound interest, so interest grows on both the principal and earlier interest.",
        translation: ["The amount grows by the same percentage each year."],
        model: [`Amount = ${formatNumber(principal)}(1 + ${formatNumber(rate)}/100)^${formatNumber(time)}`],
        steps: [
          `Amount = ${formatNumber(principal)} × ${formatNumber(1 + rate / 100)}^${formatNumber(time)}`,
          `Amount = ${formatNumber(amount)}`,
          `Compound interest = ${formatNumber(amount)} - ${formatNumber(principal)} = ${formatNumber(interest)}`
        ],
        verification: [`The amount ${formatNumber(amount)} is greater than the principal ${formatNumber(principal)}, so it is reasonable.`],
        finalAnswer: `The compound interest is ${formatNumber(interest)} and the amount is ${formatNumber(amount)}.`,
        practice: "Find compound interest on 2000 at 5% for 2 years."
      });
    }
    const interest = principal * rate * time / 100;
    const amount = principal + interest;
    return wordProblemResult({
      topic: "Word Problems",
      subtopic: "Simple Interest",
      goal: "Find simple interest from principal, rate, and time.",
      given: [`Principal = ${formatNumber(principal)}`, `Rate = ${formatNumber(rate)}%`, `Time = ${formatNumber(time)} years`],
      unknown: ["Simple interest", "Amount"],
      conditions: ["Simple interest is calculated only on the original principal."],
      formulas: ["Simple interest = P × R × T ÷ 100", "Amount = Principal + Interest"],
      story: "The story gives the three values needed for simple interest.",
      translation: ["Principal is the starting money.", "Rate is the yearly percentage.", "Time is the number of years."],
      model: [`SI = ${formatNumber(principal)} × ${formatNumber(rate)} × ${formatNumber(time)} ÷ 100`],
      steps: [
        `SI = ${formatNumber(principal)} × ${formatNumber(rate)} × ${formatNumber(time)} ÷ 100`,
        `SI = ${formatNumber(interest)}`,
        `Amount = ${formatNumber(principal)} + ${formatNumber(interest)} = ${formatNumber(amount)}`
      ],
      verification: [`The interest ${formatNumber(interest)} is positive and proportional to the given time and rate.`],
      finalAnswer: `The simple interest is ${formatNumber(interest)} and the final amount is ${formatNumber(amount)}.`,
      practice: "Find the simple interest on 5000 at 6% for 3 years."
    });
  }

  function solveRatioWordProblem(text) {
    const n = normalize(text);
    if (!/\bratio\b/.test(n)) return null;
    const ratio = n.match(/(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/);
    const total = findTotal(n);
    if (!ratio || total === null) return null;
    const a = Number(ratio[1]);
    const b = Number(ratio[2]);
    const labels = n.match(/ratio of ([a-z]+) to ([a-z]+)/);
    const firstLabel = labels ? labels[1] : "first part";
    const secondLabel = labels ? labels[2] : "second part";
    const partValue = total / (a + b);
    const first = a * partValue;
    const second = b * partValue;

    return wordProblemResult({
      topic: "Word Problems",
      subtopic: "Ratio Problems",
      goal: "Split a total using a given ratio.",
      given: [`Ratio = ${formatNumber(a)}:${formatNumber(b)}`, `Total = ${formatNumber(total)}`],
      unknown: [firstLabel, secondLabel],
      conditions: ["The total is divided into equal ratio parts."],
      formulas: ["One part value = Total ÷ Sum of ratio parts"],
      story: "The story gives a ratio and a total, so we find the value of one ratio part first.",
      translation: [`${firstLabel} has ${formatNumber(a)} parts.`, `${secondLabel} has ${formatNumber(b)} parts.`],
      model: [`One part = ${formatNumber(total)} ÷ (${formatNumber(a)} + ${formatNumber(b)})`],
      steps: [
        `Total parts = ${formatNumber(a)} + ${formatNumber(b)} = ${formatNumber(a + b)}`,
        `One part = ${formatNumber(total)} ÷ ${formatNumber(a + b)} = ${formatNumber(partValue)}`,
        `${firstLabel} = ${formatNumber(a)} × ${formatNumber(partValue)} = ${formatNumber(first)}`,
        `${secondLabel} = ${formatNumber(b)} × ${formatNumber(partValue)} = ${formatNumber(second)}`
      ],
      verification: [`${formatNumber(first)} + ${formatNumber(second)} = ${formatNumber(total)}.`],
      finalAnswer: `${firstLabel} = ${formatNumber(first)} and ${secondLabel} = ${formatNumber(second)}.`,
      practice: "The ratio of red balls to blue balls is 3:4. There are 56 balls. Find each amount."
    });
  }

  function solveMixtureWordProblem(text) {
    const n = normalize(text);
    if (!/\b(mixture|mix|solution|concentration)\b/.test(n)) return null;
    const matches = [...n.matchAll(/(\d+(?:\.\d+)?)\s*(?:litres?|liters?|l|ml|kg|g)?\s*(?:of)?\s*(\d+(?:\.\d+)?)\s*%/g)];
    if (matches.length < 2) return null;
    const amountA = Number(matches[0][1]);
    const percentA = Number(matches[0][2]);
    const amountB = Number(matches[1][1]);
    const percentB = Number(matches[1][2]);
    const pureA = amountA * percentA / 100;
    const pureB = amountB * percentB / 100;
    const totalAmount = amountA + amountB;
    const finalPercent = (pureA + pureB) / totalAmount * 100;

    return wordProblemResult({
      topic: "Word Problems",
      subtopic: "Mixture Problems",
      goal: "Find the final concentration after mixing two solutions.",
      given: [`First solution = ${formatNumber(amountA)} at ${formatNumber(percentA)}%`, `Second solution = ${formatNumber(amountB)} at ${formatNumber(percentB)}%`],
      unknown: ["Final concentration"],
      conditions: ["Pure substance amounts add together, and total mixture amounts add together."],
      formulas: ["Pure amount = Quantity × Concentration%", "Final concentration = Total pure amount ÷ Total quantity × 100"],
      story: "The story mixes two solutions, so we track the pure substance in each one.",
      translation: [`First pure amount = ${formatNumber(amountA)} × ${formatNumber(percentA)}%`, `Second pure amount = ${formatNumber(amountB)} × ${formatNumber(percentB)}%`],
      model: [`Final % = (${formatNumber(pureA)} + ${formatNumber(pureB)}) ÷ (${formatNumber(amountA)} + ${formatNumber(amountB)}) × 100`],
      steps: [
        `Pure amount 1 = ${formatNumber(amountA)} × ${formatNumber(percentA)} ÷ 100 = ${formatNumber(pureA)}`,
        `Pure amount 2 = ${formatNumber(amountB)} × ${formatNumber(percentB)} ÷ 100 = ${formatNumber(pureB)}`,
        `Total pure amount = ${formatNumber(pureA + pureB)}`,
        `Total mixture = ${formatNumber(totalAmount)}`,
        `Final concentration = ${formatNumber(finalPercent)}%`
      ],
      verification: [`${formatNumber(finalPercent)}% lies between ${formatNumber(Math.min(percentA, percentB))}% and ${formatNumber(Math.max(percentA, percentB))}%, so it is reasonable.`],
      finalAnswer: `The final concentration is ${formatNumber(finalPercent)}%.`,
      practice: "Mix 2 L of 10% solution with 3 L of 20% solution. Find the final concentration."
    });
  }

  function solveGeometryWordProblem(text) {
    const n = normalize(text);
    if (!/\b(rectangular|rectangle|garden|field|room|plot|circle|triangle|area|perimeter|radius|length|width|breadth|base|height)\b/.test(n)) return null;

    const rectangleArea =
      n.match(/\barea\b\D{0,80}(\d+(?:\.\d+)?)/) ||
      n.match(/(\d+(?:\.\d+)?)\s*(?:square\s+(?:meters?|metres?|units?|feet|centimeters?|centimetres?|yards?)|sq\.?\s*\w*)/);
    const lengthLonger =
      n.match(/\blength\b.{0,80}?(\d+(?:\.\d+)?)\s*(?:meters?|metres?|units?|cm|centimeters?|centimetres?|feet|yards?)?\s+(?:longer|more)\s+than\s+(?:its\s+)?(?:width|breadth)\b/) ||
      n.match(/\blength\b.{0,80}?(?:width|breadth)\s*\+\s*(\d+(?:\.\d+)?)/);
    const widthShorter =
      n.match(/\b(?:width|breadth)\b.{0,80}?(\d+(?:\.\d+)?)\s*(?:meters?|metres?|units?|cm|centimeters?|centimetres?|feet|yards?)?\s+(?:shorter|less)\s+than\s+(?:its\s+)?length\b/);

    if (/\b(rectangular|rectangle|garden|field|room|plot)\b/.test(n) && rectangleArea && (lengthLonger || widthShorter)) {
      const area = Number(rectangleArea[1]);
      const difference = Number((lengthLonger || widthShorter)[1]);
      const discriminant = difference * difference + 4 * area;
      const width = (-difference + Math.sqrt(discriminant)) / 2;
      const length = width + difference;

      if (Number.isFinite(area) && Number.isFinite(difference) && area > 0 && difference > 0 && width > 0) {
        return wordProblemResult({
          topic: "Word Problems",
          subtopic: "Geometry Word Problem",
          difficulty: "Quadratic Equation",
          goal: "Find the rectangle's length and width from its area and side relationship.",
          given: [`Area = ${formatNumber(area)} square units`, `Length is ${formatNumber(difference)} units longer than width`],
          unknown: ["Width", "Length"],
          conditions: ["Rectangle area = length × width", "There are two unknown side lengths."],
          formulas: ["A = length × width"],
          story: "This is a geometry word problem. Because both side lengths are unknown, the area relationship creates a quadratic equation.",
          translation: [`Let width = w`, `Length = w + ${formatNumber(difference)}`],
          model: [`w(w + ${formatNumber(difference)}) = ${formatNumber(area)}`, `w^2 + ${formatNumber(difference)}w - ${formatNumber(area)} = 0`],
          steps: [
            `Let width = w, so length = w + ${formatNumber(difference)}.`,
            `Use rectangle area: w(w + ${formatNumber(difference)}) = ${formatNumber(area)}.`,
            `Expand: w^2 + ${formatNumber(difference)}w - ${formatNumber(area)} = 0.`,
            `Solve the quadratic: w = ${formatNumber(width)}.`,
            `Length = ${formatNumber(width)} + ${formatNumber(difference)} = ${formatNumber(length)}.`
          ],
          verification: [
            `${formatNumber(length)} × ${formatNumber(width)} = ${formatNumber(length * width)}.`,
            `${formatNumber(length)} is ${formatNumber(difference)} more than ${formatNumber(width)}.`
          ],
          finalAnswer: `Width = ${formatNumber(width)} units, Length = ${formatNumber(length)} units.`,
          practice: "A rectangular field has area 108 square meters. Its length is 3 meters longer than its width. Find both sides.",
          confidence: 0.97
        });
      }
    }

    const length = numberAfterLabel(n, "length");
    const width = numberAfterLabel(n, "width|breadth");
    if (/\brectangle\b/.test(n) && length !== null && width !== null) {
      const asksPerimeter = /\bperimeter\b/.test(n);
      const value = asksPerimeter ? 2 * (length + width) : length * width;
      return wordProblemResult({
        topic: "Word Problems",
        subtopic: "Geometry Word Problems",
        goal: `Find the ${asksPerimeter ? "perimeter" : "area"} of a rectangle.`,
        given: [`Length = ${formatNumber(length)}`, `Width = ${formatNumber(width)}`],
        unknown: [asksPerimeter ? "Perimeter" : "Area"],
        conditions: ["A rectangle has opposite sides equal."],
        formulas: [asksPerimeter ? "Perimeter = 2(length + width)" : "Area = length × width"],
        story: "The story gives the rectangle dimensions, so we choose the matching formula.",
        translation: [`Length is ${formatNumber(length)} and width is ${formatNumber(width)}.`],
        model: [asksPerimeter ? `P = 2(${formatNumber(length)} + ${formatNumber(width)})` : `A = ${formatNumber(length)} × ${formatNumber(width)}`],
        steps: asksPerimeter
          ? [`P = 2(${formatNumber(length)} + ${formatNumber(width)})`, `P = 2 × ${formatNumber(length + width)}`, `P = ${formatNumber(value)}`]
          : [`A = ${formatNumber(length)} × ${formatNumber(width)}`, `A = ${formatNumber(value)}`],
        verification: [`The answer uses both given dimensions, so it matches the rectangle in the story.`],
        finalAnswer: `The rectangle's ${asksPerimeter ? "perimeter" : "area"} is ${formatNumber(value)}${asksPerimeter ? "" : " square units"}.`,
        practice: "A rectangle has length 12 cm and width 7 cm. Find its area."
      });
    }

    const radius = numberAfterLabel(n, "radius|r");
    if (/\bcircle\b/.test(n) && radius !== null) {
      const asksCircumference = /\b(circumference|perimeter)\b/.test(n);
      const value = asksCircumference ? 2 * Math.PI * radius : Math.PI * radius * radius;
      return wordProblemResult({
        topic: "Word Problems",
        subtopic: "Geometry Word Problems",
        goal: `Find the ${asksCircumference ? "circumference" : "area"} of a circle.`,
        given: [`Radius = ${formatNumber(radius)}`],
        unknown: [asksCircumference ? "Circumference" : "Area"],
        conditions: ["The radius is the distance from the center to the edge of the circle."],
        formulas: [asksCircumference ? "C = 2πr" : "A = πr²"],
        story: "The story gives the circle's radius, so we apply the circle formula.",
        translation: [`Use r = ${formatNumber(radius)}.`],
        model: [asksCircumference ? `C = 2π × ${formatNumber(radius)}` : `A = π × ${formatNumber(radius)}²`],
        steps: asksCircumference
          ? [`C = 2πr`, `C = 2 × π × ${formatNumber(radius)}`, `C = ${formatNumber(value)}`]
          : [`A = πr²`, `A = π × ${formatNumber(radius)}²`, `A = ${formatNumber(value)}`],
        verification: [`A positive radius gives a positive ${asksCircumference ? "circumference" : "area"}, so the result is reasonable.`],
        finalAnswer: `The circle's ${asksCircumference ? "circumference" : "area"} is ${formatNumber(value)}${asksCircumference ? "" : " square units"}.`,
        practice: "Find the area of a circle with radius 7 cm."
      });
    }

    const base = numberAfterLabel(n, "base");
    const height = numberAfterLabel(n, "height");
    if (/\btriangle\b/.test(n) && base !== null && height !== null) {
      const area = base * height / 2;
      return wordProblemResult({
        topic: "Word Problems",
        subtopic: "Geometry Word Problems",
        goal: "Find the area of a triangle.",
        given: [`Base = ${formatNumber(base)}`, `Height = ${formatNumber(height)}`],
        unknown: ["Area"],
        conditions: ["Triangle area is half of the matching rectangle area."],
        formulas: ["Area = 1/2 × base × height"],
        story: "The story gives a triangle's base and height, so we use the triangle area formula.",
        translation: [`Base is ${formatNumber(base)} and height is ${formatNumber(height)}.`],
        model: [`A = 1/2 × ${formatNumber(base)} × ${formatNumber(height)}`],
        steps: [`A = 1/2 × base × height`, `A = 1/2 × ${formatNumber(base)} × ${formatNumber(height)}`, `A = ${formatNumber(area)}`],
        verification: [`The triangle area is half of ${formatNumber(base * height)}, so ${formatNumber(area)} is reasonable.`],
        finalAnswer: `The triangle's area is ${formatNumber(area)} square units.`,
        practice: "A triangle has base 10 cm and height 8 cm. Find its area."
      });
    }

    return null;
  }

  function solveProbabilityWordProblem(text) {
    const n = normalize(text);
    if (!/\b(probability|chance|bag|balls|cards|dice)\b/.test(n)) return null;
    const colorMatches = [...n.matchAll(/(\d+(?:\.\d+)?)\s+(red|blue|green|yellow|black|white)\s+(?:balls?|marbles?|cards?)/g)];
    if (colorMatches.length) {
      const target = (n.match(/\b(?:probability|chance)\D{0,30}(red|blue|green|yellow|black|white)\b/) || [])[1] || colorMatches[0][2];
      const total = colorMatches.reduce((sum, match) => sum + Number(match[1]), 0);
      const favorable = colorMatches
        .filter((match) => match[2] === target)
        .reduce((sum, match) => sum + Number(match[1]), 0);
      if (favorable === 0 || total === 0) return null;
      const probability = favorable / total;
      return wordProblemResult({
        topic: "Word Problems",
        subtopic: "Probability Word Problems",
        goal: `Find the probability of choosing a ${target} item.`,
        given: colorMatches.map((match) => `${match[2]} = ${formatNumber(Number(match[1]))}`),
        unknown: [`Probability of ${target}`],
        conditions: ["All items are equally likely to be selected."],
        formulas: ["Probability = Favorable outcomes ÷ Total outcomes"],
        story: "The story gives counts of items in a bag, so probability is favorable count over total count.",
        translation: [`Favorable outcomes are the ${target} items.`, "Total outcomes are all listed items."],
        model: [`P(${target}) = ${formatNumber(favorable)} ÷ ${formatNumber(total)}`],
        steps: [
          `Total outcomes = ${formatNumber(total)}`,
          `Favorable outcomes = ${formatNumber(favorable)}`,
          `P(${target}) = ${formatNumber(favorable)} ÷ ${formatNumber(total)} = ${exactFraction(favorable, total)} = ${formatNumber(probability)}`
        ],
        verification: [`${formatNumber(probability)} is between 0 and 1, so it is a valid probability.`],
        finalAnswer: `The probability of choosing a ${target} item is ${exactFraction(favorable, total)} or ${formatNumber(probability)}.`,
        practice: "A bag has 4 red balls and 6 blue balls. Find the probability of picking a red ball."
      });
    }

    return null;
  }

  function solveStatisticsWordProblem(text) {
    const n = normalize(text);
    if (!/\b(mean|average|median|mode|scores?|marks?|data)\b/.test(n)) return null;
    const nums = extractNumbers(n);
    if (nums.length < 2) return null;
    const sorted = [...nums].sort((a, b) => a - b);
    const sum = nums.reduce((a, b) => a + b, 0);
    const asksMedian = /\bmedian\b/.test(n);
    const value = asksMedian
      ? (sorted.length % 2 ? sorted[Math.floor(sorted.length / 2)] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)
      : sum / nums.length;
    const label = asksMedian ? "median" : "mean";

    return wordProblemResult({
      topic: "Word Problems",
      subtopic: "Statistics Word Problems",
      goal: `Find the ${label} from the given data.`,
      given: [`Data values = ${nums.map(formatNumber).join(", ")}`],
      unknown: [label],
      conditions: ["Each listed value is one data point."],
      formulas: [asksMedian ? "Median = middle value after sorting" : "Mean = Sum of values ÷ Number of values"],
      story: "The story gives a set of values and asks for a statistic.",
      translation: asksMedian ? ["Sort the values, then choose the middle."] : ["Add all values and divide by how many values there are."],
      model: asksMedian ? [`Sorted data = ${sorted.map(formatNumber).join(", ")}`] : [`Mean = (${nums.map(formatNumber).join(" + ")}) ÷ ${nums.length}`],
      steps: asksMedian
        ? [`Sorted values = ${sorted.map(formatNumber).join(", ")}`, `Median = ${formatNumber(value)}`]
        : [`Sum = ${formatNumber(sum)}`, `Number of values = ${nums.length}`, `Mean = ${formatNumber(sum)} ÷ ${nums.length} = ${formatNumber(value)}`],
      verification: [`The ${label} ${formatNumber(value)} fits inside the range ${formatNumber(sorted[0])} to ${formatNumber(sorted[sorted.length - 1])}.`],
      finalAnswer: `The ${label} is ${formatNumber(value)}.`,
      practice: "Find the mean of 12, 15, 18, 20, and 25."
    });
  }

  function solveAlgebraWordProblem(text) {
    const n = normalize(text);
    if (!/\b(number|integer|unknown|increased|decreased|twice|thrice|times|less than|more than)\b/.test(n)) return null;

    let coefficientValue = 1;
    let constant = 0;
    let target = null;
    let phrase = "";

    let match = n.match(/\btwice\s+a\s+number\s+plus\s+(\d+(?:\.\d+)?)\s+(?:is|equals?)\s+(\d+(?:\.\d+)?)/);
    if (match) {
      coefficientValue = 2;
      constant = Number(match[1]);
      target = Number(match[2]);
      phrase = "twice a number plus a value";
    }

    match = match || n.match(/\b(\d+(?:\.\d+)?)\s+times\s+a\s+number\s+plus\s+(\d+(?:\.\d+)?)\s+(?:is|equals?)\s+(\d+(?:\.\d+)?)/);
    if (match && match.length === 4) {
      coefficientValue = Number(match[1]);
      constant = Number(match[2]);
      target = Number(match[3]);
      phrase = "a multiple of a number plus a value";
    }

    match = n.match(/\ba\s+number\s+increased\s+by\s+(\d+(?:\.\d+)?)\s+(?:is|equals?)\s+(\d+(?:\.\d+)?)/);
    if (match) {
      coefficientValue = 1;
      constant = Number(match[1]);
      target = Number(match[2]);
      phrase = "a number increased by a value";
    }

    match = n.match(/\ba\s+number\s+decreased\s+by\s+(\d+(?:\.\d+)?)\s+(?:is|equals?)\s+(\d+(?:\.\d+)?)/);
    if (match) {
      coefficientValue = 1;
      constant = -Number(match[1]);
      target = Number(match[2]);
      phrase = "a number decreased by a value";
    }

    if (target === null) return null;
    const value = (target - constant) / coefficientValue;
    const sign = constant >= 0 ? "+" : "-";

    return wordProblemResult({
      topic: "Word Problems",
      subtopic: "Algebraic Word Problems",
      goal: "Convert the sentence into an equation and solve for the unknown number.",
      given: [`Sentence pattern = ${phrase}`, `Target value = ${formatNumber(target)}`],
      unknown: ["The number, x"],
      conditions: ["The unknown number is represented by x."],
      formulas: ["Translate words into an equation, then isolate x."],
      story: "The story describes an unknown number using words, so we turn the words into algebra.",
      translation: [`Let the unknown number be x.`, `${phrase} becomes ${formatNumber(coefficientValue)}x ${sign} ${formatNumber(Math.abs(constant))}.`],
      model: [`${formatNumber(coefficientValue)}x ${sign} ${formatNumber(Math.abs(constant))} = ${formatNumber(target)}`],
      steps: [
        `${formatNumber(coefficientValue)}x ${sign} ${formatNumber(Math.abs(constant))} = ${formatNumber(target)}`,
        `${formatNumber(coefficientValue)}x = ${formatNumber(target - constant)}`,
        `x = ${formatNumber(target - constant)} ÷ ${formatNumber(coefficientValue)}`,
        `x = ${formatNumber(value)}`
      ],
      verification: [`${formatNumber(coefficientValue)} × ${formatNumber(value)} ${sign} ${formatNumber(Math.abs(constant))} = ${formatNumber(target)}.`],
      finalAnswer: `The number is ${formatNumber(value)}.`,
      practice: "Twice a number plus 5 is 21. Find the number."
    });
  }

  function solveWordProblem(text) {
    const n = normalize(text);
    if (!hasWordProblemCue(n)) return null;
    return solveMultiplicativeComparisonWordProblem(text)
      || solveDiscountWordProblem(text)
      || solveProfitLossWordProblem(text)
      || solveInterestWordProblem(text)
      || solveSpeedWordProblem(text)
      || solveWorkWordProblem(text)
      || solveAgeWordProblem(text)
      || solveRatioWordProblem(text)
      || solveMixtureWordProblem(text)
      || solveGeometryWordProblem(text)
      || solveProbabilityWordProblem(text)
      || solveStatisticsWordProblem(text)
      || solveAlgebraWordProblem(text);
  }

  const solvers = [
    solveWordProblem,
    solveFraction,
    solvePercentage,
    solveSystem,
    solveInequality,
    solveQuadratic,
    solveLinearEquation,
    solveRatioProportion,
    solveLogExp,
    solvePowersRootsAndExponents,
    solveExponentsRoots,
    solveCoordinateGeometry,
    solveVolume,
    solveGeometry,
    solveTrigonometry,
    solveStatistics,
    solveProbability,
    solveFinancial,
    solveCalculus,
    solveLinearAlgebra,
    solveComplex,
    solveFactors,
    solveArithmetic,
    fallbackMath
  ];

  function analyze(text) {
    for (const solver of solvers) {
      const result = solver(text);
      if (result) return result;
    }
    return null;
  }

  function createResponse(text) {
    const result = analyze(text);
    return result ? render(result) : "";
  }

  window.TutorlyAdvancedMath = {
    analyze,
    createResponse,
    render,
    solvers: solvers.length
  };
})();
