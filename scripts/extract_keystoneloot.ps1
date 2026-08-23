# Extract KeystoneLoot dungeon drop tables into structured JSON.
param(
    [string]$AddonDir = "C:\Program Files (x86)\World of Warcraft\_retail_\Interface\AddOns\KeystoneLoot",
    [string]$OutputPath = (Join-Path $PSScriptRoot "..\data\dungeon-drop-tables.json"),
    [string]$RaidOutputPath = (Join-Path $PSScriptRoot "..\data\raid-drop-tables.json"),
    [switch]$SkipWowhead,
    [switch]$StampInventory,
    [switch]$RaidsOnly
)

$ErrorActionPreference = "Stop"

$StatById = @{
    0 = "crit"
    1 = "haste"
    2 = "mastery"
    3 = "versatility"
}

$SlotById = @{
    0  = "head"
    1  = "neck"
    2  = "shoulder"
    3  = "back"
    4  = "chest"
    5  = "wrist"
    6  = "hands"
    7  = "waist"
    8  = "legs"
    9  = "feet"
    10 = "weapon"
    11 = "offhand"
    12 = "finger"
    13 = "trinket"
    14 = "other"
}

# Blizzard inventoryType IDs from Wowhead item XML.
$InventoryHandById = @{
    13 = "1h"
    14 = "oh"
    15 = "ranged"
    17 = "2h"
    21 = "1h"
    22 = "oh"
    23 = "oh"
    25 = "ranged"
    26 = "ranged"
}

$Classes = @{
    1  = @{ name = "Warrior"; specs = @{ 71 = "Arms"; 72 = "Fury"; 73 = "Protection" } }
    2  = @{ name = "Paladin"; specs = @{ 65 = "Holy"; 66 = "Protection"; 70 = "Retribution" } }
    3  = @{ name = "Hunter"; specs = @{ 253 = "Beast Mastery"; 254 = "Marksmanship"; 255 = "Survival" } }
    4  = @{ name = "Rogue"; specs = @{ 259 = "Assassination"; 260 = "Outlaw"; 261 = "Subtlety" } }
    5  = @{ name = "Priest"; specs = @{ 256 = "Discipline"; 257 = "Holy"; 258 = "Shadow" } }
    6  = @{ name = "Death Knight"; specs = @{ 250 = "Blood"; 251 = "Frost"; 252 = "Unholy" } }
    7  = @{ name = "Shaman"; specs = @{ 262 = "Elemental"; 263 = "Enhancement"; 264 = "Restoration" } }
    8  = @{ name = "Mage"; specs = @{ 62 = "Arcane"; 63 = "Fire"; 64 = "Frost" } }
    9  = @{ name = "Warlock"; specs = @{ 265 = "Affliction"; 266 = "Demonology"; 267 = "Destruction" } }
    10 = @{ name = "Monk"; specs = @{ 268 = "Brewmaster"; 269 = "Windwalker"; 270 = "Mistweaver" } }
    11 = @{ name = "Druid"; specs = @{ 102 = "Balance"; 103 = "Feral"; 104 = "Guardian"; 105 = "Restoration" } }
    12 = @{ name = "Demon Hunter"; specs = @{ 577 = "Havoc"; 581 = "Vengeance"; 1480 = "Devourer" } }
    13 = @{ name = "Evoker"; specs = @{ 1467 = "Devastation"; 1468 = "Preservation"; 1473 = "Augmentation" } }
}

$DungeonMeta = @{
    249 = @{ name = "Kings' Rest"; shortName = "KR"; slug = "kings-rest"; expansion = "Battle for Azeroth" }
    250 = @{ name = "Temple of Sethraliss"; shortName = "TOS"; slug = "temple-of-sethraliss"; expansion = "Battle for Azeroth" }
    399 = @{ name = "Ruby Life Pools"; shortName = "RLP"; slug = "ruby-life-pools"; expansion = "Dragonflight" }
    584 = @{ name = "The Blinding Vale"; shortName = "TBV"; slug = "the-blinding-vale"; expansion = "Midnight" }
    585 = @{ name = "Voidscar Arena"; shortName = "VSA"; slug = "voidscar-arena"; expansion = "Midnight" }
    586 = @{ name = "Den of Nalorakk"; shortName = "DON"; slug = "den-of-nalorakk"; expansion = "Midnight" }
    587 = @{ name = "Murder Row"; shortName = "MR"; slug = "murder-row"; expansion = "Midnight" }
    588 = @{ name = "Altar of Fangs"; shortName = "AOF"; slug = "altar-of-fangs"; expansion = "Midnight" }
}

