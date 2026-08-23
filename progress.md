# Weekly Roll — progress

Project folder is still `C:\code\weighted-dice`. GitHub remote is still `evancummings/weighted-dice`. The visible site name is **Weekly Roll**.

This file is a record of the conversation that built the planner, from the first loot extract through the rename discussion.

## What this app is

A static Midnight Season 2 loot planner. Rows are gear slots. Columns are Mythic+ dungeons or raid bosses. Footer math treats each column as a uniform bonus-roll pool (BIS / upgrade / waste). Data comes from the KeystoneLoot addon, enriched with Wowhead names, icons, and weapon inventory.

Live site (until the repo is renamed): https://evancummings.github.io/weighted-dice/

## Earlier work (before this chat)

- Extracted S2 dungeon drop tables from KeystoneLoot (`scripts/extract_keystoneloot.ps1` / `.py` → `data/dungeon-drop-tables.json` → `site/loot-data.js`).
- Built the slot × dungeon table with class/spec filters and Wowhead default stat priority.
- Added include-slot checkboxes, 2H vs MH/OH, bonus-roll dice, remaining-pool odds, and the Weekly roll ranking modal.
- Deployed `site/` to GitHub Pages from `master`.
- Renamed the product from roll-planner to Weighted Dice (`b7b4506`).
- Added Roll History (with dates) and per-character profiles.

## This conversation

### Profiles: always one, rename, delete

- There is always an active profile. If none exist, a **Default** is created.
- Rename and Delete started as header buttons, then moved into a **gear** that opens **Manage Profile** (name field, Save, Delete).
- Delete is hidden when only one profile remains.
- Dropdown option reads **Create Profile...**.

### Favicon

- Tab icon is the same dice as the bonus-roll button (`site/icons/inv_misc_dice_02.jpg`).

### Raid mode

Explored KeystoneLoot: `items.lua` is split at `-- Raids`, and `data/raids.lua` already has S2 raids. Chose a **Mythic+ | Raid** mode switch (not extra columns on the M+ table). Difficulty is one generalized table (no item level).

Implemented:

- Extract `data/raid-drop-tables.json` (union loot per boss).
- `loot-data.js` gains `raids`, `bosses`, `raidGrid` keyed by **bossId**.
- Mode toggle + raid dropdown (default **The Venomous Abyss**, plus **Tidebound Grotto**).
- Weekly roll ranks bosses in raid mode.
- Class, spec, stats, weapons, include-slots, and bonus-win history stay on the same profile.

Out of scope still: catalyst/tier tokens, Great Vault, mixing M+ and raid in one table.

### Roll History

- **M+** / **Raid** badge on each win.
- Button moved left of the profile gear as a clock icon with a count (padding fixed so the number is not clipped).

### Loot cards

- **BEST** → **BIS**, on the stat line.
- Item icon on the left, spanning both rows.
- Trinkets skip stat grading and do not show secondary stats. Open trinket slots count as upgrades so they are not treated as waste.
- Bonus-rolled cards get a stronger blue fade plus a **Rolled** tag.

### Help modal

- Larger type, scoped to How This Works only.
- Two columns on wide screens; one column below 720px.

### Color theme

- One hardcoded dark palette. `color-scheme: dark` only affects browser chrome. No `prefers-color-scheme` light theme.

### Rename to Weekly Roll

- Site title, heading, and help title now say Weekly Roll (`7ad6415`).
- Browser `localStorage` keys stay `weighted-dice.*` so existing profiles are not wiped.
- GitHub repo rename was **not** done: `gh` in this environment is logged in as work (`switchboxevan`), not `evancummings`.
- Local folder was **not** renamed: Cursor is already open on `C:\code\weighted-dice`.

To finish the rename later:

1. On GitHub: Settings → General → Repository name → `weekly-roll`.
2. Pages URL becomes `https://evancummings.github.io/weekly-roll/`.
3. `git remote set-url origin git@github.com:evancummings/weekly-roll.git`
4. Close this workspace, rename the folder to `weekly-roll`, reopen it.

## Current header

Profile dropdown → history icon (count) → manage gear → Class → Spec → Mode (Mythic+ / Raid) → Raid dropdown when needed → Stat priority → Weapons (2H / MH/OH) → How This Works / Weekly roll.

## Key files

| Path | Role |
| --- | --- |
| `site/index.html` | Shell, help, modals |
| `site/app.js` | Planner, profiles, raid mode |
| `site/styles.css` | Dark UI |
| `site/loot-data.js` | Generated dungeon + raid grids |
| `data/dungeon-drop-tables.json` | M+ extract |
| `data/raid-drop-tables.json` | Raid extract |
| `scripts/extract_keystoneloot.ps1` | Primary extractor (`-RaidsOnly` supported) |
| `scripts/generate-site.ps1` | Builds `loot-data.js` |
| `.github/workflows/pages.yml` | Deploys `site/` from `master` |

## Auth note

Pushes use the personal SSH key `~/.ssh/id_ed25519` (`evancummings`). Commits use `Evan Cummings <emcummings@gmail.com>`. Do not use the work `gh` account to admin this repo.
