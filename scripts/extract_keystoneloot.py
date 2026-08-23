"""Extract KeystoneLoot dungeon drop tables into structured JSON.

Reads the addon's auto-generated Lua databases and enriches items with
Wowhead names so a later app can compute per-spec loot probabilities.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path


DEFAULT_ADDON_DIR = Path(
    r"C:\Program Files (x86)\World of Warcraft\_retail_\Interface\AddOns\KeystoneLoot"
)

STAT_BY_ID = {
    0: "crit",
    1: "haste",
    2: "mastery",
    3: "versatility",
}

SLOT_BY_ID = {
    0: "head",
    1: "neck",
    2: "shoulder",
    3: "back",
    4: "chest",
    5: "wrist",
    6: "hands",
    7: "waist",
    8: "legs",
    9: "feet",
    10: "weapon",
    11: "offhand",
    12: "finger",
    13: "trinket",
    14: "other",
}

CLASSES = {
    1: {
        "name": "Warrior",
        "specs": {71: "Arms", 72: "Fury", 73: "Protection"},
    },
    2: {
        "name": "Paladin",
        "specs": {65: "Holy", 66: "Protection", 70: "Retribution"},
    },
    3: {
        "name": "Hunter",
        "specs": {253: "Beast Mastery", 254: "Marksmanship", 255: "Survival"},
    },
    4: {
        "name": "Rogue",
        "specs": {259: "Assassination", 260: "Outlaw", 261: "Subtlety"},
    },
    5: {
        "name": "Priest",
        "specs": {256: "Discipline", 257: "Holy", 258: "Shadow"},
    },
    6: {
        "name": "Death Knight",
        "specs": {250: "Blood", 251: "Frost", 252: "Unholy"},
    },
    7: {
        "name": "Shaman",
        "specs": {262: "Elemental", 263: "Enhancement", 264: "Restoration"},
    },
    8: {
        "name": "Mage",
        "specs": {62: "Arcane", 63: "Fire", 64: "Frost"},
    },
    9: {
        "name": "Warlock",
        "specs": {265: "Affliction", 266: "Demonology", 267: "Destruction"},
    },
    10: {
        "name": "Monk",
        "specs": {268: "Brewmaster", 269: "Windwalker", 270: "Mistweaver"},
    },
    11: {
        "name": "Druid",
        "specs": {102: "Balance", 103: "Feral", 104: "Guardian", 105: "Restoration"},
    },
    12: {
        "name": "Demon Hunter",
        "specs": {577: "Havoc", 581: "Vengeance", 1480: "Devourer"},
    },
    13: {
        "name": "Evoker",
        "specs": {1467: "Devastation", 1468: "Preservation", 1473: "Augmentation"},
    },
}

DUNGEONS = {
    249: {
        "name": "Kings' Rest",
        "shortName": "KR",
        "slug": "kings-rest",
        "expansion": "Battle for Azeroth",
    },
    250: {
        "name": "Temple of Sethraliss",
        "shortName": "TOS",
        "slug": "temple-of-sethraliss",
        "expansion": "Battle for Azeroth",
    },
    399: {
        "name": "Ruby Life Pools",
        "shortName": "RLP",
        "slug": "ruby-life-pools",
        "expansion": "Dragonflight",
    },
    584: {
        "name": "The Blinding Vale",
        "shortName": "TBV",
        "slug": "the-blinding-vale",
        "expansion": "Midnight",
    },
    585: {
        "name": "Voidscar Arena",
        "shortName": "VSA",
        "slug": "voidscar-arena",
        "expansion": "Midnight",
    },
    586: {
        "name": "Den of Nalorakk",
        "shortName": "DON",
        "slug": "den-of-nalorakk",
        "expansion": "Midnight",
    },
    587: {
        "name": "Murder Row",
        "shortName": "MR",
        "slug": "murder-row",
        "expansion": "Midnight",
    },
    588: {
        "name": "Altar of Fangs",
        "shortName": "AOF",
        "slug": "altar-of-fangs",
        "expansion": "Midnight",
    },
}

HEADER_RE = re.compile(
    r"-- Timestamp: (?P<timestamp>.+)\n"
    r"-- WoW Build: (?P<wowBuild>.+)\n"
    r"-- Season: (?P<season>\d+)",
)
DUNGEON_RE = re.compile(
    r"\{ --\[\[name = \"(?P<addonName>[^\"]+)\",\]\], "
    r"challengeModeId = (?P<challengeModeId>\d+), "
    r"teleportSpellId = (?P<teleportSpellId>\d+), "
    r"bgTexture = (?P<bgTexture>\d+), "
    r"instanceId = (?P<instanceId>\d+), "
    r"lootTable = \{ (?P<lootTable>[^}]+) \} \}",
)
ITEM_RE = re.compile(
    r"\[(?P<itemId>\d+)\] = \{ "
    r"classes = \{ (?P<classes>.+?) \}, "
    r"(?:stats = \{ (?P<stats>[\d, ]+) \}, )?"
    r"slotId = (?P<slotId>\d+) \}",
)
CLASS_RE = re.compile(r"\[(\d+)\] = \{ ([\d, ]+) \}")
INT_LIST_RE = re.compile(r"\d+")
DROPPED_BY_RE = re.compile(r"Dropped by:\s*([^<]+)")


def parse_int_list(text: str) -> list[int]:
    return [int(value) for value in INT_LIST_RE.findall(text)]


def parse_header(text: str) -> dict:
    match = HEADER_RE.search(text)
    if not match:
        return {}
    data = match.groupdict()
    data["season"] = int(data["season"])
    return data


def parse_dungeons(text: str) -> list[dict]:
    dungeons = []
    for match in DUNGEON_RE.finditer(text):
        challenge_mode_id = int(match.group("challengeModeId"))
        known = DUNGEONS.get(challenge_mode_id, {})
        dungeons.append(
            {
                "challengeModeId": challenge_mode_id,
                "instanceId": int(match.group("instanceId")),
                "teleportSpellId": int(match.group("teleportSpellId")),
                "name": known.get("name") or match.group("addonName"),
                "shortName": known.get("shortName"),
                "slug": known.get("slug"),
                "expansion": known.get("expansion"),
                "addonLocaleName": match.group("addonName"),
                "itemIds": parse_int_list(match.group("lootTable")),
            }
        )
    return dungeons


def parse_items(text: str) -> dict[int, dict]:
    dungeon_section = text.split("-- Raids", 1)[0]
    items: dict[int, dict] = {}
    for match in ITEM_RE.finditer(dungeon_section):
        item_id = int(match.group("itemId"))
        classes = {
            int(class_id): parse_int_list(spec_ids)
            for class_id, spec_ids in CLASS_RE.findall(match.group("classes"))
        }
        stat_ids = parse_int_list(match.group("stats") or "")
        items[item_id] = {
            "id": item_id,
            "slotId": int(match.group("slotId")),
            "slot": SLOT_BY_ID.get(int(match.group("slotId")), "unknown"),
            "statIds": stat_ids,
            "stats": [STAT_BY_ID[stat_id] for stat_id in stat_ids if stat_id in STAT_BY_ID],
            "classes": classes,
        }
    return items


def fetch_wowhead_item(item_id: int) -> dict:
    url = f"https://nether.wowhead.com/tooltip/item/{item_id}"
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "roll-planner-keystoneloot-extract/1.0"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        payload = json.loads(response.read().decode("utf-8"))

    tooltip = payload.get("tooltip") or ""
    dropped_by = None
    dropped_match = DROPPED_BY_RE.search(tooltip)
    if dropped_match:
        dropped_by = dropped_match.group(1).strip()

    return {
        "name": payload.get("name"),
        "quality": payload.get("quality"),
        "icon": payload.get("icon"),
        "droppedBy": dropped_by,
    }


def enrich_items(items: dict[int, dict], workers: int) -> None:
    item_ids = list(items)
    print(f"Fetching Wowhead names for {len(item_ids)} items...", file=sys.stderr)
    completed = 0
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(fetch_wowhead_item, item_id): item_id for item_id in item_ids}
        for future in as_completed(futures):
            item_id = futures[future]
            completed += 1
            try:
                items[item_id].update(future.result())
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
                print(f"  failed {item_id}: {error}", file=sys.stderr)
            if completed % 25 == 0 or completed == len(item_ids):
                print(f"  {completed}/{len(item_ids)}", file=sys.stderr)


def item_drops_for_spec(item: dict, class_id: int, spec_id: int) -> bool:
    return spec_id in item["classes"].get(class_id, [])


def build_item_record(item: dict) -> dict:
    eligible = []
    spec_ids = []
    for class_id, class_specs in item["classes"].items():
        class_info = CLASSES[class_id]
        all_class_specs = list(class_info["specs"])
        drops_for_all_specs = set(class_specs) == set(all_class_specs)
        for spec_id in class_specs:
            spec_ids.append(spec_id)
            eligible.append(
                {
                    "classId": class_id,
                    "class": class_info["name"],
                    "specId": spec_id,
                    "spec": class_info["specs"].get(spec_id, str(spec_id)),
                    "dropsForAllSpecsOfClass": drops_for_all_specs,
                }
            )

    all_spec_count = sum(len(info["specs"]) for info in CLASSES.values())
    return {
        "id": item["id"],
        "name": item.get("name"),
        "quality": item.get("quality"),
        "icon": item.get("icon"),
        "slotId": item["slotId"],
        "slot": item["slot"],
        "isOther": item["slotId"] == 14,
        "statIds": item["statIds"],
        "stats": item["stats"],
        "droppedBy": item.get("droppedBy"),
        "specIds": spec_ids,
        "dropsForAllClasses": len(spec_ids) == all_spec_count,
        "eligible": eligible,
    }


def build_pools(dungeon_item_ids: list[int], items: dict[int, dict]) -> list[dict]:
    pools = []
    for class_id, class_info in CLASSES.items():
        for spec_id, spec_name in class_info["specs"].items():
            spec_items = [
                item_id
                for item_id in dungeon_item_ids
                if item_id in items and item_drops_for_spec(items[item_id], class_id, spec_id)
            ]
            gear_items = [item_id for item_id in spec_items if items[item_id]["slotId"] != 14]
            pools.append(
                {
                    "classId": class_id,
                    "class": class_info["name"],
                    "specId": spec_id,
                    "spec": spec_name,
                    "itemIds": spec_items,
                    "poolSize": len(spec_items),
                    "gearItemIds": gear_items,
                    "gearPoolSize": len(gear_items),
                }
            )
    return pools


def build_output(header: dict, dungeons: list[dict], items: dict[int, dict]) -> dict:
    dungeon_item_ids = {item_id for dungeon in dungeons for item_id in dungeon["itemIds"]}
    used_items = {item_id: items[item_id] for item_id in dungeon_item_ids if item_id in items}

    missing = sorted(dungeon_item_ids - used_items.keys())
    if missing:
        print(f"Warning: dungeon loot IDs missing from items.lua: {missing}", file=sys.stderr)

    return {
        "meta": {
            "sourceAddon": "KeystoneLoot",
            "sourceTimestamp": header.get("timestamp"),
            "wowBuild": header.get("wowBuild"),
            "seasonId": header.get("season"),
            "expansion": "Midnight",
            "seasonNumber": 2,
            "extractedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "notes": [
                "KeystoneLoot stores one dungeon-wide loot table per challenge map, not per-boss tables.",
                "End-of-run Mythic+ loot is modeled as a uniform draw from the player's loot-spec pool.",
                "P(item | spec) = 1 / poolSize when one item drops from that spec's pool.",
                "slot 14 (other) is typically a pet, toy, or cosmetic. Use gearPoolSize to ignore those.",
            ],
        },
        "lookups": {
            "stats": {str(stat_id): name for stat_id, name in STAT_BY_ID.items()},
            "slots": {str(slot_id): name for slot_id, name in SLOT_BY_ID.items()},
            "classes": {
                str(class_id): {
                    "name": info["name"],
                    "specs": {str(spec_id): spec_name for spec_id, spec_name in info["specs"].items()},
                }
                for class_id, info in CLASSES.items()
            },
        },
        "items": {str(item_id): build_item_record(item) for item_id, item in sorted(used_items.items())},
        "dungeons": [
            {
                **{key: dungeon[key] for key in (
                    "challengeModeId",
                    "instanceId",
                    "teleportSpellId",
                    "name",
                    "shortName",
                    "slug",
                    "expansion",
                    "addonLocaleName",
                    "itemIds",
                )},
                "itemCount": len(dungeon["itemIds"]),
                "pools": build_pools(dungeon["itemIds"], used_items),
            }
            for dungeon in dungeons
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--addon-dir", type=Path, default=DEFAULT_ADDON_DIR)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "data" / "dungeon-drop-tables.json",
    )
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--skip-wowhead", action="store_true")
    args = parser.parse_args()

    dungeons_path = args.addon_dir / "data" / "dungeons.lua"
    items_path = args.addon_dir / "data" / "items.lua"
    if not dungeons_path.exists() or not items_path.exists():
        print(f"Could not find KeystoneLoot data files in {args.addon_dir}", file=sys.stderr)
        return 1

    dungeons_text = dungeons_path.read_text(encoding="utf-8")
    items_text = items_path.read_text(encoding="utf-8")
    header = parse_header(dungeons_text)
    dungeons = parse_dungeons(dungeons_text)
    items = parse_items(items_text)

    if not args.skip_wowhead:
        enrich_items(items, args.workers)

    output = build_output(header, dungeons, items)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {args.output}")
    print(f"  dungeons: {len(output['dungeons'])}")
    print(f"  items: {len(output['items'])}")
    unnamed = [item["id"] for item in output["items"].values() if not item.get("name")]
    if unnamed:
        print(f"  unnamed items: {unnamed}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