$RaidMeta = @{
    1317 = @{ name = "Tidebound Grotto"; shortName = "TBG"; slug = "tidebound-grotto" }
    1320 = @{ name = "The Venomous Abyss"; shortName = "VA"; slug = "the-venomous-abyss" }
}

$BossMeta = @{
    2849 = @{ name = "Nymrissa Wavecaller"; shortName = "NYM" }
    2888 = @{ name = "Nek'zali the Soulcoiler"; shortName = "NEK" }
    2874 = @{ name = "Entombed Sentinels"; shortName = "ES" }
    2894 = @{ name = "The Lost Explorers"; shortName = "LE" }
    2882 = @{ name = "Vashnik the Malignant"; shortName = "VAS" }
    2871 = @{ name = "Sszorak"; shortName = "SSZ" }
    2887 = @{ name = "The Twin Fangs"; shortName = "TF" }
    2883 = @{ name = "The Coiled Altar"; shortName = "CA" }
    2895 = @{ name = "Ula'tek"; shortName = "ULA" }
}

function Get-IntList([string]$Text) {
    $values = New-Object System.Collections.Generic.List[int]
    foreach ($match in [regex]::Matches($Text, "\d+")) {
        $values.Add([int]$match.Value)
    }
    return $values
}

function Get-LuaHeader([string]$Text) {
    $match = [regex]::Match($Text, "-- Timestamp: (.+)\r?\n-- WoW Build: (.+)\r?\n-- Season: (\d+)")
    if (-not $match.Success) { return @{} }
    return @{
        timestamp = $match.Groups[1].Value.Trim()
        wowBuild  = $match.Groups[2].Value.Trim()
        season    = [int]$match.Groups[3].Value
    }
}

function Get-Dungeons([string]$Text) {
    $pattern = 'challengeModeId = (?<challengeModeId>\d+), teleportSpellId = (?<teleportSpellId>\d+), bgTexture = (?<bgTexture>\d+), instanceId = (?<instanceId>\d+), lootTable = \{ (?<lootTable>[^}]+) \}'
    $results = New-Object System.Collections.Generic.List[object]
    foreach ($match in [regex]::Matches($Text, $pattern)) {
        $id = [int]$match.Groups["challengeModeId"].Value
        $known = $DungeonMeta[$id]
        $results.Add(@{
            challengeModeId = $id
            instanceId      = [int]$match.Groups["instanceId"].Value
            teleportSpellId = [int]$match.Groups["teleportSpellId"].Value
            name            = if ($known) { $known.name } else { "Unknown $id" }
            shortName       = if ($known) { $known.shortName } else { $null }
            slug            = if ($known) { $known.slug } else { $null }
            expansion       = if ($known) { $known.expansion } else { $null }
            itemIds         = @(Get-IntList $match.Groups["lootTable"].Value)
        })
    }
    if ($results.Count -eq 0) {
        throw "Failed to parse any dungeons from dungeons.lua"
    }
    return $results
}

function Get-ItemsFromSection([string]$Text) {
    $pattern = '\[(?<itemId>\d+)\] = \{ classes = \{ (?<classes>.+?) \}, (?:stats = \{ (?<stats>[\d, ]+) \}, )?slotId = (?<slotId>\d+) \}'
    $items = @{}
    foreach ($match in [regex]::Matches($Text, $pattern)) {
        $itemId = [int]$match.Groups["itemId"].Value
        $classes = @{}
        foreach ($classMatch in [regex]::Matches($match.Groups["classes"].Value, '\[(\d+)\] = \{ ([\d, ]+) \}')) {
            $classes[[int]$classMatch.Groups[1].Value] = @(Get-IntList $classMatch.Groups[2].Value)
        }
        $statIds = if ($match.Groups["stats"].Success) { @(Get-IntList $match.Groups["stats"].Value) } else { @() }
        $slotId = [int]$match.Groups["slotId"].Value
        $items[$itemId] = @{
            id      = $itemId
            slotId  = $slotId
            slot    = $SlotById[$slotId]
            statIds = $statIds
            stats   = @($statIds | ForEach-Object { $StatById[$_] })
            classes = $classes
        }
    }
    return $items
}

function Get-Items([string]$Text) {
    $dungeonSection = ($Text -split "-- Raids", 2)[0]
    return Get-ItemsFromSection $dungeonSection
}

function Get-RaidItems([string]$Text) {
    $parts = $Text -split "-- Raids", 2
    if ($parts.Count -lt 2) { return @{} }
    return Get-ItemsFromSection $parts[1]
}

