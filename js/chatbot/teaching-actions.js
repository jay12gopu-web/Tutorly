(function (root) {
  "use strict";

  const ACTIONS = Object.freeze({
    another_method: { label: "Try another method", request: "Explain this using a different method from the explanation above." },
    give_example: { label: "Give an example", request: "Walk me through one concrete example of this idea." },
    show_diagram: { label: "View diagram", request: "Show a simple labeled diagram that helps explain this topic, using the diagram in Science View." },
    talk_it_through: { label: "Talk it through" }
  });

  function plainText(value, limit) {
    return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, limit) : "";
  }

  function normalize(actions) {
    if (!Array.isArray(actions)) return [];
    const seen = new Set();
    return actions.filter((item) => {
      if (!item || typeof item.id !== "string" || !Object.prototype.hasOwnProperty.call(ACTIONS, item.id) || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }).slice(0, 4).map((item) => ({
      id: item.id,
      // Labels are product copy, never model reasoning or other arbitrary metadata.
      label: ACTIONS[item.id].label
    }));
  }

  function followup(id, focus = {}) {
    if (typeof id !== "string" || !Object.prototype.hasOwnProperty.call(ACTIONS, id) || !ACTIONS[id].request) return "";
    const topic = plainText(focus.topic, 180);
    const question = plainText(focus.prompt, 1200);
    return [ACTIONS[id].request, topic ? `Topic: ${topic}.` : "", question ? `Question we are working on: ${question}` : ""]
      .filter(Boolean).join("\n");
  }

  function voiceContext(focus) {
    if (!focus) return "";
    const topic = plainText(focus.topic, 180);
    const question = plainText(focus.prompt, 1200);
    const explanation = plainText(focus.reply, 2400);
    return [
      "The student chose Talk it through for this explanation. Continue from this point using one small step and one check for understanding at a time.",
      topic ? `Current topic: ${topic}.` : "",
      question ? `Question being discussed: ${question}` : "",
      explanation ? `Explanation to build on: ${explanation}` : ""
    ].filter(Boolean).join("\n");
  }

  const api = Object.freeze({ normalize, followup, voiceContext });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.TutorlyTeachingActions = api;
})(typeof window !== "undefined" ? window : null);
