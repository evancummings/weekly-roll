# Scrape Midnight Wowhead stat-priority guides for each spec.
#   powershell -File scripts/scrape-wowhead-stats.ps1
#
# Writes site/spec-stat-defaults.js as window.SPEC_STAT_DEFAULTS.

param(
    [string]$ChromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe",
    [string]$OutputPath = (Join-Path $PSScriptRoot "..\site\spec-stat-defaults.js"),
    [string]$CacheDir = (Join-Path $PSScriptRoot "..\site\_wowhead-cache")
)

$ErrorActionPreference = "Stop"

$Specs = @(
    @{ id = 71; classSlug = "warrior"; specSlug = "arms"; role = "dps"; name = "Arms Warrior" }
    @{ id = 72; classSlug = "warrior"; specSlug = "fury"; role = "dps"; name = "Fury Warrior" }
    @{ id = 73; classSlug = "warrior"; specSlug = "protection"; role = "tank"; name = "Protection Warrior" }
    @{ id = 65; classSlug = "paladin"; specSlug = "holy"; role = "healer"; name = "Holy Paladin" }
    @{ id = 66; classSlug = "paladin"; specSlug = "protection"; role = "tank"; name = "Protection Paladin" }
    @{ id = 70; classSlug = "paladin"; specSlug = "retribution"; role = "dps"; name = "Retribution Paladin" }
    @{ id = 253; classSlug = "hunter"; specSlug = "beast-mastery"; role = "dps"; name = "Beast Mastery Hunter" }
    @{ id = 254; classSlug = "hunter"; specSlug = "marksmanship"; role = "dps"; name = "Marksmanship Hunter" }
    @{ id = 255; classSlug = "hunter"; specSlug = "survival"; role = "dps"; name = "Survival Hunter" }
    @{ id = 259; classSlug = "rogue"; specSlug = "assassination"; role = "dps"; name = "Assassination Rogue" }
    @{ id = 260; classSlug = "rogue"; specSlug = "outlaw"; role = "dps"; name = "Outlaw Rogue" }
    @{ id = 261; classSlug = "rogue"; specSlug = "subtlety"; role = "dps"; name = "Subtlety Rogue" }
    @{ id = 256; classSlug = "priest"; specSlug = "discipline"; role = "healer"; name = "Discipline Priest" }
    @{ id = 257; classSlug = "priest"; specSlug = "holy"; role = "healer"; name = "Holy Priest" }
    @{ id = 258; classSlug = "priest"; specSlug = "shadow"; role = "dps"; name = "Shadow Priest" }
    @{ id = 250; classSlug = "death-knight"; specSlug = "blood"; role = "tank"; name = "Blood Death Knight" }
    @{ id = 251; classSlug = "death-knight"; specSlug = "frost"; role = "dps"; name = "Frost Death Knight" }
    @{ id = 252; classSlug = "death-knight"; specSlug = "unholy"; role = "dps"; name = "Unholy Death Knight" }
    @{ id = 262; classSlug = "shaman"; specSlug = "elemental"; role = "dps"; name = "Elemental Shaman" }
    @{ id = 263; classSlug = "shaman"; specSlug = "enhancement"; role = "dps"; name = "Enhancement Shaman" }
    @{ id = 264; classSlug = "shaman"; specSlug = "restoration"; role = "healer"; name = "Restoration Shaman" }
    @{ id = 62; classSlug = "mage"; specSlug = "arcane"; role = "dps"; name = "Arcane Mage" }
    @{ id = 63; classSlug = "mage"; specSlug = "fire"; role = "dps"; name = "Fire Mage" }
    @{ id = 64; classSlug = "mage"; specSlug = "frost"; role = "dps"; name = "Frost Mage" }
    @{ id = 265; classSlug = "warlock"; specSlug = "affliction"; role = "dps"; name = "Affliction Warlock" }
    @{ id = 266; classSlug = "warlock"; specSlug = "demonology"; role = "dps"; name = "Demonology Warlock" }
    @{ id = 267; classSlug = "warlock"; specSlug = "destruction"; role = "dps"; name = "Destruction Warlock" }
    @{ id = 268; classSlug = "monk"; specSlug = "brewmaster"; role = "tank"; name = "Brewmaster Monk" }
    @{ id = 269; classSlug = "monk"; specSlug = "windwalker"; role = "dps"; name = "Windwalker Monk" }
    @{ id = 270; classSlug = "monk"; specSlug = "mistweaver"; role = "healer"; name = "Mistweaver Monk" }
    @{ id = 102; classSlug = "druid"; specSlug = "balance"; role = "dps"; name = "Balance Druid" }
    @{ id = 103; classSlug = "druid"; specSlug = "feral"; role = "dps"; name = "Feral Druid" }
    @{ id = 104; classSlug = "druid"; specSlug = "guardian"; role = "tank"; name = "Guardian Druid" }
    @{ id = 105; classSlug = "druid"; specSlug = "restoration"; role = "healer"; name = "Restoration Druid" }
    @{ id = 577; classSlug = "demon-hunter"; specSlug = "havoc"; role = "dps"; name = "Havoc Demon Hunter" }
    @{ id = 581; classSlug = "demon-hunter"; specSlug = "vengeance"; role = "tank"; name = "Vengeance Demon Hunter" }
    @{ id = 1480; classSlug = "demon-hunter"; specSlug = "devourer"; role = "dps"; name = "Devourer Demon Hunter" }
    @{ id = 1467; classSlug = "evoker"; specSlug = "devastation"; role = "dps"; name = "Devastation Evoker" }
    @{ id = 1468; classSlug = "evoker"; specSlug = "preservation"; role = "healer"; name = "Preservation Evoker" }
    @{ id = 1473; classSlug = "evoker"; specSlug = "augmentation"; role = "dps"; name = "Augmentation Evoker" }
)