function Get-UniqueItemIds([string]$Text) {
    $seen = New-Object 'System.Collections.Generic.HashSet[int]'
    $ids = New-Object System.Collections.Generic.List[int]
    foreach ($match in [regex]::Matches($Text, '\[(?:14|15|16|17)\] = \{ (?<ids>[^}]+) \}')) {
        foreach ($itemId in (Get-IntList $match.Groups["ids"].Value)) {
            if ($seen.Add($itemId)) { $ids.Add($itemId) }
        }
    }
    return @($ids)
}

function Get-Raids([string]$Text) {
    $results = New-Object System.Collections.Generic.List[object]
    $chunks = [regex]::Split($Text, '(?=journalInstanceId = \d+)')
    foreach ($chunk in $chunks) {
        $raidMatch = [regex]::Match($chunk, 'journalInstanceId = (?<journalId>\d+),\s*instanceId = (?<instanceId>\d+),')
        if (-not $raidMatch.Success) { continue }
        $journalId = [int]$raidMatch.Groups["journalId"].Value
        $instanceId = [int]$raidMatch.Groups["instanceId"].Value
        $knownRaid = $RaidMeta[$journalId]
        $bosses = New-Object System.Collections.Generic.List[object]
        foreach ($bossMatch in [regex]::Matches($chunk, 'bossId = (?<bossId>\d+),\s*lootTable = \{(?<lootTable>[\s\S]*?)\n\s*\}')) {
            $bossId = [int]$bossMatch.Groups["bossId"].Value
            $knownBoss = $BossMeta[$bossId]
            $bosses.Add(@{
                bossId    = $bossId
                raidId    = $journalId
                name      = if ($knownBoss) { $knownBoss.name } else { "Unknown $bossId" }
                shortName = if ($knownBoss) { $knownBoss.shortName } else { "$bossId" }
                itemIds   = @(Get-UniqueItemIds $bossMatch.Groups["lootTable"].Value)
            })
        }
        $results.Add(@{
            journalInstanceId = $journalId
            instanceId        = $instanceId
            name              = if ($knownRaid) { $knownRaid.name } else { "Unknown $journalId" }
            shortName         = if ($knownRaid) { $knownRaid.shortName } else { "$journalId" }
            slug              = if ($knownRaid) { $knownRaid.slug } else { $null }
            bosses            = $bosses.ToArray()
        })
    }
    return $results
}

function Add-WowheadNames($Items) {
    $ids = @($Items.Keys)
    Write-Host "Fetching Wowhead names for $($ids.Count) items..."

    $runspacePool = [runspacefactory]::CreateRunspacePool(1, 8)
    $runspacePool.Open()
    $workers = New-Object System.Collections.Generic.List[object]

    foreach ($itemId in $ids) {
        $powershell = [powershell]::Create().AddScript({
            param($Id)
            $url = "https://nether.wowhead.com/tooltip/item/$Id"
            $payload = Invoke-RestMethod -Uri $url -Headers @{ "User-Agent" = "weighted-dice-keystoneloot-extract/1.0" } -TimeoutSec 20
            $droppedBy = $null
            if ($payload.tooltip -match "Dropped by:\s*([^<]+)") {
                $droppedBy = $Matches[1].Trim()
            }
            [pscustomobject]@{
                id        = $Id
                name      = $payload.name
                quality   = $payload.quality
                icon      = $payload.icon
                droppedBy = $droppedBy
            }
        }).AddArgument($itemId)
        $powershell.RunspacePool = $runspacePool
        $workers.Add(@{ Pipe = $powershell; Handle = $powershell.BeginInvoke() })
    }

    $completed = 0
    foreach ($worker in $workers) {
        $result = $worker.Pipe.EndInvoke($worker.Handle)
        $worker.Pipe.Dispose()
        $completed++
        if ($result -and $result.id) {
            $item = $Items[[int]$result.id]
            if ($item) {
                $item.name = $result.name
                $item.quality = $result.quality
                $item.icon = $result.icon
                $item.droppedBy = $result.droppedBy
            }
        }
        if (($completed % 25) -eq 0 -or $completed -eq $ids.Count) {
            Write-Host "  $completed/$($ids.Count)"
        }
    }

    $runspacePool.Close()
    $runspacePool.Dispose()
}

function Set-ItemProperty($Item, [string]$Name, $Value) {
    if ($Item -is [System.Collections.IDictionary]) {
        $Item[$Name] = $Value
        return
    }
    $existing = $Item.PSObject.Properties[$Name]
    if ($existing) {
        $existing.Value = $Value
        return
    }
    $Item | Add-Member -NotePropertyName $Name -NotePropertyValue $Value
}

