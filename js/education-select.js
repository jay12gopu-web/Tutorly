(function (root) {
  "use strict";
  let sequence = 0;
  const normalize = (value) => String(value || "").normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

  /** Mount an accessible registry picker. Values are item IDs. onChange(value, selectedItems)
   * receives a string for single selection or string[] for multiple selection.
   * API: getValue(), setValue(value, notify=false), setItems(items), setDisabled(bool),
   * setInvalid(bool), focus(), destroy(). The caller loads the registry and handles errors. */
  function mount(container, options = {}) {
    const id = options.id || `education-select-${++sequence}`;
    const multiple = !!options.multiple;
    let items = Array.isArray(options.items) ? options.items : [];
    let selected = [];
    let filtered = [];
    let active = -1;
    let expanded = false;
    let disabled = !!options.disabled;
    const wrapper = document.createElement("div");
    wrapper.className = "education-select";
    const label = document.createElement("label");
    label.className = "education-select-label";
    label.htmlFor = id;
    label.textContent = options.label || "Select an option";
    const control = document.createElement("div");
    control.className = "education-select-control";
    const input = document.createElement("input");
    input.id = id;
    input.type = "text";
    input.className = "education-select-input";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.placeholder = options.placeholder || "Search by name or abbreviation";
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-haspopup", "listbox");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-controls", `${id}-list`);
    input.setAttribute("aria-describedby", `${id}-hint`);
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "education-select-toggle";
    toggle.textContent = "⌄";
    toggle.tabIndex = -1;
    toggle.setAttribute("aria-label", `Show ${label.textContent.toLowerCase()}`);
    const list = document.createElement("ul");
    list.id = `${id}-list`;
    list.className = "education-select-list";
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", label.textContent);
    if (multiple) list.setAttribute("aria-multiselectable", "true");
    list.hidden = true;
    const chips = document.createElement("div");
    chips.className = "education-select-chips";
    chips.setAttribute("aria-label", `Selected ${label.textContent.toLowerCase()}`);
    const hint = document.createElement("p");
    hint.id = `${id}-hint`;
    hint.className = "education-select-help";
    hint.textContent = multiple ? "Choose all that apply. Search again to add another." : "Choose a result from the list.";
    const live = document.createElement("span");
    live.className = "education-select-sr";
    live.setAttribute("role", "status");
    control.append(input, toggle, list);
    wrapper.append(label, control, chips, hint, live);
    container.replaceChildren(wrapper);

    const getValue = () => multiple ? [...selected] : selected[0] || "";
    function changed() {
      input.removeAttribute("aria-invalid");
      options.onChange?.(getValue(), selected.map((value) => items.find((item) => item.id === value)));
    }
    function close() {
      expanded = false;
      active = -1;
      list.hidden = true;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
    }
    function open() {
      if (disabled) return;
      expanded = true;
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
    }
    function renderSelected() {
      chips.replaceChildren();
      chips.hidden = !multiple || !selected.length;
      if (!multiple) input.value = items.find((item) => item.id === selected[0])?.name || "";
      else selected.forEach((value) => {
        const item = items.find((entry) => entry.id === value);
        if (!item) return;
        const chip = document.createElement("span");
        chip.className = "education-select-chip";
        const text = document.createElement("span");
        text.textContent = item.shortName || item.name;
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "×";
        remove.disabled = disabled;
        remove.setAttribute("aria-label", `Remove ${item.name}`);
        remove.addEventListener("click", () => {
          selected = selected.filter((entry) => entry !== value);
          renderSelected(); renderOptions(); changed(); input.focus();
          live.textContent = `${item.name} removed. ${selected.length} selected.`;
        });
        chip.append(text, remove); chips.append(chip);
      });
    }
    function renderOptions() {
      const selectedName = !multiple ? items.find((item) => item.id === selected[0])?.name : "";
      const query = normalize(input.value === selectedName ? "" : input.value);
      const words = query.split(" ").filter(Boolean);
      filtered = items.filter((item) => {
        const haystack = normalize([item.id, item.name, item.shortName, item.state, item.region, ...(item.aliases || [])].join(" "));
        return words.every((word) => haystack.includes(word));
      });
      list.replaceChildren(); active = -1;
      input.removeAttribute("aria-activedescendant");
      if (!filtered.length) {
        const empty = document.createElement("li");
        empty.className = "education-select-empty";
        empty.setAttribute("role", "presentation");
        empty.textContent = "No matches. Try a different name or abbreviation.";
        list.append(empty);
      }
      filtered.forEach((item, index) => {
        const option = document.createElement("li");
        option.id = `${id}-option-${index}`;
        option.className = "education-select-option";
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", String(selected.includes(item.id)));
        const title = document.createElement("span");
        title.textContent = item.name;
        if (item.state || item.shortName) {
          const subtitle = document.createElement("small");
          subtitle.textContent = [item.shortName, item.state].filter(Boolean).join(" · ");
          title.append(subtitle);
        }
        option.append(title);
        if (selected.includes(item.id)) {
          const check = document.createElement("span"); check.textContent = "✓"; check.setAttribute("aria-hidden", "true"); option.append(check);
        }
        option.addEventListener("pointerdown", (event) => event.preventDefault());
        option.addEventListener("click", () => choose(item));
        list.append(option);
      });
      live.textContent = `${filtered.length} results. Use up and down arrow keys to browse.`;
    }
    function choose(item) {
      if (disabled) return;
      if (multiple) {
        selected = selected.includes(item.id) ? selected.filter((entry) => entry !== item.id) : [...selected, item.id];
        input.value = "";
      } else selected = [item.id];
      renderSelected(); renderOptions(); close(); changed(); input.focus(); close();
      live.textContent = `${item.name} ${selected.includes(item.id) ? "selected" : "removed"}.${multiple ? ` ${selected.length} selected.` : ""}`;
    }
    function activate(index) {
      if (!filtered.length) return;
      active = (index + filtered.length) % filtered.length;
      Array.from(list.children).forEach((element, itemIndex) => element.classList.toggle("is-active", itemIndex === active));
      const option = list.children[active];
      input.setAttribute("aria-activedescendant", option.id);
      option.scrollIntoView({ block: "nearest" });
    }
    input.addEventListener("input", () => {
      if (!multiple && selected.length) { selected = []; changed(); }
      renderOptions(); open();
    });
    input.addEventListener("focus", () => { renderOptions(); open(); });
    input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (!expanded) { renderOptions(); open(); }
        activate(active < 0 ? (event.key === "ArrowDown" ? 0 : filtered.length - 1) : active + (event.key === "ArrowDown" ? 1 : -1));
      } else if (event.key === "Enter" && expanded) {
        event.preventDefault();
        if (active >= 0 && filtered[active]) choose(filtered[active]);
        else if (filtered.length === 1) choose(filtered[0]);
        else if (!multiple && selected.length) close();
      } else if (event.key === "Escape") { event.preventDefault(); close(); }
      else if (event.key === "Tab") close();
    });
    toggle.addEventListener("click", () => { const previous = expanded; input.focus(); renderOptions(); if (previous) close(); else open(); });
    const outside = (event) => { if (!wrapper.contains(event.target)) close(); };
    document.addEventListener("pointerdown", outside);
    function setValue(value, notify = false) {
      const entries = Array.isArray(value) ? value : [value || ""];
      selected = [...new Set(entries.map((value) => {
        const lookup = normalize(value);
        return items.find((item) => [item.id, item.name, item.shortName, item.curriculumValue, ...(item.aliases || [])].some((alias) => alias && normalize(alias) === lookup))?.id;
      }).filter(Boolean))];
      if (!multiple) selected = selected.slice(0, 1);
      renderSelected(); renderOptions(); if (notify) changed();
    }
    function setDisabled(value) {
      disabled = !!value; input.disabled = disabled; toggle.disabled = disabled;
      chips.querySelectorAll("button").forEach((button) => { button.disabled = disabled; });
      if (disabled) close();
    }
    setValue(options.value); setDisabled(disabled);
    return {
      getValue, setValue, setDisabled,
      setItems(value) { const previous = getValue(); items = Array.isArray(value) ? value : []; setValue(previous); },
      setInvalid(value) { input.setAttribute("aria-invalid", String(!!value)); },
      focus() { input.focus(); },
      destroy() { document.removeEventListener("pointerdown", outside); wrapper.remove(); }
    };
  }
  root.TutorlyEducationSelect = Object.freeze({ mount });
})(window);
