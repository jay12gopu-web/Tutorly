/* Calendar-day scheduling only. This engine does not invent syllabus or assess understanding. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TutorlyStudyPlanEngine = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const VERSION = 1;
  const DAY = 86400000;
  const copy = value => JSON.parse(JSON.stringify(value));
  function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
  function text(value, maximum, label, required) {
    const result = typeof value === 'string' ? value.trim() : '';
    if ((required && !result) || result.length > maximum) fail('invalid_input', `Please enter a valid ${label}.`);
    return result;
  }
  function number(value, fallback, min, max, label) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      fail('invalid_input', `Please enter a valid ${label} (${min}–${max}).`);
    }
    return value;
  }
  function normalizeDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('invalid_date', 'Use a valid calendar date.');
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || +value.slice(0, 4) < 1900) {
      fail('invalid_date', 'Use a valid calendar date.');
    }
    return value;
  }
  function todayDate(date) {
    const local = date || new Date();
    return normalizeDate(`${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`);
  }
  const ordinal = value => new Date(`${normalizeDate(value)}T00:00:00Z`).getTime() / DAY;
  const daysBetween = (from, to) => ordinal(to) - ordinal(from);
  function addDays(date, count) {
    if (!Number.isInteger(count) || Math.abs(count) > 3660) fail('invalid_date', 'The calendar adjustment is too large.');
    return new Date((ordinal(date) + count) * DAY).toISOString().slice(0, 10);
  }
  function hash(value) {
    let result = 2166136261;
    for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
    return (result >>> 0).toString(36);
  }
  function ids(values) {
    if (values === undefined) return [];
    if (!Array.isArray(values) || values.length > 100) fail('invalid_input', 'Too many study resource references.');
    return [...new Set(values.map(value => text(value, 250, 'resource reference', true)))];
  }
  function context(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const result = {};
    for (const key of ['board', 'grade', 'academic_year', 'medium', 'subject_id', 'subject', 'book_id', 'book', 'chapter_id', 'chapter', 'topic_id', 'topic']) {
      if (typeof value[key] === 'string' || typeof value[key] === 'number') result[key] = String(value[key]).slice(0, 250);
    }
    return result;
  }
  function normalizeTopics(values) {
    if (!Array.isArray(values) || values.length === 0 || values.length > 150) {
      fail('syllabus_required', 'Choose verified chapters or add your own syllabus before making a plan (up to 150 topics).');
    }
    const seen = new Set();
    return values.map(value => {
      if (!value || typeof value !== 'object') fail('invalid_input', 'Please check your syllabus topics.');
      const verification = value.verification_status || value.verificationStatus;
      if (verification && verification !== 'verified') {
        fail('unverified_topic', 'Only verified curriculum records or your own syllabus can be used.');
      }
      const title = text(value.title, 200, 'topic title', true);
      const id = text(value.id || `topic-${hash(title.toLowerCase())}`, 250, 'topic ID', true);
      if (seen.has(id)) fail('duplicate_topic', 'Each syllabus topic needs a distinct ID.');
      seen.add(id);
      const levels = { easy: 1, medium: 3, hard: 5 };
      return {
        id, title,
        estimatedMinutes: number(value.estimatedMinutes, 25, 5, 480, 'topic study time'),
        difficulty: number(levels[value.difficulty] || value.difficulty, 3, 1, 5, 'difficulty'),
        priority: number(value.priority, 3, 1, 5, 'priority'),
        weakness: number(value.weakness, 0, 0, 1, 'weakness'),
        resourceIds: ids(value.resourceIds), curriculumContext: context(value.curriculumContext),
        ...(verification ? { verification_status: verification } : {})
      };
    });
  }
  function notice(plan, code, message) {
    if (!plan.notices.some(item => item.code === code && item.message === message)) plan.notices.push({ code, message });
  }
  function validatePlan(plan) {
    if (!plan || plan.schemaVersion !== VERSION || !Array.isArray(plan.tasks) || !Array.isArray(plan.topics)) {
      fail('invalid_plan', 'This study plan could not be loaded. Please create a new plan.');
    }
    normalizeDate(plan.examDate);
    number(plan.minutesPerDay, 45, 15, 480, 'daily study time');
  }
  function performance(plan, supplied, today) {
    if (supplied !== undefined && (!Array.isArray(supplied) || supplied.length > 1000)) fail('invalid_input', 'Invalid study results.');
    const available = new Set(plan.topics.map(topic => topic.id));
    const results = new Map((plan.performance || []).map(item => [item.id, item]));
    for (const item of supplied || []) {
      if (!item || !available.has(item.topicId)) fail('unknown_topic', 'A study result must refer to a topic in this plan.');
      const max = number(item.maxScore, 100, 1, 100000, 'maximum score');
      const score = number(item.score, null, 0, max, 'quiz score');
      if (score === null) fail('invalid_input', 'A quiz result needs a real score.');
      const observedDate = normalizeDate(item.observedDate || today);
      if (observedDate > today) fail('invalid_date', 'A quiz result cannot come from the future.');
      const source = text(item.source || 'reported quiz result', 100, 'result source', true);
      const id = text(item.id || `result-${hash(`${item.topicId}|${score}|${max}|${observedDate}|${source}`)}`, 250, 'result ID', true);
      results.set(id, { id, topicId: item.topicId, score: score / max * 100, observedDate, source });
    }
    plan.performance = [...results.values()].sort((a, b) => a.observedDate.localeCompare(b.observedDate)).slice(-1000);
  }
  function topicScore(plan, topic) {
    const scores = plan.performance.filter(item => item.topicId === topic.id).slice(-3);
    const average = scores.length ? scores.reduce((sum, item) => sum + item.score, 0) / scores.length : null;
    return { average, weakness: average === null ? topic.weakness : 1 - average / 100 };
  }
  function task(plan, key, kind, title, minutes, topic, extra) {
    return {
      id: `${plan.id}:${key}`, topicId: topic ? topic.id : null, title, kind,
      date: null, status: 'pending', estimatedMinutes: minutes,
      resourceIds: topic ? [...topic.resourceIds] : [...plan.resourceIds],
      ...(extra || {})
    };
  }
  function buildTasks(plan, count) {
    const result = [];
    // Fixed-size parts keep task identities stable when the student's time budget changes.
    const chunk = 15;
    for (const topic of plan.topics) {
      let remaining = topic.estimatedMinutes;
      let part = 0;
      while (remaining > 0) {
        const duration = Math.min(chunk, remaining);
        result.push(task(plan, `${topic.id}:learn-${part}`, 'learn', topic.title, duration, topic, { part: part + 1, sequence: part }));
        remaining -= duration; part += 1;
      }
      result.push(task(plan, `${topic.id}:practice`, 'practice', `${topic.title} · quick practice`, 10, topic, { sequence: part, questionCount: 3 }));
      result.push(task(plan, `${topic.id}:quiz`, 'quiz', `${topic.title} · check your understanding`, 5, topic, { sequence: part + 1, questionCount: 3 }));
      const score = topicScore(plan, topic);
      if (plan.targetScore >= 85 && count > 2 && (score.average === null || score.average < plan.targetScore)) {
        result.push(task(plan, `${topic.id}:target-practice`, 'practice', `${topic.title} · stretch practice`, 10, topic, { optional: true, sequence: part + 2, questionCount: 3 }));
      }
      if ((count > 7 && (score.average === null || score.average < 85)) || count === 1) {
        const repetitions = count > 21 ? 3 : count > 14 ? 2 : 1;
        for (let review = 0; review < repetitions; review += 1) {
          result.push(task(plan, `${topic.id}:${review ? `spaced-revision-${review}` : 'revision'}`, 'revision', `${topic.title} · quick revision`, 10, topic, { optional: count !== 1, sequence: part + 2 + review, spacingDays: [2, 7, 14][review] }));
        }
      }
      if (score.weakness >= 0.4) {
        result.push(task(plan, `${topic.id}:weak-revision`, 'revision', `${topic.title} · revisit difficult ideas`, 10, topic, { adaptive: true, sequence: part + 3 }));
      }
    }
    const revisionMinutes = Math.min(15, Math.max(5, Math.floor(plan.minutesPerDay * 0.35 / 5) * 5));
    result.push(task(plan, `final-revision:${plan.examDate}`, 'revision', 'Final revision', revisionMinutes, null, { final: true, topicIds: plan.topics.map(topic => topic.id) }));
    result.push(task(plan, `mock:${plan.examDate}`, 'mock', 'Mixed practice / mini mock', Math.min(15, plan.minutesPerDay - revisionMinutes), null, { final: true, questionCount: 3, topicIds: plan.topics.map(topic => topic.id) }));
    return result;
  }
  function syncTasks(plan, count, today) {
    const existing = new Map(plan.tasks.map(item => [item.id, item]));
    const desired = buildTasks(plan, count);
    const wanted = new Set(desired.map(item => item.id));
    const activeTopics = new Set(plan.topics.map(item => item.id));
    for (const item of desired) {
      const previous = existing.get(item.id);
      if (previous && previous.status === 'completed') continue;
      existing.set(item.id, { ...item, ...(previous ? { date: previous.date, missed: previous.missed || (previous.status === 'pending' && previous.date < today && !!previous.date) } : {}) });
    }
    for (const [id, item] of existing) {
      if (wanted.has(id) || item.status === 'completed' || item.status === 'removed') continue;
      // Optional review is retained unless real strong results or an explicit syllabus/date edit makes it redundant.
      const topic = plan.topics.find(value => value.id === item.topicId);
      const mastered = topic && topicScore(plan, topic).average >= 85;
      if (activeTopics.has(item.topicId) && !mastered) continue;
      existing.set(id, { ...item, status: 'removed', date: null, removalReason: !activeTopics.has(item.topicId) && item.topicId ? 'syllabus_changed' : item.final ? 'exam_date_changed' : 'strong_quiz_performance' });
      if (mastered && !item.final) notice(plan, 'repetition_reduced', 'Strong quiz results reduced optional repetition; final revision is still included.');
    }
    plan.tasks = [...existing.values()];
  }
  function arrange(plan, today) {
    const count = daysBetween(today, plan.examDate);
    if (count > 366) fail('exam_too_far', 'Choose an exam within the next year.');
    plan.days = Array.from({ length: Math.max(0, count) }, (_, index) => ({ date: addDays(today, index), taskIds: [] }));
    plan.status = count < 0 ? 'closed' : count === 0 ? 'exam-day' : 'active';
    const loads = plan.days.map(() => 0);
    for (const item of plan.tasks) {
      if (item.status === 'pending') item.date = null;
      else if (item.status === 'completed') {
        const index = item.date ? daysBetween(today, item.date) : -1;
        if (index >= 0 && index < count) { plan.days[index].taskIds.push(item.id); loads[index] += item.estimatedMinutes; }
      }
    }
    if (count <= 0) {
      plan.unscheduledTaskIds = plan.tasks.filter(item => item.status === 'pending').map(item => item.id);
      notice(plan, 'exam_reached', count === 0 ? 'It is exam day. Your preparation schedule has ended; unfinished work is kept in your plan history.' : 'This exam has passed. Preparation is closed and unfinished work is kept in your plan history.');
      return;
    }
    const pending = plan.tasks.filter(item => item.status === 'pending');
    const indexFor = item => item.date && item.date < today ? 0 : item.date ? daysBetween(today, item.date) : 0;
    function place(item, first, last, softLimit) {
      for (let index = Math.max(0, first); index <= last; index += 1) {
        if (loads[index] + item.estimatedMinutes <= Math.min(plan.minutesPerDay, softLimit || plan.minutesPerDay)) {
          item.date = plan.days[index].date; plan.days[index].taskIds.push(item.id); loads[index] += item.estimatedMinutes; return index;
        }
      }
      return -1;
    }
    // Reserve the final day's revision before allocating new material, even in an overloaded plan.
    pending.filter(item => item.final).forEach(item => place(item, count - 1, count - 1));
    const core = pending.filter(item => !item.final && item.kind !== 'revision');
    const learningDays = count > 2 ? count - 1 : count;
    const soft = Math.min(plan.minutesPerDay, Math.max(Math.min(20, plan.minutesPerDay), Math.ceil(core.reduce((sum, item) => sum + item.estimatedMinutes, 0) / learningDays / 5) * 5));
    const priority = topic => {
      const evidence = topicScore(plan, topic);
      return topic.priority * 4 + topic.difficulty * 1.5 + evidence.weakness * 16 + (pending.some(item => item.topicId === topic.id && item.missed) ? 12 : 0);
    };
    const topics = [...plan.topics].sort((a, b) => priority(b) - priority(a) || a.id.localeCompare(b.id));
    if (count === 1) {
      notice(plan, 'crash_plan', 'Your exam is tomorrow: this is a short, prioritized crash plan, not a promise to cover the whole syllabus.');
      for (const topic of topics) {
        const review = pending.find(item => item.topicId === topic.id && item.kind === 'revision');
        if (review) place(review, 0, 0);
      }
    }
    for (const topic of topics) {
      let first = 0;
      let blocked = false;
      const sequence = plan.tasks.filter(item => item.topicId === topic.id && ['learn', 'practice', 'quiz'].includes(item.kind) && item.status !== 'removed').sort((a, b) => a.sequence - b.sequence);
      for (const item of sequence) {
        if (item.status === 'completed') { first = Math.max(first, indexFor(item)); continue; }
        if (blocked) continue;
        const last = item.kind === 'learn' ? learningDays - 1 : count - 1;
        let index = place(item, first, last, soft);
        if (index < 0) index = place(item, first, last);
        if (index < 0) blocked = true;
        else first = index;
      }
    }
    for (const topic of topics) {
      const reviews = pending.filter(item => item.topicId === topic.id && item.kind === 'revision' && !item.date);
      const quiz = plan.tasks.find(item => item.topicId === topic.id && item.kind === 'quiz' && item.status !== 'removed');
      reviews.forEach(item => {
        const first = quiz && quiz.date ? Math.max(0, indexFor(quiz) + (item.spacingDays || 1)) : Math.floor(count / 2);
        place(item, Math.min(count - 1, first), count - 1);
      });
    }
    const byId = new Map(plan.tasks.map(item => [item.id, item]));
    plan.days.forEach(day => day.taskIds.sort((a, b) => {
      const rank = id => { const item = byId.get(id); return item.final ? item.kind === 'mock' ? 2 : 1 : 0; };
      return rank(a) - rank(b);
    }));
    plan.unscheduledTaskIds = pending.filter(item => !item.date).map(item => item.id);
    if (plan.unscheduledTaskIds.length) {
      const minutes = pending.filter(item => !item.date).reduce((sum, item) => sum + item.estimatedMinutes, 0);
      notice(plan, 'capacity_warning', `${minutes} minutes of unfinished work do not fit before the exam. They remain in your plan; add time or prioritize a smaller syllabus. Final revision stays protected where possible.`);
    }
    if (pending.some(item => item.final && !item.date)) notice(plan, 'revision_capacity', 'Completed work already uses the final day’s time. Please free time for final revision or increase your daily study time.');
    if (plan.tasks.every(item => item.status !== 'pending')) notice(plan, 'finished_early', 'You have completed the planned work. You can revisit a topic or request more practice in this conversation.');
  }
  function createPlan(config, options) {
    if (!config || typeof config !== 'object') fail('invalid_input', 'Please complete your exam setup.');
    const today = normalizeDate(options && options.today || todayDate());
    const examDate = normalizeDate(config.examDate);
    if (examDate <= today) fail('exam_not_future', 'Choose a future exam date; the exam day is not a full preparation day.');
    const subject = text(config.subject, 100, 'subject', true);
    const topics = normalizeTopics(config.topics);
    const plan = {
      schemaVersion: VERSION,
      id: text(config.id || `exam-${hash(`${subject}|${examDate}|${today}|${topics.map(item => item.id).join('|')}`)}`, 250, 'plan ID', true),
      title: text(config.title || `${subject} exam`, 150, 'exam title', true), subject, examDate,
      minutesPerDay: number(config.minutesPerDay, 45, 15, 480, 'daily study time'),
      targetScore: number(config.targetScore, null, 0, 100, 'target score'),
      concerns: text(config.concerns, 1000, 'study concern', false),
      resourceIds: ids(config.resourceIds), curriculumContext: context(config.curriculumContext),
      createdDate: today, updatedDate: today, topics, retiredTopics: [], tasks: [], performance: [], notices: [], adjustments: []
    };
    performance(plan, config.performance, today);
    syncTasks(plan, daysBetween(today, examDate), today);
    arrange(plan, today);
    return plan;
  }
  function rebalance(input, options) {
    validatePlan(input);
    const supplied = options || {};
    const plan = copy(input);
    const today = normalizeDate(supplied.today || todayDate());
    const missed = plan.tasks.filter(item => item.status === 'pending' && item.date && item.date < today);
    plan.notices = [];
    if (supplied.examDate !== undefined) plan.examDate = normalizeDate(supplied.examDate);
    if (supplied.minutesPerDay !== undefined) plan.minutesPerDay = number(supplied.minutesPerDay, 45, 15, 480, 'daily study time');
    if (supplied.topics !== undefined) {
      const topics = normalizeTopics(supplied.topics);
      const current = new Set(topics.map(item => item.id));
      const retired = new Map((plan.retiredTopics || []).map(item => [item.id, item]));
      plan.topics.filter(item => !current.has(item.id)).forEach(item => retired.set(item.id, item));
      plan.retiredTopics = [...retired.values()]; plan.topics = topics;
      if (input.topics.some(item => !current.has(item.id))) notice(plan, 'syllabus_changed', 'Removed syllabus topics are archived, including their completed work. Remaining work has been rescheduled.');
    }
    performance(plan, supplied.performance, today);
    if (daysBetween(today, plan.examDate) > 0) syncTasks(plan, daysBetween(today, plan.examDate), today);
    missed.forEach(item => { const current = plan.tasks.find(value => value.id === item.id); if (current) current.missed = true; });
    arrange(plan, today);
    if (missed.length && plan.status === 'active') {
      const names = [...new Set(missed.map(item => (plan.topics.find(topic => topic.id === item.topicId) || {}).title).filter(Boolean))].slice(0, 3);
      notice(plan, 'missed_work', `You have unfinished work${names.length ? ` on ${names.join(', ')}` : ''}. It has been carried forward into the remaining plan; anything that cannot fit is kept under unscheduled work.`);
    }
    if (plan.examDate !== input.examDate) notice(plan, 'exam_date_changed', 'Your exam date changed. Completed work is preserved and the remaining preparation has been rebalanced.');
    if (supplied.performance && supplied.performance.length) notice(plan, 'performance_adaptation', 'The remaining plan now considers your recorded quiz results; difficult topics receive priority and extra revision.');
    const changed = JSON.stringify(plan.tasks.map(item => [item.id, item.date, item.status])) !== JSON.stringify(input.tasks.map(item => [item.id, item.date, item.status]));
    if (changed) plan.adjustments = [...(plan.adjustments || []), { date: today, codes: plan.notices.map(item => item.code) }].slice(-100);
    plan.updatedDate = today;
    return plan;
  }
  function completeTask(input, taskId, options) {
    validatePlan(input);
    const plan = copy(input);
    const today = normalizeDate(options && options.today || todayDate());
    const item = plan.tasks.find(value => value.id === taskId);
    if (!item || item.status === 'removed') fail('unknown_task', 'That study task is not available.');
    if (item.status === 'completed') return plan;
    if (today >= plan.examDate) fail('exam_reached', 'Preparation has ended for this exam.');
    item.status = 'completed'; item.completedDate = today;
    // Record early completion truthfully and release its future slot without losing the original schedule.
    item.scheduledDate = item.scheduledDate || item.date;
    item.date = today;
    plan.days.forEach(day => { day.taskIds = day.taskIds.filter(id => id !== item.id); });
    const completedDay = plan.days.find(day => day.date === today);
    if (completedDay) completedDay.taskIds.push(item.id);
    plan.unscheduledTaskIds = plan.unscheduledTaskIds.filter(id => id !== item.id);
    plan.updatedDate = today;
    return plan;
  }
  function moveTask(input, taskId, date, options) {
    validatePlan(input);
    const plan = copy(input);
    const today = normalizeDate(options && options.today || todayDate());
    const target = normalizeDate(date);
    const item = plan.tasks.find(value => value.id === taskId);
    if (!item || item.status !== 'pending') fail('unknown_task', 'Only unfinished study tasks can be moved.');
    if (target < today || target >= plan.examDate) fail('invalid_task_date', 'Choose a remaining preparation day before the exam.');
    if (item.kind === 'learn' && daysBetween(today, plan.examDate) > 2 && target === addDays(plan.examDate, -1)) fail('revision_day', 'Keep the last day for revision and practice.');
    const day = plan.days.find(value => value.date === target);
    if (!day) fail('invalid_task_date', 'Refresh the remaining plan before moving this task.');
    const load = plan.tasks.filter(value => value.id !== item.id && value.status !== 'removed' && value.date === target).reduce((sum, value) => sum + value.estimatedMinutes, 0);
    if (load + item.estimatedMinutes > plan.minutesPerDay) fail('day_full', 'This day is full. Choose another day or increase your study time.');
    if (item.topicId && ['learn', 'practice', 'quiz'].includes(item.kind)) {
      const sequence = plan.tasks.filter(value => value.topicId === item.topicId && value.id !== item.id && value.status === 'pending' && ['learn', 'practice', 'quiz'].includes(value.kind));
      if (sequence.some(value => value.sequence < item.sequence && (!value.date || value.date > target)) || sequence.some(value => value.sequence > item.sequence && value.date && value.date < target)) {
        fail('task_order', 'Keep learning, practice and quiz tasks in order.');
      }
    }
    plan.days.forEach(value => { value.taskIds = value.taskIds.filter(id => id !== item.id); });
    item.date = target; day.taskIds.push(item.id);
    plan.unscheduledTaskIds = plan.unscheduledTaskIds.filter(id => id !== item.id);
    plan.updatedDate = today;
    plan.notices = [{ code: 'task_moved', message: `Your task has been moved to ${target}.` }];
    return plan;
  }
  function progress(plan, options) {
    validatePlan(plan);
    const today = normalizeDate(options && options.today || plan.updatedDate || todayDate());
    const tasks = plan.tasks.filter(item => item.status !== 'removed');
    const completed = tasks.filter(item => item.status === 'completed');
    const totalMinutes = tasks.reduce((sum, item) => sum + item.estimatedMinutes, 0);
    const completedMinutes = completed.reduce((sum, item) => sum + item.estimatedMinutes, 0);
    return {
      totalTasks: tasks.length, completedTasks: completed.length,
      percentage: totalMinutes ? completed.length === tasks.length ? 100 : Math.min(99, Math.round(completedMinutes / totalMinutes * 100)) : 0,
      totalMinutes, completedMinutes, remainingMinutes: totalMinutes - completedMinutes,
      scheduledMinutes: tasks.filter(item => item.status === 'pending' && item.date).reduce((sum, item) => sum + item.estimatedMinutes, 0),
      unscheduledMinutes: tasks.filter(item => item.status === 'pending' && !item.date).reduce((sum, item) => sum + item.estimatedMinutes, 0),
      daysRemaining: Math.max(0, daysBetween(today, plan.examDate)),
      status: today > plan.examDate ? 'closed' : today === plan.examDate ? 'exam-day' : 'active'
    };
  }
  return { VERSION, createPlan, rebalance, completeTask, moveTask, progress, normalizeDate, todayDate, addDays, daysBetween };
});
