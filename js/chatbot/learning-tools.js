(function () {
  const core = window.TutorlyChatbot;
  if (!core || core.getModule("learningTools")) return;

  const SUBJECT_PROMPTS = {
    math: {
      practice: [
        "Solve a similar problem using the same method.",
        "Change one number and solve it again.",
        "Explain why the final answer makes sense."
      ],
      flashcard: "Formula or method",
      check: "Can you identify the operation needed before calculating?"
    },
    science: {
      practice: [
        "Name the process in your own words.",
        "Give one real-life example of the concept.",
        "Explain what would happen if one condition changed."
      ],
      flashcard: "Definition",
      check: "Can you connect the concept to an observable example?"
    },
    english: {
      practice: [
        "Rewrite the sentence in simpler words.",
        "Find the main idea in one line.",
        "Use the new word in your own sentence."
      ],
      flashcard: "Meaning",
      check: "Can you explain the tone or purpose of the sentence?"
    },
    history: {
      practice: [
        "List one cause and one effect.",
        "Place the event on a simple timeline.",
        "Explain why the event mattered later."
      ],
      flashcard: "Event and impact",
      check: "Can you connect cause, event, and result?"
    },
    geography: {
      practice: [
        "Locate the place by continent and region.",
        "Name one physical feature connected to it.",
        "Explain how location affects people there."
      ],
      flashcard: "Place and location",
      check: "Can you describe where it is without only naming the country?"
    },
    general: {
      practice: [
        "Explain the idea in your own words.",
        "Give one example and one non-example.",
        "Turn the answer into a three-line revision note."
      ],
      flashcard: "Key idea",
      check: "Can you teach the answer to someone younger?"
    }
  };

  function extractHeading(text) {
    const match = String(text || "").match(/^#{1,3}\s+(.+)$/m);
    return match ? core.truncate(match[1], 60) : "Study topic";
  }

  function extractKeyLines(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.replace(/^[-*>#\d.\s]+/, "").trim())
      .filter((line) => line.length > 24 && !/^```/.test(line))
      .slice(0, 8);
  }

  function createPracticeQuestions(subject, topic, answerText) {
    const config = SUBJECT_PROMPTS[subject] || SUBJECT_PROMPTS.general;
    const keyLines = extractKeyLines(answerText);
    return config.practice.map((prompt, index) => ({
      id: core.uid("practice"),
      title: `Practice ${index + 1}`,
      prompt: `${prompt} Topic: ${topic}.`,
      hint: keyLines[index] ? core.truncate(keyLines[index], 110) : "Look back at the main explanation and copy the method.",
      difficulty: index === 0 ? "easy" : index === 1 ? "medium" : "challenge"
    }));
  }

  function createFlashcards(subject, topic, answerText) {
    const config = SUBJECT_PROMPTS[subject] || SUBJECT_PROMPTS.general;
    const keyLines = extractKeyLines(answerText);
    const cards = keyLines.slice(0, 4).map((line, index) => ({
      id: core.uid("card"),
      front: index === 0 ? `${config.flashcard}: ${topic}` : `Key point ${index + 1}`,
      back: core.truncate(line, 150)
    }));

    if (!cards.length) {
      cards.push({
        id: core.uid("card"),
        front: `${config.flashcard}: ${topic}`,
        back: "Review the answer, then write the idea in your own words."
      });
    }

    return cards;
  }

  function createKnowledgeCheck(subject, topic, answerText) {
    const config = SUBJECT_PROMPTS[subject] || SUBJECT_PROMPTS.general;
    const keyLines = extractKeyLines(answerText);
    return {
      id: core.uid("check"),
      question: config.check,
      topic,
      suggestedAnswer: keyLines[0] ? core.truncate(keyLines[0], 180) : "Use the main explanation as your answer.",
      confidenceTarget: "Explain it without looking for 30 seconds."
    };
  }

  function createLearningPath(subject, topic) {
    return [
      {
        id: core.uid("path"),
        title: "Understand",
        detail: `Read the explanation for ${topic} once without memorizing.`
      },
      {
        id: core.uid("path"),
        title: "Apply",
        detail: "Solve one similar question using the same structure."
      },
      {
        id: core.uid("path"),
        title: "Recall",
        detail: "Close the note and explain the topic in three short lines."
      }
    ];
  }

  function generateToolkit({ subject = "general", userMessage = "", assistantReply = "", model = "prime" }) {
    const topic = extractHeading(assistantReply) || core.truncate(userMessage, 40) || "Study topic";
    return {
      id: core.uid("toolkit"),
      model,
      subject,
      topic,
      createdAt: core.now(),
      practiceQuestions: createPracticeQuestions(subject, topic, assistantReply),
      flashcards: createFlashcards(subject, topic, assistantReply),
      knowledgeCheck: createKnowledgeCheck(subject, topic, assistantReply),
      learningPath: createLearningPath(subject, topic)
    };
  }

  function renderToolkitHtml(toolkit) {
    if (!toolkit) return "";
    const practice = toolkit.practiceQuestions.map((item) => `<li><strong>${item.title}</strong><span>${item.prompt}</span><em>${item.hint}</em></li>`).join("");
    const cards = toolkit.flashcards.map((card) => `<li><strong>${card.front}</strong><span>${card.back}</span></li>`).join("");
    const path = toolkit.learningPath.map((step) => `<li><strong>${step.title}</strong><span>${step.detail}</span></li>`).join("");
    return `
      <section class="study-toolkit">
        <header>
          <p>${toolkit.subject}</p>
          <h3>${toolkit.topic}</h3>
        </header>
        <div class="study-toolkit-grid">
          <article>
            <h4>Practice</h4>
            <ol>${practice}</ol>
          </article>
          <article>
            <h4>Flashcards</h4>
            <ol>${cards}</ol>
          </article>
          <article>
            <h4>Knowledge check</h4>
            <p>${toolkit.knowledgeCheck.question}</p>
            <em>${toolkit.knowledgeCheck.suggestedAnswer}</em>
          </article>
          <article>
            <h4>Learning path</h4>
            <ol>${path}</ol>
          </article>
        </div>
      </section>
    `;
  }

  core.registerModule("learningTools", {
    generateToolkit,
    renderToolkitHtml
  });
})();
