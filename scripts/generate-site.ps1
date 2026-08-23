# Build the static site payload from data/dungeon-drop-tables.json.
# Run after extracting drop tables, or whenever you want a fresh loot-data.js.
#
#   powershell -File scripts/generate-site.ps1
#
# Ship the site/ folder to any static host.

param(
    [string]$DataPath = (Join-Path $PSScriptRoot "..\data\dungeon-drop-tables.json"),
    [string]$OutputPath = (Join-Path $PSScriptRoot "..\site\loot-data.js")
)

$ErrorActionPreference = "Stop"

$StatLabels = @{
    crit         = "Crit"
    haste        = "Haste"
    mastery      = "Mastery"
    versatility  = "Versatility"
}

$SlotOrder = @(
    @{ id = 0; name = "Head" }
    @{ id = 1; name = "Neck" }
    @{ id = 2; name = "Shoulder" }
    @{ id = 3; name = "Back" }
    @{ id = 4; name = "Chest" }
    @{ id = 5; name = "Wrist" }
    @{ id = 6; name = "Hands" }
    @{ id = 7; name = "Waist" }
    @{ id = 8; name = "Legs" }
    @{ id = 9; name = "Feet" }
    @{ id = 12; name = "Finger" }
    @{ id = 13; name = "Trinket" }
    @{ id = 10; name = "Weapon" }
    @{ id = 11; name = "Offhand" }
)

$ClassOrder = @(
    @{ id = 1; name = "Warrior"; specs = @(71, 72, 73) }
    @{ id = 2; name = "Paladin"; specs = @(65, 66, 70) }
    @{ id = 3; name = "Hunter"; specs = @(253, 254, 255) }
    @{ id = 4; name = "Rogue"; specs = @(259, 260, 261) }
    @{ id = 5; name = "Priest"; specs = @(256, 257, 258) }
    @{ id = 6; name = "Death Knight"; specs = @(250, 251, 252) }
    @{ id = 7; name = "Shaman"; specs = @(262, 263, 264) }
    @{ id = 8; name = "Mage"; specs = @(62, 63, 64) }
    @{ id = 9; name = "Warlock"; specs = @(265, 266, 267) }
    @{ id = 10; name = "Monk"; specs = @(268, 269, 270) }
    @{ id = 11; name = "Druid"; specs = @(102, 103, 104, 105) }
    @{ id = 12; name = "Demon Hunter"; specs = @(577, 581, 1480) }
    @{ id = 13; name = "Evoker"; specs = @(1467, 1468, 1473) }
)

function Get-AsArray($Value) {
    if ($null -eq $Value) { return @() }
    return @($Value)
}

function Get-JsonProperty($Object, [string]$Name) {
    if ($null -eq $Object) { return $null }
    return $Object.PSObject.Properties[$Name].Value
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
        foreach ($key in $keys) {
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

$resolvedData = [System.IO.Path]::GetFullPath($DataPath)
if (-not (Test-Path $resolvedData)) {
    throw "Drop table file not found: $resolvedData"
}

$data = Get-Content -Raw -Encoding UTF8 $resolvedData | ConvertFrom-Json
$lookups = $data.lookups
$itemsRoot = $data.items

$dungeons = New-Object System.Collections.Generic.List[object]
foreach ($dungeon in $data.dungeons) {
    $dungeons.Add(@{
        id        = [int]$dungeon.challengeModeId
        name      = [string]$dungeon.name
        shortName = [string]$dungeon.shortName
    })
}

$classes = New-Object System.Collections.Generic.List[object]
foreach ($classInfo in $ClassOrder) {
    $lookup = Get-JsonProperty $lookups.classes "$($classInfo.id)"
    $specs = New-Object System.Collections.Generic.List[object]
    foreach ($specId in $classInfo.specs) {
        $specName = Get-JsonProperty $lookup.specs "$specId"
        if (-not $specName) { $specName = "$specId" }
        $specs.Add(@{
            id   = [int]$specId
            name = [string]$specName
        })
    }
    $classRecord = New-Object System.Collections.Hashtable
    $classRecord["id"] = [int]$classInfo.id
    $classRecord["name"] = [string]$classInfo.name
    $classRecord["specs"] = $specs.ToArray()
    $classes.Add($classRecord)
}

$grid = New-Object System.Collections.Hashtable
foreach ($dungeon in $data.dungeons) {
    $dungeonId = [string]$dungeon.challengeModeId
    foreach ($pool in $dungeon.pools) {
        $specId = [string]$pool.specId
        if (-not $grid.ContainsKey($specId)) {
            $grid[$specId] = New-Object System.Collections.Hashtable
        }
        $specGrid = $grid[$specId]
        if (-not $specGrid.ContainsKey($dungeonId)) {
            $specGrid[$dungeonId] = New-Object System.Collections.Hashtable
        }
        $dungeonGrid = $specGrid[$dungeonId]

        foreach ($itemId in (Get-AsArray $pool.gearItemIds)) {
            $item = Get-JsonProperty $itemsRoot "$itemId"
            if (-not $item) { continue }
            if ([int]$item.slotId -eq 14) { continue }

            $slotId = [string]$item.slotId
            if (-not $dungeonGrid.ContainsKey($slotId)) {
                $dungeonGrid[$slotId] = New-Object System.Collections.Generic.List[object]
            }

            $stats = New-Object System.Collections.Generic.List[string]
            foreach ($stat in (Get-AsArray $item.stats)) {
                $label = $StatLabels["$stat"]
                if (-not $label) { $label = [string]$stat }
                $stats.Add($label)
            }

            $entry = New-Object System.Collections.Hashtable
            $entry["id"] = [int]$itemId
            $entry["name"] = [string]$item.name
            $entry["droppedBy"] = $item.droppedBy
            $entry["stats"] = $stats.ToArray()
            $dungeonGrid[$slotId].Add($entry)
        }
    }
}

# Convert slot lists to arrays so the JSON writer emits [] not a dictionary.
$gridForJson = New-Object System.Collections.Hashtable
foreach ($specId in $grid.Keys) {
    $specOut = New-Object System.Collections.Hashtable
    foreach ($dungeonId in $grid[$specId].Keys) {
        $dungeonOut = New-Object System.Collections.Hashtable
        foreach ($slotId in $grid[$specId][$dungeonId].Keys) {
            $dungeonOut[$slotId] = $grid[$specId][$dungeonId][$slotId].ToArray()
        }
        $specOut[$dungeonId] = $dungeonOut
    }
    $gridForJson[$specId] = $specOut
}

$payload = New-Object System.Collections.Hashtable
$payload["meta"] = @{
    expansion    = [string]$data.meta.expansion
    seasonNumber = [int]$data.meta.seasonNumber
    wowBuild     = [string]$data.meta.wowBuild
    extractedAt  = [string]$data.meta.extractedAt
}
$payload["dungeons"] = $dungeons.ToArray()
$payload["slots"] = @($SlotOrder)
$payload["classes"] = $classes.ToArray()
$payload["grid"] = $gridForJson

$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
$outputDir = Split-Path -Parent $resolvedOutput
if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir | Out-Null
}

$js = "window.LOOT_DATA = " + (ConvertTo-JsonValue $payload) + ";`n"
[System.IO.File]::WriteAllText($resolvedOutput, $js)

Write-Host "Wrote $resolvedOutput"
Write-Host "  dungeons: $($dungeons.Count)"
Write-Host "  classes: $($classes.Count)"
Write-Host "  specs: $($gridForJson.Count)"