function Map-StatName([string]$Text) {
    $norm = ($Text -replace '\s+', ' ').Trim().ToLowerInvariant()
    if ($norm -match 'crit') { return "crit" }
    if ($norm -match 'haste') { return "haste" }
    if ($norm -match 'mastery') { return "mastery" }
    if ($norm -match 'vers') { return "versatility" }
    return $null
}

function Get-StatsFromText([string]$Text) {
    $mapped = New-Object System.Collections.Generic.List[string]
    foreach ($part in [regex]::Split($Text, '\s*(?:=|>|/|,|\band\b)\s*')) {
        $stat = Map-StatName $part
        if ($stat -and -not $mapped.Contains($stat)) {
            $mapped.Add($stat)
        }
    }
    return @($mapped)
}

function Get-StatOrderFromHtml([string]$Html) {
    $orders = New-Object System.Collections.Generic.List[object]
    $olMatches = [regex]::Matches($Html, '(?is)<ol\b[^>]*>(.*?)</ol>')
    foreach ($ol in $olMatches) {
        $mapped = New-Object System.Collections.Generic.List[string]
        foreach ($li in [regex]::Matches($ol.Groups[1].Value, '(?is)<li\b[^>]*>(.*?)</li>')) {
            $text = (($li.Groups[1].Value -replace '(?is)<[^>]+>', ' ') -replace '\s+', ' ').Trim()
            foreach ($stat in (Get-StatsFromText $text)) {
                if (-not $mapped.Contains($stat)) { $mapped.Add($stat) }
            }
        }
        if ($mapped.Count -eq 4) {
            $orders.Add(@($mapped))
        }
    }
    if ($orders.Count -gt 0) { return $orders[0] }
    return $null
}

if (-not (Test-Path $ChromePath)) {
    throw "Chrome not found at $ChromePath"
}

New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null
$results = [ordered]@{}
$missing = New-Object System.Collections.Generic.List[string]

foreach ($spec in $Specs) {
    $urls = @(
        "https://www.wowhead.com/guide/classes/$($spec.classSlug)/$($spec.specSlug)/stat-priority-pve-$($spec.role)"
        "https://www.wowhead.com/guide/classes/$($spec.classSlug)/$($spec.specSlug)/stat-priority"
    )
    $cacheFile = Join-Path $CacheDir "$($spec.id).html"
    Write-Host "Fetching $($spec.name)..."
    $order = $null
    if ((Test-Path $cacheFile) -and (Get-Item $cacheFile).Length -gt 20000) {
        $order = Get-StatOrderFromHtml (Get-Content -Raw -Encoding utf8 $cacheFile)
    }
    foreach ($url in $urls) {
        if ($order) { break }
        $args = @(
            "--headless=new"
            "--disable-gpu"
            "--disable-extensions"
            "--no-first-run"
            "--virtual-time-budget=6000"
            "--timeout=15000"
            "--dump-dom"
            $url
        )
        $proc = Start-Process -FilePath $ChromePath -ArgumentList $args -RedirectStandardOutput $cacheFile -RedirectStandardError (Join-Path $CacheDir "$($spec.id).err") -PassThru -WindowStyle Hidden
        if (-not $proc.WaitForExit(20000)) {
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
            Write-Host "  timed out $url"
            continue
        }
        if ((Test-Path $cacheFile) -and (Get-Item $cacheFile).Length -gt 20000) {
            $order = Get-StatOrderFromHtml (Get-Content -Raw -Encoding utf8 $cacheFile)
        }
    }
    if ($order) {
        $results["$($spec.id)"] = $order
        Write-Host ("  {0}: {1}" -f $spec.id, ($order -join " > "))
    } else {
        $missing.Add($spec.name)
        Write-Host "  FAILED $($spec.name)"
    }
}

$resolved = [System.IO.Path]::GetFullPath($OutputPath)
$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("window.SPEC_STAT_DEFAULTS = {")
$keys = @($results.Keys)
for ($i = 0; $i -lt $keys.Count; $i++) {
    $id = $keys[$i]
    $quoted = ($results[$id] | ForEach-Object { '"' + $_ + '"' }) -join ", "
    $comma = if ($i -lt $keys.Count - 1) { "," } else { "" }
    $lines.Add(('  "{0}": [{1}]{2}' -f $id, $quoted, $comma))
}
$lines.Add("};")
$lines.Add("")
[System.IO.File]::WriteAllLines($resolved, $lines)

Write-Host "Wrote $resolved ($($results.Count) specs)"
if ($missing.Count) {
    Write-Host "Missing: $($missing -join ', ')"
}