function Set-ItemInventory($Item, $Inventory) {
    if (-not $Item -or -not $Inventory) { return }
    Set-ItemProperty $Item "inventorySlotId" ([int]$Inventory.inventorySlotId)
    Set-ItemProperty $Item "inventorySlot" ([string]$Inventory.inventorySlot)
    Set-ItemProperty $Item "hand" $Inventory.hand
    Set-ItemProperty $Item "weaponClassId" ([int]$Inventory.weaponClassId)
    Set-ItemProperty $Item "weaponClass" $Inventory.weaponClass
}

function Add-WowheadInventory($Items) {
    $ids = @($Items.Keys | Where-Object {
        $slotId = [int]$Items[$_].slotId
        $slotId -eq 10 -or $slotId -eq 11
    } | Sort-Object)
    if ($ids.Count -eq 0) { return }
    Write-Host "Fetching Wowhead inventory slots for $($ids.Count) weapons/offhands..."

    $runspacePool = [runspacefactory]::CreateRunspacePool(1, 6)
    $runspacePool.Open()
    $workers = New-Object System.Collections.Generic.List[object]
    $handMap = $InventoryHandById

    foreach ($itemId in $ids) {
        $powershell = [powershell]::Create().AddScript({
            param($Id, $HandById)
            $url = "https://www.wowhead.com/item=$Id&xml"
            $raw = Invoke-WebRequest -Uri $url -Headers @{ "User-Agent" = "weighted-dice-keystoneloot-extract/1.0" } -TimeoutSec 20 -UseBasicParsing
            [xml]$doc = $raw.Content
            $item = $doc.wowhead.item
            if (-not $item -or -not $item.inventorySlot) { return $null }
            $invId = [int]$item.inventorySlot.id
            $subclass = [string]$item.subclass.InnerText
            $name = $subclass -replace '^One-Handed\s+', '' -replace '^Two-Handed\s+', ''
            $weaponClass = switch -Regex ($name) {
                '^Swords$' { "Sword" }
                '^Axes$' { "Axe" }
                '^Maces$' { "Mace" }
                '^Polearms$' { "Polearm" }
                '^Staves$' { "Staff" }
                '^Daggers$' { "Dagger" }
                '^Fist Weapons$' { "Fist" }
                '^Warglaives$' { "Warglaive" }
                '^Bows$' { "Bow" }
                '^Guns$' { "Gun" }
                '^Crossbows$' { "Crossbow" }
                '^Wands$' { "Wand" }
                '^Shields$' { "Shield" }
                default { if ($name) { $name } else { $null } }
            }
            $hand = $null
            if ($HandById.ContainsKey($invId)) { $hand = $HandById[$invId] }
            [pscustomobject]@{
                id              = $Id
                inventorySlotId = $invId
                inventorySlot   = [string]$item.inventorySlot.InnerText
                weaponClassId   = [int]$item.subclass.id
                weaponClass     = $weaponClass
                hand            = $hand
            }
        }).AddArgument($itemId).AddArgument($handMap)
        $powershell.RunspacePool = $runspacePool
        $workers.Add(@{ Pipe = $powershell; Handle = $powershell.BeginInvoke() })
    }

    $completed = 0
    $missing = New-Object System.Collections.Generic.List[int]
    foreach ($worker in $workers) {
        $result = $worker.Pipe.EndInvoke($worker.Handle)
        $worker.Pipe.Dispose()
        $completed++
        if ($result -and $result.id) {
            Set-ItemInventory $Items[[int]$result.id] $result
        } else {
            $missing.Add($completed)
        }
        if (($completed % 10) -eq 0 -or $completed -eq $ids.Count) {
            Write-Host "  $completed/$($ids.Count)"
        }
    }

    $runspacePool.Close()
    $runspacePool.Dispose()

    $unstamped = @($ids | Where-Object { -not $Items[$_].hand })
    if ($unstamped.Count -gt 0) {
        Write-Host "  unstamped inventory: $($unstamped -join ', ')"
    }
}

