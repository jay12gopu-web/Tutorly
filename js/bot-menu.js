(function () {
  const menus = document.querySelectorAll('.bot-menu');
  if (!menus.length) return;

  menus.forEach((menu) => {
    const trigger = menu.querySelector('.bot-trigger');
    if (!trigger) return;

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      menus.forEach((m) => {
        if (m !== menu) m.classList.remove('open');
      });
      menu.classList.toggle('open');
    });

    menu.querySelectorAll('.bot-card').forEach((card) => {
      card.addEventListener('click', () => {
        const route = card.getAttribute('data-route');
        if (route) window.location.href = route;
      });
    });
  });

  document.addEventListener('click', () => {
    menus.forEach((m) => m.classList.remove('open'));
  });
})();
