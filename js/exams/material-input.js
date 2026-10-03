(function (root) {
  'use strict';
  function create({onChange}) {
    const files = document.getElementById('testMaterialFiles'), list = document.getElementById('testMaterialList');
    const pasted = document.getElementById('testPastedNotes'), status = document.getElementById('testMaterialStatus');
    let materials = [], reading = false;
    const notify = () => onChange?.();
    function render() {
      list.replaceChildren();
      materials.forEach(material => {
        const row = document.createElement('details'); row.className = 'test-material-preview';
        const title = document.createElement('summary'); title.textContent = material.label + (material.partial ? ' · partial text — review' : ' · ready');
        const label = document.createElement('label'); label.className = 'paper-field'; label.textContent = 'Review extracted notes';
        const input = document.createElement('textarea'); input.rows = 5; input.maxLength = 24000; input.value = material.text;
        input.addEventListener('input', () => { material.text = input.value; notify(); }); label.append(input);
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'secondary-btn'; remove.textContent = 'Remove file';
        remove.addEventListener('click', () => { materials = materials.filter(item => item !== material); render(); notify(); });
        row.append(title, label, remove); list.append(row);
      });
    }
    files.addEventListener('change', async () => {
      const selected = Array.from(files.files || []);
      if (materials.length + selected.length > 5) { status.textContent = 'Use up to 5 files. Remove one before adding more.'; files.value = ''; return; }
      reading = true; files.disabled = true; notify();
      try {
        for (const file of selected) {
          status.textContent = 'Reading ' + file.name + '…';
          const result = await root.TutorlyStudyMaterials.readFile(file);
          materials.push({id: 'material-' + root.crypto.randomUUID(), label: file.name.slice(0,150), text: result.text, partial: result.partial});
          render();
        }
        status.textContent = 'Notes read. Review the text before continuing.';
      } catch (error) { status.textContent = error.message + ' Choose the file again to retry. Previously read files are kept.'; }
      finally { reading = false; files.disabled = false; files.value = ''; notify(); }
    });
    pasted.addEventListener('input', notify);
    return {
      reading: () => reading,
      hasContent: () => !reading && (materials.some(item => item.text.trim()) || pasted.value.trim().length > 0),
      get() {
        if (reading) throw new Error('Please wait while your notes are being read.');
        const sources = [...materials, ...(pasted.value.trim() ? [{id:'pasted-notes',label:'Pasted notes',text:pasted.value.trim()}] : [])].filter(item => item.text.trim());
        if (!sources.length) throw new Error('Add a file or paste your notes first.');
        if (sources.length > 5) throw new Error('Use up to 5 sources, including pasted notes.');
        if (sources.some(item => item.text.trim().length < 20)) throw new Error('Each source needs at least 20 characters of useful notes.');
        if (sources.reduce((n,item) => n + item.text.length, 0) > 24000) throw new Error('Trim combined notes to 24,000 characters before continuing.');
        return sources.map(({id,label,text}) => ({id,label,text}));
      },
      error: message => { status.textContent = message; }
    };
  }
  async function generate(materials, settings, profile) {
    const origin = root.TutorlyAuth?.backendOrigin?.(), token = root.TutorlyAuth?.getSessionToken?.();
    if (!origin) throw new Error('The test generator is unavailable. Your notes are kept; try again.');
    const controller = new AbortController(), timer = root.setTimeout(() => controller.abort(), 90000);
    try {
      const response = await fetch(origin + '/api/tests/generate', {method:'POST', signal:controller.signal,
        headers:{'Content-Type':'application/json', ...(token ? {Authorization:'Bearer ' + token} : {})},
        body:JSON.stringify({materials,question_count:settings.questionCount,difficulty:settings.difficulty,
          include_subjective:settings.includeSubjective,grade:String(profile.grade || ''),board:String(profile.board || ''),
          ...(profile.curriculumContext ? {curriculum_context:profile.curriculumContext} : {})})});
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const reference = response.headers?.get?.('X-Request-ID');
        const message = response.status === 404 ? 'The test service is updating. Your notes and settings are kept. Retry after the service is available.'
          : response.status === 401 ? 'Your session expired. Sign in again, then retry. Your notes are kept in this tab.'
          : response.status === 429 ? 'The test service is busy. Wait a moment and retry. Your notes are kept.'
          : response.status >= 500 ? 'Tutorly could not generate this paper right now. Your notes and settings are kept; please retry.'
          : 'Check your notes and settings, then retry.';
        throw new Error(message + (reference ? ' Reference: ' + reference : ''));
      }
      if (!Array.isArray(data.questions) || !data.questions.length) throw new Error('No usable questions were returned. Add more material and retry.');
      return data;
    } catch (error) { if (error.name === 'AbortError') throw new Error('Generation took too long. Your notes are kept; try again.'); throw error; }
    finally { root.clearTimeout(timer); }
  }
  root.TutorlyTestMaterials = Object.freeze({create,generate});
})(window);
