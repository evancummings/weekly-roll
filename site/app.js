(function () {
  const data = window.LOOT_DATA;
  if (!data) {
    document.body.innerHTML = "<p>Missing loot-data.js. Run scripts/generate-site.ps1.</p>";
    return;
  }

  const STORAGE_CLASS = "weighted-dice.classId";
  const STORAGE_SPEC = "weighted-dice.specId";
  const STORAGE_STATS = "weighted-dice.statOrder";
  const STORAGE_BONUS = "weighted-dice.bonusWins";
  const STORAGE_INCLUDE = "weighted-dice.includeSlots";
  const STORAGE_WEAPON = "weighted-dice.weaponStyle";
  const STORAGE_SPEC_STATS = "weighted-dice.specStatOrders";
  const STORAGE_HELP = "weighted-dice.seenInstructions";
  const STORAGE_PROFILES = "weighted-dice.profiles";
  const STORAGE_ACTIVE_PROFILE = "weighted-dice.activeProfileId";
  const STORAGE_MODE = "weighted-dice.contentMode";
  const STORAGE_RAID = "weighted-dice.raidId";
  const STORAGE_TRINKETS = "weighted-dice.trinketRanks";
  const CREATE_PROFILE = "__create__";
  const DEFAULT_RAID_ID = 1320;
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

  const profileSelect = document.getElementById("profile-select");
  const classSelect = document.getElementById("class-select");
  const specSelect = document.getElementById("spec-select");
  const statOrderEl = document.getElementById("stat-order");
  const table = document.getElementById("loot-table");
  const thead = table.querySelector("thead");
  const tbody = table.querySelector("tbody");
  const tfoot = table.querySelector("tfoot");
  const bonusWinsEl = document.getElementById("bonus-wins");
  const helpModal = document.getElementById("help-modal");
  const helpOpen = document.getElementById("help-open");
  const helpClose = document.getElementById("help-close");
  const planModal = document.getElementById("plan-modal");
  const planOpen = document.getElementById("plan-open");
  const planClose = document.getElementById("plan-close");
  const planBody = document.getElementById("plan-body");
  const trinketModal = document.getElementById("trinket-modal");
  const trinketOpen = document.getElementById("trinket-open");
  const trinketClose = document.getElementById("trinket-close");
  const trinketBoard = document.getElementById("trinket-board");
  const trinketCount = document.getElementById("trinket-count");
  const historyModal = document.getElementById("history-modal");
  const historyOpen = document.getElementById("history-open");
  const historyCount = document.getElementById("history-count");
  const historyClose = document.getElementById("history-close");
  const profileModal = document.getElementById("profile-modal");
  const profileForm = document.getElementById("profile-form");
  const profileNameInput = document.getElementById("profile-name");
  const profileCancel = document.getElementById("profile-cancel");
  const profileTitle = document.getElementById("profile-title");
  const profileSubmit = document.getElementById("profile-submit");
  const profileManage = document.getElementById("profile-manage");
  const profileDelete = document.getElementById("profile-delete");
  const raidField = document.getElementById("raid-field");
  const raidSelect = document.getElementById("raid-select");
  const params = new URLSearchParams(window.location.search);

  let specStatOrders = readSpecStatOrders();
  let statOrder = DEFAULT_STATS.slice();
  let bonusWins = readBonusWins();
  let weaponStyle = readWeaponStyle();
  let includeSlots = readIncludeSlots();
  let profiles = readProfiles();
  let activeProfileId = readActiveProfileId();
  let contentMode = readContentMode();
  let selectedRaidId = readRaidId();
  let trinketRanks = readTrinketRanks();
  let profileModalMode = "create";
  let dragIndex = null;
  let trinketDragId = null;

  function raidList() {
    return Array.isArray(data.raids) ? data.raids : [];
  }

  function bossList() {
    return Array.isArray(data.bosses) ? data.bosses : [];
  }

  function defaultRaidId() {
    if (raidList().some((raid) => Number(raid.id) === DEFAULT_RAID_ID)) return DEFAULT_RAID_ID;
    return raidList()[0] ? Number(raidList()[0].id) : null;
  }

  function normalizeMode(value) {
    return value === "raid" && raidList().length ? "raid" : "mplus";
  }

  function normalizeRaidId(value) {
    const id = Number(value);
    if (raidList().some((raid) => Number(raid.id) === id)) return id;
    return defaultRaidId();
  }

  function readContentMode() {
    return normalizeMode(params.get("mode") || localStorage.getItem(STORAGE_MODE));
  }

  function readRaidId() {
    return normalizeRaidId(params.get("raid") || localStorage.getItem(STORAGE_RAID));
  }

  function readTrinketRanks() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_TRINKETS) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function normalizeTrinketRanks(value) {
    const next = {};
    if (!value || typeof value !== "object" || Array.isArray(value)) return next;
    Object.entries(value).forEach(([specId, ranks]) => {
      if (!ranks || typeof ranks !== "object" || Array.isArray(ranks)) return;
      const specRanks = {};
      Object.entries(ranks).forEach(([itemId, rank]) => {
        if (rank === "bis" || rank === "upgrade") specRanks[String(itemId)] = rank;
      });
      if (Object.keys(specRanks).length) next[String(specId)] = specRanks;
    });
    return next;
  }

  function isRaidMode() {
    return contentMode === "raid";
  }

  function activeColumns() {
    if (!isRaidMode()) return data.dungeons;
    return bossList().filter((boss) => Number(boss.raidId) === Number(selectedRaidId));
  }

  function activeGrid() {
    const specId = specSelect.value;
    if (!isRaidMode()) return data.grid[specId] || {};
    return (data.raidGrid && data.raidGrid[specId]) || {};
  }

  function findColumn(columnId) {
    const id = String(columnId);
    return activeColumns().find((column) => String(column.id) === id)
      || data.dungeons.find((column) => String(column.id) === id)
      || bossList().find((column) => String(column.id) === id)
      || null;
  }

  function columnNoun(plural) {
    if (isRaidMode()) return plural ? "bosses" : "boss";
    return plural ? "dungeons" : "dungeon";
  }

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
    return raw === "dw" || raw === "dual" || raw === "mhoh" || raw === "mh" || raw === "oh" ? "mhoh" : "2h";
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
    if (id === SLOT_WEAPON) return weaponStyle === "mhoh" ? 2 : 1;
    return 1;
  }

  function readIncludeSlots() {
    return parseSlotCounts(params.get("include") || localStorage.getItem(STORAGE_INCLUDE));
  }

  function readProfiles() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_PROFILES) || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      const next = {};
      Object.values(parsed).forEach((profile) => {
        if (profile && profile.id && profile.name) next[profile.id] = profile;
      });
      return next;
    } catch (error) {
      return {};
    }
  }

  function readActiveProfileId() {
    const requested = params.get("profile") || localStorage.getItem(STORAGE_ACTIVE_PROFILE);
    if (requested && profiles[requested]) return requested;
    const ids = Object.keys(profiles);
    return ids[0] || "";
  }

  function newProfileId() {
    return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  function profileList() {
    return Object.values(profiles).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }

  function currentProfileData(name, id) {
    return {
      id,
      name,
      classId: classSelect.value,
      specId: specSelect.value,
      statOrder: statOrder.join(","),
      specStatOrders: { ...specStatOrders },
      weaponStyle,
      includeSlots: includeParam(),
      bonusWins: bonusWins.slice(),
      contentMode,
      raidId: selectedRaidId,
      trinketRanks: normalizeTrinketRanks(trinketRanks)
    };
  }

  function emptyProfileData(name, id) {
    const cls = data.classes[0];
    const spec = cls?.specs?.[0];
    const specId = spec ? String(spec.id) : "";
    return {
      id,
      name,
      classId: cls ? String(cls.id) : "",
      specId,
      statOrder: wowheadDefault(specId).join(","),
      specStatOrders: {},
      weaponStyle: "2h",
      includeSlots: "",
      bonusWins: [],
      contentMode: "mplus",
      raidId: defaultRaidId(),
      trinketRanks: {}
    };
  }

  function writeProfiles() {
    try {
      localStorage.setItem(STORAGE_PROFILES, JSON.stringify(profiles));
      if (activeProfileId) localStorage.setItem(STORAGE_ACTIVE_PROFILE, activeProfileId);
    } catch (error) {
      // file:// and some editor previews block storage
    }
  }

  function fillProfileSelect() {
    if (!profileSelect) return;
    const rows = profileList();
    profileSelect.innerHTML = `${rows.map((profile) => {
      return `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.name)}</option>`;
    }).join("")}<option value="${CREATE_PROFILE}">Create Profile...</option>`;
    profileSelect.value = activeProfileId && profiles[activeProfileId] ? activeProfileId : CREATE_PROFILE;
  }

  function applyProfile(profile) {
    if (!profile) return;
    activeProfileId = profile.id;
    specStatOrders = profile.specStatOrders && typeof profile.specStatOrders === "object" && !Array.isArray(profile.specStatOrders)
      ? { ...profile.specStatOrders }
      : {};
    if (profile.classId && data.classes.some((cls) => String(cls.id) === String(profile.classId))) {
      classSelect.value = String(profile.classId);
    }
    fillSpecs(profile.specId);
    statOrder = parseStatList(profile.statOrder);
    rememberCurrentOrder();
    weaponStyle = profile.weaponStyle === "mhoh" ? "mhoh" : "2h";
    includeSlots = typeof profile.includeSlots === "object" && profile.includeSlots && !Array.isArray(profile.includeSlots)
      ? profile.includeSlots
      : parseSlotCounts(profile.includeSlots || "");
    bonusWins = Array.isArray(profile.bonusWins) ? profile.bonusWins.filter((win) => win && win.key) : [];
    contentMode = normalizeMode(profile.contentMode || contentMode);
    selectedRaidId = normalizeRaidId(profile.raidId || selectedRaidId);
    trinketRanks = normalizeTrinketRanks(profile.trinketRanks);
    fillProfileSelect();
    syncSetupControls();
    renderStatOrder();
    renderTable();
    renderBonusSummary();
    persist();
  }

  function createProfile(name) {
    const id = newProfileId();
    const profile = emptyProfileData(name, id);
    profiles[id] = profile;
    applyProfile(profile);
  }

  function renameActiveProfile(name) {
    if (!activeProfileId || !profiles[activeProfileId]) return;
    profiles[activeProfileId].name = name;
    fillProfileSelect();
    persist();
  }

  function ensureDefaultProfile() {
    if (profileList().length) {
      if (!activeProfileId || !profiles[activeProfileId]) {
        activeProfileId = profileList()[0].id;
      }
      return;
    }
    const id = newProfileId();
    const profile = classSelect.value
      ? currentProfileData("Default", id)
      : emptyProfileData("Default", id);
    profiles[id] = profile;
    activeProfileId = id;
    writeProfiles();
  }

  function deleteActiveProfile() {
    const current = profiles[activeProfileId];
    if (!current || profileList().length < 2) return;
    if (!window.confirm(`Delete profile "${current.name}"? This cannot be undone.`)) return;
    delete profiles[activeProfileId];
    const remaining = profileList();
    if (profileModal?.open) profileModal.close();
    if (!remaining.length) {
      const id = newProfileId();
      profiles[id] = emptyProfileData("Default", id);
      applyProfile(profiles[id]);
      return;
    }
    applyProfile(remaining[0]);
  }

  function openProfileModal(mode) {
    if (!profileModal || typeof profileModal.showModal !== "function") return;
    profileModalMode = mode;
    const current = profiles[activeProfileId];
    const managing = mode === "manage";
    if (profileTitle) profileTitle.textContent = managing ? "Manage Profile" : "Create Profile";
    if (profileSubmit) profileSubmit.textContent = managing ? "Save" : "Create";
    if (profileDelete) profileDelete.hidden = !managing || profileList().length < 2;
    if (profileNameInput) {
      profileNameInput.value = managing && current ? current.name : "";
    }
    profileModal.showModal();
    profileNameInput?.focus();
    profileNameInput?.select();
  }

  function openCreateProfile() {
    openProfileModal("create");
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
    return bonusWins.filter((win) => {
      if (Number(win.slotId) !== id) return false;
      const found = findEntry(win.dungeonId, win.slotId, win.key);
      return !isWrongWeaponStyle(found || win, slot);
    }).length;
  }

  function isOffhandUnused() {
    return weaponStyle === "2h";
  }

  function handLabel(entry) {
    if (entry.handLabel) return entry.handLabel;
    if (entry.hand === "1h") return "1H";
    if (entry.hand === "2h") return "2H";
    if (entry.hand === "oh") return "OH";
    if (entry.hand === "ranged") return "Ranged";
    return "";
  }

  function isWrongWeaponStyle(entry, slot) {
    const id = Number(slot.id ?? slot);
    if (id === SLOT_OFFHAND) return weaponStyle === "2h";
    if (id !== SLOT_WEAPON) return false;
    const hand = entry.hand;
    if (!hand) return false;
    if (weaponStyle === "2h") return hand === "1h" || hand === "oh";
    return hand === "2h";
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
    persist();
  }

  function dropKey(dungeon, slot, entry) {
    if (entry.id != null) return String(entry.id);
    return `${dungeon.id}:${slot.id}:${entry.name}`;
  }

  function isBonusWin(key) {
    return bonusWins.some((win) => win.key === key);
  }

  function findEntry(dungeonId, slotId, key) {
    const column = findColumn(dungeonId);
    const slot = data.slots.find((item) => String(item.id) === String(slotId));
    const specId = specSelect.value;
    const grids = [data.grid[specId] || {}, (data.raidGrid && data.raidGrid[specId]) || {}];
    for (let i = 0; i < grids.length; i += 1) {
      const entries = (grids[i][dungeonId] && grids[i][dungeonId][slotId]) || [];
      const found = entries.find((entry) => dropKey(column, slot, entry) === key);
      if (found) return found;
    }
    return null;
  }

  function markBonusWin(dungeon, slot, entry) {
    const key = dropKey(dungeon, slot, entry);
    if (isBonusWin(key)) return;
    bonusWins.unshift({
      key,
      id: entry.id ?? null,
      name: entry.name,
      icon: entry.icon || "",
      stats: entry.stats || [],
      hand: entry.hand || null,
      droppedBy: entry.droppedBy || "",
      dungeonId: dungeon.id,
      dungeonName: dungeon.name,
      dungeonShort: dungeon.shortName,
      sourceType: isRaidMode() ? "raid" : "mplus",
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

  function fillSpecs(preferredSpec) {
    const cls = selectedClass();
    specSelect.innerHTML = (cls?.specs || []).map((spec) => {
      return `<option value="${spec.id}">${spec.name}</option>`;
    }).join("");

    const requestedSpec = preferredSpec || "";
    if (requestedSpec && (cls?.specs || []).some((spec) => String(spec.id) === String(requestedSpec))) {
      specSelect.value = String(requestedSpec);
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

  function iconUrl(icon) {
    if (!icon) return "";
    return `https://wow.zamimg.com/images/wow/icons/medium/${icon}.jpg`;
  }

  function iconHtml(icon) {
    if (!icon) return "";
    return `<img class="item-icon" src="${escapeHtml(iconUrl(icon))}" alt="" width="20" height="20" draggable="false">`;
  }

  function refreshWowheadTooltips() {
    const power = window.$WowheadPower;
    if (power && typeof power.refreshLinks === "function") {
      power.refreshLinks();
    }
    const open = document.querySelector("dialog[open]");
    const tip = document.getElementById("wowhead-tooltip")
      || document.getElementById("powerTip")
      || document.querySelector(".wowhead-tooltip");
    if (open && tip && !open.contains(tip)) open.appendChild(tip);
  }

  function itemLinkHtml(entry) {
    const icon = iconHtml(entry && entry.icon);
    if (!icon) return "";
    const id = Number(entry.id);
    if (!id) return icon;
    return `<a class="item-link" href="https://www.wowhead.com/item=${id}" target="_blank" rel="noopener noreferrer" data-wowhead="item=${id}">${icon}</a>`;
  }

  function specTrinketRanks() {
    const specId = String(specSelect.value || "");
    if (!specId) return {};
    if (!trinketRanks[specId] || typeof trinketRanks[specId] !== "object") trinketRanks[specId] = {};
    return trinketRanks[specId];
  }

  function trinketRank(entry) {
    const id = entry && entry.id != null ? String(entry.id) : "";
    const rank = specTrinketRanks()[id];
    return rank === "bis" || rank === "upgrade" ? rank : "unranked";
  }

  function syncTrinketButton() {
    if (!trinketOpen) return;
    const items = uniqueTrinkets();
    const ranked = items.filter((item) => trinketRank(item) !== "unranked").length;
    const label = ranked ? `Trinkets ${ranked} selected` : "Trinkets";
    trinketOpen.setAttribute("aria-label", label);
    trinketOpen.title = label;
    if (trinketCount) trinketCount.textContent = String(ranked);
  }

  function setTrinketRank(itemId, rank) {
    const ranks = specTrinketRanks();
    const id = String(itemId);
    if (rank === "bis" || rank === "upgrade") ranks[id] = rank;
    else delete ranks[id];
    persist();
    renderTrinketBoard();
    renderTable();
  }

  function uniqueTrinkets() {
    const byId = new Map();
    const specId = specSelect.value;
    const addFrom = (grid, columns, sourceType) => {
      const specGrid = grid && specId ? grid[specId] || {} : {};
      (columns || []).forEach((column) => {
        const entries = (specGrid[column.id] && specGrid[column.id][SLOT_TRINKET]) || [];
        entries.forEach((entry) => {
          if (entry.id == null) return;
          const id = String(entry.id);
          if (!byId.has(id)) {
            byId.set(id, {
              id: entry.id,
              name: entry.name,
              icon: entry.icon || "",
              sources: []
            });
          }
          const label = column.shortName || column.name;
          const item = byId.get(id);
          const key = `${sourceType}:${column.id}`;
          if (!item.sources.some((source) => source.key === key)) {
            item.sources.push({
              key,
              type: sourceType,
              name: column.name,
              shortName: label
            });
          }
        });
      });
    };
    addFrom(data.grid, data.dungeons, "mplus");
    addFrom(data.raidGrid, bossList(), "raid");
    return [...byId.values()].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" }));
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

  function isTrinketSlot(slot) {
    return Number(slot.id ?? slot) === SLOT_TRINKET;
  }

  function poolKind(entry, slot) {
    if (isSlotFilled(slot) || isWrongWeaponStyle(entry, slot)) return "waste";
    if (isTrinketSlot(slot)) {
      const rank = trinketRank(entry);
      if (rank === "bis" || rank === "upgrade") return rank;
      return "waste";
    }
    const present = itemStats(entry);
    const hasFirst = present.includes(statOrder[0]);
    const hasSecond = present.includes(statOrder[1]);
    if (hasFirst && hasSecond) return "bis";
    if (hasFirst || hasSecond) return "upgrade";
    return "waste";
  }

  function remainingPool(specGrid, column) {
    const items = [];
    data.slots.forEach((slot) => {
      const entries = (specGrid[column.id] && specGrid[column.id][slot.id]) || [];
      entries.forEach((entry) => {
        if (!isBonusWin(dropKey(column, slot, entry))) items.push({ entry, slot });
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

  function dungeonPlanRows() {
    const specGrid = activeGrid();
    return activeColumns().map((dungeon) => {
      const stats = poolStats(specGrid, dungeon);
      const targets = [];
      remainingPool(specGrid, dungeon).forEach(({ entry, slot }) => {
        const kind = poolKind(entry, slot);
        if (kind !== "bis" && kind !== "upgrade") return;
        targets.push({ kind, entry, slot });
      });
      targets.sort((a, b) => Number(a.kind !== "bis") - Number(b.kind !== "bis"));
      return { dungeon, ...stats, targets };
    });
  }

  function comparePlanUpgrade(a, b) {
    return (b.netPct || 0) - (a.netPct || 0)
      || (b.upgradePct || 0) - (a.upgradePct || 0)
      || b.upgrade - a.upgrade
      || b.remaining - a.remaining;
  }

  function comparePlanBis(a, b) {
    return (b.bisPct || 0) - (a.bisPct || 0)
      || b.bis - a.bis
      || (b.netPct || 0) - (a.netPct || 0)
      || b.remaining - a.remaining;
  }

  function renderPlanTargets(targets, prefer) {
    if (!targets.length) {
      return `<p class="plan-odds">No remaining BIS or upgrade items.</p>`;
    }
    const ordered = targets.slice().sort((a, b) => {
      if (prefer === "upgrade") return Number(a.kind !== "upgrade") - Number(b.kind !== "upgrade");
      return Number(a.kind !== "bis") - Number(b.kind !== "bis");
    });
    return `<ul class="plan-targets">${ordered.map(({ kind, entry, slot }) => {
      const stats = isTrinketSlot(slot) ? "" : (entry.stats || []).join(" / ");
      const detail = [slot.name, stats].filter(Boolean).join(" · ");
      return `<li><span class="plan-tag ${kind}">${kind === "bis" ? "BIS" : "UP"}</span>${itemLinkHtml(entry)}${escapeHtml(entry.name || "Unknown")}${detail ? ` · ${escapeHtml(detail)}` : ""}</li>`;
    }).join("")}</ul>`;
  }

  function renderPlanRanks(rows, prefer) {
    return `<ol class="plan-ranks">${rows.map((row) => {
      const odds = prefer === "bis"
        ? `${formatPct(row.bisPct)} BIS · ${row.bis} BIS / ${row.upgrade} upgrade`
        : `${formatPct(row.netPct)} net upgrade · ${row.upgrade} upgrade / ${row.bis} BIS`;
      return `<li>
        <div class="plan-rank-head">
          <strong>${escapeHtml(row.dungeon.name)}</strong>
          <span class="plan-short">${escapeHtml(row.dungeon.shortName)}</span>
        </div>
        <p class="plan-odds">${odds}</p>
        ${renderPlanTargets(row.targets, prefer)}
      </li>`;
    }).join("")}</ol>`;
  }

  function renderPlanColumn(title, blurb, pick, rows, prefer) {
    const pickMeta = prefer === "bis"
      ? `${formatPct(pick.bisPct)} chance of BIS · ${formatPct(pick.netPct)} net upgrade`
      : `${formatPct(pick.netPct)} chance of a BIS or upgrade · ${formatPct(pick.bisPct)} BIS`;
    return `<section class="plan-scenario">
      <h3>${title}</h3>
      <p>${blurb}</p>
      <div class="plan-pick">
        <p class="label">Recommended spend</p>
        <strong>${escapeHtml(pick.dungeon.name)}</strong>
        <p class="meta">${pickMeta}</p>
      </div>
      ${renderPlanRanks(rows, prefer)}
    </section>`;
  }

  function renderWeeklyPlan() {
    const rows = dungeonPlanRows();
    const live = rows.filter((row) => row.remaining > 0);
    if (!live.length) {
      planBody.innerHTML = `<p class="plan-lead">Nothing left in the remaining pools. Uncheck fewer slots or remove a bonus-roll win to plan again.</p>`;
      return;
    }

    const byUpgrade = live.slice().sort(comparePlanUpgrade);
    const byBis = live.slice().sort(comparePlanBis);
    const specName = specSelect.options[specSelect.selectedIndex]?.text || "this spec";

    planBody.innerHTML = `
      <p class="plan-lead">Two weekly-roll rankings from the remaining ${escapeHtml(specName)} pool after your current stat order, weapon style, included slots, trinket ranks, and bonus-roll wins. A bonus roll is a uniform draw from that ${columnNoun(false)}’s leftover items.</p>
      <div class="plan-columns">
        ${renderPlanColumn(
          "Prioritize upgrades",
          "Highest odds that the roll is a BIS or upgrade instead of waste.",
          byUpgrade[0],
          byUpgrade,
          "upgrade"
        )}
        ${renderPlanColumn(
          "Prioritize BIS",
          `Highest odds of both top stats, even if the ${columnNoun(false)} is riskier overall.`,
          byBis[0],
          byBis,
          "bis"
        )}
      </div>
    `;
    refreshWowheadTooltips();
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
      if (isWrongWeaponStyle(entry, slot)) return;
      if (isTrinketSlot(slot)) {
        const rank = trinketRank(entry);
        const tier = rank === "bis" ? "perfect" : rank === "upgrade" ? "high" : null;
        if (!tier) return;
        if (!best || TIER_RANK[tier] > TIER_RANK[best]) best = tier;
        return;
      }
      const tier = matchInfo(entry.stats).tier;
      if (!tier) return;
      if (!best || TIER_RANK[tier] > TIER_RANK[best]) best = tier;
    });
    return best;
  }

  function renderDrop(entry, dungeon, slot) {
    const stats = isTrinketSlot(slot) ? [] : (entry.stats || []);
    const key = dropKey(dungeon, slot, entry);
    const won = isBonusWin(key);
    const filled = isSlotFilled(slot);
    const wrongStyle = isWrongWeaponStyle(entry, slot);
    const wasted = filled || wrongStyle;
    const ranked = isTrinketSlot(slot) ? trinketRank(entry) : null;
    const tier = won || wasted
      ? null
      : ranked === "bis"
        ? "perfect"
        : ranked === "upgrade"
          ? "high"
          : isTrinketSlot(slot)
            ? null
            : matchInfo(stats).tier;
    const tag = handLabel(entry);
    const type = entry.weaponClass ? `${tag ? `${tag} ` : ""}${entry.weaponClass}` : tag;
    const titleParts = [entry.name, type, entry.droppedBy].filter(Boolean);
    const title = won
      ? escapeHtml(`${titleParts.join(" — ")} — won by bonus roll, removed from pool`)
      : filled
        ? escapeHtml(`${titleParts.join(" — ")} — slot filled, treated as waste`)
        : wrongStyle
          ? escapeHtml(`${titleParts.join(" — ")} — wrong weapon style, treated as waste`)
          : ranked === "unranked"
            ? escapeHtml(`${titleParts.join(" — ")} — unranked trinket, treated as waste`)
            : escapeHtml(titleParts.join(" — "));
    const tagHtml = tag ? `<span class="hand-tag">${escapeHtml(tag)}</span>` : "";
    const bisHtml = tier === "perfect" ? `<span class="bis-tag">BIS</span>` : "";
    const upHtml = ranked === "upgrade" && !won && !wasted ? `<span class="up-tag">UP</span>` : "";
    const rolledHtml = won ? `<span class="rolled-tag">Rolled</span>` : "";
    const statsHtml = stats.length
      ? `<span class="stat-line">${stats.map((stat) => `<span class="stat ${statClassName(stat)}">${escapeHtml(stat)}</span>`).join(" / ")}</span>${bisHtml}${rolledHtml}`
      : `<span class="item-name">${tagHtml}${escapeHtml(entry.name || "No stats")}${bisHtml}${upHtml}${rolledHtml}</span>`;
    const nameHtml = stats.length && entry.name
      ? `<div class="item-name">${tagHtml}<span>${escapeHtml(entry.name)}</span></div>`
      : "";
    const rollHtml = won
      ? ""
      : `<button type="button" class="bonus-roll" data-key="${escapeHtml(key)}" data-dungeon="${escapeHtml(dungeon.id)}" data-slot="${escapeHtml(slot.id)}" aria-label="Mark as won by bonus roll" title="Mark as won by bonus roll">
        <img src="icons/dice.png?v=alpha" alt="" width="22" height="22">
      </button>`;

    return `<div class="drop${tier ? ` match-${tier}` : ""}${won ? " bonus-won" : ""}${wasted && !won ? " slot-filled" : ""}">
      ${rollHtml}
      ${itemLinkHtml(entry)}
      <div class="drop-copy" title="${title}">
        <div class="stats">${statsHtml}</div>
        ${nameHtml}
      </div>
    </div>`;
  }

  function syncHistoryButton() {
    if (!historyOpen) return;
    const count = bonusWins.length;
    const label = count ? `Roll History (${count})` : "Roll History";
    historyOpen.setAttribute("aria-label", label);
    historyOpen.title = label;
    if (historyCount) {
      historyCount.hidden = count === 0;
      historyCount.textContent = String(count);
    }
  }

  function formatWonAt(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function winSourceType(win) {
    if (win.sourceType === "raid" || win.sourceType === "mplus") return win.sourceType;
    if (bossList().some((boss) => String(boss.id) === String(win.dungeonId))) return "raid";
    return "mplus";
  }

  function renderBonusSummary() {
    syncHistoryButton();
    if (!bonusWinsEl) return;
    if (!bonusWins.length) {
      bonusWinsEl.innerHTML = `<p class="bonus-empty">No bonus-roll wins yet. Click the dice on a drop to record one.</p>`;
      return;
    }

    bonusWinsEl.innerHTML = `<ul class="bonus-wins">${bonusWins.map((win) => {
      const stats = isTrinketSlot(win.slotId) ? [] : (win.stats || []);
      const statsHtml = stats.length
        ? stats.map((stat) => `<span class="stat ${statClassName(stat)}">${escapeHtml(stat)}</span>`).join(" / ")
        : "";
      const place = [handLabel(win), win.slotName, win.dungeonShort || win.dungeonName].filter(Boolean).join(" · ");
      const when = formatWonAt(win.wonAt);
      const source = winSourceType(win);
      const badge = source === "raid"
        ? `<span class="source-badge raid">Raid</span>`
        : `<span class="source-badge mplus">M+</span>`;
      return `<li class="bonus-win">
        <div class="copy">
          <div class="name">${itemLinkHtml(win)}${escapeHtml(win.name)}${badge}</div>
          <div class="meta">${statsHtml ? `${statsHtml} · ` : ""}${escapeHtml(place)}</div>
          <div class="when">${when ? escapeHtml(when) : "Date unknown"}</div>
        </div>
        <button type="button" data-remove-win="${escapeHtml(win.key)}">Remove</button>
      </li>`;
    }).join("")}</ul>`;
    refreshWowheadTooltips();
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
    const specGrid = activeGrid();
    const columns = activeColumns();

    thead.innerHTML = `<tr>
      <th class="slot-col">Slot<span class="dungeon-name">Include</span></th>
      ${columns.map((dungeon) => {
        return `<th>${dungeon.shortName}<span class="dungeon-name">${dungeon.name}</span></th>`;
      }).join("")}
    </tr>`;

    tbody.innerHTML = data.slots.map((slot) => {
      const cells = columns.map((dungeon) => {
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
    syncTrinketButton();
    refreshWowheadTooltips();
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
    const config = Number(slot.id) === SLOT_TRINKET
      ? `<button type="button" class="slot-config" data-open-trinkets="1">Rank</button>`
      : "";
    return `<th>
      <div class="slot-head">
        <span>${escapeHtml(slot.name)}${config}</span>
        <span class="alt-boxes${unused ? " inactive" : ""}">${boxes}</span>
      </div>
    </th>`;
  }

  function renderFooter(specGrid) {
    const columns = activeColumns().map((dungeon) => poolStats(specGrid, dungeon));
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
        <th title="Remaining items in this ${columnNoun(false)} pool">Total Items</th>
        ${countCells("remaining")}
      </tr>
      <tr class="pool-counts">
        <th title="Remaining items with both of your top two stats, plus trinkets marked BIS">BIS</th>
        ${countCells("bis")}
      </tr>
      <tr class="pool-counts">
        <th title="Remaining items with exactly one of your top two stats, plus trinkets marked Upgrade">Upgrade</th>
        ${countCells("upgrade")}
      </tr>
      <tr class="pool-counts">
        <th title="Remaining items with neither of your top two stats, an unranked trinket, a filled slot, or the wrong weapon style">Waste</th>
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
    if (activeProfileId && profiles[activeProfileId]) {
      profiles[activeProfileId] = currentProfileData(profiles[activeProfileId].name, activeProfileId);
    }

    try {
      localStorage.setItem(STORAGE_CLASS, classSelect.value);
      localStorage.setItem(STORAGE_SPEC, specSelect.value);
      localStorage.setItem(STORAGE_STATS, statOrder.join(","));
      localStorage.setItem(STORAGE_SPEC_STATS, JSON.stringify(specStatOrders));
      localStorage.setItem(STORAGE_INCLUDE, includeParam());
      localStorage.setItem(STORAGE_WEAPON, weaponStyle);
      localStorage.setItem(STORAGE_BONUS, JSON.stringify(bonusWins));
      localStorage.setItem(STORAGE_TRINKETS, JSON.stringify(trinketRanks));
      localStorage.setItem(STORAGE_MODE, contentMode);
      if (selectedRaidId != null) localStorage.setItem(STORAGE_RAID, String(selectedRaidId));
      writeProfiles();
    } catch (error) {
      // file:// and some editor previews block storage
    }

    if (window.location.protocol !== "http:" && window.location.protocol !== "https:") {
      return;
    }

    try {
      const next = new URL(window.location.href);
      if (activeProfileId) next.searchParams.set("profile", activeProfileId);
      else next.searchParams.delete("profile");
      next.searchParams.set("class", classSelect.value);
      next.searchParams.set("spec", specSelect.value);
      next.searchParams.set("stats", statOrder.join(","));
      next.searchParams.set("weapons", weaponStyle);
      next.searchParams.set("mode", contentMode);
      if (selectedRaidId != null) next.searchParams.set("raid", String(selectedRaidId));
      else next.searchParams.delete("raid");
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

  if (profileSelect) {
    profileSelect.addEventListener("change", () => {
      if (profileSelect.value === CREATE_PROFILE) {
        profileSelect.value = activeProfileId && profiles[activeProfileId] ? activeProfileId : CREATE_PROFILE;
        openCreateProfile();
        return;
      }
      const next = profiles[profileSelect.value];
      if (!next || next.id === activeProfileId) return;
      persist();
      applyProfile(next);
    });
  }

  if (profileCancel) {
    profileCancel.addEventListener("click", () => {
      if (profileModal.open) profileModal.close();
    });
  }

  if (profileModal) {
    profileModal.addEventListener("click", (event) => {
      if (event.target === profileModal) profileModal.close();
    });
  }

  if (profileForm) {
    profileForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = String(profileNameInput?.value || "").trim();
      if (!name) {
        profileNameInput?.focus();
        return;
      }
      if (profileModalMode === "manage") renameActiveProfile(name);
      else createProfile(name);
      if (profileModal.open) profileModal.close();
    });
  }

  if (profileManage) {
    profileManage.addEventListener("click", () => openProfileModal("manage"));
  }

  if (profileDelete) {
    profileDelete.addEventListener("click", deleteActiveProfile);
  }

  classSelect.addEventListener("change", () => {
    fillSpecs();
    loadOrderForCurrentSpec(false);
    persist();
    renderStatOrder();
    renderTable();
    if (trinketModal?.open) renderTrinketBoard();
  });

  specSelect.addEventListener("change", () => {
    loadOrderForCurrentSpec(false);
    persist();
    renderStatOrder();
    renderTable();
    if (trinketModal?.open) renderTrinketBoard();
  });

  document.querySelectorAll("input[name='content-mode']").forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      contentMode = normalizeMode(input.value);
      persist();
      syncModeControls();
      renderTable();
    });
  });

  if (raidSelect) {
    raidSelect.addEventListener("change", () => {
      selectedRaidId = normalizeRaidId(raidSelect.value);
      persist();
      renderTable();
    });
  }

  document.querySelectorAll("input[name='weapon-style']").forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      weaponStyle = input.value === "mhoh" || input.value === "dw" ? "mhoh" : "2h";
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
    if (event.target.closest("[data-open-trinkets]")) {
      openTrinketRanks();
      return;
    }
    const button = event.target.closest(".bonus-roll");
    if (!button) return;
    const dungeon = findColumn(button.dataset.dungeon);
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

  function fillRaidSelect() {
    if (!raidSelect) return;
    const raids = raidList();
    raidSelect.innerHTML = raids.map((raid) => {
      return `<option value="${raid.id}">${escapeHtml(raid.name)}</option>`;
    }).join("");
    if (selectedRaidId != null) raidSelect.value = String(selectedRaidId);
  }

  function syncModeControls() {
    document.querySelectorAll("input[name='content-mode']").forEach((input) => {
      input.checked = input.value === contentMode;
    });
    fillRaidSelect();
    if (raidField) raidField.hidden = !isRaidMode() || !raidList().length;
    const modeField = document.querySelector(".content-mode");
    if (modeField) modeField.hidden = !raidList().length;
  }

  function syncSetupControls() {
    document.querySelectorAll("input[name='weapon-style']").forEach((input) => {
      input.checked = input.value === weaponStyle;
    });
    syncModeControls();
  }

  try {
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith("roll-planner.")) localStorage.removeItem(key);
    });
  } catch (error) {
    // file:// and some editor previews block storage
  }

  function hasSeenInstructions() {
    try {
      return localStorage.getItem(STORAGE_HELP) === "1";
    } catch (error) {
      return false;
    }
  }

  function markInstructionsSeen() {
    try {
      localStorage.setItem(STORAGE_HELP, "1");
    } catch (error) {
      // file:// and some editor previews block storage
    }
  }

  function openInstructions() {
    if (helpModal && typeof helpModal.showModal === "function") helpModal.showModal();
  }

  if (helpOpen) helpOpen.addEventListener("click", openInstructions);
  if (helpClose) {
    helpClose.addEventListener("click", () => {
      if (helpModal.open) helpModal.close();
    });
  }
  if (helpModal) {
    helpModal.addEventListener("click", (event) => {
      if (event.target === helpModal) helpModal.close();
    });
    helpModal.addEventListener("close", markInstructionsSeen);
  }

  function openWeeklyPlan() {
    renderWeeklyPlan();
    if (planModal && typeof planModal.showModal === "function") planModal.showModal();
  }

  if (planOpen) planOpen.addEventListener("click", openWeeklyPlan);
  if (planClose) {
    planClose.addEventListener("click", () => {
      if (planModal.open) planModal.close();
    });
  }
  if (planModal) {
    planModal.addEventListener("click", (event) => {
      if (event.target === planModal) planModal.close();
    });
  }

  function trinketSourceLabel(item) {
    return (item.sources || []).map((source) => {
      const tag = source.type === "raid" ? "Raid" : "M+";
      return `${tag} ${source.name}`;
    }).join(" · ");
  }

  function renderTrinketBoard() {
    if (!trinketBoard) return;
    const items = uniqueTrinkets();
    const buckets = { unranked: [], upgrade: [], bis: [] };
    items.forEach((item) => {
      buckets[trinketRank(item)].push(item);
    });

    const column = (rank, title, blurb) => {
      const rows = buckets[rank];
      const list = rows.length
        ? `<ul class="trinket-list">${rows.map((item) => {
          return `<li class="trinket-card" draggable="true" data-item-id="${escapeHtml(item.id)}">
            ${itemLinkHtml(item)}
            <div class="copy">
              <strong>${escapeHtml(item.name || "Unknown")}</strong>
              <div class="meta">${escapeHtml(trinketSourceLabel(item) || "Unknown source")}</div>
            </div>
            <div class="moves">
              <button type="button" data-item-id="${escapeHtml(item.id)}" data-rank="unranked"${rank === "unranked" ? " class=\"active\"" : ""}>None</button>
              <button type="button" data-item-id="${escapeHtml(item.id)}" data-rank="upgrade"${rank === "upgrade" ? " class=\"active\"" : ""}>Upgrade</button>
              <button type="button" data-item-id="${escapeHtml(item.id)}" data-rank="bis"${rank === "bis" ? " class=\"active\"" : ""}>BIS</button>
            </div>
          </li>`;
        }).join("")}</ul>`
        : `<p class="trinket-empty">None here yet.</p>`;
      return `<section class="trinket-col" data-rank="${rank}">
        <h3>${title}<span>${rows.length} · ${blurb}</span></h3>
        ${list}
      </section>`;
    };

    trinketBoard.innerHTML = [
      column("unranked", "Unranked", "counts as waste"),
      column("upgrade", "Upgrade", "minor upgrade"),
      column("bis", "BIS", "best in slot")
    ].join("");
    refreshWowheadTooltips();
  }

  function openTrinketRanks() {
    renderTrinketBoard();
    if (trinketModal && typeof trinketModal.showModal === "function") trinketModal.showModal();
  }

  if (trinketOpen) trinketOpen.addEventListener("click", openTrinketRanks);
  if (trinketClose) {
    trinketClose.addEventListener("click", () => {
      if (trinketModal.open) trinketModal.close();
    });
  }
  if (trinketModal) {
    trinketModal.addEventListener("click", (event) => {
      if (event.target === trinketModal) trinketModal.close();
    });
  }
  if (trinketBoard) {
    trinketBoard.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-rank]");
      if (!button) return;
      setTrinketRank(button.dataset.itemId, button.dataset.rank);
    });
    trinketBoard.addEventListener("dragstart", (event) => {
      const card = event.target.closest(".trinket-card");
      if (!card) return;
      trinketDragId = card.dataset.itemId;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", trinketDragId);
      card.classList.add("dragging");
    });
    trinketBoard.addEventListener("dragend", (event) => {
      const card = event.target.closest(".trinket-card");
      if (card) card.classList.remove("dragging");
      trinketBoard.querySelectorAll(".trinket-col").forEach((col) => col.classList.remove("drag-over"));
      trinketDragId = null;
    });
    trinketBoard.addEventListener("dragover", (event) => {
      const col = event.target.closest(".trinket-col");
      if (!col) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      trinketBoard.querySelectorAll(".trinket-col").forEach((item) => {
        item.classList.toggle("drag-over", item === col);
      });
    });
    trinketBoard.addEventListener("dragleave", (event) => {
      const col = event.target.closest(".trinket-col");
      if (col && !col.contains(event.relatedTarget)) col.classList.remove("drag-over");
    });
    trinketBoard.addEventListener("drop", (event) => {
      const col = event.target.closest(".trinket-col");
      if (!col) return;
      event.preventDefault();
      const itemId = trinketDragId || event.dataTransfer.getData("text/plain");
      if (itemId) setTrinketRank(itemId, col.dataset.rank);
    });
  }

  document.addEventListener("mouseover", (event) => {
    if (!event.target.closest(".item-link")) return;
    refreshWowheadTooltips();
  });

  function openRollHistory() {
    renderBonusSummary();
    if (historyModal && typeof historyModal.showModal === "function") historyModal.showModal();
  }

  if (historyOpen) historyOpen.addEventListener("click", openRollHistory);
  if (historyClose) {
    historyClose.addEventListener("click", () => {
      if (historyModal.open) historyModal.close();
    });
  }
  if (historyModal) {
    historyModal.addEventListener("click", (event) => {
      if (event.target === historyModal) historyModal.close();
    });
  }

  fillClasses();
  fillSpecs(params.get("spec") || localStorage.getItem(STORAGE_SPEC));
  loadOrderForCurrentSpec(true);
  syncSetupControls();
  ensureDefaultProfile();
  applyProfile(profiles[activeProfileId]);
  if (!hasSeenInstructions()) openInstructions();

  window.addEventListener("pagehide", persist);
  window.addEventListener("load", refreshWowheadTooltips);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") persist();
  });
})();
