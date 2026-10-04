(function (root) {
  'use strict';
  const node = (tag, text, className) => { const element = document.createElement(tag); if (text) element.textContent = text; if (className) element.className = className; return element; };
  const PROMPTS = Object.freeze({
    next: 'I got it. Continue with the next small concept or a brief understanding check. Do not mark the task complete yet.',
    another_method: 'Explain this concept another way, in a short block with one simple example. Then ask me a small question.',
    quick_check: 'Give me 2–4 quick questions about what we have just studied. Wait for my answers before showing solutions.',
    another_question: 'Give me one more short question about the concept we are studying. Wait for my answer.',
    quick_revision: 'Give me a very short revision of this concept, using a few small explanation blocks.',
    recap: 'Give a short recap of this study task: what we covered, what my answers show I understood, and what needs revision. Say when understanding has not been checked; do not invent quiz scores.'
  });
  function detectExamDraft(text) {
    if (typeof text !== 'string' || text.length > 800 || !/\b(?:my|our|have|prepare|plan)\b/i.test(text) || !/\bexam\b/i.test(text)) return null;
    const seed = {};
    const subject = text.match(/\b(?:my|our)\s+([A-Za-z][A-Za-z &-]{1,60}?)\s+exam\b/i);
    if (subject) seed.subject = subject[1];
    const relative = text.match(/\bin\s+(\d{1,3}|one|two|three|a)\s+(days?|weeks?)\b/i);
    const explicit = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    try {
      if (/\btomorrow\b/i.test(text)) seed.examDate = root.TutorlyStudyPlanEngine.addDays(root.TutorlyStudyPlanEngine.todayDate(), 1);
      else if (relative) {
        const amount = ({one:1,two:2,three:3,a:1})[relative[1].toLowerCase()] || Number(relative[1]);
        const days = amount * (/week/i.test(relative[2]) ? 7 : 1);
        if (days > 0 && days <= 365) seed.examDate = root.TutorlyStudyPlanEngine.addDays(root.TutorlyStudyPlanEngine.todayDate(), days);
      } else if (explicit) seed.examDate = root.TutorlyStudyPlanEngine.normalizeDate(explicit[1]);
    } catch (_) { /* The setup form can collect an unambiguous date. */ }
    return seed;
  }
  function create(options) {
    const view = document.getElementById('studyPlannerView');
    const bar = document.getElementById('studySessionBar');
    if (!view || !bar || !root.TutorlyStudyPlanner) return null;
    let active = false, accountChanged = false, openVersion = 0;
    const planner = root.TutorlyStudyPlanner.create({ container: view, getAccountKey: options.getAccountKey,
      getProfile: () => root.TutorlyCurriculum?.currentProfile?.(),
      onReturnToChat: () => { options.showChat(); options.focusComposer(); },
      onStudyTask(plan, task) {
        if (options.isBusy()) { options.notify('Wait for the current answer to finish before switching tasks.'); return; }
        if (plan.examDate <= root.TutorlyStudyPlanEngine.todayDate()) { options.notify('Preparation has ended. Change the exam date to resume studying.'); return; }
        const conversationId = options.prepareConversation(plan.conversationId, plan.title);
        planner.selectTask?.(plan.id, task.id);
        planner.bindConversation?.(conversationId);
        active = true;
        options.selectStudyMode();
        options.showChat();
        const context = planner.getActiveSessionContext();
        if (context?.curriculumContext?.chapter_id) root.TutorlyCurriculum?.setActiveContext?.(context.curriculumContext);
        else root.TutorlyCurriculum?.clearActiveContext?.();
        root.TutorlyLiveBoardPanel?.close?.({ keepBanner: false });
        render();
        // "Do not use Live Board" and micro-learning rules live in the backend's
        // STUDY_SESSION_PROMPT, not in the student's visible message bubble.
        options.send(`Start my ${task.kind} task${task.part ? `, part ${task.part}` : ''}: ${context?.topicTitle || task.title}.`, 'start');
      },
      onReviewTask(plan, task, conversationId) {
        if (options.isBusy()) { options.notify('Wait for the current answer to finish before reviewing a task.'); return true; }
        // Review must only load a real saved chat. Unlike Start, it must never
        // create a chat or fall back to the current/unrelated conversation.
        if (!options.openConversation?.(conversationId)) return false;
        planner.selectTask?.(plan.id, task.id);
        active = true;
        options.selectStudyMode();
        options.showChat();
        const context = planner.getActiveSessionContext();
        if (context?.curriculumContext?.chapter_id) root.TutorlyCurriculum?.setActiveContext?.(context.curriculumContext);
        else root.TutorlyCurriculum?.clearActiveContext?.();
        root.TutorlyLiveBoardPanel?.close?.({ keepBanner: false });
        render('Reviewing this task. Its completion status is unchanged.');
        options.focusComposer();
        return true;
      }
    });
    function context(action) {
      if (accountChanged) return null;
      const value = active ? planner.getActiveSessionContext() : null;
      if (!value) return null;
      return {
        plan_id: value.planId, task_id: value.taskId, subject: value.subject, topic: value.topicTitle,
        task_kind: value.taskKind, estimated_minutes: value.estimatedMinutes,
        question_count: Math.min(4, Math.max(2, value.questionCount || 3)), exam_date: value.examDate,
        date: root.TutorlyStudyPlanEngine.todayDate(), completed_tasks: value.completedTasks || 0,
        total_tasks: value.totalTasks || 0, action: action || 'resume', topics: value.topicTitles,
        target_score: value.targetScore, concern: value.concerns, resource_labels: value.resourceLabels,
        performance_evidence: value.performanceEvidence, materials: planner.getMaterials?.() || []
      };
    }
    function actionButton(label, action) {
      const button = node('button', label); button.type = 'button';
      button.addEventListener('click', action); return button;
    }
    async function ready(retry = false) {
      let timer;
      try {
        await Promise.race([
          Promise.resolve().then(() => typeof options.ready === 'function' ? options.ready(retry) : options.ready),
          new Promise((_, reject) => { timer = root.setTimeout(() => reject(new Error('Account request timed out.')), 15000); })
        ]);
      } finally { root.clearTimeout(timer); }
    }
    function entryState(message, settings, error) {
      view.hidden = false;
      view.classList.add('study-planner');
      view.setAttribute('aria-busy', error ? 'false' : 'true');
      const heading = node('h1', 'Study Bot');
      const status = node('p', message, error ? 'study-status study-error' : 'study-status');
      status.setAttribute('role', error ? 'alert' : 'status');
      const actions = node('div', '', 'study-actions');
      if (error) {
        const retry = actionButton('Retry', () => open(settings, true));
        retry.className = 'study-button study-button-primary'; actions.append(retry);
        if (error.status === 401) {
          const login = node('a', 'Sign in again', 'study-button'); login.href = 'login.html?intent=chatbot'; actions.append(login);
        }
      }
      const back = actionButton('Back to chat', () => options.showChat()); back.className = 'study-button'; actions.append(back);
      view.replaceChildren(heading, status, actions);
    }
    async function open(settings = {}, retry = false) {
      if (options.isBusy()) { options.notify('Wait for the current answer to finish before opening your plan.'); return; }
      const version = ++openVersion;
      options.showPlanner();
      entryState('Loading your study plans…', settings);
      view.focus();
      try {
        if (accountChanged) throw new Error('Account changed.');
        await ready(retry);
        if (version !== openVersion) return;
        if (accountChanged) throw new Error('Account changed.');
        planner.open(settings);
        view.setAttribute('aria-busy', 'false');
      } catch (error) {
        if (version !== openVersion) return;
        const message = accountChanged ? 'Your account changed. Refresh Tutorly before opening saved study plans.'
          : error.status === 401 ? 'Your session expired. Sign in again to open your study plans.'
          : 'Tutorly couldn’t load your study plans. Check your connection and retry. Your saved plans have not been changed.';
        entryState(message, settings, error);
      }
    }
    function render(message = '') {
      const value = active ? planner.getActiveSessionContext() : null;
      bar.hidden = !value;
      document.body.classList.toggle('study-session-active', !!value);
      if (!value) return;
      bar.replaceChildren();
      const heading = node('div', '', 'study-session-heading');
      const copy = node('div'); copy.append(node('strong', value.topicTitle));
      copy.append(node('small', `${value.subject} · ${value.taskKind} · about ${value.estimatedMinutes} min`));
      heading.append(copy, actionButton('View plan', () => open({ planId: value.planId })));
      bar.append(heading);
      const details = node('details'); details.append(node('summary', 'Study actions'));
      const actions = node('div', '', 'study-session-actions');
      const primary = node('div', '', 'study-session-actions');
      [['Got it · next', 'next'], ['Quick check', 'quick_check']].forEach(([label, action]) => primary.append(actionButton(label, () => options.send(PROMPTS[action], action))));
      [['Explain another way', 'another_method'], ['Another question', 'another_question'], ['Quick revision', 'quick_revision'], ['Recap', 'recap']].forEach(([label, action]) => {
        actions.append(actionButton(label, () => options.send(PROMPTS[action], action)));
      });
      const status = node('p', message, 'study-session-status'); status.setAttribute('role', 'status');
      primary.append(actionButton(value.taskStatus === 'completed' ? 'Task saved as complete' : 'Finish & save task', () => {
        if (options.isBusy()) { options.notify('Wait for Tutorly to finish before saving this task.'); return; }
        try {
          if (value.taskStatus !== 'completed' && planner.completeActiveTask()) {
            render('Task saved. Open your plan to choose the next task.');
            options.send(PROMPTS.recap, 'recap');
          }
        } catch (error) { status.textContent = error.message || 'Could not save this task. Try again.'; }
      }));
      const form = node('form', '', 'study-session-score'); form.noValidate = true;
      const correctLabel = node('label', 'Correct answers'); const correct = node('input'); correct.type = 'number'; correct.min = '0'; correct.max = '4'; correct.step = '1'; correct.required = true; correctLabel.append(correct);
      const totalLabel = node('label', 'Questions'); const total = node('select'); [2,3,4].forEach(count => { const option = node('option', String(count)); option.value = String(count); total.append(option); }); totalLabel.append(total);
      const topicLabel = node('label', 'Quiz topic'); const topic = node('select');
      (value.topics || []).forEach(item => { const option = node('option', item.title); option.value = item.id; topic.append(option); });
      if (value.topicId) topic.value = value.topicId;
      topicLabel.append(topic);
      const submit = node('button', 'Save quiz result'); submit.type = 'submit';
      if (!value.topicId) form.append(topicLabel);
      form.append(correctLabel, totalLabel, submit);
      form.addEventListener('submit', event => {
        event.preventDefault();
        const count = Number(correct.value), all = Number(total.value);
        if (correct.value === '' || !Number.isInteger(count) || count < 0 || count > all) { status.textContent = 'Enter the number correct, between 0 and the question count.'; correct.focus(); return; }
        try {
          if (planner.recordPerformance({ correct: count, total: all, topicId: value.topicId || topic.value, source: 'student_report', id: root.crypto?.randomUUID?.() || `quiz-${Date.now()}` })) {
            status.textContent = 'Your reported result is saved. Remaining revision has been adjusted where time allows.';
          }
        } catch (error) { status.textContent = error.message || 'Could not save your result. Try again.'; }
      });
      const manual = node('details'); manual.append(node('summary', 'Record a separate quiz result'), form, node('small', 'Record an actual 2–4 question check after reviewing your answers. This is a self-reported result, not an automatic grade.'));
      details.append(actions, manual);
      bar.append(primary, details, status);
    }
    function restore(conversationId) {
      planner.restoreConversation?.(conversationId);
      active = !!conversationId && !!planner.getActiveSessionContext();
      if (active) options.selectStudyMode();
      render();
    }
    function reset() { active = false; planner.clearActiveSession?.(); render(); }
    function mountCheck(container, check, id) {
      if (!check || !root.TutorlyStudyQuiz) return false;
      const key = String(id || root.crypto?.randomUUID?.() || `check-${Date.now()}`);
      const conversationId = options.getConversationId();
      const host = node('div', 'Loading saved answers…', 'study-check-host'); host.setAttribute('role', 'status'); container.append(host);
      const canAnswer = () => { const value = context(); return value?.plan_id === check.plan_id && value?.task_id === check.task_id && value.exam_date > root.TutorlyStudyPlanEngine.todayDate(); };
      ready().then(() => {
        if (!host.isConnected || accountChanged || options.getConversationId() !== conversationId) return;
        host.replaceChildren(); host.removeAttribute('role');
        root.TutorlyStudyQuiz.mount(host, check, {
        id: key, canAnswer, load: () => planner.quizAttempt(check, key), save: answers => planner.quizAttempt(check, key, answers),
        complete: (result, answers) => { if (!canAnswer()) return false; const saved = planner.quizAttempt(check, key, answers, result); render('Quick check saved. Your remaining revision reflects these answers.'); return !!saved; },
        explain: (question, answer) => options.send(`Help me understand this check: ${question.question}\nI chose: ${question.options[answer]}. Explain the concept another way in a few short lines.`, 'another_method'),
        continue: result => options.send(`I finished the quick check: ${result.correct}/${result.total} correct on first attempts. ${result.correct < result.total ? 'Help me revisit the mistakes with a smaller example before continuing.' : 'Continue with the next small concept.'}`, result.correct < result.total ? 'another_method' : 'next')
        });
      }).catch(() => { host.textContent = 'Saved answers could not be loaded. Open Study Bot and retry your account connection, then reopen this conversation.'; });
      return true;
    }
    root.addEventListener('storage', event => {
      if (['tutorly_session_token', 'tutorly_logged_in'].includes(event.key)) { reset(); planner.close(); accountChanged = true; }
    });
    ready().then(() => { if (!accountChanged) restore(options.getConversationId()); }).catch(() => {});
    return Object.freeze({ open, close: () => { ++openVersion; planner.close(); }, context, restore, reset, mountCheck, isActive: () => !!context() });
  }
  root.TutorlyStudySession = Object.freeze({ create, detectExamDraft });
})(window);
