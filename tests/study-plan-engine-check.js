// Deterministic calendar and scheduling checks. No real student or external provider is contacted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const E = require('../js/study/plan-engine');
const TODAY = '2026-09-20';
let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log(`PASS ${name}`); }
function config(days = 7, overrides = {}) {
  return {
    id: 'exam-science', subject: 'Science', examDate: E.addDays(TODAY, days), minutesPerDay: 60,
    topics: [{ id: 'motion', title: 'Motion', estimatedMinutes: 30 }, { id: 'atoms', title: 'Atoms', estimatedMinutes: 25 }],
    ...overrides
  };
}
const create = (days, overrides) => E.createPlan(config(days, overrides), { today: TODAY });
function invariants(plan, today = TODAY) {
  const allIds = new Set(plan.tasks.map(item => item.id));
  assert.equal(allIds.size, plan.tasks.length, 'stable task IDs are unique');
  const scheduled = new Set();
  for (const day of plan.days) {
    assert.ok(day.date >= today && day.date < plan.examDate, 'only remaining days before exam');
    const items = day.taskIds.map(id => plan.tasks.find(item => item.id === id));
    for (const item of items) {
      assert.ok(item && item.status !== 'removed');
      assert.equal(item.date, day.date);
      assert.ok(!scheduled.has(item.id), 'task only scheduled once');
      scheduled.add(item.id);
    }
    if (!items.some(item => item.status === 'completed')) {
      assert.ok(items.reduce((sum, item) => sum + item.estimatedMinutes, 0) <= plan.minutesPerDay, 'daily pending work fits budget');
    }
    if (E.daysBetween(today, plan.examDate) > 2 && day.date === E.addDays(plan.examDate, -1)) {
      assert.ok(!items.some(item => item.kind === 'learn' && item.status === 'pending'), 'final day protected from new learning');
    }
  }
  for (const task of plan.tasks.filter(item => item.status === 'pending')) {
    assert.ok(task.date ? scheduled.has(task.id) : plan.unscheduledTaskIds.includes(task.id), 'no silently dropped work');
    assert.ok(task.estimatedMinutes > 0);
    if (task.questionCount) assert.ok(task.questionCount >= 2 && task.questionCount <= 4, 'tiny quiz/practice sets');
    if (task.kind === 'learn') assert.ok(task.estimatedMinutes <= 15, 'micro-learning chunks');
  }
  assert.equal(E.progress(plan).remainingMinutes, E.progress(plan).scheduledMinutes + E.progress(plan).unscheduledMinutes);
}

for (const days of [1, 3, 7, 30]) test(`exam in ${days} days has exactly ${days} preparation dates, tiny sessions, protected revision`, () => {
  const plan = create(days); invariants(plan);
  assert.equal(plan.days.length, days);
  assert.equal(plan.days.at(-1).date, E.addDays(plan.examDate, -1));
  assert.equal(E.progress(plan).daysRemaining, days);
  assert.equal(E.progress(plan).percentage, 0);
  assert.ok(plan.tasks.find(item => item.final && item.kind === 'revision').date);
  assert.ok(plan.tasks.find(item => item.kind === 'mock').date);
  if (days === 1) assert.ok(plan.notices.some(item => item.code === 'crash_plan'));
});

