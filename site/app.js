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
  const STORAGE_CRAFTED = "roll-planner.craftedSlots";
  const STORAGE_ALT = "roll-planner.altSlots";
  const STORAGE_INCLUDE = "roll-planner.includeSlots";
  const STORAGE_WEAPON = "roll-planner.weaponStyle";
  const STORAGE_SPEC_STATS = "roll-planner.specStatOrders";
  const SLOT_WEAPON = 10;
  const SLOT_OFFHAND = 11;
  const SLOT_FINGER = 12;
  const SLOT_TRINKET = 13;
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
  const tfoot = table.querySelector("tfoot");
  const bonusWinsEl = document.getElementById("bonus-wins");
  const params = new URLSearchParams(window.location.search);

  let specStatOrders = readSpecStatOrders();
  let statOrder = DEFAULT_STATS.slice();
  let bonusWins = readBonusWins();
  let weaponStyle = readWeaponStyle();
  let includeSlots = readIncludeSlots();
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

  function readSpecStatOrders() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_SPEC_STATS) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function wowheadDefault(specId) {
    const raw = (window.SPEC_STAT_DEFAULTS || {})[String(specId)];
    if (Array.isArray(raw)) return parseStatList(raw.join(","));
    return parseStatList(raw);
  }

  function orderForSpec(specId) {
    if (specStatOrders[specId]) return parseStatList(specStatOrders[specId]);
    return wowheadDefault(specId);
  }

  function rememberCurrentOrder() {
    if (!specSelect.value) return;
    specStatOrders[specSelect.value] = statOrder.join(",");
  }

  function loadOrderForCurrentSpec(preferUrl) {
    const specId = specSelect.value;
    if (preferUrl && params.get("stats")) {
      statOrder = parseStatList(params.get("stats"));
    } else if (specStatOrders[specId]) {
      statOrder = orderForSpec(specId);
    } else if (localStorage.getItem(STORAGE_STATS) && !Object.keys(specStatOrders).length) {
      statOrder = parseStatList(localStorage.getItem(STORAGE_STATS));
    } else {
      statOrder = orderForSpec(specId);
    }
    rememberCurrentOrder();
  }

  function readWeaponStyle() {
    const raw = (params.get("weapons") || localStorage.getItem(STORAGE_WEAPON) || "2h").toLowerCase();
    return raw === "dw" || raw === "dual" ? "dw" : "2h";
  }

  function parseSlotCounts(raw) {
    const slots = {};
    if (!raw) return slots;
    try {
      if (String(raw).trim().startsWith("{")) {
        const parsed = JSON.parse(raw);
        Object.entries(parsed || {}).forEach(([id, count]) => {
          slots[id] = Math.max(0, Number(count) || 0);
        });
        return slots;
      }
    } catch (error) {
      // fall through to compact format
    }
    String(raw).split(",").forEach((part) => {
      const [id, count] = part.split(":");
      if (id) slots[id] = Math.max(0, Number(count) || 0);
    });
    return slots;
  }

  function slotCapacity(slot) {
    const id = Number(slot.id ?? slot);
    if (id === SLOT_FINGER || id === SLOT_TRINKET) return 2;
    if (id === SLOT_WEAPON) return weaponStyle === "dw" ? 2 : 1;
    return 1;
  }

  function invertExcludedCounts(excluded) {
    const included = {};
    Object.entries(excluded).forEach(([id, count]) => {
      const cap = slotCapacity(id);
      if (count > 0) included[id] = Math.max(0, cap - Math.min(cap, count));
    });
    return included;
  }

  function readIncludeSlots() {
    const includedRaw = params.get("include") || localStorage.getItem(STORAGE_INCLUDE);
    if (includedRaw) return parseSlotCounts(includedRaw);
    const excludedRaw = params.get("alts") || params.get("crafts")
      || localStorage.getItem(STORAGE_ALT) || localStorage.getItem(STORAGE_CRAFTED);
    return invertExcludedCounts(parseSlotCounts(excludedRaw));
  }

  function includedCount(slot) {
    const id = String(slot.id ?? slot);
    const cap = slotCapacity(slot);
    if (includeSlots[id] == null) return cap;
    return Math.min(cap, Math.max(0, Number(includeSlots[id]) || 0));
  }

  function includeParam() {
    return data.slots
      .map((slot) => {
        const cap = slotCapacity(slot);
        const count = includedCount(slot);
        return count < cap ? `${slot.id}:${count}` : null;
      })
      .filter(Boolean)
      .join(",");
  }

  function bonusFillCount(slot) {
    const id = Number(slot.id ?? slot);
    return bonusWins.filter((win) => Number(win.slotId) === id).length;
  }

  function isOffhandUnused() {
    return weaponStyle === "2h";
  }

  function isSlotFilled(slot) {
    if (Number(slot.id) === SLOT_OFFHAND && isOffhandUnused()) return true;
    const excluded = slotCapacity(slot) - includedCount(slot);
    return excluded + bonusFillCount(slot) >= slotCapacity(slot);
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

  function itemStats(entry) {
    return [...new Set((entry.stats || []).map(normalizeStat).filter((stat) => DEFAULT_STATS.includes(stat)))];
  }

  function poolKind(entry, slot) {
    if (isSlotFilled(slot)) return "waste";
    const present = itemStats(entry);
    const hasFirst = present.includes(statOrder[0]);
    const hasSecond = present.includes(statOrder[1]);
    if (hasFirst && hasSecond) return "bis";
    if (hasFirst || hasSecond) return "upgrade";
    return "waste";
  }

  function remainingPool(specGrid, dungeon) {
    const items = [];
    data.slots.forEach((slot) => {
      const entries = (specGrid[dungeon.id] && specGrid[dungeon.id][slot.id]) || [];
      entries.forEach((entry) => {
        if (!isBonusWin(dropKey(dungeon, slot, entry))) items.push({ entry, slot });
      });
    });
    return items;
  }

  function poolStats(specGrid, dungeon) {
    const items = remainingPool(specGrid, dungeon);
    const counts = { remaining: items.length, bis: 0, upgrade: 0, waste: 0 };
    items.forEach(({ entry, slot }) => {
      counts[poolKind(entry, slot)] += 1;
    });
    const ratio = (part) => counts.remaining ? part / counts.remaining : null;
    return {
      ...counts,
      bisPct: ratio(counts.bis),
      upgradePct: ratio(counts.upgrade),
      netPct: ratio(counts.bis + counts.upgrade)
    };
  }

  function formatPct(value) {
    if (value == null) return "—";
    const pct = Math.round(value * 1000) / 10;
    return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`;
  }

  function heatColor(t) {
    const clamped = Math.max(0, Math.min(1, t));
    const hue = Math.round(8 + clamped * 112);
    const sat = Math.round(40 + clamped * 16);
    const light = Math.round(15 + clamped * 9);
    return `hsl(${hue} ${sat}% ${light}%)`;
  }

  function heatStyle(value, max) {
    if (value == null || !max) return "";
    return `background:${heatColor(value / max)}`;
  }

  function bestTier(entries, dungeon, slot) {
    if (isSlotFilled(slot)) return null;
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
    const filled = isSlotFilled(slot);
    const tier = won || filled ? null : matchInfo(stats).tier;
    const titleParts = [entry.name, entry.droppedBy].filter(Boolean);
    const title = won
      ? escapeHtml(`${titleParts.join(" — ")} — won by bonus roll, removed from pool`)
      : filled
        ? escapeHtml(`${titleParts.join(" — ")} — slot filled, treated as waste`)
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

    return `<div class="drop${tier ? ` match-${tier}` : ""}${won ? " bonus-won" : ""}${filled && !won ? " slot-filled" : ""}" title="${title}">
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
    rememberCurrentOrder();
    persist();
    renderStatOrder();
    renderTable();
  }

  function renderTable() {
    const specId = specSelect.value;
    const specGrid = data.grid[specId] || {};

    thead.innerHTML = `<tr>
      <th class="slot-col">Slot<span class="dungeon-name">Include</span></th>
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

      return `<tr>${renderSlotHead(slot)}${cells}</tr>`;
    }).join("");

    renderFooter(specGrid);
  }

  function renderSlotHead(slot) {
    const cap = slotCapacity(slot);
    const count = includedCount(slot);
    const unused = Number(slot.id) === SLOT_OFFHAND && isOffhandUnused();
    const boxes = Array.from({ length: cap }, (_, index) => {
      const checked = index < count;
      const label = cap > 1
        ? `Include ${slot.name} ${index + 1} in calculations`
        : `Include ${slot.name} in calculations`;
      return `<label class="alt-box" title="${escapeHtml(label)}">
        <input type="checkbox" data-include-slot="${escapeHtml(slot.id)}" ${checked ? "checked" : ""} ${unused ? "disabled" : ""}>
      </label>`;
    }).join("");
    return `<th>
      <div class="slot-head">
        <span>${escapeHtml(slot.name)}</span>
        <span class="alt-boxes${unused ? " inactive" : ""}">${boxes}</span>
      </div>
    </th>`;
  }

  function renderFooter(specGrid) {
    const columns = data.dungeons.map((dungeon) => poolStats(specGrid, dungeon));
    const maxBis = Math.max(0, ...columns.map((col) => col.bisPct || 0));
    const maxUpgrade = Math.max(0, ...columns.map((col) => col.upgradePct || 0));
    const maxNet = Math.max(0, ...columns.map((col) => col.netPct || 0));

    const countCells = (key) => columns.map((col) => {
      return `<td class="pool-count">${col[key]}</td>`;
    }).join("");

    const pctTitle = (col, hits) => {
      if (!col.remaining) return "No remaining items";
      return `${hits} of ${col.remaining} remaining`;
    };

    const pctCells = (key, hitsKey, max) => columns.map((col) => {
      const hits = typeof hitsKey === "function" ? hitsKey(col) : col[hitsKey];
      return `<td class="pool-pct" style="${heatStyle(col[key], max)}" title="${escapeHtml(pctTitle(col, hits))}">${formatPct(col[key])}</td>`;
    }).join("");

    tfoot.innerHTML = `
      <tr class="pool-counts pool-total">
        <th title="Remaining items in this dungeon pool">Total Items</th>
        ${countCells("remaining")}
      </tr>
      <tr class="pool-counts">
        <th title="Remaining items with both of your top two stats">BIS</th>
        ${countCells("bis")}
      </tr>
      <tr class="pool-counts">
        <th title="Remaining items with exactly one of your top two stats">Upgrade</th>
        ${countCells("upgrade")}
      </tr>
      <tr class="pool-counts">
        <th title="Remaining items with neither of your top two stats">Waste</th>
        ${countCells("waste")}
      </tr>
      <tr class="pool-pcts pool-rule">
        <th title="Odds of rolling a remaining BIS item">BIS Upgrade %</th>
        ${pctCells("bisPct", "bis", maxBis)}
      </tr>
      <tr class="pool-pcts">
        <th title="Odds of rolling a remaining minor upgrade">Minor Upgrade %</th>
        ${pctCells("upgradePct", "upgrade", maxUpgrade)}
      </tr>
      <tr class="pool-pcts pool-net">
        <th title="Odds of rolling a remaining BIS or Upgrade item">Net Upgrade %</th>
        ${pctCells("netPct", (col) => col.bis + col.upgrade, maxNet)}
      </tr>
    `;
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_CLASS, classSelect.value);
      localStorage.setItem(STORAGE_SPEC, specSelect.value);
      localStorage.setItem(STORAGE_STATS, statOrder.join(","));
      localStorage.setItem(STORAGE_SPEC_STATS, JSON.stringify(specStatOrders));
      localStorage.setItem(STORAGE_INCLUDE, includeParam());
      localStorage.setItem(STORAGE_WEAPON, weaponStyle);
      localStorage.setItem(STORAGE_BONUS, JSON.stringify(bonusWins));
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
      next.searchParams.set("weapons", weaponStyle);
      next.searchParams.delete("crafted");
      next.searchParams.delete("alts");
      next.searchParams.delete("crafts");
      const included = includeParam();
      if (included) next.searchParams.set("include", included);
      else next.searchParams.delete("include");
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
    loadOrderForCurrentSpec(false);
    persist();
    renderStatOrder();
    renderTable();
  });

  specSelect.addEventListener("change", () => {
    loadOrderForCurrentSpec(false);
    persist();
    renderStatOrder();
    renderTable();
  });

  document.querySelectorAll("input[name='weapon-style']").forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      weaponStyle = input.value === "dw" ? "dw" : "2h";
      const weaponId = String(SLOT_WEAPON);
      if (includeSlots[weaponId] != null) {
        includeSlots[weaponId] = Math.min(slotCapacity(SLOT_WEAPON), includeSlots[weaponId]);
      }
      persist();
      renderTable();
    });
  });

  tbody.addEventListener("change", (event) => {
    const input = event.target.closest("input[data-include-slot]");
    if (!input) return;
    const slotId = input.dataset.includeSlot;
    const cap = slotCapacity(slotId);
    const checked = [...tbody.querySelectorAll(`input[data-include-slot="${slotId}"]`)]
      .filter((box) => box.checked).length;
    includeSlots[slotId] = Math.min(cap, checked);
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
    const win = bonusWins.find((item) => item.key === button.dataset.removeWin);
    const label = win?.name || "this bonus-roll win";
    if (!window.confirm(`Remove ${label} from bonus-roll wins?`)) return;
    bonusWins = bonusWins.filter((item) => item.key !== button.dataset.removeWin);
    persist();
    renderTable();
    renderBonusSummary();
  });

  function syncSetupControls() {
    document.querySelectorAll("input[name='weapon-style']").forEach((input) => {
      input.checked = input.value === weaponStyle;
    });
  }

  fillClasses();
  fillSpecs();
  loadOrderForCurrentSpec(true);
  syncSetupControls();
  renderStatOrder();
  renderTable();
  renderBonusSummary();
  persist();

  window.addEventListener("pagehide", persist);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") persist();
  });
})();
