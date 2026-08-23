(function () {
  const data = window.LOOT_DATA;
  if (!data) {
    document.body.innerHTML = "<p>Missing loot-data.js. Run scripts/generate-site.ps1.</p>";
    return;
  }

  const STORAGE_CLASS = "roll-planner.classId";
  const STORAGE_SPEC = "roll-planner.specId";
  const STORAGE_STATS = "roll-planner.statOrder";
  const STORAGE_BONUS = "roll-planner.bonusWins";
  const DEFAULT_STATS = ["crit", "haste", "mastery", "versatility"];
  const STAT_LABELS = {
    crit: "Crit",
    haste: "Haste",
    mastery: "Mastery",
    versatility: "Versatility"
  };
  const TIER_RANK = { perfect: 5, high: 4, mid: 3, low: 2, faint: 1 };

  const classSelect = document.getElementById("class-select");
  const specSelect = document.getElementById("spec-select");
  const statOrderEl = document.getElementById("stat-order");
  const table = document.getElementById("loot-table");
  const thead = table.querySelector("thead");
  const tbody = table.querySelector("tbody");
  const bonusWinsEl = document.getElementById("bonus-wins");
  const params = new URLSearchParams(window.location.search);

  let statOrder = readStatOrder();
  let bonusWins = readBonusWins();
  let dragIndex = null;

  function selectedClass() {
    return data.classes.find((cls) => String(cls.id) === classSelect.value);
  }

  function parseStatList(value) {
    const parts = String(value || "")
      .split(",")
      .map((stat) => stat.trim().toLowerCase())
      .filter((stat) => DEFAULT_STATS.includes(stat));
    const unique = [];
    parts.forEach((stat) => {
      if (!unique.includes(stat)) unique.push(stat);
    });
    DEFAULT_STATS.forEach((stat) => {
      if (!unique.includes(stat)) unique.push(stat);
    });
    return unique;
  }

  function readStatOrder() {
    return parseStatList(params.get("stats") || localStorage.getItem(STORAGE_STATS));
  }

  function readBonusWins() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_BONUS) || "[]");
      return Array.isArray(parsed) ? parsed.filter((win) => win && win.key) : [];
    } catch (error) {
      return [];
    }
  }

  function persistBonusWins() {
    try {
      localStorage.setItem(STORAGE_BONUS, JSON.stringify(bonusWins));
    } catch (error) {
      // file:// and some editor previews block storage
    }
  }

  function dropKey(dungeon, slot, entry) {
    if (entry.id != null) return String(entry.id);
    return `${dungeon.id}:${slot.id}:${entry.name}`;
  }

  function isBonusWin(key) {
    return bonusWins.some((win) => win.key === key);
  }

  function findEntry(dungeonId, slotId, key) {
    const specGrid = data.grid[specSelect.value] || {};
    const entries = (specGrid[dungeonId] && specGrid[dungeonId][slotId]) || [];
    const dungeon = data.dungeons.find((item) => String(item.id) === String(dungeonId));
    const slot = data.slots.find((item) => String(item.id) === String(slotId));
    return entries.find((entry) => dropKey(dungeon, slot, entry) === key) || null;
  }

  function markBonusWin(dungeon, slot, entry) {
    const key = dropKey(dungeon, slot, entry);
    if (isBonusWin(key)) return;
    bonusWins.unshift({
      key,
      id: entry.id ?? null,
      name: entry.name,
      stats: entry.stats || [],
      droppedBy: entry.droppedBy || "",
      dungeonId: dungeon.id,
      dungeonName: dungeon.name,
      dungeonShort: dungeon.shortName,
      slotId: slot.id,
      slotName: slot.name,
      wonAt: new Date().toISOString()
    });
    persistBonusWins();
    renderTable();
    renderBonusSummary();
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
    return "stat-" + String(stat).toLowerCase();
  }

  function normalizeStat(stat) {
    return String(stat).toLowerCase();
  }

  function matchInfo(stats) {
    const present = [...new Set((stats || []).map(normalizeStat).filter((stat) => DEFAULT_STATS.includes(stat)))];
    if (!present.length) {
      return { tier: null, score: 0 };
    }

    const score = present.reduce((total, stat) => {
      const rank = statOrder.indexOf(stat);
      return total + (rank === -1 ? 0 : 4 - rank);
    }, 0);

    const hasTopTwo = present.includes(statOrder[0]) && present.includes(statOrder[1]);
    if (hasTopTwo && present.length >= 2) {
      return { tier: "perfect", score };
    }
    if (score >= 6) return { tier: "high", score };
    if (score >= 5) return { tier: "mid", score };
    if (score >= 4) return { tier: "low", score };
    if (score >= 1) return { tier: "faint", score };
    return { tier: null, score };
  }

  function bestTier(entries, dungeon, slot) {
    let best = null;
    entries.forEach((entry) => {
      if (isBonusWin(dropKey(dungeon, slot, entry))) return;
      const tier = matchInfo(entry.stats).tier;
      if (!tier) return;
      if (!best || TIER_RANK[tier] > TIER_RANK[best]) best = tier;
    });
    return best;
  }

  function renderDrop(entry, dungeon, slot) {
    const stats = entry.stats || [];
    const key = dropKey(dungeon, slot, entry);
    const won = isBonusWin(key);
    const tier = won ? null : matchInfo(stats).tier;
    const titleParts = [entry.name, entry.droppedBy].filter(Boolean);
    const title = won
      ? escapeHtml(`${titleParts.join(" — ")} — won by bonus roll, removed from pool`)
      : escapeHtml(titleParts.join(" — "));
    const statsHtml = stats.length
      ? stats.map((stat) => `<span class="stat ${statClassName(stat)}">${escapeHtml(stat)}</span>`).join(" / ")
      : `<span class="item-name">${escapeHtml(entry.name || "No stats")}</span>`;
    const nameHtml = stats.length && entry.name
      ? `<div class="item-name">${escapeHtml(entry.name)}</div>`
      : "";
    const rollHtml = won
      ? ""
      : `<button type="button" class="bonus-roll" data-key="${escapeHtml(key)}" data-dungeon="${escapeHtml(dungeon.id)}" data-slot="${escapeHtml(slot.id)}" aria-label="Mark as won by bonus roll" title="Mark as won by bonus roll">
        <img src="icons/inv_misc_dice_02.jpg" alt="" width="22" height="22">
      </button>`;

    return `<div class="drop${tier ? ` match-${tier}` : ""}${won ? " bonus-won" : ""}" title="${title}">
      ${rollHtml}
      <div class="stats">${statsHtml}</div>
      ${nameHtml}
    </div>`;
  }

  function renderBonusSummary() {
    if (!bonusWins.length) {
      bonusWinsEl.innerHTML = `<p class="bonus-empty">No bonus-roll wins yet. Click the dice on a drop to record one.</p>`;
      return;
    }

    bonusWinsEl.innerHTML = `<ul class="bonus-wins">${bonusWins.map((win) => {
      const stats = win.stats || [];
      const statsHtml = stats.length
        ? stats.map((stat) => `<span class="stat ${statClassName(stat)}">${escapeHtml(stat)}</span>`).join(" / ")
        : "No stats";
      const place = [win.slotName, win.dungeonShort || win.dungeonName].filter(Boolean).join(" · ");
      return `<li class="bonus-win">
        <div class="copy">
          <div class="name">${escapeHtml(win.name)}</div>
          <div class="meta">${statsHtml} · ${escapeHtml(place)}</div>
        </div>
        <button type="button" data-remove-win="${escapeHtml(win.key)}">Remove</button>
      </li>`;
    }).join("")}</ul>`;
  }

  function renderStatOrder() {
    statOrderEl.innerHTML = statOrder.map((stat, index) => {
      return `<li class="stat-chip" draggable="true" data-index="${index}">
        <span class="rank">${index + 1}</span>
        <span class="stat ${statClassName(stat)}">${STAT_LABELS[stat]}</span>
        <span class="move">
          <button type="button" data-move="-1" aria-label="Move ${STAT_LABELS[stat]} up">▲</button>
          <button type="button" data-move="1" aria-label="Move ${STAT_LABELS[stat]} down">▼</button>
        </span>
      </li>`;
    }).join("");
  }

  function moveStat(from, offset) {
    const to = from + offset;
    if (to < 0 || to >= statOrder.length) return;
    const next = statOrder.slice();
    const [stat] = next.splice(from, 1);
    next.splice(to, 0, stat);
    statOrder = next;
    persist();
    renderStatOrder();
    renderTable();
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
        const tier = bestTier(entries, dungeon, slot);
        return `<td class="${tier ? `match-${tier}` : ""}"><div class="drops">${entries.map((entry) => renderDrop(entry, dungeon, slot)).join("")}</div></td>`;
      }).join("");

      return `<tr><th>${slot.name}</th>${cells}</tr>`;
    }).join("");
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_CLASS, classSelect.value);
      localStorage.setItem(STORAGE_SPEC, specSelect.value);
      localStorage.setItem(STORAGE_STATS, statOrder.join(","));
    } catch (error) {
      // file:// and some editor previews block storage
    }

    if (window.location.protocol !== "http:" && window.location.protocol !== "https:") {
      return;
    }

    try {
      const next = new URL(window.location.href);
      next.searchParams.set("class", classSelect.value);
      next.searchParams.set("spec", specSelect.value);
      next.searchParams.set("stats", statOrder.join(","));
      history.replaceState(null, "", next);
    } catch (error) {
      // ignore preview / file-origin history restrictions
    }
  }

  statOrderEl.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-move]");
    if (!button) return;
    const chip = button.closest(".stat-chip");
    moveStat(Number(chip.dataset.index), Number(button.dataset.move));
  });

  statOrderEl.addEventListener("dragstart", (event) => {
    const chip = event.target.closest(".stat-chip");
    if (!chip) return;
    dragIndex = Number(chip.dataset.index);
    chip.classList.add("dragging");
  });

  statOrderEl.addEventListener("dragend", (event) => {
    const chip = event.target.closest(".stat-chip");
    if (chip) chip.classList.remove("dragging");
    dragIndex = null;
  });

  statOrderEl.addEventListener("dragover", (event) => {
    event.preventDefault();
  });

  statOrderEl.addEventListener("drop", (event) => {
    event.preventDefault();
    const chip = event.target.closest(".stat-chip");
    if (!chip || dragIndex === null) return;
    moveStat(dragIndex, Number(chip.dataset.index) - dragIndex);
  });

  classSelect.addEventListener("change", () => {
    fillSpecs();
    persist();
    renderTable();
  });

  specSelect.addEventListener("change", () => {
    persist();
    renderTable();
  });

  tbody.addEventListener("click", (event) => {
    const button = event.target.closest(".bonus-roll");
    if (!button) return;
    const dungeon = data.dungeons.find((item) => String(item.id) === button.dataset.dungeon);
    const slot = data.slots.find((item) => String(item.id) === button.dataset.slot);
    const entry = dungeon && slot ? findEntry(dungeon.id, slot.id, button.dataset.key) : null;
    if (!entry) return;
    markBonusWin(dungeon, slot, entry);
  });

  bonusWinsEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-win]");
    if (!button) return;
    bonusWins = bonusWins.filter((win) => win.key !== button.dataset.removeWin);
    persistBonusWins();
    renderTable();
    renderBonusSummary();
  });

  fillClasses();
  fillSpecs();
  renderStatOrder();
  renderTable();
  renderBonusSummary();
  persist();
})();
