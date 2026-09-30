(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TutorlyStudyQuiz = api;
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';
  // Same question/options/answer/explanation contract as Tutorly Tests.
  // These are formative AI-generated checks, not secure exam grades.
  function normalize(value) {
    if (!value || typeof value.plan_id !== 'string' || typeof value.task_id !== 'string' || !Array.isArray(value.questions) || value.questions.length < 2 || value.questions.length > 4) return null;
    const text = (value, max) => typeof value === 'string' && !!value.trim() && value.length <= max;
    if (!value.questions.every(q => q && text(q.question, 600) && text(q.topic, 240) && text(q.explanation, 600) && Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 4 && q.options.every(option => text(option, 300)) && new Set(q.options.map(option => option.trim().toLowerCase())).size === q.options.length && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length)) return null;
    return { plan_id: value.plan_id, task_id: value.task_id, questions: value.questions.map(q => ({topic:q.topic, question:q.question, options:q.options.slice(), answer:q.answer, explanation:q.explanation})) };
  }
  function score(check, answers) {
    const valid = normalize(check);
    if (!valid || !Array.isArray(answers) || answers.length !== valid.questions.length || !answers.every((answer, i) => Number.isInteger(answer) && answer >= 0 && answer < valid.questions[i].options.length)) return null;
    const topics = new Map();
    valid.questions.forEach((q, i) => { const result = topics.get(q.topic) || {topic:q.topic,correct:0,total:0}; result.total++; result.correct += Number(answers[i] === q.answer); topics.set(q.topic,result); });
    return { correct: [...topics.values()].reduce((n, item) => n + item.correct, 0), total: answers.length, topics: [...topics.values()] };
  }
  function mount(container, raw, hooks) {
    const check = normalize(raw); if (!check) return false;
    const el = (tag, text, className) => { const node = document.createElement(tag); if (text) node.textContent = text; if (className) node.className = className; return node; };
    const button = (text, action) => { const node = el('button', text); node.type = 'button'; node.addEventListener('click', action); return node; };
    const card = el('section', '', 'study-quiz-card'); card.setAttribute('aria-label', 'Quick understanding check'); container.append(card);
    let answers = (hooks.load()?.answers || []).slice(0, check.questions.length), index = Math.min(answers.length, check.questions.length - 1), selected = null;
    if (!answers.every((value, i) => Number.isInteger(value) && value >= 0 && value < check.questions[i].options.length)) answers = [];
    let finished = answers.length === check.questions.length;
    function render(focus = false) {
      card.replaceChildren();
      const heading = el('h3', finished ? 'Quick check complete' : `Question ${index + 1} of ${check.questions.length}`); heading.tabIndex = -1; card.append(heading);
      const status = el('p', '', 'study-quiz-feedback'); status.setAttribute('role', 'status');
      if (finished) {
        const result = score(check, answers);
        card.append(el('p', `${result.correct} of ${result.total} correct on your first attempts.`));
        result.topics.forEach(item => card.append(el('p', `${item.topic}: ${item.correct}/${item.total}${item.correct < item.total ? ' · worth revisiting' : ' · understood in this check'}`)));
        card.append(el('small', 'Checked against Tutorly’s generated answer key. This is practice feedback, not an official grade.'), status);
        const save = () => {
          try { status.textContent = hooks.complete(result, answers) ? 'Result saved. Remaining revision has been adjusted where time allows.' : 'Open this study task to save its result.'; }
          catch (error) { status.textContent = error.message || 'Could not save. Retry without answering again.'; card.append(button('Retry saving result', save)); }
        };
        save();
        card.append(button('Review answers', () => { finished = false; index = 0; render(true); }));
        if (hooks.canAnswer()) card.append(button('Continue learning', () => hooks.continue(result)));
      } else {
        const question = check.questions[index], answered = Number.isInteger(answers[index]);
        card.append(el('p', question.question));
        const choices = el('fieldset'); const legend = el('legend', 'Choose one answer'); choices.append(legend);
        question.options.forEach((option, i) => {
          const label = el('label', '', 'study-quiz-option'), radio = el('input'); radio.type = 'radio'; radio.name = `study-check-${hooks.id}-${index}`; radio.value = String(i); radio.checked = answered ? answers[index] === i : selected === i; radio.disabled = answered || !hooks.canAnswer();
          radio.addEventListener('change', () => { selected = i; }); label.append(radio, el('span', option));
          if (answered && i === question.answer) label.classList.add('is-correct');
          if (answered && answers[index] === i && i !== question.answer) label.classList.add('is-incorrect');
          choices.append(label);
        }); card.append(choices, status);
        if (answered) {
          status.textContent = answers[index] === question.answer ? 'Correct.' : `Not quite. The correct answer is: ${question.options[question.answer]}`;
          const explanation = el('details'); explanation.append(el('summary', 'Explain why'), el('p', question.explanation)); if (answers[index] !== question.answer) explanation.open = true; card.append(explanation);
          if (hooks.canAnswer()) card.append(button('Explain another way', () => hooks.explain(question, answers[index])));
          card.append(button(index === check.questions.length - 1 ? 'See recap' : 'Next question', () => { if (index === check.questions.length - 1) finished = true; else index++; selected = null; render(true); }));
        } else if (hooks.canAnswer()) card.append(button('Check answer', () => {
          if (selected === null) { status.textContent = 'Choose an answer first.'; return; }
          const next = answers.slice(); next[index] = selected;
          try { hooks.save(next); answers = next; render(true); }
          catch (error) { status.textContent = error.message || 'Could not save your answer. Try again.'; }
        }));
        else status.textContent = 'This check belongs to another study task. Open that task from your plan to continue.';
      }
      if (focus) heading.focus();
    }
    render(); return true;
  }
  return Object.freeze({ normalize, score, mount });
});