function ConvertTo-Plain($Value) {
    if ($null -eq $Value) { return $null }
    if ($Value -is [bool] -or $Value -is [string]) { return $Value }
    if ($Value -is [byte] -or $Value -is [int16] -or $Value -is [uint16] -or $Value -is [int] -or $Value -is [uint32] -or $Value -is [long] -or $Value -is [uint64] -or $Value -is [double] -or $Value -is [decimal] -or $Value -is [single]) {
        if (($Value -is [double] -or $Value -is [decimal] -or $Value -is [single]) -and [math]::Abs($Value - [math]::Round($Value)) -gt 1e-9) {
            return [double]$Value
        }
        return [int64]$Value
    }
    if ($Value -is [System.Collections.IDictionary]) {
        $hash = New-Object System.Collections.Hashtable
        foreach ($key in $Value.Keys) {
            $hash["$key"] = ConvertTo-Plain $Value[$key]
        }
        return $hash
    }
    if ($Value -is [System.Management.Automation.PSCustomObject]) {
        $hash = New-Object System.Collections.Hashtable
        foreach ($prop in $Value.PSObject.Properties) {
            $hash[$prop.Name] = ConvertTo-Plain $prop.Value
        }
        return $hash
    }
    if ($Value -is [System.Collections.IEnumerable]) {
        $list = New-Object System.Collections.Generic.List[object]
        foreach ($item in $Value) {
            $list.Add((ConvertTo-Plain $item))
        }
        return $list.ToArray()
    }
    return "$Value"
}

function Test-ItemDropsForSpec($ItemData, [int]$ClassId, [int]$SpecId) {
    $specs = $ItemData.classes[$ClassId]
    return $null -ne $specs -and $specs -contains $SpecId
}

function New-ItemRecord($ItemData) {
    $eligible = New-Object System.Collections.Generic.List[object]
    $specIds = New-Object System.Collections.Generic.List[int]
    $allSpecCount = 0
    foreach ($classId in $Classes.Keys) {
        $allSpecCount += $Classes[$classId].specs.Count
    }

    foreach ($classId in ($ItemData.classes.Keys | Sort-Object)) {
        $classKey = [int]$classId
        $classInfo = $Classes[$classKey]
        if (-not $classInfo) { continue }
        $classSpecs = @($ItemData.classes[$classKey])
        $allClassSpecs = @($classInfo.specs.Keys)
        $dropsForAllSpecs = ($classSpecs.Count -eq $allClassSpecs.Count) -and (@(Compare-Object $classSpecs $allClassSpecs).Count -eq 0)
        foreach ($specId in $classSpecs) {
            $specIds.Add([int]$specId)
            $eligible.Add(@{
                classId                 = $classKey
                class                   = $classInfo.name
                specId                  = [int]$specId
                spec                    = $classInfo.specs[[int]$specId]
                dropsForAllSpecsOfClass = $dropsForAllSpecs
            })
        }
    }

    $record = New-Object System.Collections.Hashtable
    $record["id"] = [int]$ItemData.id
    $record["name"] = $ItemData.name
    $record["quality"] = $ItemData.quality
    $record["icon"] = $ItemData.icon
    $record["slotId"] = [int]$ItemData.slotId
    $record["slot"] = [string]$ItemData.slot
    if ($null -ne $ItemData.inventorySlotId) {
        $record["inventorySlotId"] = [int]$ItemData.inventorySlotId
        $record["inventorySlot"] = [string]$ItemData.inventorySlot
        $record["hand"] = $ItemData.hand
        $record["weaponClassId"] = [int]$ItemData.weaponClassId
        $record["weaponClass"] = $ItemData.weaponClass
    }
    $record["isOther"] = [bool]($ItemData.slotId -eq 14)
    $record["statIds"] = @($ItemData.statIds | ForEach-Object { [int]$_ })
    $record["stats"] = @($ItemData.stats | ForEach-Object { [string]$_ })
    $record["droppedBy"] = $ItemData.droppedBy
    $record["specIds"] = $specIds.ToArray()
    $record["dropsForAllClasses"] = [bool]($specIds.Count -eq $allSpecCount)
    $record["eligible"] = $eligible.ToArray()
    return $record
}

function New-Pools($DungeonItemIds, $Items) {
    $pools = New-Object System.Collections.Generic.List[object]
    foreach ($classId in ($Classes.Keys | Sort-Object)) {
        $classInfo = $Classes[$classId]
        foreach ($specId in ($classInfo.specs.Keys | Sort-Object)) {
            $specItems = New-Object System.Collections.Generic.List[int]
            foreach ($itemId in $DungeonItemIds) {
                if ($Items.ContainsKey($itemId) -and (Test-ItemDropsForSpec $Items[$itemId] $classId $specId)) {
                    $specItems.Add($itemId)
                }
            }
            $gearItems = @($specItems | Where-Object { $Items[$_].slotId -ne 14 })
            $pools.Add(@{
                classId      = $classId
                class        = $classInfo.name
                specId       = $specId
                spec         = $classInfo.specs[$specId]
                itemIds      = @($specItems)
                poolSize     = $specItems.Count
                gearItemIds  = @($gearItems)
                gearPoolSize = @($gearItems).Count
            })
        }
    }
    return $pools.ToArray()
}