test('local calendar arithmetic is unaffected by DST and validates leap dates', () => {
  assert.equal(E.daysBetween('2026-03-07', '2026-03-10'), 3);
  assert.equal(E.daysBetween('2026-10-31', '2026-11-03'), 3);
  assert.equal(E.addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(E.addDays('2026-12-31', 1), '2027-01-01');
  assert.throws(() => E.normalizeDate('2026-02-29'), { code: 'invalid_date' });
  assert.throws(() => E.normalizeDate('09/20/2026'), { code: 'invalid_date' });
  assert.throws(() => E.addDays(TODAY, 0.5), { code: 'invalid_date' });
});

test('explicit completion persists, is idempotent, and opening or regenerating never completes tasks', () => {
  const before = create(7); const unchanged = JSON.stringify(before);
  const item = before.tasks.find(task => task.date === TODAY);
  const after = E.completeTask(before, item.id, { today: TODAY });
  assert.equal(JSON.stringify(before), unchanged, 'input is never mutated');
  assert.equal(E.progress(after).completedTasks, 1);
  assert.ok(E.progress(after).percentage > 0);
  assert.deepEqual(E.completeTask(after, item.id, { today: TODAY }), after);
  const refreshed = E.rebalance(after, { today: TODAY });
  assert.deepEqual(refreshed.tasks.find(task => task.id === item.id), after.tasks.find(task => task.id === item.id));
  assert.equal(E.progress(E.rebalance(before, { today: TODAY })).completedTasks, 0);
});

test('missed work is carried forward after several days, with a visible explanation', () => {
  const before = create(7); const today = E.addDays(TODAY, 3);
  const beforeIds = before.tasks.filter(item => item.status === 'pending').map(item => item.id);
  const after = E.rebalance(before, { today }); invariants(after, today);
  assert.ok(after.notices.some(item => item.code === 'missed_work'));
  beforeIds.forEach(id => assert.ok(after.tasks.find(item => item.id === id), 'unfinished task retained'));
  assert.ok(after.tasks.some(item => item.missed));
});

test('changing an exam later or earlier preserves completion and keeps old final tasks as archived history', () => {
  let plan = create(7); const id = plan.tasks.find(item => item.date === TODAY).id;
  plan = E.completeTask(plan, id, { today: TODAY });
  for (const days of [10, 3]) {
    const after = E.rebalance(plan, { today: TODAY, examDate: E.addDays(TODAY, days) }); invariants(after);
    assert.equal(after.tasks.find(item => item.id === id).status, 'completed');
    assert.equal(after.days.length, days);
    assert.ok(after.notices.some(item => item.code === 'exam_date_changed'));
    assert.ok(after.tasks.some(item => item.final && item.status === 'removed' && item.removalReason === 'exam_date_changed'));
  }
});

test('exam day and passed exams stop scheduling without dropping unfinished work', () => {
  const before = create(3);
  for (const offset of [3, 4, 20]) {
    const after = E.rebalance(before, { today: E.addDays(TODAY, offset) });
    assert.equal(after.days.length, 0);
    assert.equal(after.status, offset === 3 ? 'exam-day' : 'closed');
    assert.equal(after.unscheduledTaskIds.length, before.tasks.length);
    assert.ok(after.tasks.every(item => item.date === null));
    assert.throws(() => E.completeTask(after, after.tasks[0].id, { today: E.addDays(TODAY, offset) }), { code: 'exam_reached' });
  }
});

test('overload is honest, remains in progress denominator, and cannot crowd out final revision', () => {
  const plan = create(3, { minutesPerDay: 15, topics: [{ id: 'long', title: 'Student supplied long chapter', estimatedMinutes: 480 }] });
  invariants(plan);
  assert.ok(plan.unscheduledTaskIds.length > 0);
  assert.ok(plan.notices.some(item => item.code === 'capacity_warning'));
  assert.ok(E.progress(plan).unscheduledMinutes > E.progress(plan).scheduledMinutes);
  assert.ok(plan.tasks.filter(item => item.final).every(item => item.date));
});

test('weak real quiz results add revision and prioritize the struggling topic', () => {
  const before = create(7);
  const after = E.rebalance(before, { today: TODAY, performance: [{ id: 'quiz-1', topicId: 'motion', score: 1, maxScore: 3, source: 'Tutorly quiz' }] });
  invariants(after);
  assert.ok(after.tasks.some(item => item.topicId === 'motion' && item.adaptive));
  const firstLearning = after.days[0].taskIds.map(id => after.tasks.find(item => item.id === id)).find(item => item.kind === 'learn');
  assert.equal(firstLearning.topicId, 'motion');
  assert.equal(before.performance.length, 0);
  assert.ok(Math.abs(after.performance[0].score - 100 / 3) < 1e-10);
  assert.ok(after.notices.some(item => item.code === 'performance_adaptation'));
});

test('strong actual results reduce optional repetitions but preserve final revision', () => {
  const before = create(30);
  const after = E.rebalance(before, { today: TODAY, performance: [{ topicId: 'motion', score: 96 }] }); invariants(after);
  assert.ok(after.tasks.some(item => item.topicId === 'motion' && item.status === 'removed' && item.removalReason === 'strong_quiz_performance'));
  assert.ok(after.tasks.filter(item => item.final).every(item => item.status === 'pending' && item.date));
  assert.ok(after.notices.some(item => item.code === 'repetition_reduced'));
});

test('unknown or fabricated performance is never inferred and invalid results are rejected', () => {
  const plan = create(7);
  assert.deepEqual(plan.performance, []);
  assert.ok(!plan.tasks.some(item => item.adaptive));
  assert.throws(() => E.rebalance(plan, { today: TODAY, performance: [{ topicId: 'fake', score: 50 }] }), { code: 'unknown_topic' });
  assert.throws(() => E.rebalance(plan, { today: TODAY, performance: [{ topicId: 'motion', score: 999 }] }), { code: 'invalid_input' });
  assert.throws(() => E.rebalance(plan, { today: TODAY, performance: [{ topicId: 'motion' }] }), { code: 'invalid_input' });
  assert.throws(() => E.rebalance(plan, { today: TODAY, performance: [{ topicId: 'motion', score: 30, observedDate: '2026-09-21' }] }), { code: 'invalid_date' });
});

test('syllabus metadata is supplied, not invented, and unverified catalog entries are rejected', () => {
  const title = 'My worksheet, exercise Q7';
  const plan = create(7, { topics: [{ id: 'worksheet:7', title, resourceIds: ['file-1'], curriculumContext: { board: 'CBSE', grade: '9', chapter_id: 'canonical:123' } }] });
  assert.deepEqual(plan.topics.map(item => item.title), [title]);
  assert.equal(plan.topics[0].curriculumContext.chapter_id, 'canonical:123');
  assert.deepEqual(plan.tasks.find(item => item.topicId).resourceIds, ['file-1']);
  assert.throws(() => create(7, { topics: [] }), { code: 'syllabus_required' });
  for (const status of ['needs_review', 'rejected', 'outdated']) {
    assert.throws(() => create(7, { topics: [{ title: 'Unverified', verification_status: status }] }), { code: 'unverified_topic' });
  }
  assert.throws(() => create(7, { topics: [{ id: 'same', title: 'A' }, { id: 'same', title: 'B' }] }), { code: 'duplicate_topic' });
});

test('syllabus edits archive removed topics and completed work instead of losing history', () => {
  const before = create(7); const first = before.tasks.find(item => item.topicId === 'atoms');
  const done = E.completeTask(before, first.id, { today: TODAY });
  const after = E.rebalance(done, { today: TODAY, topics: [{ id: 'motion', title: 'Motion' }, { id: 'new', title: 'My new worksheet' }] }); invariants(after);
  assert.equal(after.tasks.find(item => item.id === first.id).status, 'completed');
  assert.ok(after.tasks.some(item => item.topicId === 'atoms' && item.status === 'removed'));
  assert.ok(after.retiredTopics.some(item => item.id === 'atoms'));
  assert.ok(after.tasks.some(item => item.topicId === 'new'));
});

test('daily time edits keep stable IDs and completed learning durations', () => {
  const before = create(7); const done = E.completeTask(before, before.tasks[0].id, { today: TODAY });
  const after = E.rebalance(done, { today: TODAY, minutesPerDay: 15 }); invariants(after);
  assert.deepEqual(after.tasks.find(item => item.id === done.tasks[0].id), done.tasks[0]);
  before.tasks.filter(item => item.topicId && !item.final).forEach(item => assert.ok(after.tasks.some(next => next.id === item.id)));
});

test('higher target score adds useful practice without inventing mastery', () => {
  const normal = create(7); const ambitious = create(7, { targetScore: 90 });
  assert.ok(ambitious.tasks.filter(item => item.kind === 'practice').length > normal.tasks.filter(item => item.kind === 'practice').length);
  assert.equal(E.progress(ambitious).completedTasks, 0); invariants(ambitious);
});

test('progress cannot round to fully complete while work remains', () => {
  const plan = create(30, { minutesPerDay: 480, topics: Array.from({ length: 10 }, (_, index) => ({ id: `topic-${index}`, title: `Student topic ${index}`, estimatedMinutes: 480 })) });
  plan.tasks.forEach(item => { item.status = 'completed'; });
  plan.tasks.find(item => item.kind === 'quiz').status = 'pending';
  assert.equal(E.progress(plan).percentage, 99);
});

test('long preparation windows include spaced revision instead of random chapter allocation', () => {
  const plan = create(30); const reviews = plan.tasks.filter(item => item.topicId === 'motion' && item.kind === 'revision');
  assert.equal(reviews.length, 3);
  assert.ok(new Set(reviews.map(item => item.date)).size > 1);
  assert.deepEqual(create(30), plan, 'same inputs yield same plan');
});

test('task moving validates deadline, budget, learning order and protected final day', () => {
  const plan = create(7);
  const quiz = plan.tasks.find(item => item.kind === 'quiz' && item.topicId === 'atoms');
  const moved = E.moveTask(plan, quiz.id, E.addDays(TODAY, 4), { today: TODAY }); invariants(moved);
  assert.equal(moved.tasks.find(item => item.id === quiz.id).date, E.addDays(TODAY, 4));
  assert.throws(() => E.moveTask(plan, quiz.id, plan.examDate, { today: TODAY }), { code: 'invalid_task_date' });
  assert.throws(() => E.moveTask(plan, quiz.id, TODAY, { today: TODAY }), { code: 'task_order' });
  const learn = plan.tasks.find(item => item.kind === 'learn');
  assert.throws(() => E.moveTask(plan, learn.id, E.addDays(plan.examDate, -1), { today: TODAY }), { code: 'revision_day' });
  const crowded = create(1, { minutesPerDay: 15 });
  const unscheduled = crowded.tasks.find(item => !item.date && item.status === 'pending');
  assert.throws(() => E.moveTask(crowded, unscheduled.id, TODAY, { today: TODAY }), { code: 'day_full' });
});

test('finishing early releases the future date and records original schedule', () => {
  const plan = create(7); const future = plan.tasks.find(item => item.date > TODAY && item.kind === 'learn');
  const after = E.completeTask(plan, future.id, { today: TODAY });
  const completed = after.tasks.find(item => item.id === future.id);
  assert.equal(completed.date, TODAY); assert.equal(completed.scheduledDate, future.date);
  assert.ok(!after.days.find(item => item.date === future.date).taskIds.includes(future.id));
});

test('multiple plans and JSON round trips stay independent', () => {
  const science = create(7);
  const maths = create(10, { id: 'exam-maths', subject: 'Mathematics', topics: [{ id: 'shared-topic', title: 'My algebra exercise' }] });
  const persisted = JSON.parse(JSON.stringify([science, maths]));
  assert.deepEqual(persisted, [science, maths]);
  const done = E.completeTask(persisted[0], persisted[0].tasks[0].id, { today: TODAY });
  assert.equal(E.progress(done).completedTasks, 1); assert.equal(E.progress(persisted[1]).completedTasks, 0);
  assert.ok(maths.tasks.every(item => !science.tasks.some(other => other.id === item.id)));
});

test('invalid setup and unsupported plan versions fail safely', () => {
  assert.throws(() => create(0), { code: 'exam_not_future' });
  assert.throws(() => create(367), { code: 'exam_too_far' });
  assert.throws(() => create(7, { minutesPerDay: -10 }), { code: 'invalid_input' });
  assert.throws(() => create(7, { subject: '' }), { code: 'invalid_input' });
  assert.throws(() => E.rebalance({ schemaVersion: 999 }, { today: TODAY }), { code: 'invalid_plan' });
});

test('capacity and retention invariants across 168 varied schedules and missed-day rebalances', () => {
  for (const days of [1, 2, 3, 7, 14, 30, 60]) {
    for (const budget of [15, 30, 45, 120]) {
      for (const size of [5, 20, 40, 60, 120, 480]) {
        const plan = create(days, { minutesPerDay: budget, topics: [{ id: 'supplied', title: 'Student supplied topic', estimatedMinutes: size }] });
        invariants(plan);
        const advanced = E.addDays(TODAY, Math.min(2, days - 1));
        invariants(E.rebalance(plan, { today: advanced }), advanced);
      }
    }
  }
});

test('same API loads without Node into an existing browser page', () => {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/study/plan-engine.js'), 'utf8'), sandbox);
  assert.equal(typeof sandbox.window.TutorlyStudyPlanEngine.createPlan, 'function');
  assert.equal(sandbox.window.TutorlyStudyPlanEngine.createPlan(config(7), { today: TODAY }).days.length, 7);
});

console.log(`Study plan engine: ${passed} checks passed.`);
