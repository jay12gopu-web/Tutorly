(function () {
  'use strict';
  const input = document.getElementById('helpSearch');
  const articles = Array.from(document.querySelectorAll('#helpArticles > article'));
  const status = document.getElementById('helpSearchStatus');
  if (!input || !status) return;
  input.addEventListener('input', () => {
    const query = input.value.trim().toLocaleLowerCase();
    let count = 0;
    articles.forEach(article => { article.hidden = !article.textContent.toLocaleLowerCase().includes(query); if (!article.hidden) count++; });
    status.hidden = !query;
    status.replaceChildren();
    if (count) status.textContent = `${count} help ${count === 1 ? 'article' : 'articles'} found.`;
    else status.append(window.TutorlyUIState.create({state:'empty',title:'No matching articles',message:'Try another word or contact Tutorly Support.'}));
  });
})();
