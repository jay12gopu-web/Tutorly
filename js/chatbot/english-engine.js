(function () {
  if (window.TutorlyEnglishEngine) return;

  const MIN_LOCAL_CONFIDENCE = 0.75;

  const CATEGORY_DEFINITIONS = [
    {
      id: "summary",
      area: "Literature",
      subtopic: "Summary",
      patterns: [/\bsummar(?:y|ize|ise)\b/, /\bbrief account\b/, /\bgist\b/, /\bshort note\b/]
    },
    {
      id: "theme",
      area: "Literature",
      subtopic: "Theme",
      patterns: [/\btheme\b/, /\bcentral idea\b/, /\bmessage\b/, /\bmoral\b/, /\blesson\b/]
    },
    {
      id: "character",
      area: "Literature",
      subtopic: "Character Analysis",
      patterns: [/\bcharacter sketch\b/, /\bdescribe (?:the )?character\b/, /\bqualities\b/, /\btraits\b/, /\bpersonality\b/]
    },
    {
      id: "plot",
      area: "Literature",
      subtopic: "Plot Analysis",
      patterns: [/\bplot\b/, /\bstory events\b/, /\bclimax\b/, /\bconflict\b/, /\bresolution\b/]
    },
    {
      id: "literary_device",
      area: "Literature",
      subtopic: "Literary Device",
      patterns: [/\bmetaphor\b/, /\bsimile\b/, /\bimagery\b/, /\bpersonification\b/, /\balliteration\b/, /\bhyperbole\b/, /\birony\b/]
    },
    {
      id: "poetry",
      area: "Literature",
      subtopic: "Poetry Analysis",
      patterns: [/\btone\b/, /\bmood\b/, /\brhyme scheme\b/, /\bpoetic devices?\b/, /\bpoem analysis\b/, /\banaly[sz]e (?:the )?poem\b/]
    },
    {
      id: "author_purpose",
      area: "Literature",
      subtopic: "Author Purpose",
      patterns: [/\bauthor'?s purpose\b/, /\bwriter'?s intention\b/, /\bviewpoint\b/, /\bpoint of view\b/]
    },
    {
      id: "extract",
      area: "Literature",
      subtopic: "Extract Analysis",
      patterns: [/\bread the passage\b/, /\bextract\b/, /\bsignificance\b/, /\blines from (?:the )?poem\b/, /\bexplain these lines\b/]
    },
    {
      id: "parts_of_speech",
      area: "Grammar",
      subtopic: "Parts of Speech",
      patterns: [/\bparts? of speech\b/, /\bnoun\b/, /\bpronoun\b/, /\badjective\b/, /\badverb\b/, /\bverb\b/, /\bpreposition\b/, /\bconjunction\b/]
    },
    {
      id: "tense",
      area: "Grammar",
      subtopic: "Tense",
      patterns: [/\bpast tense\b/, /\bpresent tense\b/, /\bfuture tense\b/, /\bidentify tense\b/, /\btense of\b/, /\bchange .* tense\b/]
    },
    {
      id: "subject_verb",
      area: "Grammar",
      subtopic: "Subject-Verb Agreement",
      patterns: [/\bsubject[- ]verb agreement\b/, /\bcorrect verb\b/, /\bchoose the verb\b/, /\bverb agrees\b/]
    },
    {
      id: "voice",
      area: "Grammar",
      subtopic: "Active and Passive Voice",
      patterns: [/\bactive voice\b/, /\bpassive voice\b/, /\bchange .* passive\b/, /\bchange .* active\b/]
    },
    {
      id: "speech",
      area: "Grammar",
      subtopic: "Direct and Indirect Speech",
      patterns: [/\breported speech\b/, /\bdirect speech\b/, /\bindirect speech\b/, /\bchange .* narration\b/]
    },
    {
      id: "article",
      area: "Grammar",
      subtopic: "Articles",
      patterns: [/\barticle\b/, /\bfill .* (?:a|an|the)\b/, /\buse (?:a|an|the)\b/, /\bchoose (?:a|an|the)\b/]
    },
    {
      id: "preposition",
      area: "Grammar",
      subtopic: "Prepositions",
      patterns: [/\bfill .* preposition\b/, /\bsuitable preposition\b/, /\bcorrect preposition\b/, /\bpreposition\b/]
    },
    {
      id: "conjunction",
      area: "Grammar",
      subtopic: "Conjunctions",
      patterns: [/\bjoin sentences\b/, /\bcombine .* sentence\b/, /\bconjunction\b/, /\busing (?:and|but|because|although|so)\b/]
    },
    {
      id: "pronoun",
      area: "Grammar",
      subtopic: "Pronouns",
      patterns: [/\breplace .* noun\b/, /\bidentify pronoun\b/, /\bpronoun\b/, /\bpersonal pronoun\b/]
    },
    {
      id: "modal",
      area: "Grammar",
      subtopic: "Modals",
      patterns: [/\bmodals?\b/, /\bchoose (?:can|could|should|may|might|must)\b/, /\bfill .* (?:can|could|should|may|might|must)\b/, /\buse (?:can|could|should|may|might|must)\b/, /\b(?:can|could|should|may|might|must)\s+or\s+(?:can|could|should|may|might|must)\b/]
    },
    {
      id: "transformation",
      area: "Grammar",
      subtopic: "Sentence Transformation",
      patterns: [/\brewrite\b/, /\btransformation\b/, /\bchange degree\b/, /\bcombine\b/, /\bchange into\b/]
    },
    {
      id: "error_correction",
      area: "Grammar",
      subtopic: "Error Correction",
      patterns: [/\bfind (?:the )?error\b/, /\bcorrect (?:the )?sentence\b/, /\bspot (?:the )?mistake\b/, /\bfix (?:this )?sentence\b/, /\bimprove (?:this )?sentence\b/]
    },
    {
      id: "punctuation",
      area: "Grammar",
      subtopic: "Punctuation and Capitalization",
      patterns: [/\bpunctuation\b/, /\bpunctuate\b/, /\bcapitali[sz]ation\b/, /\bcapital letters?\b/]
    },
    {
      id: "vocabulary",
      area: "Grammar",
      subtopic: "Vocabulary",
      patterns: [/\bsynonym\b/, /\bantonym\b/, /\bidiom\b/, /\bphrase\b/, /\bone[- ]word substitution\b/, /\bhomophone\b/, /\bmeaning of\b/]
    },
    {
      id: "writing",
      area: "Writing",
      subtopic: "Writing Task",
      patterns: [
        /\bformal letter\b/, /\binformal letter\b/, /\bemail writing\b/, /\bwrite an? email\b/,
        /\bessay\b/, /\barticle writing\b/, /\breport writing\b/, /\bspeech writing\b/,
        /\bdebate\b/, /\bnotice writing\b/, /\bstory writing\b/, /\bdiary entry\b/,
        /\bparagraph writing\b/, /\bwrite (?:a|an|the)\b/
      ]
    }
  ];

  const DEVICE_DEFINITIONS = {
    metaphor: {
      definition: "A metaphor compares two things directly without using like or as.",
      effect: "It makes an idea feel stronger, clearer, or more imaginative."
    },
    simile: {
      definition: "A simile compares two things using like or as.",
      effect: "It helps the reader picture the idea quickly."
    },
    imagery: {
      definition: "Imagery uses sensory details to help readers see, hear, feel, taste, or smell something.",
      effect: "It makes the scene more vivid."
    },
    personification: {
      definition: "Personification gives human qualities to non-human things.",
      effect: "It makes objects, nature, or ideas feel alive."
    },
    alliteration: {
      definition: "Alliteration repeats the same beginning sound in nearby words.",
      effect: "It creates rhythm and makes a line memorable."
    },
    hyperbole: {
      definition: "Hyperbole is deliberate exaggeration.",
      effect: "It adds emphasis, humor, or strong emotion."
    },
    irony: {
      definition: "Irony happens when the real meaning is different from what is expected or said.",
      effect: "It creates surprise, humor, or criticism."
    }
  };

  const WRITING_FORMS = {
    "formal letter": {
      format: "Sender's address, date, receiver's address, subject, salutation, body, closing, signature.",
      guideline: "Use polite language, a clear purpose, and short organized paragraphs.",
      sample: "Subject: Request for Library Improvement\n\nRespected Sir/Madam,\nI request you to improve the school library facilities so students can access more updated books and study resources.\n\nYours faithfully,\nStudent Name",
      tip: "Keep the tone respectful and avoid slang."
    },
    "informal letter": {
      format: "Address, date, greeting, friendly body, warm closing, name.",
      guideline: "Write naturally, as if speaking to a friend or family member.",
      sample: "Dear Riya,\nI hope you are doing well. I wanted to tell you about my recent school event. It was exciting, and I learned many new things.\n\nWith love,\nYour friend",
      tip: "A personal tone is expected, but grammar still matters."
    },
    "email": {
      format: "To, subject, greeting, body, closing.",
      guideline: "Make the subject specific and keep the message direct.",
      sample: "Subject: Doubt About Homework\n\nDear Teacher,\nI have a doubt about question 4 in today's homework. Could you please explain it once more?\n\nThank you,\nStudent Name",
      tip: "Emails should be clear enough to understand at first reading."
    },
    "essay": {
      format: "Introduction, body paragraphs, conclusion.",
      guideline: "Start with the main idea, support it with points, and end with a clear conclusion.",
      sample: "Education helps people develop knowledge, confidence, and discipline. It prepares students for future responsibilities and improves society.",
      tip: "One paragraph should usually explain one main point."
    },
    "article": {
      format: "Title, byline, introduction, main points, conclusion.",
      guideline: "Use an engaging opening and organize ideas with clear paragraphs.",
      sample: "The Importance of Reading\nBy Student Name\n\nReading improves vocabulary, imagination, and concentration. It also helps students understand the world better.",
      tip: "A strong title makes the article feel complete."
    },
    "report": {
      format: "Title, date/place, factual details, conclusion.",
      guideline: "Write facts clearly and avoid emotional exaggeration.",
      sample: "Report on Cleanliness Drive\nA cleanliness drive was organized in the school on Monday. Students cleaned the campus and learned the importance of hygiene.",
      tip: "Reports should sound factual, not like a story."
    },
    "speech": {
      format: "Greeting, introduction, key points, conclusion, thank you.",
      guideline: "Use clear sentences that are easy to speak aloud.",
      sample: "Good morning everyone. Today I would like to speak about the importance of discipline. Discipline helps us manage time and achieve our goals.",
      tip: "Read your speech aloud to check flow."
    },
    "debate": {
      format: "Opening, stance, arguments, counterpoint, conclusion.",
      guideline: "State whether you are for or against the topic and support your stance.",
      sample: "I strongly support the motion. Technology in education makes learning faster, more visual, and more accessible.",
      tip: "A debate answer should sound confident and logical."
    },
    "notice": {
      format: "School/organization name, NOTICE, date, title, body, signature.",
      guideline: "Keep it short, formal, and complete with time, date, venue, and purpose.",
      sample: "NOTICE\nInter-House Quiz Competition\nStudents are informed that an inter-house quiz competition will be held on Friday at 10 a.m. in the auditorium.",
      tip: "A notice is usually brief and does not use first-person storytelling."
    },
    "story": {
      format: "Beginning, problem, events, climax, ending.",
      guideline: "Build a clear conflict and finish with a meaningful ending.",
      sample: "One rainy evening, Aarav found a lost notebook near the school gate. What he discovered inside changed the way he saw his classmates.",
      tip: "Good stories show events instead of only explaining them."
    },
    "diary": {
      format: "Date, day, time, personal entry.",
      guideline: "Write feelings honestly in first person.",
      sample: "Today was a memorable day. I felt nervous at first, but after speaking on stage, I became proud of myself.",
      tip: "Diary entries should feel personal."
    },
    "paragraph": {
      format: "Topic sentence, supporting details, closing sentence.",
      guideline: "Stay on one topic and avoid unrelated ideas.",
      sample: "Discipline is important for students because it helps them use time wisely and stay focused on goals.",
      tip: "A paragraph should feel like one complete thought."
    }
  };

  const VOCABULARY_BANK = {
    brave: { synonym: "courageous", antonym: "cowardly", example: "The brave student answered confidently." },
    happy: { synonym: "joyful", antonym: "sad", example: "She felt happy after winning the prize." },
    quick: { synonym: "fast", antonym: "slow", example: "He gave a quick reply." },
    honest: { synonym: "truthful", antonym: "dishonest", example: "An honest person tells the truth." },
    ancient: { synonym: "old", antonym: "modern", example: "The ancient temple is famous." },
    huge: { synonym: "enormous", antonym: "tiny", example: "They saw a huge building." }
  };

  function normalizeText(text) {
    return String(text || "").toLowerCase().replace(/[^\w\s'"?:;.,-]/g, " ").replace(/\s+/g, " ").trim();
  }

  function titleCase(value) {
    return String(value || "")
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  function cleanText(value, fallback = "") {
    const text = String(value ?? "").trim();
    if (!text || text === "undefined" || text === "null") return fallback;
    return text;
  }

  function asList(items) {
    return (Array.isArray(items) ? items : [items])
      .map((item) => cleanText(item))
      .filter(Boolean);
  }

  function extractQuotedText(text) {
    const quoted = String(text || "").match(/["'“‘]([^"'”’]+)["'”’]/);
    return quoted ? quoted[1].trim() : "";
  }

  function extractAfterPrompt(text) {
    const raw = String(text || "").trim();
    const quoted = extractQuotedText(raw);
    if (quoted) return quoted;
    if (raw.includes(":")) return raw.split(":").slice(1).join(":").trim();
    return raw;
  }

  function detectWritingForm(text) {
    const value = normalizeText(text);
    if (/\bformal letter\b/.test(value)) return "formal letter";
    if (/\binformal letter\b/.test(value)) return "informal letter";
    if (/\bemail\b/.test(value)) return "email";
    if (/\bessay\b/.test(value)) return "essay";
    if (/\barticle\b/.test(value)) return "article";
    if (/\breport\b/.test(value)) return "report";
    if (/\bspeech\b/.test(value)) return "speech";
    if (/\bdebate\b/.test(value)) return "debate";
    if (/\bnotice\b/.test(value)) return "notice";
    if (/\bstory\b/.test(value)) return "story";
    if (/\bdiary\b/.test(value)) return "diary";
    if (/\bparagraph\b/.test(value)) return "paragraph";
    return "essay";
  }

  function detectDevice(text) {
    const value = normalizeText(text);
    return Object.keys(DEVICE_DEFINITIONS).find((device) => value.includes(device)) || "metaphor";
  }

  function detectTargetWord(text) {
    const quoted = extractQuotedText(text);
    if (quoted && quoted.split(/\s+/).length <= 3) return quoted.toLowerCase();
    const value = normalizeText(text);
    const afterOf = value.match(/\b(?:synonym|antonym|meaning|homophone) of ([a-z-]+)/);
    if (afterOf) return afterOf[1];
    const words = value.split(/\s+/).filter((word) => /^[a-z-]+$/.test(word));
    return words[words.length - 1] || "";
  }

  function simpleSentenceFix(sentence) {
    let fixed = cleanText(sentence);
    if (!fixed) return "";
    fixed = fixed.replace(/\bi\b/g, "I");
    fixed = fixed.replace(/\bI has\b/g, "I have");
    fixed = fixed.replace(/\bhe go\b/gi, "he goes");
    fixed = fixed.replace(/\bshe go\b/gi, "she goes");
    fixed = fixed.replace(/\bit do\b/gi, "it does");
    fixed = fixed.replace(/\ba ([aeiou])/gi, "an $1");
    fixed = fixed.replace(/\ban ([^aeiou\s])/gi, "a $1");
    fixed = fixed.replace(/\s+([,.!?])/g, "$1");
    fixed = fixed.replace(/\s+/g, " ").trim();
    fixed = fixed.charAt(0).toUpperCase() + fixed.slice(1);
    if (!/[.!?]$/.test(fixed)) fixed += ".";
    return fixed;
  }

  function classify(text) {
    const value = normalizeText(text);
    if (!value) return { isEnglish: false, confidence: 0, category: null };

    const scored = CATEGORY_DEFINITIONS.map((category) => {
      const matches = category.patterns.reduce((sum, pattern) => sum + (pattern.test(value) ? 1 : 0), 0);
      const contextBoost = /\b(english|grammar|literature|poem|story|sentence|writing|write|passage|novel|chapter)\b/.test(value) ? 0.1 : 0;
      return {
        ...category,
        matches,
        confidence: Math.min(0.98, matches ? 0.66 + matches * 0.16 + contextBoost : 0)
      };
    }).sort((a, b) => b.confidence - a.confidence);

    const best = scored[0];
    if (!best || best.confidence < 0.55) return { isEnglish: false, confidence: 0, category: null };
    return {
      isEnglish: true,
      confidence: best.confidence,
      category: best.id,
      area: best.area,
      subtopic: best.subtopic
    };
  }

  function createResponse({ category, area, subtopic, confidence, sections, finalAnswer, examTip, practice }) {
    return {
      topic: "English",
      area: cleanText(area, "English"),
      subtopic: cleanText(subtopic, "English Practice"),
      category: cleanText(category, "english"),
      understanding: cleanText(sections?.understanding, "The question is asking for an English explanation or correction."),
      givenInfo: asList(sections?.givenInfo || sections?.analysis?.slice?.(0, 2) || "The important words, sentence, passage, or writing task are given in the question."),
      conceptRule: cleanText(sections?.conceptRule, defaultConceptRule(category, area)),
      analysis: asList(sections?.analysis),
      steps: asList(sections?.steps),
      finalAnswer: cleanText(finalAnswer, "Use a clear, correct, and complete English answer."),
      whyThisWorks: cleanText(sections?.whyThisWorks, defaultWhyThisWorks(category, area)),
      commonMistakes: asList(sections?.commonMistakes || defaultCommonMistakes(category, area)),
      examTip: cleanText(examTip, "Keep your answer clear, specific, and supported by the question."),
      practice: cleanText(practice, "Write one similar sentence or answer using the same rule."),
      confidence: Math.max(0, Math.min(1, Number(confidence) || 0))
    };
  }

  function defaultConceptRule(category, area) {
    if (area === "Literature") {
      if (category === "literary_device") return "Identify the device, define it, then explain the effect it creates in the line.";
      if (category === "summary") return "A summary keeps only the main idea, key events, and result without personal opinion.";
      return "A literature answer should connect meaning, evidence, and effect.";
    }
    if (area === "Writing") return "Use the correct format, suitable tone, organized paragraphs, and accurate grammar.";
    if (category === "tense") return "Tense is identified from the verb form and the time of the action.";
    if (category === "voice") return "Voice changes focus between the doer of the action and the receiver of the action.";
    if (category === "speech") return "Reported speech keeps meaning but changes quotation, pronouns, tense, and time words when needed.";
    if (category === "error_correction") return "Correct the sentence by checking subject-verb agreement, tense, articles, punctuation, and word order.";
    return "Apply the grammar rule first, then prove the answer with the sentence.";
  }

  function defaultWhyThisWorks(category, area) {
    if (area === "Literature") return "This works because the answer is supported by the text, not just personal opinion.";
    if (area === "Writing") return "This works because the format, tone, and content match the writing task.";
    if (category === "vocabulary") return "This works because the answer matches the meaning and can be tested in a sentence.";
    return "This works because the rule explains why the chosen answer is grammatically correct.";
  }

  function defaultCommonMistakes(category, area) {
    if (area === "Literature") return ["Giving only a plot summary when the question asks for analysis.", "Writing opinions without evidence from the text.", "Forgetting to connect the answer to the theme or character."];
    if (area === "Writing") return ["Using the wrong format.", "Mixing formal and informal tone.", "Writing one huge paragraph without clear organization."];
    if (category === "tense") return ["Looking only at time words and ignoring the verb form.", "Mixing two tenses in one sentence without reason."];
    if (category === "voice") return ["Changing the tense while changing voice.", "Forgetting the past participle form of the verb."];
    if (category === "speech") return ["Forgetting pronoun changes.", "Keeping quotation marks in indirect speech."];
    return ["Giving the answer without explaining the rule.", "Ignoring punctuation or capitalization.", "Not checking whether the sentence sounds complete."];
  }

  function literatureSolver(text, classification) {
    const passage = extractAfterPrompt(text);
    const hasUsefulText = passage.length > 40;
    const subject = hasUsefulText ? passage.slice(0, 160) : "the given text";
    const category = classification.category;

    if (category === "summary") {
      return createResponse({
        ...classification,
        sections: {
          understanding: "The question asks you to reduce the text to its main idea and most important events.",
          conceptRule: "A summary should include the main idea, key events, and final result in your own words.",
          analysis: [
            hasUsefulText ? `Main idea: ${subject}${passage.length > 160 ? "..." : ""}` : "Main idea: identify what the text is mostly about.",
            "Key events: keep only the events that change the situation or reveal the message.",
            "Avoid small details unless they are needed to understand the ending."
          ],
          steps: [
            "Read the text once to understand the overall situation.",
            "Pick the main character, central problem, and important result.",
            "Rewrite the idea in your own words without copying long lines."
          ]
        },
        finalAnswer: hasUsefulText
          ? `Final summary: ${passage.length > 220 ? passage.slice(0, 220).trim() + "..." : passage}`
          : "A good summary should state the main idea, the key events, and the final result in a few clear sentences.",
        examTip: "Do not add personal opinion in a summary unless the question asks for it.",
        practice: "Summarize one paragraph from your textbook in three sentences.",
        confidence: classification.confidence
      });
    }

    if (category === "theme") {
      return createResponse({
        ...classification,
        sections: {
          understanding: "The question asks for the deeper message or lesson behind the text.",
          conceptRule: "A theme is the central message of a text, written as a complete idea rather than one word.",
          analysis: ["Theme is not just the topic; it is what the writer says about that topic.", "Support the theme with one event, line, or character action."],
          steps: ["Find the repeated idea.", "Connect it to the character's experience.", "Write the theme as a complete sentence."]
        },
        finalAnswer: "The theme is the central message of the text, supported by events, character choices, and the ending.",
        examTip: "Write theme as a sentence, not one word. For example: Courage helps people face difficult situations.",
        practice: "Pick a story you know and write its theme in one sentence.",
        confidence: classification.confidence
      });
    }

    if (category === "character") {
      return createResponse({
        ...classification,
        sections: {
          understanding: "The question asks you to describe a character's personality and prove it with evidence.",
          conceptRule: "A character analysis explains traits and supports them using actions, words, thoughts, or reactions.",
          analysis: ["A strong character sketch includes traits, actions, speech, and relationships.", "Evidence can come from what the character says, does, thinks, or how others react."],
          steps: ["Name the character.", "Choose two or three major traits.", "Support each trait with a short example.", "End with the character's importance in the text."]
        },
        finalAnswer: "A character analysis should explain the character's main traits and show how those traits affect the story.",
        examTip: "Do not only list adjectives. Add evidence after each trait.",
        practice: "Write three traits of a character from your current lesson and give one example for each.",
        confidence: classification.confidence
      });
    }

    if (category === "plot") {
      return createResponse({
        ...classification,
        sections: {
          understanding: "The question asks how the events of the story are arranged.",
          conceptRule: "Plot analysis follows the story from beginning to conflict, climax, and resolution.",
          analysis: ["Plot usually moves from beginning to conflict, climax, and resolution.", "The climax is the turning point where the main problem reaches its highest tension."],
          steps: ["Beginning: introduce setting and characters.", "Rising action: explain the problem and events.", "Climax: identify the turning point.", "Resolution: explain how the problem ends."]
        },
        finalAnswer: "Plot analysis explains the order of events and how the conflict is finally resolved.",
        examTip: "When writing plot, keep events in correct order.",
        practice: "Write the beginning, climax, and ending of a story you recently read.",
        confidence: classification.confidence
      });
    }

    if (category === "literary_device") {
      const device = detectDevice(text);
      const info = DEVICE_DEFINITIONS[device];
      return createResponse({
        ...classification,
        sections: {
          understanding: `The question asks about ${device}, a literary device used to create meaning or effect.`,
          conceptRule: info.definition,
          analysis: [`Definition: ${info.definition}`, `Example: The classroom was a zoo.`, `Effect: ${info.effect}`],
          steps: ["Identify the device in the line.", "Explain the literal meaning.", "Explain what feeling, image, or idea it creates."]
        },
        finalAnswer: `${titleCase(device)} is used to make the writing more expressive and meaningful.`,
        examTip: "Always write both the device name and its effect.",
        practice: `Create one sentence using ${device}.`,
        confidence: classification.confidence
      });
    }

    if (category === "poetry") {
      return createResponse({
        ...classification,
        sections: {
          understanding: "The question asks you to explain how the poem creates meaning through ideas, tone, mood, and devices.",
          conceptRule: "Poetry analysis connects theme, tone, mood, sound, and poetic devices to the poem's meaning.",
          analysis: ["Theme: the main idea of the poem.", "Tone: the poet's attitude.", "Mood: the feeling created in the reader.", "Devices: techniques like imagery, rhyme, metaphor, or alliteration."],
          steps: ["Read the poem for meaning.", "Identify the speaker and situation.", "Notice repeated images or words.", "Connect devices to the poem's message."]
        },
        finalAnswer: "A poem analysis should explain the poem's meaning, tone, mood, and important poetic devices.",
        examTip: "Quote a short phrase from the poem when possible.",
        practice: "Choose two lines from a poem and identify one poetic device.",
        confidence: classification.confidence
      });
    }

    if (category === "author_purpose") {
      return createResponse({
        ...classification,
        sections: {
          understanding: "The question asks why the author wrote the text.",
          conceptRule: "Author purpose is the reason for writing, such as to inform, persuade, entertain, describe, or criticize.",
          analysis: ["Common purposes include to inform, entertain, persuade, describe, or criticize.", "Evidence comes from tone, word choice, and the message of the text."],
          steps: ["Identify the main idea.", "Look at the author's tone.", "Decide whether the writer informs, persuades, entertains, or reflects.", "Support the answer with evidence."]
        },
        finalAnswer: "The author's purpose is the reason behind the writing, proven through the content and style.",
        examTip: "Use the phrase: The author aims to... because...",
        practice: "Read a short paragraph and decide whether it informs, persuades, or entertains.",
        confidence: classification.confidence
      });
    }

    return createResponse({
      ...classification,
      sections: {
        understanding: "The question asks you to explain the context, meaning, and importance of an extract.",
        conceptRule: "Extract analysis explains where the lines appear, what they mean, and why they matter.",
        analysis: ["Context: where the extract appears.", "Meaning: what the lines say in simple words.", "Importance: why the lines matter to the lesson, theme, or character."],
        steps: ["Identify who is speaking or what is happening.", "Explain the lines in simple English.", "Connect the extract to the larger text."]
      },
      finalAnswer: "An extract analysis explains context, meaning, and importance clearly.",
      examTip: "Do not explain only the dictionary meaning; connect the extract to the chapter or poem.",
      practice: "Take two lines from your lesson and write their context and meaning.",
      confidence: classification.confidence
    });
  }

  function grammarSolver(text, classification) {
    const source = extractAfterPrompt(text);
    const value = normalizeText(text);

    if (classification.category === "parts_of_speech") {
      const word = detectTargetWord(text) || "the selected word";
      let type = "part of speech";
      if (/\bnoun\b/.test(value)) type = "noun";
      else if (/\bpronoun\b/.test(value)) type = "pronoun";
      else if (/\badjective\b/.test(value)) type = "adjective";
      else if (/\badverb\b/.test(value)) type = "adverb";
      else if (/\bverb\b/.test(value)) type = "verb";
      else if (/\bpreposition\b/.test(value)) type = "preposition";
      else if (/\bconjunction\b/.test(value)) type = "conjunction";
      return createResponse({
        ...classification,
        sections: {
          understanding: "The question asks you to identify the job of a word in a sentence.",
          analysis: [`Word: ${word}`, `Type: ${type}`, "A part of speech depends on how the word is used in the sentence."],
          steps: ["Find the word.", "Check what job it does.", "Name the part of speech and explain why."]
        },
        finalAnswer: `${titleCase(word)} is treated as a ${type} in this question.`,
        examTip: "Always look at the sentence, not only the word alone.",
        practice: "Identify the parts of speech in: The bright bird sang sweetly.",
        confidence: classification.confidence
      });
    }

    if (classification.category === "tense") {
      const tense = /\bwill\b/.test(value) ? "Simple Future Tense" : /\b(was|were|went|played|did|had)\b/.test(value) ? "Past Tense" : /\b(is|am|are|goes|plays|do|does|has|have)\b/.test(value) ? "Present Tense" : "Tense depends on the verb form";
      return createResponse({
        ...classification,
        sections: {
          understanding: "The question asks when the action happens.",
          analysis: [`Tense name: ${tense}`, "The verb form shows time: past, present, or future."],
          steps: ["Find the main verb.", "Check whether it shows past, present, or future.", "Name the tense and explain the verb form."]
        },
        finalAnswer: `The answer is: ${tense}.`,
        examTip: "Underline the main verb first; tense questions become much easier.",
        practice: "Identify the tense: She will complete her homework.",
        confidence: classification.confidence
      });
    }

    if (classification.category === "subject_verb") {
      const corrected = simpleSentenceFix(source);
      return createResponse({
        ...classification,
        sections: {
          understanding: "The question asks you to choose a verb that matches the subject.",
          analysis: ["Singular subjects usually take singular verbs.", "Plural subjects usually take plural verbs.", corrected ? `Corrected sentence: ${corrected}` : "Find whether the subject is singular or plural before choosing the verb."],
          steps: ["Identify the subject.", "Decide if it is singular or plural.", "Choose the matching verb form."]
        },
        finalAnswer: corrected || "Use the verb form that agrees with the subject.",
        examTip: "Words between the subject and verb usually do not change the agreement.",
        practice: "Choose the correct verb: The list of items is/are on the desk.",
        confidence: classification.confidence
      });
    }

    if (classification.category === "voice") {
      return createResponse({
        ...classification,
        sections: {
          understanding: "The question asks you to change between active voice and passive voice.",
          analysis: ["Active voice: the subject does the action.", "Passive voice: the subject receives the action.", "Rule: object + helping verb + past participle + by + subject."],
          steps: ["Find subject, verb, and object.", "Move the object to the subject position.", "Use the correct form of be plus past participle.", "Add by if the doer is needed."]
        },
        finalAnswer: "Active-passive conversion changes focus from the doer to the receiver of the action.",
        examTip: "Keep the tense same while changing the voice.",
        practice: "Change to passive voice: The teacher praised the student.",
        confidence: classification.confidence
      });
    }

    if (classification.category === "speech") {
      return createResponse({
        ...classification,
        sections: {
          understanding: "The question asks you to change direct speech into reported speech or the reverse.",
          analysis: ["Direct speech uses exact words inside quotation marks.", "Indirect speech reports the meaning without quotation marks.", "Pronouns, tense, and time words may change."],
          steps: ["Identify the reporting verb.", "Remove or add quotation marks as needed.", "Change pronouns and tense carefully.", "Adjust time words like today, tomorrow, and yesterday."]
        },
        finalAnswer: "Reported speech gives the same meaning without quoting the exact words.",
        examTip: "Check pronouns first, then tense, then time expressions.",
        practice: "Change to indirect speech: He said, I am tired.",
        confidence: classification.confidence
      });
    }

    if (classification.category === "article") {
      const phrase = source || text;
      const article = /\b[aeiou]/i.test(phrase.trim()) ? "an" : "a";
      return createResponse({
        ...classification,
        sections: {
          understanding: "The question asks which article fits before a noun.",
          analysis: ["Use a before a consonant sound.", "Use an before a vowel sound.", "Use the for something specific or already known."],
          steps: ["Check the sound at the start of the next word.", "Decide whether the noun is general or specific.", "Choose a, an, or the."]
        },
        finalAnswer: `Use ${article} for a general word starting with that sound; use the if the noun is specific.`,
        examTip: "Article choice depends on sound, not only spelling.",
        practice: "Choose the article: ___ honest man.",
        confidence: classification.confidence
      });
    }

    if (classification.category === "preposition") {
      return createResponse({
        ...classification,
        sections: {
          understanding: "The question asks for a word that shows relation, place, time, or direction.",
          analysis: ["Examples: in, on, at, by, with, from, to.", "Use in for larger time/place, on for surfaces/days, and at for exact points."],
          steps: ["Find the noun or phrase after the blank.", "Decide the relation: place, time, direction, or method.", "Choose the preposition that shows that relation."]
        },
        finalAnswer: "Choose the preposition that correctly shows the relationship in the sentence.",
        examTip: "Common exam set: in a city, on Monday, at 5 p.m.",
        practice: "Fill the preposition: She is good ___ mathematics.",
        confidence: classification.confidence
      });
    }

    if (classification.category === "conjunction") {
      return createResponse({
        ...classification,
        sections: {
          understanding: "The question asks you to connect words, phrases, or sentences.",
          analysis: ["Use and to add.", "Use but to show contrast.", "Use because to show reason.", "Use so to show result."],
          steps: ["Find the relationship between the ideas.", "Choose the conjunction that matches that relationship.", "Read the combined sentence for smoothness."]
        },
        finalAnswer: "The correct conjunction depends on whether the ideas add, contrast, explain a reason, or show a result.",
        examTip: "Do not use because and so together for the same reason-result pair.",
        practice: "Join: It was raining. We stayed inside.",
        confidence: classification.confidence
      });
    }

    if (classification.category === "pronoun") {
      const pronouns = (source.match(/\b(I|me|my|mine|you|he|him|she|her|it|we|us|they|them|his|hers|ours|theirs)\b/gi) || []);
      return createResponse({
        ...classification,
        sections: {
          understanding: "The question asks about a word used in place of a noun.",
          analysis: pronouns.length ? [`Pronoun found: ${pronouns[0]}`, "Pronouns avoid repeating the same noun."] : ["Pronouns include I, you, he, she, it, we, and they.", "They replace nouns in sentences."],
          steps: ["Find the noun being replaced.", "Choose the pronoun that matches number and gender.", "Check whether it is subject or object position."]
        },
        finalAnswer: pronouns.length ? `${pronouns[0]} is a pronoun.` : "A pronoun replaces a noun.",
        examTip: "Pronouns must agree with the noun they replace.",
        practice: "Replace the noun with a pronoun: Riya is reading a book.",
        confidence: classification.confidence
      });
    }

    if (classification.category === "modal") {
      const modal = (value.match(/\b(can|could|should|may|might|must)\b/) || [])[0] || "should";
      const reasons = {
        can: "ability or permission",
        could: "past ability or polite possibility",
        should: "advice or duty",
        may: "permission or possibility",
        might: "weak possibility",
        must: "strong duty or necessity"
      };
      return createResponse({
        ...classification,
        sections: {
          understanding: "The question asks which modal verb fits the meaning.",
          analysis: [`Modal: ${modal}`, `Reason: ${reasons[modal] || "It changes the mood of the main verb."}`],
          steps: ["Understand the meaning needed.", "Choose the modal that matches ability, advice, permission, possibility, or necessity.", "Use base verb after the modal."]
        },
        finalAnswer: `${titleCase(modal)} is used for ${reasons[modal] || "the required meaning"}.`,
        examTip: "After a modal, use the base form of the verb: should go, not should goes.",
        practice: "Choose the modal: You ___ respect your elders.",
        confidence: classification.confidence
      });
    }

    if (classification.category === "transformation") {
      return createResponse({
        ...classification,
        sections: {
          understanding: "The question asks you to rewrite a sentence without changing its meaning.",
          analysis: ["Transformations may change voice, degree, sentence type, or structure.", "Meaning should remain the same."],
          steps: ["Identify the required transformation.", "Keep the core meaning unchanged.", "Apply the grammar rule.", "Check tense and punctuation."]
        },
        finalAnswer: "A correct transformation changes form but preserves meaning.",
        examTip: "After transforming, compare the new sentence with the original meaning.",
        practice: "Rewrite without changing meaning: No other city is as clean as this city.",
        confidence: classification.confidence
      });
    }

    if (classification.category === "punctuation") {
      const corrected = simpleSentenceFix(source);
      return createResponse({
        ...classification,
        sections: {
          understanding: "The question asks you to add correct punctuation and capital letters.",
          analysis: corrected ? [`Corrected sentence: ${corrected}`] : ["Start sentences with capital letters.", "End statements with periods, questions with question marks, and exclamations with exclamation marks."],
          steps: ["Capitalize the first word and proper nouns.", "Add commas where a pause or list is needed.", "End with the correct punctuation mark."]
        },
        finalAnswer: corrected || "Use correct capitalization and punctuation to make the sentence clear.",
        examTip: "Names, places, days, months, and I must be capitalized.",
        practice: "Punctuate: where are you going today",
        confidence: classification.confidence
      });
    }

    if (classification.category === "vocabulary") {
      const word = detectTargetWord(text);
      const entry = VOCABULARY_BANK[word] || { synonym: "clearer word", antonym: "opposite meaning", example: `Use ${word || "the word"} in a meaningful sentence.` };
      const wantsAntonym = /\bantonym\b/.test(value);
      const answer = wantsAntonym ? entry.antonym : entry.synonym;
      return createResponse({
        ...classification,
        sections: {
          understanding: "The question asks for word meaning or word relationship.",
          analysis: [`Word: ${word || "selected word"}`, wantsAntonym ? `Antonym: ${answer}` : `Synonym: ${answer}`, `Example: ${entry.example}`],
          steps: ["Identify the target word.", "Decide whether the question asks for similar meaning, opposite meaning, idiom, or usage.", "Give the answer with one example."]
        },
        finalAnswer: answer,
        examTip: "Use the word in a sentence to confirm the meaning.",
        practice: "Write one synonym and antonym of brave.",
        confidence: classification.confidence
      });
    }

    const corrected = simpleSentenceFix(source);
    return createResponse({
      ...classification,
      sections: {
        understanding: "The question asks you to find and correct a grammar mistake.",
        analysis: corrected ? [`Correct version: ${corrected}`] : ["Check subject-verb agreement, articles, tense, punctuation, and word order."],
        steps: ["Read the sentence once for meaning.", "Find the grammar issue.", "Rewrite the sentence correctly.", "Read it aloud to check smoothness."]
      },
      finalAnswer: corrected || "The corrected sentence should be grammatical, clear, and complete.",
      examTip: "Correct one error at a time instead of rewriting randomly.",
      practice: "Correct this sentence: She go to school everyday.",
      confidence: classification.confidence
    });
  }

  function writingSolver(text, classification) {
    const form = detectWritingForm(text);
    const details = WRITING_FORMS[form] || WRITING_FORMS.essay;
    return createResponse({
      ...classification,
      subtopic: `${titleCase(form)} Writing`,
      sections: {
        understanding: `The question asks you to write or plan a ${form}.`,
        analysis: [`Format: ${details.format}`, `Writing guideline: ${details.guideline}`, `Sample answer: ${details.sample}`],
        steps: ["Understand the topic and audience.", "Use the correct format.", "Write in organized paragraphs.", "Check grammar, punctuation, and tone."]
      },
      finalAnswer: details.sample,
      examTip: details.tip,
      practice: `Write a short ${form} on a topic from your school syllabus.`,
      confidence: classification.confidence
    });
  }

  function solve(text) {
    const classification = classify(text);
    if (!classification.isEnglish) return null;
    if (classification.area === "Literature") return literatureSolver(text, classification);
    if (classification.area === "Writing") return writingSolver(text, classification);
    return grammarSolver(text, classification);
  }

  function renderList(items) {
    return asList(items).map((item) => `- ${item}`).join("\n");
  }

  function renderPrime(response) {
    if (!response || response.confidence < MIN_LOCAL_CONFIDENCE) return "";
    return [
      `# Topic: ${response.topic}`,
      "",
      `## Subtopic: ${response.subtopic}`,
      "",
      "### 1. Understand the Question",
      "",
      response.understanding,
      "",
      "### 2. Identify Given Information",
      "",
      renderList(response.givenInfo),
      "",
      "### 3. Concept or Rule",
      "",
      `_${response.conceptRule}_`,
      "",
      "### 4. Step-by-Step Solution",
      "",
      renderList(response.analysis),
      "",
      renderList(response.steps),
      "",
      "### 5. Final Answer",
      "",
      `**${response.finalAnswer}**`,
      "",
      "### 6. Why This Works",
      "",
      response.whyThisWorks,
      "",
      "### 7. Common Mistakes",
      "",
      renderList(response.commonMistakes),
      "",
      "### 8. Practice Question",
      "",
      response.practice,
      "",
      "### Exam Tip",
      "",
      `_${response.examTip}_`
    ].join("\n");
  }

  function renderSpark(response) {
    if (!response || response.confidence < MIN_LOCAL_CONFIDENCE) return "";
    const quick = response.analysis[0] || response.understanding;
    return [
      `# Topic: ${response.topic}`,
      "",
      "## 1. Understand the Question",
      "",
      response.understanding,
      "",
      "## 2. Concept or Rule",
      "",
      `_${response.conceptRule}_`,
      "",
      "## 3. Quick Steps",
      "",
      quick,
      "",
      "## 4. Final Answer",
      "",
      `**${response.finalAnswer}**`,
      "",
      "## 5. Practice Question",
      "",
      response.practice
    ].join("\n");
  }

  function createReply(text, options = {}) {
    const response = solve(text);
    if (!response || response.confidence < MIN_LOCAL_CONFIDENCE) return "";
    return options.model === "spark" ? renderSpark(response) : renderPrime(response);
  }

  function getConfidentReply(text, model = "prime") {
    return createReply(text, { model });
  }

  window.TutorlyEnglishEngine = {
    classify,
    solve,
    createReply,
    getConfidentReply,
    renderPrime,
    renderSpark,
    minConfidence: MIN_LOCAL_CONFIDENCE,
    categories: CATEGORY_DEFINITIONS.map(({ id, area, subtopic }) => ({ id, area, subtopic }))
  };
})();
