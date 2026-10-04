/* TEST ONLY: injected by scripts/preview-chat.cjs; never referenced by production HTML.
 * Everything below is confined to the exact local preview origin. The account is a
 * deliberately fake UI fixture, not an authenticated user and not valid on any API.
 */
(function () {
  'use strict';
  if (location.origin !== 'http://127.0.0.1:8767') throw new Error('Preview fixture cannot run outside its loopback server.');
  const nativeFetch = window.fetch.bind(window);
  const fixtureToken = 'local-preview-not-a-real-session';
  const calls = [];
  const preview = window.TutorlyChatPreview = { mode: 'fixtures', calls, lastRequest: null, scenario: 'normal' };
  window.TUTORLY_BACKEND_ORIGIN = location.origin;
  window.TUTORLY_PAYMENT_API_BASE = location.origin;
  const subscription = { currentPlan: 'pro', status: 'active', subscriptionExpiry: '2099-01-01T00:00:00Z', premiumCreditsRemaining: 1000 };
  const user = { id: 'local-preview-student', email: 'preview@example.invalid', full_name: 'Preview Student', role: 'student', grade: '9', board: 'CBSE', school: '', personalization: {} };
  const json = (payload, status = 200) => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
  const wait = (signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    const timer = setTimeout(resolve, preview.scenario === 'slow' ? 10000 : 350);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });

  window.fetch = async function (input, options = {}) {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    const api = /^\/api\//.test(url.pathname) || /^\/(subscription\/|upload-image|chat$|chat-feedback$)/.test(url.pathname);
    if (url.origin !== location.origin) throw new TypeError('External network disabled in fixture preview.');
    if (!api) return nativeFetch(input, options);
    let payload = {};
    try { payload = JSON.parse(options.body || '{}'); } catch (_) { /* Binary/form fixtures have no JSON body. */ }
    calls.push({ path: url.pathname, method: options.method || 'GET', payload });
    preview.lastRequest = payload;
    if (url.pathname === '/api/auth/me') {
      if (sessionStorage.getItem('preview_account_expired') === 'true') return json({ detail: 'Your session has expired.' }, 401);
      if (sessionStorage.getItem('preview_account_offline') === 'true') return json({ detail: 'Intentional account lookup fixture failure.' }, 503);
      return json({ authenticated: true, user });
    }
    if (url.pathname === '/api/tests/generate') {
      await wait(options.signal);
      if (preview.scenario === 'failure') return json({detail:'Intentional test-generation fixture failure.'},503);
      const source=payload.materials?.[0];
      return json({source:'student_material',notice:'Local fixture questions only — no AI provider was called.',questions:[{
        id:'fixture-test-1',type:'objective',question:'Local fixture: 20 metres in 4 seconds gives which speed?',
        options:['5 m/s','80 m/s'],answer:0,correctText:'5 m/s',chapterId:source.id,chapterName:source.label,
        concept:'Speed',explanation:'20 divided by 4 is 5.',hint:'Divide distance by time.',difficulty:'Easy'
      }, ...(payload.include_subjective ? [{id:'fixture-test-2',type:'subjective',question:'Local fixture: explain how speed is calculated.',
        options:[],answer:null,correctText:'Speed is distance divided by time.',chapterId:source.id,chapterName:source.label,
        concept:'Speed',explanation:'Divide distance by time.',hint:'Use distance and time.',difficulty:'Easy'}] : [])]});
    }
    if (url.pathname === '/api/auth/personalization') return json({ personalization: {} });
    if (url.pathname === '/api/auth/voice-preferences') {
      if (options.method === 'PATCH' || options.method === 'POST') return json({ saved: true, ...payload });
      return json({ preferred_voice_agent: '', voice_onboarding_completed: false });
    }
    if (url.pathname === '/api/auth/logout') return json({ logged_out: true });
    if (url.pathname.startsWith('/subscription/')) return json({ subscription });
    if (url.pathname === '/api/curriculum/catalog') return nativeFetch('/__preview/curriculum-catalog.json?grade=' + encodeURIComponent(url.searchParams.get('grade') || '9'));
    if (url.pathname === '/api/vision/extract') return json({ text: 'Graph y = x² - 4', language: 'en-IN' });
    if (url.pathname === '/upload-image') return json({ uploaded: false, preview_only: true });
    if (url.pathname === '/api/voice/config') return json({ enabled: false, reason: 'Voice connections disabled in local fixture preview.' });
    if (url.pathname === '/api/voice/session' || url.pathname === '/api/transcribe') return json({ detail: 'No voice provider in fixture preview.' }, 503);
    if (url.pathname === '/api/chatbot/feedback' || url.pathname === '/chat-feedback') return json({ accepted: true, preview_only: true });
    if (url.pathname === '/api/chat' || url.pathname === '/chat') {
      await wait(options.signal);
      if (preview.scenario === 'failure') return json({ detail: 'Intentional fixture failure.' }, 503);
      const prompt = String(payload.message || '');
      if (payload.client_context?.study_session) {
        const session = payload.client_context.study_session;
        const answer = session.action === 'quick_check' ? '## Quick check · local test fixture\n\n1. What changes when an object accelerates?\n2. Can direction change while speed stays constant?\n\nReply with your answers. This fixture does not assess them.'
          : session.action === 'recap' ? '## Recap · local test fixture\n\nYou opened a small study task. Your completion choice is saved separately.\n\nUnderstanding has not been assessed by this fixture. Use your actual quiz results to adjust revision.'
          : '## One small concept · local test fixture\n\nThis preview demonstrates a short learning block, not a real AI lesson.\n\n**Example:** A car changes speed as it accelerates.\n\nWould you like a quick check or another explanation?';
        const report = document.getElementById('previewStudyContext');
        if (report) report.textContent = JSON.stringify({conversationId: payload.conversation_id, mode: payload.mode, study: session}, null, 2);
        // Deliberately request a graph: the Study UI must still keep Live Board closed.
        const check = session.action === 'quick_check' || (session.action === 'start' && ['quiz','practice','mock'].includes(session.task_kind));
        return json({answer:check ? 'Try this short check · local test fixture.' : answer,conversation_id:payload.conversation_id,metadata:{preview_only:true,semantic_route:{subject:'science',topic:session.topic,visual:{needed:true,type:'graph'}},teaching_actions:[],study_check:check ? {plan_id:session.plan_id,task_id:session.task_id,questions:[
          {topic:session.topics[0],question:'An object travels 20 metres in 4 seconds. What is its average speed?',options:['5 m/s','80 m/s','16 m/s'],answer:0,explanation:'Divide distance by time: 20 ÷ 4 = 5 m/s.'},
          {topic:session.topics[0],question:'Which unit measures speed?',options:['Metres','Metres per second','Seconds'],answer:1,explanation:'Speed measures distance travelled per unit of time.'}
        ]} : null}});
      }
      const graph = /\b(graph|plot|vertex|ray|add y|move down)\b|y\s*=/.test(prompt.toLowerCase());
      const answer = graph
        ? '## A graph we can explore\n\nFor **y = x² − 4**, subtracting 4 moves every point of y = x² down four units.\n\n1. Start with the coordinate plane.\n2. Plot the parabola using mathematical coordinates.\n3. Compare the vertex at **(0, −4)** and intercepts at **(−2, 0)** and **(2, 0)**.\n\nUse the Live Board playback to explore each step.'
        : '## Let’s work through it\n\nThis is a **local fixture response**, so no AI provider or credits were used.\n\n1. Identify what the question gives you.\n2. Choose a useful rule.\n3. Check the result.\n\n| Idea | Example |\n| --- | --- |\n| Multiplication | 8 × 7 = 56 |\n| Check | 56 ÷ 7 = 8 |\n\nTry **Graph y = x² − 4** to exercise the real board renderer.';
      return json({ answer, conversation_id: payload.conversation_id, metadata: {
        preview_only: true,
        semantic_route: { subject: graph ? 'mathematics' : 'general', topic: graph ? 'Quadratic graph' : 'Preview response', visual: { needed: graph, type: graph ? 'graph' : 'none' } },
        teaching_actions: []
      } });
    }
    return json({ detail: `No local fixture for ${url.pathname}.`, preview_only: true }, 503);
  };

  // Never request a real microphone, WebRTC agent, third-party SDK session or OAuth.
  if (navigator.mediaDevices) {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => { throw new DOMException('Microphone disabled in local fixture preview.', 'NotFoundError'); } });
  }
  window.WebSocket = class { constructor() { throw new Error('WebSocket disabled in fixture preview.'); } };
  if (navigator.sendBeacon) navigator.sendBeacon = () => false;

  function activateStudent() {
    sessionStorage.removeItem('preview_account_expired');
    sessionStorage.removeItem('preview_account_offline');
    const fields = { tutorly_session_token: fixtureToken, tutorly_logged_in: 'true', tutorly_signed_up: 'true', tutorly_account_role: 'student', tutorly_signup_full_name: user.full_name,
      tutorly_email: user.email, tutorly_grade: user.grade, tutorly_board: user.board, tutorly_user_id: user.id, tutorly_subscription: JSON.stringify(subscription), tutorly_theme: 'light' };
    Object.entries(fields).forEach(([key, value]) => localStorage.setItem(key, value));
  }

  document.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = '#localPreviewControls{position:fixed;z-index:100001;right:8px;top:8px;max-width:calc(100vw - 16px);font:12px/1.45 system-ui;color:#17213a;background:#fff;border:1px solid #7185ab;border-radius:8px;box-shadow:0 2px 8px #0001}#localPreviewControls summary{padding:6px 10px;cursor:pointer}#localPreviewControls .preview-actions{padding:10px;display:grid;gap:7px;max-width:290px}#localPreviewControls button,#localPreviewControls select{font:inherit;padding:7px;border:1px solid #8293b4;border-radius:5px;background:white;color:#17213a;text-align:left}#localPreviewControls button:focus-visible{outline:3px solid #6366f1}';
    document.head.appendChild(style);
    const controls = document.createElement('details');
    controls.id = 'localPreviewControls';
    const summary = document.createElement('summary'); summary.textContent = 'Local fixture preview'; controls.appendChild(summary);
    const actions = document.createElement('div'); actions.className = 'preview-actions'; controls.appendChild(actions);
    const description = document.createElement('p'); description.textContent = 'Test responses only. No real account, AI, uploads, OAuth, or credits.'; actions.appendChild(description);
    const report = document.createElement('pre'); report.id = 'previewStudyContext'; report.style.cssText = 'white-space:pre-wrap;max-height:180px;overflow:auto;font-size:10px'; actions.appendChild(report);
    function button(label, handler) { const item = document.createElement('button'); item.type = 'button'; item.textContent = label; item.addEventListener('click', handler); actions.appendChild(item); }
    button('Use local student fixture', () => { activateStudent(); location.reload(); });
    button('Use unavailable account fixture', () => { activateStudent(); sessionStorage.setItem('preview_account_offline', 'true'); location.reload(); });
    button('Use expired session fixture', () => { activateStudent(); sessionStorage.setItem('preview_account_expired', 'true'); location.reload(); });
    button('Reconnect account fixture', () => { sessionStorage.removeItem('preview_account_offline'); controls.open = false; });
    button('Seed saved conversation fixture', () => {
      activateStudent();
      const history = window.TutorlyChatbot?.getModule('history');
      if (!history) return;
      const conversation = history.createConversation({ title: 'Saved graph fixture', source: 'local-test-only' });
      history.appendMessage(conversation.id, { role: 'user', content: 'Graph y = x² - 4' });
      history.appendMessage(conversation.id, { role: 'assistant', content: 'The vertex is **(0, −4)**. This is a saved local test conversation.', metadata: { semanticRoute: { subject: 'mathematics', topic: 'Quadratic graph', visual: { needed: true, type: 'graph' } } } });
      location.reload();
    });
    button('Use guest fixture', () => { ['tutorly_session_token', 'tutorly_logged_in', 'tutorly_signed_up', 'tutorly_account_role'].forEach(key => localStorage.removeItem(key)); localStorage.setItem('tutorly_bot_try_count', '0'); location.reload(); });
    button('Toggle preview theme', () => { localStorage.setItem('tutorly_theme', document.body.dataset.theme === 'dark' ? 'light' : 'dark'); location.reload(); });
    const label = document.createElement('label'); label.textContent = 'Response fixture '; const select = document.createElement('select'); select.setAttribute('aria-label', 'Response fixture');
    [['normal', 'Normal response'], ['failure', 'Backend unavailable'], ['slow','Slow response (test Stop)']].forEach(([value, copy]) => { const option = document.createElement('option'); option.value = value; option.textContent = copy; select.appendChild(option); });
    select.addEventListener('change', () => { preview.scenario = select.value; controls.open = false; }); label.appendChild(select); actions.appendChild(label);
    document.body.appendChild(controls);
  });
})();