function Escape-JsonString([string]$Value) {
    return $Value.Replace('\', '\\').Replace('"', '\"').Replace("`n", '\n').Replace("`r", '\r').Replace("`t", '\t')
}

function ConvertTo-JsonValue {
    param($Value, [int]$Indent = 0)
    $pad = "  " * $Indent
    $inner = "  " * ($Indent + 1)

    if ($null -eq $Value) { return "null" }
    if ($Value -is [bool]) { if ($Value) { return "true" } else { return "false" } }
    if ($Value -is [int] -or $Value -is [long] -or $Value -is [double] -or $Value -is [decimal]) { return "$Value" }
    if ($Value -is [string]) { return ('"' + (Escape-JsonString $Value) + '"') }

    if ($Value -is [System.Collections.IDictionary]) {
        $keys = @($Value.Keys)
        if ($keys.Count -eq 0) { return "{}" }
        $parts = New-Object System.Collections.Generic.List[string]
        foreach ($key in ($keys | Sort-Object { "$_" })) {
            $parts.Add($inner + '"' + (Escape-JsonString "$key") + '": ' + (ConvertTo-JsonValue $Value[$key] ($Indent + 1)))
        }
        return "{`n" + ($parts -join ",`n") + "`n$pad}"
    }

    if ($Value -is [System.Collections.IEnumerable] -and $Value -isnot [string]) {
        $items = @($Value)
        if ($items.Count -eq 0) { return "[]" }
        $parts = New-Object System.Collections.Generic.List[string]
        foreach ($item in $items) {
            $parts.Add($inner + (ConvertTo-JsonValue $item ($Indent + 1)))
        }
        return "[`n" + ($parts -join ",`n") + "`n$pad]"
    }

    return ('"' + (Escape-JsonString "$Value") + '"')
}

if ($StampInventory) {
    $resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
    if (-not (Test-Path $resolvedOutput)) {
        throw "Drop table file not found: $resolvedOutput"
    }
    $existing = Get-Content -Raw -Encoding UTF8 $resolvedOutput | ConvertFrom-Json
    $stampItems = @{}
    foreach ($prop in $existing.items.PSObject.Properties) {
        $stampItems[[int]$prop.Name] = $prop.Value
    }
    Add-WowheadInventory $stampItems
    $payload = ConvertTo-Plain $existing
    $json = ConvertTo-JsonValue $payload
    [System.IO.File]::WriteAllText($resolvedOutput, $json + "`n")
    $weapons = @($stampItems.Values | Where-Object { [int]$_.slotId -in 10, 11 })
    $stamped = @($weapons | Where-Object { $_.hand })
    Write-Host "Wrote $resolvedOutput"
    Write-Host "  stamped $($stamped.Count)/$($weapons.Count) weapons/offhands"
    $byHand = $stamped | Group-Object hand
    foreach ($group in $byHand) {
        Write-Host ("  {0}: {1}" -f $group.Name, $group.Count)
    }
    return
}

$dungeonsPath = Join-Path $AddonDir "data\dungeons.lua"
$itemsPath = Join-Path $AddonDir "data\items.lua"
if (-not (Test-Path $dungeonsPath) -or -not (Test-Path $itemsPath)) {
    throw "Could not find KeystoneLoot data files in $AddonDir"
}

$dungeonsText = Get-Content -Raw -Encoding UTF8 $dungeonsPath
$itemsText = Get-Content -Raw -Encoding UTF8 $itemsPath
$header = Get-LuaHeader $dungeonsText
$lookupsClasses = @{}
foreach ($classId in ($Classes.Keys | Sort-Object)) {
    $specMap = @{}
    foreach ($specId in ($Classes[$classId].specs.Keys | Sort-Object)) {
        $specMap["$specId"] = $Classes[$classId].specs[$specId]
    }
    $lookupsClasses["$classId"] = @{
        name  = $Classes[$classId].name
        specs = $specMap
    }
}
$lookups = New-Object System.Collections.Hashtable
$lookups["stats"] = @{ "0" = "crit"; "1" = "haste"; "2" = "mastery"; "3" = "versatility" }
$lookups["slots"] = @{
    "0" = "head"; "1" = "neck"; "2" = "shoulder"; "3" = "back"; "4" = "chest"
    "5" = "wrist"; "6" = "hands"; "7" = "waist"; "8" = "legs"; "9" = "feet"
    "10" = "weapon"; "11" = "offhand"; "12" = "finger"; "13" = "trinket"; "14" = "other"
}
$lookups["classes"] = $lookupsClasses

