(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TutorlyStudyPlanStore = api;
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';
  const PREFIX = 'tutorly_study_plans_v1:';
  const clone = value => JSON.parse(JSON.stringify(value));
  const empty = () => ({ version: 1, plans: [], selectedPlanId: null, activePlanId: null, activeTaskId: null });
  function accountKey(value) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    // Callers must pass the stable account ID, never a session/access token.
    return normalized ? `account:${encodeURIComponent(normalized.slice(0, 250))}` : 'guest-device';
  }
  function validPlan(plan) {
    const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
    const id = value => typeof value === 'string' && value.length > 0 && value.length <= 300;
    const ids = values => Array.isArray(values) && values.length <= 2000 && values.every(id) && new Set(values).size === values.length;
    const tasks = new Set(Array.isArray(plan?.tasks) ? plan.tasks.map(task => task?.id) : []);
    return !!plan && typeof plan === 'object' && typeof plan.id === 'string'
      && plan.schemaVersion === 1 && typeof plan.subject === 'string' && date(plan.examDate)
      && Number.isFinite(plan.minutesPerDay) && plan.minutesPerDay >= 15 && plan.minutesPerDay <= 480
      && Array.isArray(plan.topics) && Array.isArray(plan.tasks) && Array.isArray(plan.days)
      && plan.topics.length <= 200 && plan.tasks.length <= 2000
      && id(plan.id) && plan.subject.length <= 100
      && ids(plan.topics.map(topic => topic?.id)) && ids(plan.tasks.map(task => task?.id))
      && plan.topics.every(topic => topic && typeof topic.title === 'string' && topic.title.length <= 200 && Array.isArray(topic.resourceIds))
      && plan.tasks.every(task => task && typeof task.title === 'string' && ['pending', 'completed', 'removed'].includes(task.status) && ['learn','practice','quiz','revision','mock'].includes(task.kind) && Number.isFinite(task.estimatedMinutes) && task.estimatedMinutes > 0 && Array.isArray(task.resourceIds))
      && plan.days.length <= 366 && plan.days.every(day => day && date(day.date) && day.date < plan.examDate && ids(day.taskIds) && day.taskIds.every(value => tasks.has(value)))
      && new Set(plan.days.map(day => day.date)).size === plan.days.length
      && ids(plan.unscheduledTaskIds) && plan.unscheduledTaskIds.every(value => tasks.has(value))
      && Array.isArray(plan.notices) && Array.isArray(plan.performance) && Array.isArray(plan.resourceIds);
  }
  function create(options = {}) {
    const memory = new Map();
    let storage = options.storage;
    if (!storage) { try { storage = typeof localStorage !== 'undefined' ? localStorage : null; } catch (_) { storage = null; } }
    let lastError = '';
    const key = () => PREFIX + accountKey(options.getAccountKey?.());
    function read() {
      const namespace = key();
      let data = memory.get(namespace);
      try { if (!data) data = JSON.parse(storage?.getItem(namespace) || 'null'); }
      catch (_) { lastError = 'Saved plans could not be read. You can still plan in this tab.'; }
      if (!data || data.version !== 1 || !Array.isArray(data.plans)) return empty();
      return clone({ ...empty(), ...data, plans: data.plans.filter(validPlan).slice(0, 30) });
    }
    function write(data) {
      const namespace = key();
      const state = { version: 1, plans: data.plans.filter(validPlan).slice(0, 30), selectedPlanId: data.selectedPlanId || null, activePlanId: data.activePlanId || null, activeTaskId: data.activeTaskId || null };
      memory.set(namespace, clone(state));
      try { storage?.setItem(namespace, JSON.stringify(state)); lastError = storage ? '' : 'Plans are saved only in this tab.'; }
      catch (_) { lastError = 'Your browser could not save this plan. Keep this tab open; changes are held in memory.'; }
      return clone(state);
    }
    function savePlan(plan) {
      if (!validPlan(plan)) throw new Error('This study plan could not be saved safely.');
      const state = read();
      const index = state.plans.findIndex(item => item.id === plan.id);
      if (index < 0 && state.plans.length >= 30) throw new Error('You have 30 saved plans. Finish using an existing plan before adding another.');
      if (index < 0) state.plans.unshift(clone(plan)); else state.plans[index] = clone(plan);
      state.selectedPlanId = plan.id;
      return write(state);
    }
    function select(planId, taskId = null) {
      const state = read();
      const plan = state.plans.find(item => item.id === planId);
      if (!plan) throw new Error('This plan is not available in the current account.');
      state.selectedPlanId = planId;
      state.activeTaskId = plan.tasks.some(task => task.id === taskId) ? taskId : null;
      state.activePlanId = state.activeTaskId ? planId : null;
      if (state.activeTaskId) plan.lastActiveTaskId = state.activeTaskId;
      return write(state);
    }
    function clearActiveSession() {
      const state = read(); state.activePlanId = null; state.activeTaskId = null; return write(state);
    }
    if (typeof window !== 'undefined') window.addEventListener('storage', event => {
      if (event.key?.startsWith(PREFIX)) memory.delete(event.key);
    });
    function importPlans(text) {
      if (typeof text !== 'string' || text.length > 2000000) throw new Error('Use a study backup under 2 MB.');
      const data = JSON.parse(text);
      if (data?.type !== 'tutorly-study-backup' || data.version !== 1 || !Array.isArray(data.plans) || data.plans.length > 30 || !data.plans.every(validPlan)) throw new Error('This is not a valid Tutorly study backup.');
      if (new Set(data.plans.map(plan => plan.id)).size !== data.plans.length) throw new Error('This backup contains duplicate plan IDs. No saved plans were changed.');
      const state = read();
      const existing = new Set(state.plans.map(plan => plan.id));
      const incoming = data.plans.filter(plan => !existing.has(plan.id));
      if (state.plans.length + incoming.length > 30) throw new Error('Restore would exceed 30 plans. No saved plans were changed.');
      return write({ ...state, plans: [...incoming, ...state.plans] });
    }
    const exportPlans = () => JSON.stringify({ type: 'tutorly-study-backup', version: 1, plans: read().plans }, null, 2);
    return Object.freeze({ read, savePlan, select, clearActiveSession, importPlans, exportPlans, namespace: key, isGuest: () => accountKey(options.getAccountKey?.()) === 'guest-device', getError: () => lastError });
  }
  return Object.freeze({ create, accountKey, validPlan, PREFIX });
});
