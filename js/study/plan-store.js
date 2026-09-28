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
    return !!plan && typeof plan === 'object' && typeof plan.id === 'string'
      && plan.schemaVersion === 1 && typeof plan.subject === 'string' && date(plan.examDate)
      && Number.isFinite(plan.minutesPerDay) && plan.minutesPerDay >= 15 && plan.minutesPerDay <= 480
      && Array.isArray(plan.topics) && Array.isArray(plan.tasks) && Array.isArray(plan.days)
      && plan.topics.length <= 200 && plan.tasks.length <= 2000
      && plan.topics.every(topic => topic && typeof topic.id === 'string' && typeof topic.title === 'string')
      && plan.tasks.every(task => task && typeof task.id === 'string' && typeof task.title === 'string' && ['pending', 'completed', 'removed'].includes(task.status) && Number.isFinite(task.estimatedMinutes))
      && plan.days.every(day => day && date(day.date) && Array.isArray(day.taskIds));
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
    return Object.freeze({ read, savePlan, select, clearActiveSession, namespace: key, isGuest: () => accountKey(options.getAccountKey?.()) === 'guest-device', getError: () => lastError });
  }
  return Object.freeze({ create, accountKey, validPlan, PREFIX });
});