if (-not $RaidsOnly) {
$parsedDungeons = Get-Dungeons $dungeonsText
$dungeons = New-Object System.Collections.Generic.List[object]
foreach ($dungeon in $parsedDungeons) { $dungeons.Add($dungeon) }
$items = Get-Items $itemsText
Write-Host "Parsed $($dungeons.Count) dungeons and $($items.Count) item definitions"

if (-not $SkipWowhead) {
    Add-WowheadNames $items
    Add-WowheadInventory $items
}

$dungeonItemIds = New-Object 'System.Collections.Generic.HashSet[int]'
foreach ($dungeon in $dungeons) {
    foreach ($itemId in $dungeon.itemIds) { [void]$dungeonItemIds.Add($itemId) }
}

$usedItems = @{}
foreach ($itemId in $dungeonItemIds) {
    if ($items.ContainsKey($itemId)) {
        $usedItems[$itemId] = $items[$itemId]
    }
}

$itemRecords = @{}
foreach ($itemId in ($usedItems.Keys | Sort-Object)) {
    $itemRecords["$itemId"] = New-ItemRecord $usedItems[$itemId]
}

$dungeonRecords = New-Object System.Collections.Generic.List[object]
foreach ($dungeon in $dungeons) {
    $record = New-Object System.Collections.Hashtable
    $record["challengeModeId"] = $dungeon.challengeModeId
    $record["instanceId"] = $dungeon.instanceId
    $record["teleportSpellId"] = $dungeon.teleportSpellId
    $record["name"] = $dungeon.name
    $record["shortName"] = $dungeon.shortName
    $record["slug"] = $dungeon.slug
    $record["expansion"] = $dungeon.expansion
    $record["itemIds"] = @($dungeon.itemIds | ForEach-Object { [int]$_ })
    $record["itemCount"] = @($dungeon.itemIds).Count
    $record["pools"] = New-Pools $dungeon.itemIds $usedItems
    $dungeonRecords.Add($record)
}

$meta = New-Object System.Collections.Hashtable
$meta["sourceAddon"] = "KeystoneLoot"
$meta["sourceTimestamp"] = $header.timestamp
$meta["wowBuild"] = $header.wowBuild
$meta["seasonId"] = $header.season
$meta["expansion"] = "Midnight"
$meta["seasonNumber"] = 2
$meta["extractedAt"] = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$meta["notes"] = [string[]]@(
    "KeystoneLoot stores one dungeon-wide loot table per challenge map, not per-boss tables."
    "End-of-run Mythic+ loot is modeled as a uniform draw from the player's loot-spec pool."
    "P(item | spec) = 1 / poolSize when one item drops from that spec's pool."
    "slot 14 (other) is typically a pet, toy, or cosmetic. Use gearPoolSize to ignore those."
)

$payload = New-Object System.Collections.Hashtable
$payload["meta"] = $meta
$payload["lookups"] = $lookups
$payload["items"] = $itemRecords
$payload["dungeons"] = $dungeonRecords.ToArray()

$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
$outputDir = Split-Path -Parent $resolvedOutput
if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir | Out-Null
}

$json = ConvertTo-JsonValue $payload
[System.IO.File]::WriteAllText($resolvedOutput, $json + "`n")

Write-Host "Wrote $resolvedOutput"
Write-Host "  dungeons: $($dungeonRecords.Count)"
Write-Host "  items: $($itemRecords.Count)"
$unnamed = @($itemRecords.Values | Where-Object { -not $_.name } | ForEach-Object { $_.id })
if ($unnamed.Count -gt 0) {
    Write-Host "  unnamed items: $($unnamed -join ', ')"
}
}

$raidsPath = Join-Path $AddonDir "data\raids.lua"
if (-not (Test-Path $raidsPath)) {
    Write-Host "Skipping raid extract: raids.lua not found in $AddonDir"
    return
}

$raidsText = Get-Content -Raw -Encoding UTF8 $raidsPath
$parsedRaids = @(Get-Raids $raidsText)
$raidItems = Get-RaidItems $itemsText
Write-Host "Parsed $($parsedRaids.Count) raids and $($raidItems.Count) raid item definitions"

