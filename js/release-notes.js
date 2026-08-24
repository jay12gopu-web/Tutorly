(function () {
  "use strict";
  const root = document.getElementById("releaseNotesList");
  const groups = Array.isArray(window.TUTORLY_RELEASE_NOTES) ? window.TUTORLY_RELEASE_NOTES : [];
  if (!root) return;
  root.replaceChildren(...groups.map((group) => {
    const card = document.createElement("article");
    card.className = "account-page-card";
    const date = document.createElement("p");
    date.className = "release-date";
    date.textContent = group.period;
    const items = document.createElement("div");
    items.className = "release-items";
    items.replaceChildren(...group.items.map((entry) => {
      const item = document.createElement("section");
      item.className = "release-item";
      const heading = document.createElement("h3");
      const copy = document.createElement("p");
      heading.textContent = entry.title;
      copy.textContent = entry.description;
      item.append(heading, copy);
      return item;
    }));
    card.append(date, items);
    return card;
  }));
})();
