(function (root) {
  'use strict';
  const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  const button = (text, action, className = 'study-button') => { const node = el('button', className, text); node.type = 'button'; node.addEventListener('click', action); return node; };
  function field(label, control, help) { const wrap = el('label', 'study-field'); wrap.append(el('span', '', label), control); if (help) wrap.append(el('small', '', help)); return wrap; }
  function input(type, value = '', options = {}) { const node = el('input'); node.type = type; node.value = value; Object.entries(options).forEach(([key, value]) => node.setAttribute(key, value)); return node; }
  const safeList = value => Array.isArray(value) ? value : [];
  function create(options) {
    const container = options.container;
    if (!container) throw new Error('Study Bot needs its existing Tutorly workspace container.');
    const engine = root.TutorlyStudyPlanEngine;
    const store = root.TutorlyStudyPlanStore.create({ getAccountKey: options.getAccountKey });
    let namespace = store.namespace(), view = 'list', step = 0, draft = {}, catalog = null, profile = {}, busy = false, loadToken = 0;
    let statusNode, activePlanId = null;
    let subjectChoices = [];
    root.TutorlyEducation?.load().then(registry => { subjectChoices = registry.subjects; if (view === 'setup' && step === 1) render(); }).catch(() => {});
    const today = () => engine.todayDate();
    const dateLabel = date => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const getPlan = () => store.read().plans.find(item => item.id === activePlanId) || null;
    function ensureAccount() {
      const current = store.namespace();
      if (namespace !== current) { namespace = current; activePlanId = null; draft = {}; view = 'list'; catalog = null; profile = {}; busy = false; ++loadToken; }
    }
    function announce(message, error = false) { if (!statusNode) return; statusNode.textContent = message || ''; statusNode.classList.toggle('study-error', error); }
    function run(action, message) {
      try { ensureAccount(); action(); render(); announce(store.getError() || message || 'Plan updated.'); }
      catch (error) { announce(error.message || 'Tutorly could not update this plan. Please try again.', true); }
    }
    function persist(next) { store.savePlan(next); activePlanId = next.id; }
    function initialDraft(seed = {}) {
      const context = root.TutorlyCurriculum?.getActiveContext?.();
      return { subject: seed.subject || context?.subject || '', title: seed.title || '', examDate: seed.examDate || engine.addDays(today(), 7), minutesPerDay: seed.minutesPerDay || 45,
        targetScore: seed.targetScore ?? '', concerns: seed.concerns || '', selected: new Set(), manualTopics: safeList(seed.topics).map(item => typeof item === 'string' ? item : item.title).filter(Boolean).join('\n'), resourceLabels: '', materials: [], pastedNotes: '' };
    }
    async function loadCatalog(refresh = false) {
      const token = ++loadToken, account = store.namespace(); busy = true;
      try {
        profile = await Promise.resolve(options.getProfile?.() || root.TutorlyCurriculum?.currentProfile?.() || {});
        if (profile?.user) profile = profile.user;
        const next = await root.TutorlyCurriculum?.load?.({ profile, refresh });
        if (token !== loadToken || account !== store.namespace()) return;
        catalog = next || { available: false, message: 'Curriculum is unavailable. Add your own topic titles below.' };
      } catch (_) { if (token === loadToken) catalog = { available: false, status: 'error', message: 'Tutorly could not load your curriculum. You can retry or add your own topics.' }; }
      finally { if (token === loadToken && account === store.namespace()) { busy = false; if (view === 'setup' && step === 4) render(); } }
    }
    function verifiedChapters(subject) {
      return safeList(catalog?.subjects).filter(item => String(item.name).toLowerCase() === String(subject).toLowerCase()).flatMap(item => safeList(item.books).flatMap(book => safeList(book.chapters)
        .filter(chapter => chapter.verification_status === 'verified')
        .map(chapter => ({ id: chapter.id, title: chapter.name, book: book.title, curriculumContext: { board: catalog.board || profile.board, grade: String(catalog.grade || profile.grade || ''), academic_year: catalog.academic_year, medium: catalog.medium, subject_id: item.id, subject: item.name, book_id: book.id, book: book.title, chapter_id: chapter.id, chapter: chapter.name, source_url: chapter.source_url } }))));
    }
    function topicsFromDraft() {
      const selected = verifiedChapters(draft.subject).filter(chapter => draft.selected.has(chapter.id)).map(chapter => ({ id: chapter.id, title: chapter.title, curriculumContext: chapter.curriculumContext }));
      const manual = draft.manualTopics.split(/\n/).map(text => text.trim()).filter(Boolean).slice(0, 40).map(title => ({ id: `student:${title.toLowerCase().replace(/\s+/g, '-').slice(0, 100)}`, title, curriculumContext: { source: 'student-provided', subject: draft.subject, board: profile.board || '', grade: String(profile.grade || '') } }));
      return [...new Map([...selected, ...manual].map(topic => [topic.id, topic])).values()];
    }
    function header(title, subtitle) {
      const head = el('header', 'study-heading');
      const words = el('div'); words.append(el('p', 'study-eyebrow', 'TUTORLY · STUDY BOT'), el('h1', '', title), el('p', 'study-subtitle', subtitle));
      head.append(words, button('Back to chat', () => options.onReturnToChat?.(), 'study-button study-button-quiet'));
      container.append(head);
      if (store.isGuest()) container.append(el('p', 'study-storage-note', 'Guest plans stay on this device only. Signing in uses your account’s separate plans.'));
      else container.append(el('p', 'study-storage-note', 'Saved for your account in this browser. Cross-device sync is not available yet.'));
      statusNode = el('p', 'study-status'); statusNode.setAttribute('role', 'status'); statusNode.setAttribute('aria-live', 'polite'); container.append(statusNode);
      if (view !== 'setup') {
        const backup = el('details'); backup.append(el('summary', '', 'Back up or restore plans'));
        backup.append(el('p', 'study-storage-note', 'Clearing site data removes browser-only plans. Backups may contain private notes; keep yours safe. Restoring adds missing plans to the current account/device and never overwrites existing IDs.'));
        backup.append(button('Download backup', () => {
          const url = URL.createObjectURL(new Blob([store.exportPlans()], {type:'application/json'}));
          const link = el('a'); link.href = url; link.download = 'tutorly-study-backup.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
        }));
        const restore = input('file', '', {accept:'.json,application/json'});
        restore.addEventListener('change', async () => {
          const owner = store.namespace(), file = restore.files?.[0]; if (!file) return;
          try {
            if (file.size > 2000000) throw new Error('Use a backup under 2 MB.');
            const text = await file.text(); if (owner !== store.namespace()) throw new Error('Account changed. Choose the backup again.');
            store.importPlans(text); render(); announce(store.getError() || 'Missing plans restored. Existing plans kept.');
          } catch (error) { announce(error.message || 'Backup could not be restored; saved plans kept.',true); }
          restore.value = '';
        });
        backup.append(field('Restore backup', restore)); container.append(backup);
      }
    }
    function showList() {
      header('A calmer way to prepare', 'Choose what you’re preparing for. Tutorly will turn the time you have into a practical study plan.');
      container.append(button('Create study plan', () => { draft = initialDraft(); step = 0; view = 'setup'; render(); loadCatalog(); }, 'study-button study-button-primary'));
      const plans = store.read().plans;
      if (!plans.length) { const empty = el('section', 'study-empty'); empty.append(el('h2', '', 'One day at a time'), el('p', '', 'Add an exam, the topics you need, and a little time each day. Learn, practise and revise in the same Tutorly conversation.')); container.append(empty); return; }
      const list = el('div', 'study-plan-list');
      plans.forEach(plan => {
        const card = el('article', 'study-plan-card'); const progress = engine.progress(plan, { today: today() });
        card.append(el('p', 'study-eyebrow', plan.status === 'closed' || plan.examDate < today() ? 'EXAM DATE PASSED' : `${dateLabel(plan.examDate)} · ${plan.minutesPerDay} min/day`), el('h2', '', plan.title || plan.subject), el('p', '', `${progress.completedTasks} of ${progress.totalTasks} tasks completed`));
        const meter = el('progress'); meter.max = 100; meter.value = progress.percentage; meter.setAttribute('aria-label', `${plan.subject} completed tasks`); card.append(meter);
        card.append(button('Open plan', () => run(() => { activePlanId = plan.id; if (plan.updatedDate !== today() || plan.tasks.some(task => task.status === 'pending' && task.date && task.date < today())) persist(engine.rebalance(plan, { today: today() })); view = 'detail'; }, 'Your saved plan is ready.'))); list.append(card);
      }); container.append(list);
    }
    function setup() {
      header('Let’s make your study plan', 'Your saved Board and Grade are reused automatically. No extra profile setup here.');
      container.append(el('p', 'study-eyebrow', `STEP ${step + 1} OF 5 · ${['Exam date', 'Subject', 'Your goal', 'Study material', 'Review topics'][step]}`));
      const meter = el('progress'); meter.max = 5; meter.value = step + 1; meter.setAttribute('aria-label', 'Study setup progress'); container.append(meter);
      const form = el('form', 'study-setup'); form.noValidate = true;
      form.addEventListener('submit', event => { event.preventDefault(); advance(); });
      let capture = () => {}, readingFiles = false;
      if (step === 1) {
        form.append(el('h2', '', 'What are you preparing for?'));
        const subject = el('select'); subject.required = true;
        const names = [...new Set([...safeList(catalog?.subjects).map(item => item.name), ...subjectChoices.map(item => item.name), ...(draft.subject ? [draft.subject] : [])])];
        [['', 'Choose your subject'], ...names.map(name => [name,name]), ['__custom','Another subject…']].forEach(([value,label]) => { const option=el('option','',label); option.value=value; subject.append(option); }); subject.value=draft.subject;
        const custom=input('text','',{maxlength:'100',placeholder:'Subject name'}); const customField=field('Your subject',custom); customField.hidden=true;
        subject.addEventListener('change',()=>{customField.hidden=subject.value!=='__custom';draft.subject=customField.hidden?subject.value:custom.value;if(!customField.hidden)custom.focus();});
        custom.addEventListener('input',()=>{draft.subject=custom.value;});
        form.append(field('Subject',subject,'These are subject choices, not a claim that a verified syllabus is available.'),customField);
        if (!names.length) form.append(button('Reload subject choices',async()=>{try{subjectChoices=(await root.TutorlyEducation.load()).subjects;render();}catch(_){announce('Could not load subjects. Choose Another subject to continue.',true);}}));
        capture=()=>{draft.subject=(subject.value==='__custom'?custom.value:subject.value).trim();if(!draft.subject){subject.focus();throw new Error('Choose a subject to continue.');}};
      } else if (step === 0) {
        form.append(el('h2', '', 'When is your exam?'));
        const dateSummary=el('p','study-date-summary');dateSummary.setAttribute('role','status');const updateDate=date=>{draft.examDate=date;dateSummary.textContent=`${dateLabel(date)} · ${engine.daysBetween(today(),date)} preparation days`;};
        const calendar=root.TutorlyStudyControls.calendar({value:draft.examDate,min:engine.addDays(today(),1),max:engine.addDays(today(),365),onChange:updateDate});updateDate(draft.examDate);
        const shortcuts=el('div','study-actions study-date-shortcuts');[[1,'Tomorrow'],[3,'In 3 days'],[7,'In a week'],[30,'In a month']].forEach(([days,label])=>shortcuts.append(button(label,()=>{const date=engine.addDays(today(),days);calendar.setValue(date);updateDate(date);})));form.append(shortcuts,calendar.element,dateSummary);
        const minutes=input('range',draft.minutesPerDay,{min:'15',max:'120',step:'5'}),minutesOutput=el('output','study-range-value',`${draft.minutesPerDay} min/day`);
        minutes.addEventListener('input',()=>{draft.minutesPerDay=Number(minutes.value);minutesOutput.textContent=`${draft.minutesPerDay} min/day`;});form.append(field('Time to study each day',minutes),minutesOutput);
        capture=()=>{if(!draft.examDate||draft.examDate<=today())throw new Error('Choose a future exam date.');};
      } else if (step === 2) {
        form.append(el('h2', '', 'What would make you feel ready?'));
        const target = root.TutorlyStudyControls.scoreRing({value:draft.targetScore,onChange:value=>{draft.targetScore=value;}});
        const concerns = el('textarea'); concerns.rows = 3; concerns.maxLength = 600; concerns.value = draft.concerns; concerns.placeholder = 'For example: I understand the ideas but struggle with calculations.';
        concerns.addEventListener('input', () => { draft.concerns = concerns.value; });
        const worryChoices=el('div','study-worry-choices');['Getting started','Too much to cover','Understanding concepts','Remembering what I learn','Running out of time'].forEach(text=>{const choice=button(text,()=>{draft.concerns=text;concerns.value=text;Array.from(worryChoices.children).forEach(item=>item.setAttribute('aria-pressed',String(item===choice)));});choice.setAttribute('aria-pressed',String(draft.concerns===text));worryChoices.append(choice);});
        form.append(target.element,el('h3','','What worries you most?'),worryChoices,field('Anything else? (optional)',concerns));
        capture=()=>{draft.targetScore=target.getValue();draft.concerns=concerns.value;};
      } else if (step === 3) {
        form.append(el('h2', '', 'Bring your study material'), el('p', 'study-subtitle', 'Add the notes or pages you need for this exam. No material? Continue and choose your topics.'));
        const upload = input('file', '', { accept: '.pdf,.txt,.jpg,.jpeg,.png', multiple: '' });
        form.append(field('Add files or a photo of your notes', upload, 'PDF, TXT, JPG or PNG · up to 5 MB each · up to 5 files. PDFs need selectable text; photos use the existing image reader.'));
        const uploadStatus = el('p', 'study-status'); uploadStatus.setAttribute('role', 'status'); form.append(uploadStatus);
        upload.addEventListener('change', async () => {
          const files = Array.from(upload.files || []), owner = namespace, currentDraft = draft;
          if (draft.materials.length + files.length > 5) { uploadStatus.textContent = 'Use up to 5 files. Remove one before adding more.'; return; }
          readingFiles = true; upload.disabled = true; next.disabled = true;
          try {
            for (const file of files) {
              uploadStatus.textContent = `Reading ${file.name}…`;
              const result = await root.TutorlyStudyMaterials.readFile(file);
              if (store.namespace() !== owner || draft !== currentDraft) return;
              draft.materials.push({ id: root.crypto?.randomUUID?.() || `notes-${Date.now()}-${draft.materials.length}`, label: file.name, text: result.text, partial: result.partial, source: 'student-material' });
            }
            if (view === 'setup' && step === 3) { render(); announce('Notes read. Review the extracted text before continuing.'); }
          } catch (error) { uploadStatus.textContent = `${error.message} You can choose the file again to retry. Previously read files are kept.`; }
          finally { readingFiles = false; upload.disabled = false; upload.value = ''; next.disabled = false; }
        });
        draft.materials.forEach((material, index) => {
          const details = el('details', 'study-day'); details.append(el('summary', '', `${material.label}${material.partial ? ' · partial text' : ' · ready'}`));
          const text = el('textarea'); text.rows = 5; text.maxLength = 24000; text.value = material.text; text.addEventListener('input', () => { material.text = text.value; });
          details.append(field('Review extracted notes', text, 'Correct reading errors here. These notes are not verified curriculum.'), button('Remove file', () => { draft.materials.splice(index, 1); render(); })); form.append(details);
        });
        const pasted = el('textarea'); pasted.rows = 5; pasted.maxLength = 24000; pasted.value = draft.pastedNotes; pasted.placeholder = 'Paste the relevant section of your notes here…'; pasted.addEventListener('input', () => { draft.pastedNotes = pasted.value; });
        form.append(field('Or paste your notes', pasted), el('p', 'study-storage-note', 'Extracted text stays with this plan in this browser and is sent to Tutorly’s existing AI when you study. Original files are not stored by this uploader. Avoid personal or sensitive information.'));
        capture = () => { draft.pastedNotes = pasted.value; const length = draft.materials.reduce((n, item) => n + item.text.length, 0) + pasted.value.length; if (length > 24000) throw new Error('Keep the combined notes under 24,000 characters. Trim the text to the sections for this exam.'); };
      } else {
        form.append(el('h2', '', 'What needs to go into your plan?'));
        const meta = [profile.board, profile.grade ? `Grade ${profile.grade}` : '', catalog?.academic_year].filter(Boolean).join(' · '); if (meta) form.append(el('p', 'study-subtitle', meta));
        const chapters = verifiedChapters(draft.subject);
        if (busy) form.append(el('p', '', 'Loading your verified curriculum…'));
        else if (!chapters.length) {
          form.append(el('p', 'study-subtitle', catalog?.message || 'No verified chapters are available for this subject yet. Add the topic titles from your class below.'));
          if (catalog?.status === 'error') form.append(button('Retry curriculum', () => loadCatalog(true)));
          if (catalog?.status === 'profile_incomplete') { const link = el('a', '', 'Update Board and Grade in Profile'); link.href = 'profile.html'; form.append(link); }
        } else {
          const search = input('search', '', { placeholder: 'Search verified chapters…' }); form.append(field('Your curriculum chapters', search));
          const list = el('div', 'study-chapter-options');
          chapters.forEach(chapter => { const check = input('checkbox'); check.checked = draft.selected.has(chapter.id); check.addEventListener('change', () => check.checked ? draft.selected.add(chapter.id) : draft.selected.delete(chapter.id)); const label = field(chapter.title, check, chapter.book); label.classList.add('study-check'); label.dataset.search = `${chapter.title} ${chapter.book}`.toLowerCase(); list.append(label); });
          search.addEventListener('input', () => Array.from(list.children).forEach(node => { node.hidden = !node.dataset.search.includes(search.value.trim().toLowerCase()); })); form.append(list);
        }
        const manual = el('textarea'); manual.rows = 4; manual.maxLength = 5000; manual.value = draft.manualTopics; manual.placeholder = 'One topic per line';
        manual.addEventListener('input', () => { draft.manualTopics = manual.value; });
        form.append(field('Add your own topics', manual, 'Student-provided titles stay separate from verified curriculum metadata. Copy the headings you want to study from your notes; Tutorly will not invent syllabus entries.'));
        if (draft.materials.length || draft.pastedNotes.trim()) form.append(el('p', 'study-notice', 'Your notes will support these topics. Check the titles against your exam syllabus before creating the plan.'));
        capture = () => { draft.manualTopics = manual.value; if (!topicsFromDraft().length) { manual.focus(); throw new Error('Choose at least one verified chapter or add a topic from your notes.'); } };
      }
      function advance() {
        try {
          if (readingFiles) throw new Error('Please wait while your notes are being read.');
          capture();
          if (step < 4) { step++; render(); return; }
          const topics = topicsFromDraft(); const resources = [...draft.materials, ...(draft.pastedNotes.trim() ? [{ id: 'pasted-notes', label: 'Pasted notes', text: draft.pastedNotes.trim(), source: 'student-material' }] : [])].filter(item => item.text.trim()).map(item => ({ ...item, topicIds: topics.map(topic => topic.id) }));
          const plan = engine.createPlan({ id: root.crypto?.randomUUID?.() || `study-${Date.now()}`, title: draft.title || `${draft.subject} exam prep`, subject: draft.subject, examDate: draft.examDate, minutesPerDay: draft.minutesPerDay, topics: topics.map(topic => ({ ...topic, resourceIds: resources.map(item => item.id) })), resourceIds: resources.map(item => item.id), targetScore: draft.targetScore === '' ? undefined : Number(draft.targetScore), concerns: draft.concerns, curriculumContext: { board: profile.board || '', grade: String(profile.grade || ''), subject: draft.subject } }, { today: today() });
          persist({ ...plan, materials: resources, resourceLabels: resources.map(({id, label, source}) => ({id, label, source})) }); view = 'detail'; render(); announce(store.getError() || 'Your study plan is ready.');
        } catch (error) { announce(error.message || 'Please check your plan details.', true); }
      }
      const actions = el('div', 'study-actions'); actions.append(button(step === 0 ? 'Cancel' : 'Back', () => { if (readingFiles) { announce('Please wait while your notes are being read.'); return; } try { capture(); } catch (_) {} if (step > 0) step--; else view = 'list'; render(); }, 'study-button study-button-quiet'));
      const next = el('button', 'study-button study-button-primary', step === 4 ? 'Create my plan' : 'Continue'); next.type = 'submit'; actions.append(next); form.append(actions); container.append(form);
    }
    function taskRow(plan, task) {
      const row = el('article', 'study-task'); row.dataset.taskId = task.id;
      const copy = el('div', 'study-task-copy'); copy.append(el('p', 'study-eyebrow', `${task.kind}${task.part ? ` · part ${task.part}` : ''} · ${task.estimatedMinutes} min`), el('h3', '', task.title));
      if (task.questionCount) copy.append(el('small', '', `${task.questionCount} questions planned`));
      row.append(copy);
      if (task.status === 'completed') {
        row.append(el('span', 'study-complete', 'Completed'));
        if (today() < plan.examDate) row.append(button('Undo completion', () => run(() => persist(engine.reopenTask(plan, task.id, { today: today() })), 'Task reopened and remaining work rebalanced. Quiz evidence is kept.')));
        const review = el('a', 'study-button', 'Review in Tutorly');
        review.href = plan.conversationId ? `maths_gpt.html?conversationId=${encodeURIComponent(plan.conversationId)}` : 'maths_gpt.html';
        row.append(review); return row;
      }
      if (today() >= plan.examDate) { row.append(el('span', 'study-subtitle', 'Preparation ended')); return row; }
      const actions = el('div', 'study-task-actions');
      actions.append(button('Start', () => run(() => { store.select(plan.id, task.id); options.onStudyTask?.(plan, task); }, 'Task opened in Tutorly chat.'), 'study-button study-button-primary'));
      actions.append(button('Mark done', () => run(() => persist(engine.completeTask(plan, task.id, { today: today() })), 'Task marked complete.'), 'study-button study-button-quiet'));
      const move = el('details', 'study-move'); move.append(el('summary', '', 'Move')); const moveForm = el('form'); moveForm.noValidate = true; const date = input('date', task.date || today(), { min: today(), max: engine.addDays(plan.examDate, -1) }); moveForm.append(field('Move task to date', date)); const submit = el('button', 'study-button', 'Save date'); submit.type = 'submit'; moveForm.append(submit); moveForm.addEventListener('submit', event => { event.preventDefault(); run(() => persist(engine.moveTask(plan, task.id, date.value, { today: today() })), 'Task moved.'); }); move.append(moveForm); actions.append(move); row.append(actions); return row;
    }
    function detail() {
      const plan = getPlan(); if (!plan) { view = 'list'; showList(); return; }
      const daysRemaining = Math.max(0, engine.daysBetween(today(), plan.examDate));
      header(plan.title || plan.subject, `${dateLabel(plan.examDate)} · ${plan.minutesPerDay} minutes a day · ${daysRemaining} days remaining`);
      const controls = el('div', 'study-actions'); controls.append(button('All plans', () => { view = 'list'; render(); }, 'study-button study-button-quiet'), button('Edit plan', () => { view = 'edit'; render(); }), button('Rebalance unfinished work', () => run(() => persist(engine.rebalance(plan, { today: today() })), 'Unfinished work rebalanced. Completed work is unchanged.'))); container.append(controls);
      const todayTask = plan.tasks.find(task => task.status === 'pending' && task.date === today());
      if (todayTask && daysRemaining > 0) container.append(button('Start today’s study', () => { store.select(plan.id, todayTask.id); options.onStudyTask?.(plan, todayTask); }, 'study-button study-button-primary'));
      const progress = engine.progress(plan, { today: today() }); const meter = el('progress'); meter.max = 100; meter.value = progress.percentage; meter.setAttribute('aria-label', 'Completed planned study time');
      const progressWrap = el('section', 'study-progress'); progressWrap.append(el('p', '', `${progress.completedTasks} of ${progress.totalTasks} tasks completed · ${progress.percentage}% of planned study time`), meter, el('small', '', 'Weighted by each task’s planned minutes. Only tasks you mark done count, not page visits.')); container.append(progressWrap);
      safeList(plan.notices).forEach(notice => container.append(el('p', 'study-notice', notice.message)));
      if (plan.examDate < today()) container.append(el('p', 'study-notice', 'Your exam date has passed. Completed work remains saved. Edit the date to continue this plan.'));
      const tasks = new Map(plan.tasks.filter(task => task.status !== 'removed').map(task => [task.id, task]));
      plan.days.forEach(day => {
        const rows = safeList(day.taskIds).map(id => tasks.get(id)).filter(Boolean); if (!rows.length && day.date !== today() && day.date !== engine.addDays(today(), 1)) return;
        const section = el('details', 'study-day'); section.open = day.date === today() || day.date === engine.addDays(today(), 1);
        const relative = day.date === today() ? 'Today' : day.date === engine.addDays(today(), 1) ? 'Tomorrow' : dateLabel(day.date);
        section.append(el('summary', '', `${relative}${day.date === plan.examDate ? ' · Exam day' : ''} · ${rows.length} tasks`));
        if (!rows.length) section.append(el('p', 'study-subtitle', 'No tasks scheduled. Keep this time free, or move an unfinished task here.'));
        rows.forEach(task => section.append(taskRow(plan, task))); container.append(section);
      });
      const examDay = el('details', 'study-day'); examDay.append(el('summary', '', `${dateLabel(plan.examDate)} · Exam day`), el('p', 'study-subtitle', 'Preparation ends before your exam. Leave room to rest and get ready.')); container.append(examDay);
      const visibleIds = new Set(plan.days.flatMap(day => safeList(day.taskIds)));
      const completedHistory = plan.tasks.filter(task => task.status === 'completed' && !visibleIds.has(task.id));
      if (completedHistory.length) { const history = el('details', 'study-day'); history.append(el('summary', '', `Completed earlier · ${completedHistory.length} tasks`)); completedHistory.forEach(task => history.append(taskRow(plan, task))); container.append(history); }
      const unscheduled = safeList(plan.unscheduledTaskIds).map(id => tasks.get(id)).filter(task => task && task.status !== 'completed');
      if (unscheduled.length) { const backlog = el('details', 'study-day'); backlog.open = true; backlog.append(el('summary', '', `Needs more time · ${unscheduled.length} tasks`), el('p', 'study-subtitle', 'These tasks do not fit yet. Add daily time, reduce topics, or move the exam date.')); unscheduled.forEach(task => backlog.append(taskRow(plan, task))); container.append(backlog); }
      if (safeList(plan.materials).length) { const materials = el('details', 'study-day'); materials.append(el('summary', '', 'Your study material'));
        plan.materials.forEach(item => { const preview = el('details'); preview.append(el('summary', '', item.label), el('p', 'study-notes-preview', item.text), button('Remove notes', () => run(() => persist({ ...plan, materials: plan.materials.filter(source => source.id !== item.id), resourceLabels: safeList(plan.resourceLabels).filter(source => source.id !== item.id) }), 'Notes removed from this plan. Previously sent chat messages are unchanged.'))); materials.append(preview); }); container.append(materials);
      } else if (safeList(plan.resourceLabels).length) { const reminders = el('p', 'study-subtitle', `Material reminders (labels only): ${plan.resourceLabels.map(item => item.label).join(', ')}`); container.append(reminders); }
      const results = el('details', 'study-day'); results.append(el('summary', '', 'Use previous quiz results (optional)'), el('p', 'study-subtitle', 'Earlier Tutorly test history is stored device-wide and may include another person’s work. Only import it if these are your results. Only exact single-chapter, Board and Grade matches are used.'));
      const consent = input('checkbox'); const consentLabel = field('These are my results on this device', consent); consentLabel.classList.add('study-check'); results.append(consentLabel);
      results.append(button('Use matching quiz results from this device', () => {
        if (!consent.checked) { announce('Confirm that the stored results are yours before importing them.', true); consent.focus(); return; }
        run(() => {
          let reports; try { reports = JSON.parse(localStorage.getItem('tutorly_exam_history') || '[]'); } catch (_) { throw new Error('Stored quiz results could not be read.'); }
          const normalizeBoard = root.TutorlyCurriculum?.normalizeBoard || (value => String(value || '').toUpperCase());
          const normalizeGrade = root.TutorlyCurriculum?.normalizeGrade || (value => String(value || '').replace(/\D/g, ''));
          const performance = [];
          safeList(reports).slice(0, 60).forEach(report => {
            const ids = safeList(report.chapterIds); if (ids.length !== 1 || !report.id || !report.board || !report.grade) return;
            const topic = plan.topics.find(item => item.id === ids[0] && item.curriculumContext?.chapter_id === ids[0]); if (!topic) return;
            const context = topic.curriculumContext;
            if (!context.board || !context.grade || normalizeBoard(report.board) !== normalizeBoard(context.board) || normalizeGrade(report.grade) !== normalizeGrade(context.grade)) return;
            const total = Number(report.total), correct = Number(report.correct); if (!Number.isInteger(total) || total <= 0 || !Number.isInteger(correct) || correct < 0 || correct > total) return;
            const observedDate = String(report.date || '').slice(0, 10); try { engine.normalizeDate(observedDate); } catch (_) { return; } if (observedDate > today()) return;
            performance.push({ id: `existing-quiz:${report.id}:${topic.id}`.slice(0, 250), topicId: topic.id, score: correct, maxScore: total, source: 'existing single-chapter test (device history)', observedDate });
          });
          if (!performance.length) throw new Error('No matching single-chapter results were found. Your plan has not changed.');
          persist(engine.rebalance(plan, { today: today(), performance }));
        }, 'Matching quiz results saved. Your remaining plan now considers those results.');
      })); container.append(results);
    }
    function edit() {
      const plan = getPlan(); if (!plan) { view = 'list'; showList(); return; }
      header('Adjust your plan', 'Changes apply to unfinished work. Completed tasks stay saved.');
      const form = el('form', 'study-setup'); form.noValidate = true;
      const exam = input('date', plan.examDate, { min: engine.addDays(today(), 1) }); const minutes = input('number', plan.minutesPerDay, { min: '15', max: '480' }); form.append(field('Exam date', exam), field('Minutes per day', minutes));
      const selected = new Set(plan.topics.map(topic => topic.id)); const topics = el('fieldset', 'study-topic-edit'); topics.append(el('legend', '', 'Topics to keep'));
      plan.topics.forEach(topic => { const check = input('checkbox'); check.checked = true; check.addEventListener('change', () => check.checked ? selected.add(topic.id) : selected.delete(topic.id)); const label = field(topic.title, check); label.classList.add('study-check'); topics.append(label); }); form.append(topics);
      const extra = el('textarea'); extra.rows = 3; extra.maxLength = 4000; form.append(field('Add topics (one per line)', extra, 'Added titles are student-provided, not verified syllabus entries.'));
      const actions = el('div', 'study-actions'); actions.append(button('Cancel', () => { view = 'detail'; render(); }, 'study-button study-button-quiet')); const save = el('button', 'study-button study-button-primary', 'Save and rebalance'); save.type = 'submit'; actions.append(save); form.append(actions);
      form.addEventListener('submit', event => { event.preventDefault(); run(() => { const added = extra.value.split(/\n/).map(title => title.trim()).filter(Boolean).map(title => ({ id: `student:${title.toLowerCase().replace(/\s+/g, '-').slice(0, 100)}`, title, curriculumContext: { ...plan.curriculumContext, source: 'student-provided' } })); const topics = [...new Map([...plan.topics.filter(topic => selected.has(topic.id)), ...added].map(topic => [topic.id, topic])).values()]; persist(engine.rebalance(plan, { today: today(), examDate: exam.value, minutesPerDay: Number(minutes.value), topics })); view = 'detail'; }, 'Plan updated; completed tasks preserved.'); }); container.append(form);
    }
    function render() {
      ensureAccount(); container.replaceChildren(); container.classList.add('study-planner');
      container.scrollTop = 0;
      if (!engine) { container.append(el('p', 'study-error', 'Study Bot could not load. Refresh Tutorly to try again.')); return; }
      if (view === 'setup') setup(); else if (view === 'detail') detail(); else if (view === 'edit') edit(); else showList();
      if (store.getError()) announce(store.getError(), true);
    }
    function getActiveSessionContext() {
      ensureAccount(); const state = store.read(); const plan = state.plans.find(item => item.id === state.activePlanId); const task = plan?.tasks.find(item => item.id === state.activeTaskId);
      if (!plan || !task || task.status === 'removed') return null;
      const topic = plan.topics.find(item => item.id === task.topicId);
      const progress = engine.progress(plan, { today: today() });
      return { planId: plan.id, planTitle: plan.title, conversationId: plan.conversationId || null, completedTasks: progress.completedTasks, totalTasks: progress.totalTasks, subject: plan.subject, examDate: plan.examDate, minutesPerDay: plan.minutesPerDay, taskId: task.id, taskTitle: task.title, taskKind: task.kind, taskStatus: task.status, topicId: task.topicId, topicTitle: topic?.title || task.title, topicTitles: plan.topics.filter(item => !task.topicId || item.id === task.topicId).map(item => item.title), topics: plan.topics.map(item => ({id: item.id, title: item.title})), performanceEvidence: safeList(plan.studyChecks).slice(-8), estimatedMinutes: task.estimatedMinutes, questionCount: task.questionCount || null, targetScore: plan.targetScore, concerns: plan.concerns, curriculumContext: topic?.curriculumContext || plan.curriculumContext || {}, resourceLabels: safeList(plan.resourceLabels).filter(item => safeList(task.resourceIds).includes(item.id)).map(item => item.label) };
    }
    function completeActiveTask() {
      const context = getActiveSessionContext(); if (!context) return false;
      const plan = store.read().plans.find(item => item.id === context.planId); persist(engine.completeTask(plan, context.taskId, { today: today() })); if (!container.hidden) render(); if (store.getError()) throw new Error(store.getError()); return true;
    }
    function recordPerformance(result = {}) {
      const context = getActiveSessionContext(); if (!context) return false;
      const plan = store.read().plans.find(item => item.id === context.planId); const score = Number(result.score ?? (Number(result.total) > 0 ? Number(result.correct) / Number(result.total) * 100 : NaN));
      if (!Number.isFinite(score) || score < 0 || score > 100) return false;
      const performance = [{ id: result.id || `${context.taskId}:${result.source || 'result'}:${today()}`, topicId: result.topicId || context.topicId, score, source: result.source || 'student-result', observedDate: today() }];
      const next = engine.rebalance(plan, { today: today(), performance });
      if (Number.isInteger(result.correct) && Number.isInteger(result.total) && result.total > 0 && result.correct >= 0 && result.correct <= result.total) {
        const topic = plan.topics.find(item => item.id === performance[0].topicId);
        next.studyChecks = [...safeList(plan.studyChecks), { record_id: performance[0].id, topic: topic.title, correct: result.correct, total: result.total, source: 'student_report' }].slice(-30);
      }
      persist(next); if (!container.hidden) render(); if (store.getError()) throw new Error(store.getError()); return true;
    }
    function quizAttempt(check, id, answers, result) {
      ensureAccount(); const state = store.read(); const plan = state.plans.find(item => item.id === check.plan_id);
      if (!plan) return null;
      const previous = safeList(plan.studyQuizAttempts).find(item => item.id === id);
      if (!answers) return previous || null;
      if (state.activePlanId !== plan.id || state.activeTaskId !== check.task_id || today() >= plan.examDate) throw new Error('Open this task from your plan before saving answers.');
      const checked = root.TutorlyStudyQuiz.normalize(check);
      if (!checked || !answers.every((value, i) => checked.questions[i] && Number.isInteger(value) && value >= 0 && value < checked.questions[i].options.length)) throw new Error('This answer could not be saved safely.');
      // First attempts are immutable: review/refresh/retry must not inflate scores.
      if (previous && previous.answers.some((value, i) => answers[i] !== value)) throw new Error('Your first answer is already saved. Request another check to practise again.');
      const attempt = { id, taskId: check.task_id, answers: answers.slice(), scored: !!previous?.scored };
      let next = { ...plan };
      if (result && !attempt.scored) {
        const scored = root.TutorlyStudyQuiz.score(checked, answers); if (!scored) throw new Error('Answer every question before saving this check.');
        const performance = [], evidence = [];
        scored.topics.forEach((item, index) => {
          const topic = plan.topics.find(topic => topic.title.trim().toLowerCase() === item.topic.trim().toLowerCase()); if (!topic) return;
          performance.push({ id: `${id}:${index}`, topicId: topic.id, score: item.correct / item.total * 100, source: 'study-quiz', observedDate: today() });
          evidence.push({ record_id: `${id}:${index}`, topic: topic.title, correct: item.correct, total: item.total, source: 'quiz' });
        });
        next = engine.rebalance(plan, { today: today(), performance });
        next.studyChecks = [...safeList(plan.studyChecks), ...evidence].slice(-30);
        attempt.scored = true;
      }
      next.studyQuizAttempts = [...safeList(plan.studyQuizAttempts).filter(item => item.id !== id), attempt].slice(-200);
      persist(next); if (store.getError()) throw new Error(store.getError()); return attempt;
    }
    function getMaterials() {
      const context = getActiveSessionContext(); if (!context) return [];
      const plan = store.read().plans.find(item => item.id === context.planId);
      return root.TutorlyStudyMaterials?.excerpts(plan?.materials, context.topicId) || [];
    }
    function selectTask(planId, taskId) { ensureAccount(); const state = store.select(planId, taskId); return !!state.activeTaskId; }
    function bindConversation(id) {
      const context = getActiveSessionContext(); if (!context || typeof id !== 'string' || !id.trim()) return false;
      const plan = store.read().plans.find(item => item.id === context.planId); store.savePlan({ ...plan, conversationId: id.slice(0, 250), lastActiveTaskId: context.taskId }); return true;
    }
    function restoreConversation(id) {
      ensureAccount(); const plan = typeof id === 'string' && id ? store.read().plans.find(item => item.conversationId === id) : null;
      if (!plan || !plan.tasks.some(task => task.id === plan.lastActiveTaskId && task.status !== 'removed')) { store.clearActiveSession(); return null; }
      store.select(plan.id, plan.lastActiveTaskId); return getActiveSessionContext();
    }
    return Object.freeze({ open({ draft: seed, planId } = {}) { ensureAccount(); container.hidden = false; if (seed) { draft = initialDraft(seed); step = 0; view = 'setup'; render(); loadCatalog(); } else { if (planId) { activePlanId = planId; const plan = getPlan(); if (plan && (plan.updatedDate !== today() || plan.tasks.some(task => task.status === 'pending' && task.date && task.date < today()))) persist(engine.rebalance(plan, { today: today() })); view = 'detail'; } render(); } }, close() { container.hidden = true; }, getActiveSessionContext, getMaterials, quizAttempt, completeActiveTask, recordPerformance, selectTask, bindConversation, restoreConversation, clearActiveSession() { ensureAccount(); store.clearActiveSession(); }, getConversationId(planId) { ensureAccount(); return store.read().plans.find(plan => plan.id === planId)?.conversationId || null; } });
  }
  root.TutorlyStudyPlanner = Object.freeze({ create });
})(window);
