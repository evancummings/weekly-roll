(function () {
  const data = window.LOOT_DATA;
  if (!data) {
    document.body.innerHTML = "<p>Missing loot-data.js. Run scripts/generate-site.ps1.</p>";
    return;
  }

  const STORAGE_CLASS = "roll-planner.classId";
  const STORAGE_SPEC = "roll-planner.specId";

  const classSelect = document.getElementById("class-select");
  const specSelect = document.getElementById("spec-select");
  const table = document.getElementById("loot-table");
  const thead = table.querySelector("thead");
  const tbody = table.querySelector("tbody");
  const params = new URLSearchParams(window.location.search);

  function selectedClass() {
    return data.classes.find((cls) => String(cls.id) === classSelect.value);
  }

  function fillClasses() {
    classSelect.innerHTML = data.classes.map((cls) => {
      return `<option value="${cls.id}">${cls.name}</option>`;
    }).join("");

    const requestedClass = params.get("class") || localStorage.getItem(STORAGE_CLASS);
    if (requestedClass && data.classes.some((cls) => String(cls.id) === requestedClass)) {
      classSelect.value = requestedClass;
    }
  }

  function fillSpecs() {
    const cls = selectedClass();
    specSelect.innerHTML = (cls?.specs || []).map((spec) => {
      return `<option value="${spec.id}">${spec.name}</option>`;
    }).join("");

    const requestedSpec = params.get("spec") || localStorage.getItem(STORAGE_SPEC);
    if (requestedSpec && (cls?.specs || []).some((spec) => String(spec.id) === requestedSpec)) {
      specSelect.value = requestedSpec;
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function statClassName(stat) {
    return "stat-" + stat.toLowerCase();
  }

  function renderDrop(entry) {
    const stats = entry.stats || [];
    const titleParts = [entry.name, entry.droppedBy].filter(Boolean);
    const title = escapeHtml(titleParts.join(" — "));
    const statsHtml = stats.length
      ? stats.map((stat) => `<span class="stat ${statClassName(stat)}">${escapeHtml(stat)}</span>`).join(" / ")
      : `<span class="item-name">${escapeHtml(entry.name || "No stats")}</span>`;
    const nameHtml = stats.length && entry.name
      ? `<div class="item-name">${escapeHtml(entry.name)}</div>`
      : "";

    return `<div class="drop" title="${title}">
      <div class="stats">${statsHtml}</div>
      ${nameHtml}
    </div>`;
  }

  function renderTable() {
    const specId = specSelect.value;
    const specGrid = data.grid[specId] || {};

    thead.innerHTML = `<tr>
      <th class="slot-col">Slot</th>
      ${data.dungeons.map((dungeon) => {
        return `<th>${dungeon.shortName}<span class="dungeon-name">${dungeon.name}</span></th>`;
      }).join("")}
    </tr>`;

    tbody.innerHTML = data.slots.map((slot) => {
      const cells = data.dungeons.map((dungeon) => {
        const entries = (specGrid[dungeon.id] && specGrid[dungeon.id][slot.id]) || [];
        if (!entries.length) {
          return `<td><span class="empty">—</span></td>`;
        }
        return `<td><div class="drops">${entries.map(renderDrop).join("")}</div></td>`;
      }).join("");

      return `<tr><th>${slot.name}</th>${cells}</tr>`;
    }).join("");
  }

  function persist() {
    localStorage.setItem(STORAGE_CLASS, classSelect.value);
    localStorage.setItem(STORAGE_SPEC, specSelect.value);
    const next = new URL(window.location.href);
    next.searchParams.set("class", classSelect.value);
    next.searchParams.set("spec", specSelect.value);
    history.replaceState(null, "", next);
  }

  classSelect.addEventListener("change", () => {
    fillSpecs();
    persist();
    renderTable();
  });

  specSelect.addEventListener("change", () => {
    persist();
    renderTable();
  });

  fillClasses();
  fillSpecs();
  persist();
  renderTable();
})();
