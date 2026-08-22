(function () {
  const body = document.body;
  const themeKey = 'tutorly_theme';
  const themeButton = document.getElementById('foundationTheme');
  const preferred = localStorage.getItem(themeKey) || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

  function setTheme(theme) {
    body.dataset.theme = theme;
    if (themeButton) {
      themeButton.textContent = theme === 'dark' ? '☀' : '☾';
      themeButton.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    }
  }

  setTheme(preferred);
  themeButton?.addEventListener('click', function () {
    const next = body.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(themeKey, next);
    setTheme(next);
  });

  document.querySelectorAll('[data-practice-subject]').forEach(function (button) {
    button.addEventListener('click', function () {
      localStorage.setItem('tutorly_practice_subject', button.dataset.practiceSubject);
      window.location.href = 'tests.html';
    });
  });

  if (body.dataset.foundationPage === 'progress') {
    const history = JSON.parse(localStorage.getItem('tutorly_exam_history') || '[]');
    const completed = history.length;
    const scores = history.map(function (item) { return Number(item.score || item.percentage || 0); }).filter(Number.isFinite);
    const average = scores.length ? Math.round(scores.reduce(function (sum, score) { return sum + score; }, 0) / scores.length) : 0;
    const chats = JSON.parse(localStorage.getItem('tutorly_chat_history_v1') || '[]');
    const chatbotState = JSON.parse(localStorage.getItem('tutorly_chatbot_history_v1') || '{}');
    const savedChats = Array.isArray(chatbotState.conversations) ? chatbotState.conversations : (Array.isArray(chats) ? chats : []);
    const streak = Number(localStorage.getItem('tutorly_streak') || 0);
    document.getElementById('progressTests').textContent = String(completed);
    document.getElementById('progressScore').textContent = completed ? average + '%' : '—';
    document.getElementById('progressChats').textContent = String(savedChats.length);
    document.getElementById('progressStreak').textContent = String(streak);
    document.getElementById('progressEmpty').hidden = completed + savedChats.length + streak > 0;
  }

})();
