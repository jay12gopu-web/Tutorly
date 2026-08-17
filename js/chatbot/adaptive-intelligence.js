(function () {
  const core = window.TutorlyChatbot;
  if (!core || core.getModule("adaptive")) return;

  const STORAGE_KEY = "tutorly_adaptive_intelligence_v1";
  const MAX_PATTERNS = 180;
  const MAX_INTERACTIONS = 220;
  const MAX_FEEDBACK = 260;
  const VECTOR_SIZE = 128;

  const STOP_WORDS = new Set([
    "a", "an", "and", "are", "as", "at", "be", "but", "by", "can", "do", "does", "for",
    "from", "has", "have", "how", "i", "in", "is", "it", "me", "my", "of", "on", "or",
    "please", "show", "solve", "tell", "that", "the", "their", "them", "then", "this",
    "to", "was", "what", "when", "where", "which", "why", "with", "you"
  ]);

  const SUBJECT_RULES = [
    {
      subject: "mathematics",
      topic: "Mathematics",
      weight: 3,
      patterns: [
        /\b(math|maths|algebra|equation|fraction|percentage|ratio|proportion|geometry|area|perimeter|volume|trigonometry|calculus|probability|statistics)\b/i,
        /\b(?:solve|calculate|find|evaluate|simplify|factor|differentiate|integrate)\b.*(?:\d|x|y|equation|area|perimeter|ratio)/i,
        /\d+\s*(?:\+|-|×|x|\*|÷|\/|\^|=)\s*\d+/i,
        /\b(?:together they have|times as many|older than|younger than|speed|distance|work together|mixture|profit|loss|shared equally)\b/i
      ]
    },
    {
      subject: "physics",
      topic: "Physics",
      weight: 3,
      patterns: [/\b(force|motion|velocity|acceleration|gravity|newton|energy|work done|power|electricity|magnet|sound|light|pressure)\b/i]
    },
    {
      subject: "chemistry",
      topic: "Chemistry",
      weight: 3,
      patterns: [/\b(atom|molecule|compound|acid|base|salt|reaction|periodic|bond|valency|solution|ion|electron|proton|neutron)\b/i]
    },
    {
      subject: "biology",
      topic: "Biology",
      weight: 3,
      patterns: [/\b(photosynthesis|germination|cell|respiration|digestion|blood|heart|plant|animal|ecosystem|reproduction|organ|tissue)\b/i]
    },
    {
      subject: "english",
      topic: "English",
      weight: 3,
      patterns: [/\b(grammar|noun|verb|adjective|adverb|preposition|conjunction|tense|active voice|passive voice|essay|letter|poem|theme|summary|character sketch|synonym|antonym|idiom)\b/i]
    },
    {
      subject: "history",
      topic: "History",
      weight: 3,
      patterns: [/\b(history|war|empire|civilization|revolution|independence|king|queen|treaty|ancient|medieval|modern history|dynasty)\b/i]
    },
    {
      subject: "geography",
      topic: "Geography",
      weight: 3,
      patterns: [/\b(geography|country|state|city|continent|ocean|river|mountain|desert|climate|latitude|longitude|map|located|location|capital)\b/i, /\bwhere is\b/i]
    },
    {
      subject: "civics",
      topic: "Civics",
      weight: 2,
      patterns: [/\b(civics|constitution|government|parliament|democracy|rights|duties|citizen|election|law)\b/i]
    },
    {
      subject: "economics",
      topic: "Economics",
      weight: 2,
      patterns: [/\b(economics|demand|supply|market|inflation|gdp|income|production|consumer|budget|tax)\b/i]
    },
    {
      subject: "computer_science",
      topic: "Computer Science",
      weight: 2,
      patterns: [/\b(computer science|algorithm|programming|python|javascript|html|css|database|variable|loop|function)\b/i]
    }
  ];

  const QUESTION_TYPE_RULES = [
    { type: "current_events", patterns: [/\b(today|latest|current|currently|live|breaking|this week|this month|recent|now|2026)\b/i] },
    { type: "numerical", patterns: [/\d/, /\b(calculate|find|solve|evaluate|how many|how much)\b/i] },
    { type: "problem_solving", patterns: [/\b(solve|find|calculate|prove|derive|work out|word problem)\b/i] },
    { type: "explanation", patterns: [/\b(explain|concept|why|how does|how do|teach|understand)\b/i] },
    { type: "essay", patterns: [/\b(essay|article|speech|debate|letter|email|report|notice|story|diary)\b/i] },
    { type: "literature", patterns: [/\b(poem|poetry|theme|character|plot|author|metaphor|simile|imagery|irony|extract)\b/i] },
    { type: "grammar", patterns: [/\b(grammar|tense|noun|verb|adjective|adverb|preposition|article|conjunction|pronoun|modal|punctuation)\b/i] },
    { type: "coding", patterns: [/\b(code|debug|program|algorithm|function|variable|loop)\b/i] },
    { type: "conceptual", patterns: [/\b(what is|define|meaning|principle|law|rule)\b/i] }
  ];

  const TOPIC_RULES = [
    { topic: "Algebra", subTopic: "Equations", patterns: [/\b(algebra|equation|solve for|linear|quadratic|x\s*=|y\s*=)\b/i] },
    { topic: "Geometry", subTopic: "Area and Perimeter", patterns: [/\b(area|perimeter|rectangle|rectangular|triangle|circle|radius|diameter|volume|surface area)\b/i] },
    { topic: "Rates", subTopic: "Speed Distance Time", patterns: [/\b(speed|distance|time|train|car|km\/h|m\/s)\b/i] },
    { topic: "Ratios", subTopic: "Proportion", patterns: [/\b(ratio|proportion|shared equally|divide among)\b/i] },
    { topic: "Photosynthesis", subTopic: "Plant Nutrition", patterns: [/\bphotosynthesis\b/i] },
    { topic: "Germination", subTopic: "Plant Growth", patterns: [/\bgermination\b/i] },
    { topic: "Grammar", subTopic: "Sentence Rules", patterns: [/\b(grammar|tense|article|preposition|voice|speech)\b/i] },
    { topic: "Literature", subTopic: "Analysis", patterns: [/\b(theme|summary|character|plot|poem|author)\b/i] },
    { topic: "Location", subTopic: "Map Skills", patterns: [/\b(where is|located|location|capital|continent|map)\b/i] },
    { topic: "History", subTopic: "Cause and Effect", patterns: [/\b(war|revolution|independence|civilization|empire)\b/i] },
    { topic: "General Study", subTopic: "Concept Explanation", patterns: [/\b(explain|what is|define|why|how)\b/i] }
  ];

  const CURRENT_OR_UNSTABLE_PATTERNS = [
    /\b(today|tonight|this week|this month|latest|breaking|live|score|weather|stock price|share price|current ranking|recent policy|new update)\b/i,
    /\b(who won|released today|announced today|price now|current price)\b/i
  ];

  const BASE_PATTERNS = [
    {
      id: "seed_speed_distance_time",
      subject: "mathematics",
      topic: "Rates",
      solutionPattern: "Speed = Distance / Time",
      teachingPattern: "Extract distance and time, write the formula first, substitute values, then check units.",
      difficulty: "easy",
      successScore: 0.78,
      examples: ["A train travels 120 km in 2 hours.", "A car travels 300 km in 5 hours."],
      keywords: ["speed", "distance", "time", "km", "hours", "travels"]
    },
    {
      id: "seed_linear_times_as_many",
      subject: "mathematics",
      topic: "Algebra",
      solutionPattern: "Let the smaller quantity be x, express the other quantity, add them, then solve.",
      teachingPattern: "Define variables clearly, build one equation from the relationship, verify by substitution.",
      difficulty: "medium",
      successScore: 0.82,
      examples: ["Sarah has three times as many pencils as Tom. Together they have 48 pencils."],
      keywords: ["times as many", "together", "how many", "each", "x"]
    },
    {
      id: "seed_rectangle_area_quadratic",
      subject: "mathematics",
      topic: "Geometry",
      solutionPattern: "Use area = length × width, express one side in terms of the other, solve the quadratic.",
      teachingPattern: "Draw the relationship in words, define width as x, write length as x plus/minus a value, then solve and reject impossible dimensions.",
      difficulty: "medium",
      successScore: 0.79,
      examples: ["A rectangular garden has length 5 meters longer than width and area 84 square meters."],
      keywords: ["rectangular", "garden", "length", "width", "area", "quadratic"]
    },
    {
      id: "seed_photosynthesis_concept",
      subject: "biology",
      topic: "Photosynthesis",
      solutionPattern: "Explain inputs, process, outputs, and why plants need it.",
      teachingPattern: "Start with the definition, then connect sunlight, chlorophyll, water, carbon dioxide, glucose, and oxygen.",
      difficulty: "easy",
      successScore: 0.84,
      examples: ["Explain photosynthesis."],
      keywords: ["photosynthesis", "plants", "sunlight", "chlorophyll", "glucose", "oxygen"]
    },
    {
      id: "seed_geography_location",
      subject: "geography",
      topic: "Location",
      solutionPattern: "Give quick location, hierarchy, and map context.",
      teachingPattern: "Answer the exact location first, then show state/country/continent hierarchy and one memory hint.",
      difficulty: "easy",
      successScore: 0.8,
      examples: ["Where is Hyderabad located?", "Where is India located?"],
      keywords: ["where is", "located", "city", "state", "country", "continent"]
    },
    {
      id: "seed_english_grammar_rule",
      subject: "english",
      topic: "Grammar",
      solutionPattern: "Identify the rule, apply it to the sentence, and explain why alternatives are wrong.",
      teachingPattern: "Keep the rule simple, show the corrected sentence, then give one practice sentence.",
      difficulty: "easy",
      successScore: 0.77,
      examples: ["Identify the tense.", "Use the correct article."],
      keywords: ["grammar", "tense", "article", "preposition", "sentence"]
    }
  ];

  function defaultStore() {
    return {
      version: 1,
      patterns: BASE_PATTERNS.map((pattern) => ({
        ...pattern,
        questionEmbedding: vectorize(`${pattern.examples.join(" ")} ${pattern.keywords.join(" ")}`),
        source: "seed",
        createdAt: core.now(),
        updatedAt: core.now()
      })),
      interactions: [],
      feedback: [],
      profile: {
        strategyScores: {},
        topicMastery: {},
        preferredDepth: "balanced",
        lastAdaptiveContext: null
      },
      updatedAt: core.now()
    };
  }

  function readStore() {
    const saved = core.storage.get(STORAGE_KEY, null);
    if (!saved || typeof saved !== "object") return defaultStore();
    const seeded = defaultStore();
    const savedPatterns = Array.isArray(saved.patterns) ? saved.patterns : [];
    const patternMap = new Map();
    seeded.patterns.concat(savedPatterns).forEach((pattern) => {
      if (!pattern || !pattern.id) return;
      patternMap.set(pattern.id, {
        ...pattern,
        questionEmbedding: Array.isArray(pattern.questionEmbedding) ? pattern.questionEmbedding : vectorize(pattern.examples?.join(" ") || pattern.solutionPattern || "")
      });
    });
    return {
      ...seeded,
      ...saved,
      patterns: Array.from(patternMap.values()).slice(-MAX_PATTERNS),
      interactions: Array.isArray(saved.interactions) ? saved.interactions.slice(-MAX_INTERACTIONS) : [],
      feedback: Array.isArray(saved.feedback) ? saved.feedback.slice(-MAX_FEEDBACK) : [],
      profile: { ...seeded.profile, ...(saved.profile || {}) }
    };
  }

  function writeStore(store) {
    const next = {
      ...store,
      patterns: (store.patterns || []).slice(-MAX_PATTERNS),
      interactions: (store.interactions || []).slice(-MAX_INTERACTIONS),
      feedback: (store.feedback || []).slice(-MAX_FEEDBACK),
      updatedAt: core.now()
    };
    core.storage.set(STORAGE_KEY, next);
    core.emit("adaptive:changed", next);
    return next;
  }

  function normalizeText(value) {
    return core.normalizeForSearch(value)
      .replace(/\bmaths\b/g, "math")
      .replace(/[×÷]/g, (symbol) => symbol === "×" ? "*" : "/");
  }

  function tokenize(value) {
    const normalized = normalizeText(value);
    return normalized
      .split(/[^a-z0-9#+/%=.-]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
  }

  function hashToken(token) {
    let hash = 2166136261;
    for (let index = 0; index < token.length; index += 1) {
      hash ^= token.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash) % VECTOR_SIZE;
  }

  function vectorize(value) {
    const vector = Array(VECTOR_SIZE).fill(0);
    tokenize(value).forEach((token) => {
      vector[hashToken(token)] += 1;
    });
    const magnitude = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0)) || 1;
    return vector.map((item) => Number((item / magnitude).toFixed(4)));
  }

  function cosineSimilarity(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right)) return 0;
    const length = Math.min(left.length, right.length);
    let dot = 0;
    for (let index = 0; index < length; index += 1) {
      dot += Number(left[index] || 0) * Number(right[index] || 0);
    }
    return Math.max(0, Math.min(1, dot));
  }

  function matched(patterns, text) {
    return patterns.some((pattern) => pattern.test(text));
  }

  function detectSubject(message) {
    const text = String(message || "");
    const scores = SUBJECT_RULES.map((rule) => {
      const hits = rule.patterns.filter((pattern) => pattern.test(text)).length;
      return { ...rule, score: hits * rule.weight };
    }).sort((a, b) => b.score - a.score);
    const best = scores[0];
    if (!best || best.score <= 0) {
      return { subject: "general", topic: "General Study", confidence: 0.52 };
    }
    return {
      subject: best.subject,
      topic: best.topic,
      confidence: Math.min(0.98, 0.58 + best.score * 0.09)
    };
  }

  function detectTopic(message, subjectResult) {
    const text = String(message || "");
    const found = TOPIC_RULES.find((rule) => matched(rule.patterns, text));
    if (found) return found;
    return {
      topic: subjectResult.topic || "General Study",
      subTopic: subjectResult.subject === "general" ? "Concept Explanation" : "Core Concept"
    };
  }

  function detectQuestionType(message) {
    const text = String(message || "");
    const found = QUESTION_TYPE_RULES.find((rule) => matched(rule.patterns, text));
    if (found) return found.type;
    return text.trim().endsWith("?") ? "conceptual" : "explanation";
  }

  function detectGradeLevel(message) {
    const text = String(message || "").toLowerCase();
    const explicit = text.match(/\b(?:grade|class)\s*(\d{1,2})\b/);
    if (explicit) {
      const grade = Number(explicit[1]);
      if (grade <= 5) return "grade_1_5";
      if (grade <= 8) return "grade_6_8";
      if (grade <= 12) return "grade_9_12";
      return "college";
    }

    const memory = core.getModule("memory")?.readMemory?.();
    const savedGrade = Number(memory?.learner?.grade || 0);
    if (savedGrade > 0) {
      if (savedGrade <= 5) return "grade_1_5";
      if (savedGrade <= 8) return "grade_6_8";
      if (savedGrade <= 12) return "grade_9_12";
    }

    if (/\b(derivative|integral|eigenvalue|laplace|university|college|prove rigorously)\b/i.test(text)) return "college";
    if (/\b(board exam|class 10|class 12|quadratic|trigonometry|organic chemistry)\b/i.test(text)) return "grade_9_12";
    return "grade_6_8";
  }

  function detectDifficulty(message, gradeLevel, questionType) {
    const text = String(message || "").toLowerCase();
    if (/\b(simple|easy|basic|explain like|beginner)\b/.test(text) || gradeLevel === "grade_1_5") return "easy";
    if (/\b(advanced|hard|difficult|prove|derive|deep|college|university)\b/.test(text) || gradeLevel === "college") return "hard";
    if (questionType === "numerical" || questionType === "problem_solving") return "medium";
    return "medium";
  }

  function analyzeQuestion(message, options = {}) {
    const subjectResult = detectSubject(message);
    const topicResult = detectTopic(message, subjectResult);
    const questionType = detectQuestionType(message);
    const gradeLevel = detectGradeLevel(message);
    const difficulty = detectDifficulty(message, gradeLevel, questionType);
    const text = String(message || "");
    const tokens = tokenize(text);
    const hasCurrentSignal = CURRENT_OR_UNSTABLE_PATTERNS.some((pattern) => pattern.test(text));
    const confidence = Math.min(0.99, Math.max(0.35,
      subjectResult.confidence +
      (topicResult.topic !== "General Study" ? 0.08 : 0) +
      (tokens.length >= 4 ? 0.05 : 0) -
      (hasCurrentSignal ? 0.18 : 0)
    ));

    return {
      subject: options.subject || subjectResult.subject,
      topic: topicResult.topic,
      subTopic: topicResult.subTopic,
      gradeLevel,
      difficulty,
      questionType,
      confidence: Number(confidence.toFixed(3)),
      keywords: tokens.slice(0, 14),
      requiresFreshnessCheck: hasCurrentSignal
    };
  }

  function patternSignature(message, analysis) {
    const text = normalizeText(message);
    if (analysis.subject === "mathematics" && /\b(speed|distance|time|travels?)\b/.test(text)) return "rate_speed_distance_time";
    if (analysis.subject === "mathematics" && /\b(area|rectangle|rectangular|length|width)\b/.test(text)) return "geometry_area_relationship";
    if (analysis.subject === "mathematics" && /\b(times as many|together they have|older than|younger than|sum of|difference between)\b/.test(text)) return "algebra_relationship_equation";
    if (analysis.subject === "biology" && /\bphotosynthesis\b/.test(text)) return "biology_process_inputs_outputs";
    if (analysis.subject === "english" && /\b(grammar|tense|article|preposition|voice|speech)\b/.test(text)) return "english_rule_application";
    if (analysis.subject === "geography" && /\b(where is|located|location|capital)\b/.test(text)) return "geography_location_hierarchy";
    return `${analysis.subject}_${analysis.topic}`.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  }

  function findSimilarPatterns(message, analysis, options = {}) {
    const store = readStore();
    const vector = vectorize(message);
    const signature = patternSignature(message, analysis);
    const threshold = options.threshold ?? 0.58;
    const matches = store.patterns.map((pattern) => {
      const semantic = cosineSimilarity(vector, pattern.questionEmbedding);
      const subjectBoost = pattern.subject === analysis.subject ? 0.18 : 0;
      const topicBoost = normalizeText(pattern.topic) === normalizeText(analysis.topic) ? 0.12 : 0;
      const signatureBoost = normalizeText(pattern.solutionPattern).includes(signature.replace(/_/g, " ")) ? 0.08 : 0;
      const keywordBoost = (pattern.keywords || []).some((keyword) => normalizeText(message).includes(normalizeText(keyword))) ? 0.08 : 0;
      const successBoost = Math.min(0.1, Number(pattern.successScore || 0) * 0.08);
      return {
        ...pattern,
        similarity: Number(Math.min(1, semantic + subjectBoost + topicBoost + signatureBoost + keywordBoost + successBoost).toFixed(3))
      };
    })
      .filter((pattern) => pattern.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, options.limit || 4);

    return matches;
  }

  function assessKnowledgeConfidence(message, analysis, patterns = []) {
    const text = String(message || "");
    const currentSignal = CURRENT_OR_UNSTABLE_PATTERNS.some((pattern) => pattern.test(text));
    const knownAcademic = analysis.subject !== "general" && analysis.questionType !== "current_events";
    const bestPattern = patterns[0]?.similarity || 0;
    let confidenceScore = analysis.confidence;
    let reason = "Question can be answered from tutor knowledge.";

    if (bestPattern > 0.7) {
      confidenceScore = Math.max(confidenceScore, 0.88 + Math.min(0.08, bestPattern * 0.08));
      reason = "A similar successful teaching pattern exists.";
    } else if (knownAcademic) {
      confidenceScore = Math.max(confidenceScore, 0.78);
    }

    if (currentSignal || analysis.questionType === "current_events") {
      confidenceScore = Math.min(confidenceScore, 0.52);
      reason = "Question may require current or recently changed information.";
    }

    if (!knownAcademic && !currentSignal) {
      confidenceScore = Math.min(confidenceScore, 0.68);
      reason = "The topic is broad, so internal confidence is moderate.";
    }

    const requiresAdditionalKnowledge = confidenceScore < 0.7 || currentSignal || analysis.questionType === "current_events";

    return {
      confidenceScore: Number(Math.max(0, Math.min(1, confidenceScore)).toFixed(3)),
      requiresAdditionalKnowledge,
      reason
    };
  }

  function retrieveKnowledge(message, analysis, patterns) {
    const memory = core.getModule("memory")?.buildContext?.({ mode: "adaptive" }) || null;
    const relevantPatterns = patterns.map((pattern) => ({
      solutionPattern: pattern.solutionPattern,
      teachingPattern: pattern.teachingPattern,
      successScore: Number(pattern.successScore || 0),
      similarity: pattern.similarity
    }));

    return {
      memory,
      previousSuccessfulPatterns: relevantPatterns,
      internalNotes: buildInternalNotes(analysis),
      retrievedAt: core.now()
    };
  }

  function buildInternalNotes(analysis) {
    const notes = [];
    if (analysis.subject === "mathematics") notes.push("Use formulas, substitution, calculation, verification, and a practice problem.");
    if (["physics", "chemistry", "biology"].includes(analysis.subject)) notes.push("Teach the concept first, then connect it to a real-life example.");
    if (analysis.subject === "english") notes.push("Show the rule or literary idea, apply it, then add one exam-style practice prompt.");
    if (["history", "geography", "civics", "economics"].includes(analysis.subject)) notes.push("Use context, cause/effect, timelines or map hierarchy when relevant.");
    if (analysis.gradeLevel === "grade_1_5") notes.push("Use very simple words and short sentences.");
    if (analysis.gradeLevel === "college") notes.push("Use deeper reasoning and precise terminology.");
    return notes;
  }

  function mergeKnowledge(analysis, retrieval, confidence) {
    const bestPattern = retrieval.previousSuccessfulPatterns[0];
    const recommendedTeachingStrategy = bestPattern?.teachingPattern || defaultTeachingStrategy(analysis);
    const mergedKnowledge = [
      ...retrieval.internalNotes,
      bestPattern ? `Reuse teaching strategy: ${bestPattern.teachingPattern}` : "",
      retrieval.memory?.promptHints?.join("\n") || ""
    ].filter(Boolean).join("\n");

    return {
      mergedKnowledge,
      sourceConfidence: confidence.confidenceScore,
      recommendedTeachingStrategy
    };
  }

  function defaultTeachingStrategy(analysis) {
    const strategyMap = {
      mathematics: "Show the formula, substitute values, solve step by step, verify, and end with a practice question.",
      physics: "Explain the law or principle, connect it to the situation, then show any calculation clearly.",
      chemistry: "Define the chemical idea, explain particles/reactions, then summarize in exam-friendly wording.",
      biology: "Explain the process in order, use real-life comparison, then add a memory clue.",
      english: "Identify the rule or literary focus, explain it, apply it to the question, and give a practice prompt.",
      history: "Set context, explain sequence, connect cause and effect, then highlight exam points.",
      geography: "Answer location or concept first, show hierarchy/map context, then add key exam facts.",
      civics: "Define the system or rule, explain why it matters, then connect it to citizens or governance.",
      economics: "Define the term, explain the relationship, use a simple example, then summarize the result.",
      computer_science: "Explain the problem, describe the logic, and keep code help educational and concise."
    };
    return strategyMap[analysis.subject] || "Teach the idea clearly, answer directly, and add one practice question.";
  }

  function generatePracticeQuestion(analysis, message) {
    const topic = analysis.topic || "";
    if (analysis.subject === "mathematics" && /geometry|area/i.test(topic)) {
      return "A rectangle has a width of 6 m and a length 4 m longer than its width. Find its area.";
    }
    if (analysis.subject === "mathematics" && /rates|speed/i.test(topic)) {
      return "A bus travels 180 km in 3 hours. What is its average speed?";
    }
    if (analysis.subject === "mathematics" && /algebra/i.test(topic)) {
      return "Riya has twice as many stickers as Aman. Together they have 45 stickers. How many does each have?";
    }
    if (analysis.subject === "biology") return "Explain why chlorophyll is important for photosynthesis.";
    if (analysis.subject === "physics") return "A force of 10 N moves an object 4 m. How much work is done?";
    if (analysis.subject === "chemistry") return "Explain the difference between an acid and a base with one example each.";
    if (analysis.subject === "english" && analysis.questionType === "grammar") return "Identify the tense: She has finished her homework.";
    if (analysis.subject === "english") return "Write a short paragraph explaining the theme of honesty in a story.";
    if (analysis.subject === "geography") return "Where is Pune located? Write the city, state, country, and continent.";
    if (analysis.subject === "history") return "Name one cause and one effect of the French Revolution.";
    if (analysis.subject === "civics") return "Why are fundamental rights important in a democracy?";
    if (analysis.subject === "economics") return "Give one example of how demand can affect price.";
    return `Ask one similar question about ${analysis.subTopic || analysis.topic || "this topic"} and try answering it in your own words.`;
  }

  function commonMistakeFor(analysis) {
    if (analysis.subject === "mathematics") return "Do not jump to the final answer before defining the unknowns and checking the equation.";
    if (["physics", "chemistry"].includes(analysis.subject)) return "Do not use a formula before checking what each quantity means and which units are used.";
    if (analysis.subject === "biology") return "Do not memorize only keywords; explain the process in the correct order.";
    if (analysis.subject === "english" && analysis.questionType === "grammar") return "Do not choose an answer only because it sounds right; connect it to the grammar rule.";
    if (analysis.subject === "geography") return "Do not stop at the country if the question asks for a city or state; give the exact hierarchy.";
    if (analysis.subject === "history") return "Do not list events without explaining cause and effect.";
    return "";
  }

  function hasAcademicStructure(reply) {
    const text = String(reply || "");
    return /Understand the Question|Final Answer|Practice Question|math-learning-flow|Quick Solve/i.test(text);
  }

  function isCasual(message) {
    return /^(hi|hello|hey|yo|thanks|thank you|bye|good night|good morning|lol|wassup|sup|sorry)\b[!.?]*$/i.test(String(message || "").trim());
  }

  function enhanceReply(reply, options = {}) {
    const message = options.message || "";
    const analysis = options.adaptiveContext?.analysis || analyzeQuestion(message, options);
    const text = String(reply || "").trim();
    if (!text || isCasual(message)) return reply;
    if (/data-tutorly-math-response|geo-visual-panel|math-learning-flow/i.test(text)) return reply;

    const additions = [];
    const mistake = commonMistakeFor(analysis);
    if (!/Common Mistakes/i.test(text) && mistake) {
      additions.push("### Common Mistakes", "", mistake);
    }
    if (!/Practice Question|Practice Challenge/i.test(text)) {
      additions.push("### Practice Question", "", generatePracticeQuestion(analysis, message));
    }
    if (!additions.length) return reply;
    return [text, "", ...additions].join("\n");
  }

  function buildAdaptiveContext(message, options = {}) {
    const analysis = analyzeQuestion(message, options);
    const patterns = findSimilarPatterns(message, analysis);
    const confidence = assessKnowledgeConfidence(message, analysis, patterns);
    const retrieval = retrieveKnowledge(message, analysis, patterns);
    const merged = mergeKnowledge(analysis, retrieval, confidence);
    const context = {
      analysis,
      patternMatches: patterns,
      knowledgeConfidence: confidence,
      retrieval,
      merged,
      practiceQuestion: generatePracticeQuestion(analysis, message),
      commonMistake: commonMistakeFor(analysis),
      createdAt: core.now()
    };

    const store = readStore();
    store.profile.lastAdaptiveContext = {
      message: core.truncate(message, 180),
      analysis,
      confidence,
      bestPattern: patterns[0] ? {
        id: patterns[0].id,
        similarity: patterns[0].similarity,
        teachingPattern: patterns[0].teachingPattern
      } : null
    };
    writeStore(store);

    return context;
  }

  function solutionPatternFromInteraction(message, analysis, reply) {
    const firstEquation = String(reply || "").match(/[a-z0-9\s()+\-*/^=.]+=[a-z0-9\s()+\-*/^=.]+/i);
    if (firstEquation) return `Use equation pattern: ${core.truncate(firstEquation[0], 90)}`;
    if (analysis.subject === "mathematics") return patternSignature(message, analysis).replace(/_/g, " ");
    return `${analysis.topic}: ${analysis.questionType}`;
  }

  function teachingPatternFromReply(analysis, reply) {
    if (/Understand the Question/i.test(reply) && /Practice Question/i.test(reply)) return defaultTeachingStrategy(analysis);
    if (/Quick Solve/i.test(reply)) return "Use compact visual steps, a final answer, and a mini-check.";
    if (/map|located|hierarchy/i.test(reply) && analysis.subject === "geography") return "Use direct location, hierarchy, and visual map context.";
    return defaultTeachingStrategy(analysis);
  }

  function recordInteraction(payload = {}) {
    const message = payload.message || payload.prompt || "";
    const reply = payload.reply || payload.content || "";
    if (!message || !reply || isCasual(message)) return null;

    const analysis = payload.analysis || analyzeQuestion(message, { subject: payload.subject });
    const store = readStore();
    const signature = patternSignature(message, analysis);
    const patternId = `pattern_${signature}_${hashToken(signature + normalizeText(message)).toString(36)}`;
    const existing = store.patterns.find((pattern) => pattern.id === patternId);
    const successScore = Number(payload.successScore ?? 0.62);
    const record = {
      id: core.uid("interaction"),
      conversationId: payload.conversationId || null,
      messageId: payload.messageId || null,
      question: core.truncate(message, 260),
      subject: analysis.subject,
      topic: analysis.topic,
      subTopic: analysis.subTopic,
      questionType: analysis.questionType,
      difficulty: analysis.difficulty,
      teachingStrategy: teachingPatternFromReply(analysis, reply),
      successScore,
      createdAt: core.now()
    };
    store.interactions.push(record);

    const nextPattern = {
      id: patternId,
      questionEmbedding: vectorize(message),
      subject: analysis.subject,
      topic: analysis.topic,
      solutionPattern: solutionPatternFromInteraction(message, analysis, reply),
      teachingPattern: record.teachingStrategy,
      difficulty: analysis.difficulty,
      successScore: existing
        ? Number(((Number(existing.successScore || 0.6) * 0.75) + (successScore * 0.25)).toFixed(3))
        : successScore,
      examples: existing?.examples ? core.unique(existing.examples.concat(core.truncate(message, 120))).slice(-6) : [core.truncate(message, 120)],
      keywords: analysis.keywords,
      source: "interaction",
      createdAt: existing?.createdAt || core.now(),
      updatedAt: core.now()
    };

    if (existing) {
      Object.assign(existing, nextPattern);
    } else {
      store.patterns.push(nextPattern);
    }

    bumpStrategyScore(store, record.teachingStrategy, successScore - 0.55);
    writeStore(store);
    return record;
  }

  function bumpStrategyScore(store, strategy, delta) {
    const key = core.truncate(strategy || "general", 80);
    const current = Number(store.profile.strategyScores[key] || 0.5);
    store.profile.strategyScores[key] = Number(core.clamp(current + delta, 0, 1).toFixed(3));
  }

  function feedbackScore(feedbackType) {
    const map = {
      understood: 0.95,
      simpler: 0.42,
      examples: 0.58,
      confused: 0.22,
      up: 0.86,
      down: 0.28
    };
    return map[feedbackType] ?? 0.5;
  }

  function recordFeedback(payload = {}) {
    const feedbackType = payload.feedbackType || payload.rating || "";
    const message = payload.message || payload.prompt || "";
    const reply = payload.reply || "";
    const analysis = payload.analysis || analyzeQuestion(message, { subject: payload.subject });
    const store = readStore();
    const score = feedbackScore(feedbackType);
    const feedback = {
      id: core.uid("feedback"),
      feedbackType,
      score,
      conversationId: payload.conversationId || null,
      messageId: payload.messageId || null,
      subject: analysis.subject,
      topic: analysis.topic,
      difficulty: analysis.difficulty,
      prompt: core.truncate(message, 220),
      createdAt: core.now()
    };
    store.feedback.push(feedback);

    const signature = patternSignature(message, analysis);
    store.patterns.forEach((pattern) => {
      const related =
        pattern.subject === analysis.subject &&
        (normalizeText(pattern.topic) === normalizeText(analysis.topic) || cosineSimilarity(pattern.questionEmbedding, vectorize(message)) > 0.62);
      if (!related) return;
      pattern.successScore = Number(((Number(pattern.successScore || 0.55) * 0.82) + (score * 0.18)).toFixed(3));
      pattern.updatedAt = core.now();
    });

    if (feedbackType === "understood" || feedbackType === "up") {
      bumpStrategyScore(store, teachingPatternFromReply(analysis, reply), 0.08);
    }
    if (feedbackType === "confused" || feedbackType === "down") {
      bumpStrategyScore(store, teachingPatternFromReply(analysis, reply), -0.12);
    }

    writeStore(store);
    core.emit("adaptive:feedback", feedback);
    return feedback;
  }

  function createFeedbackFollowup(feedbackType, payload = {}) {
    const message = payload.message || payload.prompt || "";
    const analysis = payload.analysis || analyzeQuestion(message, { subject: payload.subject });
    const practice = generatePracticeQuestion(analysis, message);

    if (feedbackType === "understood") {
      return [
        "Nice. I will remember that this teaching style worked for this topic.",
        "",
        `Try this next: ${practice}`
      ].join("\n");
    }

    if (feedbackType === "simpler") {
      return [
        "### Simpler Version",
        "",
        "Let's shrink the idea into smaller pieces.",
        "",
        `1. The topic is **${analysis.topic}**.`,
        `2. The main goal is to understand **${analysis.subTopic || analysis.questionType}**.`,
        "3. Focus on one rule or relationship first, then apply it to the question.",
        "",
        "_Send the part that feels confusing, and I will explain only that part._"
      ].join("\n");
    }

    if (feedbackType === "examples") {
      return [
        "### More Examples",
        "",
        `Example 1: ${practice}`,
        "",
        `Example 2: Create your own similar question by changing the numbers or place names, but keeping the same idea: **${analysis.topic}**.`,
        "",
        "_Examples work best when the pattern stays the same but the details change._"
      ].join("\n");
    }

    return [
      "### Let's Break It Down",
      "",
      `We will restart from the smallest idea: **${analysis.topic}**.`,
      "",
      "Tell me which part is confusing:",
      "",
      "- the meaning of the question",
      "- the rule/formula",
      "- the first step",
      "- the final answer",
      "",
      "_I will reteach that exact part slowly._"
    ].join("\n");
  }

  function createTeachingDirectives(context) {
    const analysis = context?.analysis || {};
    const confidence = context?.knowledgeConfidence || {};
    const merged = context?.merged || {};
    return [
      `Detected subject: ${analysis.subject || "general"}`,
      `Detected topic: ${analysis.topic || "General Study"}`,
      `Question type: ${analysis.questionType || "explanation"}`,
      `Difficulty: ${analysis.difficulty || "medium"}`,
      `Grade adaptation: ${analysis.gradeLevel || "grade_6_8"}`,
      `Knowledge confidence: ${confidence.confidenceScore ?? 0.7}`,
      `Search needed only if confidence is low or the topic is current: ${Boolean(confidence.requiresAdditionalKnowledge)}`,
      `Recommended strategy: ${merged.recommendedTeachingStrategy || defaultTeachingStrategy(analysis)}`
    ];
  }

  core.registerModule("adaptive", {
    readStore,
    writeStore,
    analyzeQuestion,
    findSimilarPatterns,
    assessKnowledgeConfidence,
    retrieveKnowledge,
    mergeKnowledge,
    buildAdaptiveContext,
    enhanceReply,
    recordInteraction,
    recordFeedback,
    createFeedbackFollowup,
    generatePracticeQuestion,
    createTeachingDirectives,
    vectorize,
    cosineSimilarity
  });
})();