if (-not $SkipWowhead) {
    Add-WowheadNames $raidItems
    Add-WowheadInventory $raidItems
}

$raidItemIds = New-Object 'System.Collections.Generic.HashSet[int]'
foreach ($raid in $parsedRaids) {
    foreach ($boss in $raid.bosses) {
        foreach ($itemId in $boss.itemIds) { [void]$raidItemIds.Add($itemId) }
    }
}

$usedRaidItems = @{}
foreach ($itemId in $raidItemIds) {
    if ($raidItems.ContainsKey($itemId)) {
        $usedRaidItems[$itemId] = $raidItems[$itemId]
    } else {
        Write-Host "Warning: raid loot ID missing from items.lua: $itemId"
    }
}

$raidItemRecords = @{}
foreach ($itemId in ($usedRaidItems.Keys | Sort-Object)) {
    $raidItemRecords["$itemId"] = New-ItemRecord $usedRaidItems[$itemId]
}

$raidRecords = New-Object System.Collections.Generic.List[object]
$bossRecords = New-Object System.Collections.Generic.List[object]
foreach ($raid in $parsedRaids) {
    $raidBosses = New-Object System.Collections.Generic.List[object]
    foreach ($boss in $raid.bosses) {
        $bossRecord = New-Object System.Collections.Hashtable
        $bossRecord["bossId"] = [int]$boss.bossId
        $bossRecord["raidId"] = [int]$raid.journalInstanceId
        $bossRecord["name"] = $boss.name
        $bossRecord["shortName"] = $boss.shortName
        $bossRecord["itemIds"] = @($boss.itemIds | ForEach-Object { [int]$_ })
        $bossRecord["itemCount"] = @($boss.itemIds).Count
        $bossRecord["pools"] = New-Pools $boss.itemIds $usedRaidItems
        $raidBosses.Add($bossRecord)
        $bossRecords.Add($bossRecord)
    }
    $raidRecord = New-Object System.Collections.Hashtable
    $raidRecord["journalInstanceId"] = [int]$raid.journalInstanceId
    $raidRecord["instanceId"] = [int]$raid.instanceId
    $raidRecord["name"] = $raid.name
    $raidRecord["shortName"] = $raid.shortName
    $raidRecord["slug"] = $raid.slug
    $raidRecord["bosses"] = $raidBosses.ToArray()
    $raidRecords.Add($raidRecord)
}

$raidMeta = New-Object System.Collections.Hashtable
$raidMeta["sourceAddon"] = "KeystoneLoot"
$raidMeta["sourceTimestamp"] = $header.timestamp
$raidMeta["wowBuild"] = $header.wowBuild
$raidMeta["seasonId"] = $header.season
$raidMeta["expansion"] = "Midnight"
$raidMeta["seasonNumber"] = 2
$raidMeta["extractedAt"] = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$raidMeta["notes"] = [string[]]@(
    "KeystoneLoot stores per-boss raid loot tables keyed by difficulty (14/15/16/17)."
    "Item IDs are the unique union across difficulties because this planner does not track item level."
    "A bonus roll is modeled as a uniform draw from that boss's leftover spec pool."
    "slot 14 (other) is typically a token, pet, toy, or cosmetic. Use gearPoolSize to ignore those."
)

$raidPayload = New-Object System.Collections.Hashtable
$raidPayload["meta"] = $raidMeta
$raidPayload["lookups"] = $lookups
$raidPayload["items"] = $raidItemRecords
$raidPayload["raids"] = $raidRecords.ToArray()
$raidPayload["bosses"] = $bossRecords.ToArray()

$resolvedRaidOutput = [System.IO.Path]::GetFullPath($RaidOutputPath)
$raidOutputDir = Split-Path -Parent $resolvedRaidOutput
if (-not (Test-Path $raidOutputDir)) {
    New-Item -ItemType Directory -Path $raidOutputDir | Out-Null
}

$raidJson = ConvertTo-JsonValue $raidPayload
[System.IO.File]::WriteAllText($resolvedRaidOutput, $raidJson + "`n")

Write-Host "Wrote $resolvedRaidOutput"
Write-Host "  raids: $($raidRecords.Count)"
Write-Host "  bosses: $($bossRecords.Count)"
Write-Host "  items: $($raidItemRecords.Count)"
$unnamedRaid = @($raidItemRecords.Values | Where-Object { -not $_.name } | ForEach-Object { $_.id })
if ($unnamedRaid.Count -gt 0) {
    Write-Host "  unnamed raid items: $($unnamedRaid -join ', ')"
}
