(function () {
  if (window.__tutorlyGlobalLayoutApplied) return;
  window.__tutorlyGlobalLayoutApplied = true;

  function pageName() {
    const parts = window.location.pathname.split('/');
    return (parts[parts.length - 1] || '').toLowerCase();
  }

  function initPageTransitions() {
    if (window.__tutorlyPageTransitionsApplied) return;
    window.__tutorlyPageTransitionsApplied = true;

    const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.body.classList.add('mt-page-motion');

    requestAnimationFrame(function () {
      document.body.classList.add('mt-page-ready');
      document.body.classList.remove('mt-page-motion');
    });

    function samePageHash(url) {
      return url.pathname === window.location.pathname && url.search === window.location.search && url.hash;
    }

    function isInternalHtmlTarget(url) {
      return (
        url.origin === window.location.origin &&
        /\.html$/i.test(url.pathname) &&
        url.href !== window.location.href &&
        !samePageHash(url)
      );
    }

    function beginTransition(targetHref) {
      if (!targetHref || reducedMotion) {
        window.location.href = targetHref;
        return;
      }

      document.body.classList.add('mt-page-leaving');
      window.location.href = targetHref;
    }

    document.addEventListener('click', function (event) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const routeElement = event.target.closest && event.target.closest('[data-route]');
      const link = event.target.closest && event.target.closest('a[href]');
      const rawTarget = routeElement ? routeElement.getAttribute('data-route') : link && link.getAttribute('href');
      if (!rawTarget || rawTarget.startsWith('#') || rawTarget.startsWith('mailto:') || rawTarget.startsWith('tel:') || rawTarget.startsWith('javascript:')) return;
      if (link && (link.target || link.hasAttribute('download'))) return;

      var url;
      try {
        url = new URL(rawTarget, window.location.href);
      } catch (error) {
        return;
      }

      if (!isInternalHtmlTarget(url)) return;
      event.preventDefault();
      event.stopPropagation();
      beginTransition(url.href);
    }, true);

    window.addEventListener('pageshow', function () {
      document.body.classList.remove('mt-page-leaving');
    });
  }

  function findOffsetTarget() {
    return (
      document.querySelector('main') ||
      document.querySelector('.chat') ||
      document.querySelector('.chat-shell') ||
      document.querySelector('.welcome-page') ||
      document.querySelector('.auth-wrap') ||
      document.querySelector('.profile-shell') ||
      document.querySelector('.loader-shell')
    );
  }

  function icon(name) {
    const icons = {
      home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5"></path><path d="M5 10.5V20h14v-9.5"></path></svg>',
      subjects: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16"></path><path d="M4 12h16"></path><path d="M4 19h16"></path></svg>',
      practice: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 12l2 2 4-5"></path><path d="M4 4h16v16H4z"></path></svg>',
      lessons: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H7a3 3 0 0 0-3 3V5.5Z"></path><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M8 7h8"></path><path d="M8 11h6"></path></svg>',
      ai: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v4"></path><path d="M8 7h8a4 4 0 0 1 4 4v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-5a4 4 0 0 1 4-4z"></path><path d="M9 13h.01"></path><path d="M15 13h.01"></path></svg>',
      profile: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 21a8 8 0 0 0-16 0"></path><path d="M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"></path></svg>',
      bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path><path d="M13.7 21a2 2 0 0 1-3.4 0"></path></svg>',
      menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"></path><path d="M4 12h16"></path><path d="M4 17h16"></path></svg>',
      shop: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="20" r="1.5"></circle><circle cx="18" cy="20" r="1.5"></circle><path d="M3 4h2l2.4 10.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 1.9-1.4L21 8H6"></path></svg>',
      gift: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12v8H4v-8"></path><path d="M2.5 8h19v4h-19V8Z"></path><path d="M12 20V8"></path><path d="M12 8H8.5a2 2 0 1 1 2-2c0 2-2 2-2 2"></path><path d="M12 8h3.5a2 2 0 1 0-2-2c0 2 2 2 2 2"></path></svg>',
      plans: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"></path><path d="M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"></path><path d="M8 12h8"></path><path d="M8 16h5"></path></svg>',
      support: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8.5 8.5 0 0 1-12.5 7.5L3 21l1.5-5.2A8.5 8.5 0 1 1 21 12Z"></path><path d="M8.5 10.5h7"></path><path d="M8.5 14h4.5"></path></svg>'
    };
    return icons[name] || '';
  }

  function navItems(current) {
    const items = [
      { key: 'home', label: 'Home', href: 'home.html', match: ['home.html', 'welcome.html'] },
      { key: 'ai', label: 'AI Tutor', href: 'maths_gpt.html', match: ['maths_gpt.html'] },
      { key: 'subjects', label: 'Tests', href: 'tests.html', match: ['tests.html'] },
      { key: 'practice', label: 'Practice', href: 'quests.html', match: ['quests.html', 'refer_earn.html', 'subscriptions.html'] },
      { key: 'lessons', label: 'Lessons', href: 'lessons.html', match: ['lessons.html'] },
      { key: 'profile', label: 'Profile', href: 'profile.html', match: ['profile.html', 'contact.html', 'terms_conditions.html'] }
    ];
    return items.map(function (item) {
      const active = item.match.indexOf(current) !== -1 ? ' active' : '';
      return '<a class="' + active.trim() + '" href="' + item.href + '">' + icon(item.key) + '<span>' + item.label + '</span></a>';
    }).join('');
  }

  function mobileNavItems(current) {
    const items = [
      { key: 'home', label: 'Home', href: 'home.html', match: ['home.html', 'welcome.html'] },
      { key: 'ai', label: 'AI Tutor', href: 'maths_gpt.html', match: ['maths_gpt.html'] },
      { key: 'subjects', label: 'Tests', href: 'tests.html', match: ['tests.html'] },
      { key: 'lessons', label: 'Lessons', href: 'lessons.html', match: ['lessons.html'] },
      { key: 'practice', label: 'Quests', href: 'quests.html', match: ['quests.html'] },
      { key: 'plans', label: 'Plans', href: 'subscriptions.html', match: ['subscriptions.html', 'payment-history.html', 'payment-success.html'] },
      { key: 'shop', label: 'Shop', href: 'shop.html', match: ['shop.html'] },
      { key: 'gift', label: 'Refer & Earn', href: 'refer_earn.html', match: ['refer_earn.html'] },
      { key: 'support', label: 'Support', href: 'contact.html', match: ['contact.html'] },
      { key: 'profile', label: 'Profile', href: 'profile.html', match: ['profile.html', 'info.html', 'teacher_info.html'] }
    ];

    return items.map(function (item) {
      const active = item.match.indexOf(current) !== -1 ? ' active' : '';
      return '<a class="mt-page-drawer-link' + active + '" href="' + item.href + '">' + icon(item.key) + '<span>' + item.label + '</span></a>';
    }).join('');
  }

  function enhanceMobileHeader(current) {
    const header = document.querySelector('header.header-wrap') || document.querySelector('header.topbar');
    const topbar = header && (header.matches('.topbar') ? header : header.querySelector('.topbar'));
    if (!header || !topbar || topbar.querySelector('.mt-mobile-header-actions')) return;

    document.body.classList.add('mt-mobile-header-active');
    header.classList.add('mt-mobile-header');

    const existingActions = topbar.querySelector('.top-actions');
    const hasNotificationButton = !!topbar.querySelector('.notification-btn, [id$="NotificationBtn"]');
    const actions = document.createElement('div');
    actions.className = 'mt-mobile-header-actions';
    actions.innerHTML = [
      hasNotificationButton ? '' : '<button class="mt-mobile-icon-btn mt-mobile-notify" type="button" aria-label="Notifications" aria-expanded="false">' + icon('bell') + '</button>',
      '<a class="mt-mobile-icon-btn" href="profile.html" aria-label="Profile">' + icon('profile') + '</a>',
      '<button class="mt-mobile-icon-btn mt-mobile-menu" type="button" aria-label="Open menu" aria-expanded="false">' + icon('menu') + '</button>'
    ].join('');
    (existingActions || topbar).appendChild(actions);

    const overlay = document.createElement('div');
    overlay.className = 'mt-page-drawer-overlay';
    overlay.setAttribute('aria-hidden', 'true');

    const drawer = document.createElement('aside');
    drawer.className = 'mt-page-drawer';
    drawer.setAttribute('aria-label', 'Mobile menu');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.innerHTML = [
      '<div class="mt-page-drawer-head">',
      '<img src="assets/title-logo.png" alt="Tutorly" />',
      '<button class="mt-page-drawer-close" type="button" aria-label="Close menu">×</button>',
      '</div>',
      '<nav class="mt-page-drawer-nav">' + mobileNavItems(current) + '</nav>'
    ].join('');

    document.body.appendChild(overlay);
    document.body.appendChild(drawer);

    const menuBtn = actions.querySelector('.mt-mobile-menu');
    const notifyBtn = actions.querySelector('.mt-mobile-notify');
    const closeBtn = drawer.querySelector('.mt-page-drawer-close');

    function closeDrawer() {
      document.body.classList.remove('mt-page-drawer-open');
      menuBtn.setAttribute('aria-expanded', 'false');
      menuBtn.setAttribute('aria-label', 'Open menu');
      drawer.setAttribute('aria-hidden', 'true');
      overlay.setAttribute('aria-hidden', 'true');
    }

    function openDrawer() {
      document.body.classList.add('mt-page-drawer-open');
      menuBtn.setAttribute('aria-expanded', 'true');
      menuBtn.setAttribute('aria-label', 'Close menu');
      drawer.setAttribute('aria-hidden', 'false');
      overlay.setAttribute('aria-hidden', 'false');
    }

    menuBtn.addEventListener('click', function () {
      if (document.body.classList.contains('mt-page-drawer-open')) {
        closeDrawer();
      } else {
        openDrawer();
      }
    });
    overlay.addEventListener('click', closeDrawer);
    closeBtn.addEventListener('click', closeDrawer);
    drawer.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', closeDrawer);
    });

    if (notifyBtn) {
      notifyBtn.addEventListener('click', function () {
        notifyBtn.classList.add('tapped');
        window.setTimeout(function () { notifyBtn.classList.remove('tapped'); }, 220);
      });
    }

    function syncScroll() {
      document.body.classList.toggle('mt-mobile-header-scrolled', window.scrollY > 8);
    }

    window.addEventListener('scroll', syncScroll, { passive: true });
    window.addEventListener('resize', function () {
      if (window.matchMedia('(min-width: 768px)').matches) closeDrawer();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeDrawer();
    });
    syncScroll();
  }

  function mountSidebar(current) {
    const side = document.createElement('aside');
    side.className = 'mt-global-sidebar';
    side.setAttribute('aria-label', 'Global sidebar');
    side.innerHTML = [
      '<div class="mt-brand"><img class="mt-brand-logo" src="assets/title-logo.png" alt="Tutorly" /></div>',
      '<nav class="mt-nav">' + navItems(current) + '</nav>'
    ].join('');
    document.body.appendChild(side);
  }

  function mountBottomNav(current) {
    const nav = document.createElement('nav');
    nav.className = 'mt-bottom-nav';
    nav.setAttribute('aria-label', 'Bottom navigation');

    const tabs = [
      { key: 'home', label: 'Home', href: 'home.html', match: ['home.html', 'welcome.html'] },
      { key: 'ai', label: 'AI Tutor', href: 'maths_gpt.html', match: ['maths_gpt.html'] },
      { key: 'lessons', label: 'Lessons', href: 'lessons.html', match: ['lessons.html'] },
      { key: 'practice', label: 'Practice', href: 'tests.html', match: ['tests.html', 'quests.html'] },
      { key: 'profile', label: 'Profile', href: 'profile.html', match: ['profile.html', 'contact.html'] }
    ];

    nav.innerHTML = tabs.map(function (tab) {
      const active = tab.match.indexOf(current) !== -1 ? ' active' : '';
      return '<a class="' + active.trim() + '" href="' + tab.href + '">' + icon(tab.key) + '<span>' + tab.label + '</span></a>';
    }).join('');

    document.body.appendChild(nav);
  }

  function initMobileSwipeHome() {
    return;
    if (window.__tutorlySwipeHomeApplied) return;
    window.__tutorlySwipeHomeApplied = true;

    const fileName = pageName();
    const isHome = fileName === 'home.html';
    const isChatbot = fileName === 'maths_gpt.html' || fileName === 'math_gpt.html';
    if (isHome) return;

    function isTouchPortraitLayout() {
      const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const portraitTablet = window.innerHeight >= window.innerWidth && window.innerWidth <= 1180;
      const phone = window.innerWidth <= 760;
      return touch && (phone || portraitTablet);
    }

    function injectSwipeStyles() {
      if (document.getElementById('tutorlySwipeHomeStyles')) return;
      const style = document.createElement('style');
      style.id = 'tutorlySwipeHomeStyles';
      style.textContent = [
        '@media (pointer: coarse) and (max-width: 1180px), (pointer: coarse) and (orientation: portrait) {',
        '  body.tutorly-chat-mobile-clean .main-header { display: none !important; }',
        '  body.tutorly-chat-mobile-clean .work-area { padding-top: max(10px, env(safe-area-inset-top)) !important; }',
        '}',
        '.swipe-home-hold {',
        '  position: fixed;',
        '  left: 18px;',
        '  top: 50%;',
        '  z-index: 9999;',
        '  width: 58px;',
        '  height: 58px;',
        '  border-radius: 50%;',
        '  display: grid;',
        '  place-items: center;',
        '  opacity: 0;',
        '  pointer-events: none;',
        '  transform: translate(-14px, -50%) scale(.84);',
        '  transition: opacity 160ms ease, transform 180ms cubic-bezier(.2,.8,.2,1);',
        '  background: conic-gradient(from -90deg, #3f72ff var(--swipe-progress, 0%), rgba(183, 207, 255, .46) 0);',
        '  box-shadow: 0 18px 44px rgba(49, 96, 210, .28);',
        '}',
        '.swipe-home-hold::before {',
        '  content: "";',
        '  position: absolute;',
        '  inset: 5px;',
        '  border-radius: inherit;',
        '  background: rgba(255, 255, 255, .92);',
        '  box-shadow: inset 0 1px 0 rgba(255,255,255,.9);',
        '}',
        '.swipe-home-hold svg {',
        '  position: relative;',
        '  z-index: 1;',
        '  width: 25px;',
        '  height: 25px;',
        '  color: #2757c8;',
        '  stroke: currentColor;',
        '  stroke-width: 2.7;',
        '  fill: none;',
        '  stroke-linecap: round;',
        '  stroke-linejoin: round;',
        '}',
        '.swipe-home-hold.show { opacity: 1; transform: translate(0, -50%) scale(1); }',
        '.swipe-home-hold.ready { box-shadow: 0 20px 52px rgba(49, 96, 210, .38), 0 0 0 8px rgba(63, 114, 255, .11); }',
        '@media (max-width: 420px) { .swipe-home-hold { width: 52px; height: 52px; left: 14px; } }'
      ].join('');
      document.head.appendChild(style);
    }

    function goHome() {
      window.location.href = 'home.html';
    }

    injectSwipeStyles();
    if (isChatbot) document.body.classList.add('tutorly-chat-mobile-clean');

    const indicator = document.createElement('div');
    indicator.className = 'swipe-home-hold';
    indicator.setAttribute('aria-hidden', 'true');
    indicator.innerHTML = '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"></path><path d="M9 12h10"></path></svg>';
    document.body.appendChild(indicator);

    let active = false;
    let holding = false;
    let holdStart = 0;
    let raf = 0;
    let startX = 0;
    let startY = 0;
    const holdMs = 850;

    function reset() {
      active = false;
      holding = false;
      holdStart = 0;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      indicator.classList.remove('show', 'ready');
      indicator.style.setProperty('--swipe-progress', '0%');
    }

    function tick(time) {
      if (!active || !holding) return;
      const progress = Math.min(100, ((time - holdStart) / holdMs) * 100);
      indicator.style.setProperty('--swipe-progress', progress.toFixed(1) + '%');
      indicator.classList.toggle('ready', progress > 12);
      if (progress >= 100) {
        goHome();
        return;
      }
      raf = requestAnimationFrame(tick);
    }

    window.addEventListener('pointerdown', function (event) {
      if (!isTouchPortraitLayout()) return;
      if (event.pointerType === 'mouse') return;
      if (event.clientX > 26) return;
      if (event.target.closest && event.target.closest('input, textarea, select, button, a, [contenteditable="true"]')) return;
      active = true;
      holding = false;
      startX = event.clientX;
      startY = event.clientY;
      indicator.style.top = Math.min(Math.max(event.clientY, 92), window.innerHeight - 92) + 'px';
      indicator.classList.add('show');
      indicator.style.setProperty('--swipe-progress', '0%');
    }, { passive: true });

    window.addEventListener('pointermove', function (event) {
      if (!active || !isTouchPortraitLayout()) return;
      const dx = event.clientX - startX;
      const dy = Math.abs(event.clientY - startY);
      if (dy > 80 && dx < 90) {
        reset();
        return;
      }
      const holdZone = Math.min(window.innerWidth * 0.42, 220);
      if (dx >= holdZone) {
        if (!holding) {
          holding = true;
          holdStart = performance.now();
          raf = requestAnimationFrame(tick);
        }
      } else if (holding && dx < holdZone - 34) {
        holding = false;
        holdStart = 0;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        indicator.classList.remove('ready');
        indicator.style.setProperty('--swipe-progress', Math.max(0, Math.min(65, (dx / holdZone) * 65)).toFixed(1) + '%');
      } else if (!holding) {
        indicator.style.setProperty('--swipe-progress', Math.max(0, Math.min(65, (dx / holdZone) * 65)).toFixed(1) + '%');
      }
    }, { passive: true });

    window.addEventListener('pointerup', reset, { passive: true });
    window.addEventListener('pointercancel', reset, { passive: true });
    window.addEventListener('resize', reset, { passive: true });
  }

  function addAiMessage(box, role, text) {
    const msg = document.createElement('div');
    msg.className = 'mt-ai-msg ' + role;
    msg.textContent = text;
    box.appendChild(msg);
    box.scrollTop = box.scrollHeight;
  }

  function mountAiDock() {
    const panel = document.createElement('aside');
    panel.className = 'mt-global-ai';
    panel.setAttribute('aria-label', 'AI tutor panel');
    panel.innerHTML = [
      '<div class="mt-ai-head"><h3>AI Tutor</h3><span class="mt-ai-chip">Live helper</span></div>',
      '<div class="mt-ai-suggest">',
      '<button type="button" data-prompt="Explain this topic">Explain topic</button>',
      '<button type="button" data-prompt="Solve this problem">Solve problem</button>',
      '<button type="button" data-prompt="Give practice questions">Practice questions</button>',
      '</div>',
      '<div class="mt-ai-messages" id="mtAiMessages"></div>',
      '<div class="mt-ai-input">',
      '<input type="text" id="mtAiInput" placeholder="Ask your learning doubt..." />',
      '<button type="button" id="mtAiSend">Go</button>',
      '</div>'
    ].join('');
    document.body.appendChild(panel);

    const box = panel.querySelector('#mtAiMessages');
    const input = panel.querySelector('#mtAiInput');
    const send = panel.querySelector('#mtAiSend');

    function submit(text) {
      const value = (text || input.value || '').trim();
      if (!value) return;
      addAiMessage(box, 'user', value);
      input.value = '';
      setTimeout(function () {
        addAiMessage(box, 'bot', 'Great question. Open AI Tutor to continue this step by step.');
      }, 220);
    }

    send.addEventListener('click', function () {
      submit();
    });

    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        submit();
      }
    });

    panel.querySelectorAll('[data-prompt]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        submit(btn.getAttribute('data-prompt'));
      });
    });

    addAiMessage(box, 'bot', 'I can help while you keep working in this page.');
  }

  function initLayout() {
    initPageTransitions();
    initMobileSwipeHome();

    const current = pageName();
    enhanceMobileHeader(current);

    const isHome = current === 'home.html';
    if (!isHome) return;
    const target = findOffsetTarget();
    if (!target) return;
    const header = document.querySelector('header.header-wrap');

    document.body.classList.add('mt-layout-active');
    target.classList.add('mt-offset-target');
    if (header && !target.contains(header)) {
      header.classList.add('mt-offset-target');
    }

    mountSidebar(current);
    mountBottomNav(current);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLayout);
  } else {
    initLayout();
  }
})();
