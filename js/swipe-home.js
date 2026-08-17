(function () {
  if (window.__tutorlySwipeHomeV2Applied) return;
  window.__tutorlySwipeHomeV2Applied = true;

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  function pageName() {
    var parts = window.location.pathname.split('/');
    return (parts[parts.length - 1] || 'home.html').toLowerCase();
  }

  function isHomePage(name) {
    return !name || name === 'home.html' || name === 'index.html';
  }

  function isChatPage(name) {
    return name === 'maths_gpt.html' || name === 'math_gpt.html';
  }

  function canUseGesture() {
    var touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    var ua = navigator.userAgent || '';
    var uaMobile = /Android|iPhone|iPad|iPod|Mobile|Tablet|Silk|Kindle/i.test(ua);
    var iPadDesktop = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
    var portrait = window.innerHeight >= window.innerWidth;
    var phone = window.innerWidth <= 760;
    var tabletPortrait = portrait && window.innerWidth <= 1180;
    return phone || (touch && (tabletPortrait || uaMobile || iPadDesktop));
  }

  function injectStyles() {
    if (document.getElementById('tutorlySwipeHomeV2Styles')) return;

    var style = document.createElement('style');
      style.id = 'tutorlySwipeHomeV2Styles';
      style.textContent = [
      '.mt-swipe-home-indicator {',
      '  position: fixed;',
      '  left: 0;',
      '  top: 0;',
      '  z-index: 2147483000;',
      '  width: 62px;',
      '  height: 62px;',
      '  border-radius: 999px;',
      '  display: grid;',
      '  place-items: center;',
      '  opacity: 0;',
      '  pointer-events: none;',
      '  --mt-swipe-x: 34px;',
      '  --mt-swipe-y: 50vh;',
      '  --mt-swipe-progress: 0%;',
      '  transform: translate3d(var(--mt-swipe-x), var(--mt-swipe-y), 0) translate(-50%, -50%) scale(.78);',
      '  transition: opacity 140ms ease, transform 210ms cubic-bezier(.18,.9,.2,1.18), filter 160ms ease;',
      '  background: conic-gradient(from -90deg, #2f7dff 0%, #63c8ff var(--mt-swipe-progress), rgba(176, 203, 255, .5) var(--mt-swipe-progress), rgba(176, 203, 255, .5) 100%);',
      '  box-shadow: 0 20px 54px rgba(43, 94, 205, .28);',
      '  will-change: transform, opacity;',
      '}',
      '.mt-swipe-home-indicator::before {',
      '  content: "";',
      '  position: absolute;',
      '  inset: 5px;',
      '  border-radius: inherit;',
      '  background: rgba(255, 255, 255, .72);',
      '  border: 1px solid rgba(255, 255, 255, .7);',
      '  box-shadow: inset 0 1px 0 rgba(255,255,255,.88), inset 0 -18px 36px rgba(99, 140, 255, .1);',
      '  backdrop-filter: blur(16px) saturate(1.2);',
      '  -webkit-backdrop-filter: blur(16px) saturate(1.2);',
      '}',
      '.mt-swipe-home-indicator svg {',
      '  position: relative;',
      '  z-index: 1;',
      '  width: 27px;',
      '  height: 27px;',
      '  color: #1f5fd8;',
      '  fill: none;',
      '  stroke: currentColor;',
      '  stroke-width: 2.8;',
      '  stroke-linecap: round;',
      '  stroke-linejoin: round;',
      '}',
      '.mt-swipe-home-indicator.is-visible {',
      '  opacity: 1;',
      '  transform: translate3d(var(--mt-swipe-x), var(--mt-swipe-y), 0) translate(-50%, -50%) scale(1);',
      '}',
      '.mt-swipe-home-indicator.is-holding {',
      '  filter: drop-shadow(0 0 18px rgba(47,125,255,.22));',
      '}',
      '.mt-swipe-home-indicator.is-complete {',
      '  opacity: 1;',
      '  transform: translate3d(var(--mt-swipe-x), var(--mt-swipe-y), 0) translate(-50%, -50%) scale(1.14);',
      '  filter: drop-shadow(0 0 24px rgba(47,125,255,.34));',
      '}',
      '@media (max-width: 420px) {',
      '  .mt-swipe-home-indicator { width: 56px; height: 56px; }',
      '  .mt-swipe-home-indicator svg { width: 24px; height: 24px; }',
      '}'
    ].join('');

    document.head.appendChild(style);
  }

  ready(function () {
    var name = pageName();
    injectStyles();

    var indicator = document.createElement('div');
    indicator.className = 'mt-swipe-home-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    indicator.innerHTML = '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"></path><path d="M9 12h10"></path></svg>';
    document.body.appendChild(indicator);

    var active = false;
    var horizontal = false;
    var holding = false;
    var complete = false;
    var startX = 0;
    var startY = 0;
    var targetX = 34;
    var targetY = 120;
    var visualX = 34;
    var visualY = 120;
    var holdStart = 0;
    var pausedAt = 0;
    var raf = 0;
    var progress = 0;
    var holdMs = 1000;

    function setIndicatorPosition(x, y) {
      var radius = window.innerWidth <= 420 ? 28 : 31;
      targetX = Math.max(radius, Math.min(x, Math.min(window.innerWidth - radius, 260)));
      targetY = Math.max(radius + 18, Math.min(y, window.innerHeight - radius - 18));
    }

    function renderPosition() {
      visualX += (targetX - visualX) * 0.34;
      visualY += (targetY - visualY) * 0.34;
      indicator.style.setProperty('--mt-swipe-x', visualX.toFixed(1) + 'px');
      indicator.style.setProperty('--mt-swipe-y', visualY.toFixed(1) + 'px');
    }

    function setProgress(value) {
      progress = Math.max(0, Math.min(100, value));
      indicator.style.setProperty('--mt-swipe-progress', progress.toFixed(1) + '%');
    }

    function navigateHome() {
      if (complete) return;
      complete = true;
      setProgress(100);
      indicator.classList.add('is-complete');
      if (navigator.vibrate) navigator.vibrate(28);
      document.body.classList.add('mt-page-leaving');
      window.setTimeout(function () {
        if (isHomePage(pageName())) {
          resetGesture();
          return;
        }
        window.location.href = 'home.html';
      }, 130);
    }

    function frame(now) {
      if (!active) return;
      renderPosition();

      if (holding) {
        if (!holdStart) holdStart = now;
        setProgress(pausedAt + ((now - holdStart) / holdMs) * (100 - pausedAt));
        if (progress >= 100) {
          navigateHome();
          return;
        }
      }

      raf = requestAnimationFrame(frame);
    }

    function startGesture(x, y) {
      if (!canUseGesture()) return;
      active = true;
      horizontal = false;
      holding = false;
      complete = false;
      startX = x;
      startY = y;
      holdStart = 0;
      pausedAt = 0;
      setProgress(0);
      setIndicatorPosition(34, y);
      visualX = 20;
      visualY = targetY;
      indicator.classList.remove('is-holding', 'is-complete');
      indicator.classList.add('is-visible');
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
    }

    function resetGesture() {
      active = false;
      horizontal = false;
      holding = false;
      complete = false;
      holdStart = 0;
      pausedAt = 0;
      setProgress(0);
      indicator.classList.remove('is-visible', 'is-holding', 'is-complete');
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    function updateGesture(x, y) {
      if (!active || complete) return;

      var dx = x - startX;
      var dy = y - startY;
      var ady = Math.abs(dy);
      var adx = Math.abs(dx);
      var holdZone = Math.min(window.innerWidth * 0.42, 230);

      if (!horizontal) {
        if (ady > 28 && ady > adx * 1.2) {
          resetGesture();
          return;
        }
        if (dx > 18 && dx > ady * 1.1) {
          horizontal = true;
        }
      }

      if (dx < -8 || (horizontal && dx < 18)) {
        resetGesture();
        return;
      }

      setIndicatorPosition(Math.max(34, x), y);

      if (!holding) {
        setProgress(Math.min(72, Math.max(0, (dx / holdZone) * 72)));
      }

      if (horizontal && dx >= holdZone && ady < 92) {
        if (!holding) {
          holding = true;
          holdStart = 0;
          pausedAt = progress;
          indicator.classList.add('is-holding');
          if (navigator.vibrate) navigator.vibrate(8);
        }
      } else if (holding) {
        holding = false;
        holdStart = 0;
        pausedAt = progress;
        indicator.classList.remove('is-holding');
      }
    }

    function isBlockedTarget(target) {
      return !!(target.closest && target.closest('input, textarea, select, button, a, label, summary, [contenteditable="true"], .model-selector, .composer, .mt-page-drawer, .sidebar'));
    }

    if (window.PointerEvent) {
      window.addEventListener('pointerdown', function (event) {
        if (event.pointerType === 'mouse' && window.innerWidth > 760) return;
        if (event.clientX > 30) return;
        if (isBlockedTarget(event.target)) return;
        startGesture(event.clientX, event.clientY);
      }, { passive: true });

      window.addEventListener('pointermove', function (event) {
        updateGesture(event.clientX, event.clientY);
      }, { passive: true });

      window.addEventListener('pointerup', resetGesture, { passive: true });
      window.addEventListener('pointercancel', resetGesture, { passive: true });
    } else {
      window.addEventListener('touchstart', function (event) {
        if (!event.touches || !event.touches.length) return;
        var touch = event.touches[0];
        if (touch.clientX > 30) return;
        if (isBlockedTarget(event.target)) return;
        startGesture(touch.clientX, touch.clientY);
      }, { passive: true });

      window.addEventListener('touchmove', function (event) {
        if (!event.touches || !event.touches.length) return;
        updateGesture(event.touches[0].clientX, event.touches[0].clientY);
      }, { passive: true });

      window.addEventListener('touchend', resetGesture, { passive: true });
      window.addEventListener('touchcancel', resetGesture, { passive: true });
    }

    window.addEventListener('resize', resetGesture, { passive: true });
    window.addEventListener('pagehide', function () {
      if (raf) cancelAnimationFrame(raf);
    });
  });
})();
