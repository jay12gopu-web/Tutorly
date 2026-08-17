(function () {
  if (window.__tutorlyMobileAppApplied) return;
  window.__tutorlyMobileAppApplied = true;

  const path = (window.location.pathname.split('/').pop() || 'home.html').toLowerCase();
  const $ = (selector, root = document) => root.querySelector(selector);

  const icons = {
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5"></path><path d="M5 10.5V20h14v-9.5"></path></svg>',
    learn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H7a3 3 0 0 0-3 3V5.5Z"></path><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M8 7h8"></path><path d="M8 11h6"></path></svg>',
    ai: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v4"></path><path d="M8 7h8a4 4 0 0 1 4 4v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-5a4 4 0 0 1 4-4Z"></path><path d="M9 13h.01"></path><path d="M15 13h.01"></path></svg>',
    progress: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5"></path><path d="M4 19h16"></path><path d="M8 16v-5"></path><path d="M12 16V8"></path><path d="M16 16v-7"></path></svg>',
    profile: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 21a8 8 0 0 0-16 0"></path><circle cx="12" cy="7" r="4"></circle></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z"></path></svg>',
    flame: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 14.5A4.5 4.5 0 1 0 17 12c0-4-4-6-4-10-2 2-4 4-4 7 0 1.5.6 2.8 1.5 3.7"></path><path d="M12 22a5 5 0 0 1-5-5c0-1.7.7-3.4 2-4.6"></path></svg>',
    bolt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 10-13h-7l1-7Z"></path></svg>',
    test: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="2" width="8" height="4" rx="1"></rect><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><path d="M8 12h8"></path><path d="M8 16h6"></path></svg>',
    card: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 10 5-10 5L2 7l10-5Z"></path><path d="m2 17 10 5 10-5"></path><path d="m2 12 10 5 10-5"></path></svg>',
    mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"></path><path d="M5 10v1a7 7 0 0 0 14 0v-1"></path><path d="M12 18v3"></path></svg>'
  };

  function isMobile() {
    return window.matchMedia('(max-width: 767px)').matches;
  }

  function pageTab() {
    if (['lessons.html', 'ask_doubt.html', 'bookmarks.html', 'offline_tutor.html', 'online_tutor.html'].includes(path)) return 'learn';
    if (path === 'maths_gpt.html') return 'ai';
    if (['tests.html', 'quests.html', 'refer_earn.html', 'payment-history.html', 'subscriptions.html', 'shop.html'].includes(path)) return 'progress';
    if (['profile.html', 'contact.html', 'info.html', 'teacher_info.html', 'terms_conditions.html'].includes(path)) return 'profile';
    return 'home';
  }

  function applyPageClasses() {
    document.body.classList.add('mt-mobile-app');
    if (path === 'home.html') document.body.classList.add('mt-mobile-home');
    if (path === 'maths_gpt.html') document.body.classList.add('mt-mobile-chat');
    if (path === 'tests.html') document.body.classList.add('mt-mobile-tests');
    if (path === 'lessons.html') document.body.classList.add('mt-mobile-learn');
  }

  function mountBottomNav() {
    if (path === 'maths_gpt.html') return;
    if ($('.mt-native-bottom-nav')) return;
    const tabs = [
      { tab: 'home', label: 'Home', href: 'home.html', icon: icons.home },
      { tab: 'learn', label: 'Learn', href: 'lessons.html', icon: icons.learn },
      { tab: 'ai', label: 'AI', href: 'maths_gpt.html', icon: icons.ai },
      { tab: 'progress', label: 'Progress', href: 'tests.html', icon: icons.progress },
      { tab: 'profile', label: 'Profile', href: 'profile.html', icon: icons.profile }
    ];
    const active = pageTab();
    const nav = document.createElement('nav');
    nav.className = 'mt-native-bottom-nav';
    nav.setAttribute('aria-label', 'Primary mobile navigation');
    nav.innerHTML = tabs.map((item) => (
      `<a href="${item.href}" data-tab="${item.tab}" class="${item.tab === active ? 'active' : ''}">${item.icon}<span>${item.label}</span></a>`
    )).join('');
    document.body.appendChild(nav);
  }

  function safeText(selector, fallback) {
    const node = $(selector);
    return (node && node.textContent.trim()) || fallback;
  }

  function mountHomeSurface() {
    if (path !== 'home.html' || $('.mt-mobile-home-surface')) return;
    const shell = $('.app-shell') || document.body;
    const name = localStorage.getItem('tutorly_name') || localStorage.getItem('math-bot-name') || 'Learner';
    const coins = localStorage.getItem('tutorly_coins') || safeText('#homeCoinBalance', '1,250');
    const streak = localStorage.getItem('tutorly_streak') || '5';
    const first = name.trim().charAt(0).toUpperCase() || 'L';

    const surface = document.createElement('main');
    surface.className = 'mt-mobile-home-surface';
    surface.innerHTML = `
      <section class="mtm-top" aria-label="Mobile home header">
        <div class="mtm-greeting">
          <h1>Hi, ${name.split(' ')[0]}</h1>
          <p>Ready for a focused study session?</p>
        </div>
        <a class="mtm-avatar" href="profile.html" aria-label="Open profile">${first}</a>
      </section>

      <a class="mtm-ask" href="maths_gpt.html">
        <span class="mtm-icon">${icons.search}</span>
        <span>Search or ask AI anything</span>
        <span class="mtm-icon">${icons.mic}</span>
      </a>

      <section class="mtm-card mtm-primary-card">
        <div class="mtm-row">
          <div>
            <h2>Continue Learning</h2>
            <p>Pick up your current lesson and keep your progress moving.</p>
          </div>
          <a class="mtm-button" href="lessons.html">Resume</a>
        </div>
      </section>

      <section class="mtm-stats">
        <article class="mtm-card mtm-stat"><span>Daily Streak</span><strong>${streak}d</strong><p>Study today to protect it.</p></article>
        <article class="mtm-card mtm-stat"><span>Coins</span><strong>${coins}</strong><p>Use rewards for upgrades.</p></article>
      </section>

      <section>
        <div class="mtm-row" style="margin-bottom: 10px;"><h2 style="margin:0;font-size:20px;">Quick Actions</h2></div>
        <div class="mtm-actions">
          <a class="mtm-action" href="maths_gpt.html"><span class="mtm-icon">${icons.ai}</span><span>Ask AI</span></a>
          <a class="mtm-action" href="tests.html"><span class="mtm-icon">${icons.test}</span><span>Practice</span></a>
          <a class="mtm-action" href="lessons.html"><span class="mtm-icon">${icons.learn}</span><span>Lessons</span></a>
          <a class="mtm-action" href="quests.html"><span class="mtm-icon">${icons.bolt}</span><span>Quests</span></a>
        </div>
      </section>

      <section>
        <div class="mtm-row" style="margin-bottom: 10px;"><h2 style="margin:0;font-size:20px;">Subjects</h2><a href="lessons.html" style="color:#2563eb;font-weight:900;">View all</a></div>
        <div class="mtm-scroll">
          ${['Mathematics', 'Science', 'English', 'Social Studies'].map((subject, index) => `
            <article class="mtm-card">
              <span class="mtm-icon">${index === 0 ? icons.progress : icons.learn}</span>
              <h2 style="margin-top:14px;">${subject}</h2>
              <p>${index === 0 ? 'Chapter 6 in progress' : 'Recommended revision ready'}</p>
              <div style="height:9px;border-radius:999px;background:#e8eef8;margin-top:14px;overflow:hidden;"><span style="display:block;height:100%;width:${72 - index * 9}%;background:linear-gradient(90deg,#2563eb,#7c3aed);border-radius:999px;"></span></div>
            </article>
          `).join('')}
        </div>
      </section>

      <section class="mtm-card">
        <h2>Recent Activity</h2>
        <p>Completed a quiz, reviewed flashcards, and asked AI for algebra help.</p>
      </section>

      <section class="mtm-card">
        <h2>Recommended Next</h2>
        <p>Take a 15-minute Maths practice set to improve your weak chapter score.</p>
        <a class="mtm-button" href="tests.html" style="margin-top:14px;">Start Practice</a>
      </section>
    `;
    shell.prepend(surface);
  }

  function tagTables() {
    document.querySelectorAll('table').forEach((table) => {
      table.classList.add('mt-mobile-card-table');
      const headings = Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent.trim());
      table.querySelectorAll('tbody tr').forEach((row) => {
        Array.from(row.children).forEach((cell, index) => {
          if (headings[index]) cell.setAttribute('data-label', headings[index]);
        });
      });
    });
  }

  function enhanceBottomSheets() {
    document.querySelectorAll('.modal-backdrop, .coin-modal-backdrop').forEach((modal) => {
      modal.classList.add('mt-mobile-bottom-sheet');
    });
  }

  function initPullHint() {
    let startY = 0;
    let armed = false;
    window.addEventListener('touchstart', (event) => {
      if (!isMobile() || window.scrollY > 0 || event.touches.length !== 1) return;
      startY = event.touches[0].clientY;
      armed = true;
    }, { passive: true });
    window.addEventListener('touchend', (event) => {
      if (!armed || !isMobile()) return;
      const dy = event.changedTouches[0].clientY - startY;
      armed = false;
      if (dy < 72) return;
      document.body.classList.add('mt-mobile-refreshing');
      window.setTimeout(() => document.body.classList.remove('mt-mobile-refreshing'), 520);
    }, { passive: true });
  }

  function init() {
    applyPageClasses();
    mountBottomNav();
    mountHomeSurface();
    tagTables();
    enhanceBottomSheets();
    initPullHint();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
