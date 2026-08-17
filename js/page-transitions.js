(function () {
  if (window.__tutorlyPageTransitionsApplied) return;
  window.__tutorlyPageTransitionsApplied = true;

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  ready(function () {
    var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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

      var routeElement = event.target.closest && event.target.closest('[data-route]');
      var link = event.target.closest && event.target.closest('a[href]');
      var rawTarget = routeElement ? routeElement.getAttribute('data-route') : link && link.getAttribute('href');
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

    initMobileSwipeHome();
  });

  function initMobileSwipeHome() {
    return;
    if (window.__tutorlySwipeHomeApplied) return;
    window.__tutorlySwipeHomeApplied = true;

    var fileName = (window.location.pathname.split('/').pop() || '').toLowerCase();
    var isHome = fileName === 'home.html';
    var isChatbot = fileName === 'maths_gpt.html' || fileName === 'math_gpt.html';
    if (isHome) return;

    function isTouchPortraitLayout() {
      var touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      var portraitTablet = window.innerHeight >= window.innerWidth && window.innerWidth <= 1180;
      var phone = window.innerWidth <= 760;
      return touch && (phone || portraitTablet);
    }

    function injectSwipeStyles() {
      if (document.getElementById('tutorlySwipeHomeStyles')) return;
      var style = document.createElement('style');
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

    var indicator = document.createElement('div');
    indicator.className = 'swipe-home-hold';
    indicator.setAttribute('aria-hidden', 'true');
    indicator.innerHTML = '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"></path><path d="M9 12h10"></path></svg>';
    document.body.appendChild(indicator);

    var active = false;
    var holding = false;
    var holdStart = 0;
    var raf = 0;
    var startX = 0;
    var startY = 0;
    var holdMs = 850;

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
      var progress = Math.min(100, ((time - holdStart) / holdMs) * 100);
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
      var dx = event.clientX - startX;
      var dy = Math.abs(event.clientY - startY);
      if (dy > 80 && dx < 90) {
        reset();
        return;
      }
      var holdZone = Math.min(window.innerWidth * 0.42, 220);
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
})();
