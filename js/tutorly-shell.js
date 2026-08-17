(function () {
  const body = document.body;
  const themeToggle = document.getElementById('themeToggle');
  const sidebar = document.getElementById('sidebar');
  const chatShell = document.getElementById('chatShell');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const historyButton = document.getElementById('chatHistoryBtn');
  const profileButton = document.querySelector('.profile-dot[href="profile.html"]');
  const themeKey = 'tutorly_theme';
  const sidebarKey = 'tutorly_sidebar_collapsed';

  function preferredTheme() {
    const stored = localStorage.getItem(themeKey);
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    body.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    if (!themeToggle) return;
    const isDark = theme === 'dark';
    themeToggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    themeToggle.setAttribute('title', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    themeToggle.innerHTML = isDark
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.1A8 8 0 0 1 9.9 3.5 8.5 8.5 0 1 0 20.5 14.1z"></path></svg>';
  }

  applyTheme(preferredTheme());

  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      const next = body.dataset.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem(themeKey, next);
      applyTheme(next);
    });
  }

  if (sidebar && chatShell && window.matchMedia('(min-width: 1081px)').matches) {
    const collapsed = localStorage.getItem(sidebarKey) === 'true';
    sidebar.classList.toggle('collapsed', collapsed);
    chatShell.classList.toggle('sidebar-collapsed', collapsed);
  }

  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', function () {
      if (!window.matchMedia('(min-width: 1081px)').matches) return;
      window.setTimeout(function () {
        localStorage.setItem(sidebarKey, String(sidebar.classList.contains('collapsed')));
      }, 0);
    });
  }

  document.querySelectorAll('[data-open-history]').forEach(function (button) {
    button.addEventListener('click', function () {
      if (historyButton) historyButton.click();
    });
  });

  if (profileButton) {
    const name = localStorage.getItem('tutorly_name') || localStorage.getItem('tutorly_signup_full_name') || 'Student';
    profileButton.textContent = name.trim().charAt(0).toUpperCase() || 'S';
    profileButton.setAttribute('title', name);
  }
})();
