# Scrape Midnight Wowhead BIS guides for S/A raid and Mythic+ trinkets.
#   powershell -File scripts/scrape-wowhead-trinkets.ps1
#
# Writes site/spec-trinket-defaults.js as window.SPEC_TRINKET_DEFAULTS.
# S-tier raid/M+ trinkets become "bis"; A-tier become "upgrade".

param(
    [string]$ChromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe",
    [string]$OutputPath = (Join-Path $PSScriptRoot "..\site\spec-trinket-defaults.js"),
    [string]$CacheDir = (Join-Path $PSScriptRoot "..\site\_wowhead-cache"),
    [int[]]$SpecId = @(),
    [int]$VirtualTimeBudget = 12000,
    [int]$WaitMs = 40000
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

function Get-TrinketRanksFromHtml([string]$Html) {
    $start = $Html.IndexOf('class="tier-list-rows')
    if ($start -lt 0) { $start = $Html.IndexOf("Trinket Tier List") }
    if ($start -lt 0) { return $null }

    $end = $Html.Length
    foreach ($marker in @('id="crafted-gear"', 'id="upgrading-gear"', "Best Crafted Gear")) {
        $at = $Html.IndexOf($marker, $start)
        if ($at -gt $start -and $at -lt $end) { $end = $at }
    }
    $chunk = $Html.Substring($start, $end - $start)
    $tokens = [regex]::Matches(
        $chunk,
        '(?is)class="tier-label[^>]*">\s*([SABCD])\s*<|data-quality="q([2-5])"|wowhead\.com/(?:ptr/)?item=(\d+)/[^"]*"|data-variation="wow-(epic|rare|uncommon|legendary)"'
    )
    $ranks = [ordered]@{
        raid = [ordered]@{}
        mplus = [ordered]@{}
    }
    $current = $null
    $pendingId = $null
    $pendingSrc = $null
    foreach ($tok in $tokens) {
        if ($tok.Groups[1].Success) {
            $current = $tok.Groups[1].Value
            $pendingId = $null
            $pendingSrc = $null
            continue
        }
        if ($tok.Groups[2].Success) {
            $pendingSrc = switch ($tok.Groups[2].Value) {
                "4" { "epic" }
                "3" { "rare" }
                "2" { "uncommon" }
                "5" { "legendary" }
                default { $null }
            }
            continue
        }
        if ($tok.Groups[3].Success) {
            $pendingId = $tok.Groups[3].Value
            $bucket = if ($pendingSrc -eq "epic") { "raid" } elseif ($pendingSrc -eq "rare") { "mplus" } else { $null }
            if ($pendingId -and $current -and $bucket) {
                if ($current -eq "S") {
                    $ranks[$bucket][$pendingId] = "bis"
                } elseif ($current -eq "A" -and $ranks[$bucket][$pendingId] -ne "bis") {
                    $ranks[$bucket][$pendingId] = "upgrade"
                }
            }
            continue
        }
        if (-not ($tok.Groups[4].Success -and $pendingId -and $current)) { continue }
        $src = $tok.Groups[4].Value
        if ($src -in @("uncommon", "legendary")) {
            $ranks.raid.Remove($pendingId)
            $ranks.mplus.Remove($pendingId)
        } elseif ($src -in @("epic", "rare")) {
            $bucket = if ($src -eq "epic") { "raid" } else { "mplus" }
            if ($current -eq "S") {
                $ranks[$bucket][$pendingId] = "bis"
            } elseif ($current -eq "A" -and $ranks[$bucket][$pendingId] -ne "bis") {
                $ranks[$bucket][$pendingId] = "upgrade"
            }
        }
        $pendingId = $null
        $pendingSrc = $null
    }
    if ($ranks.raid.Count -eq 0 -and $ranks.mplus.Count -eq 0) { return $null }
    return $ranks
}

function Test-WowheadDump([string]$Path) {
    if (-not (Test-Path $Path)) { return $false }
    if ((Get-Item $Path).Length -lt 80000) { return $false }
    $html = Get-Content -Raw -Encoding utf8 $Path
    if ($html -match '(?i)<title>\s*Page Not Found') { return $false }
    return $true
}

if (-not (Test-Path $ChromePath)) {
    throw "Chrome not found at $ChromePath"
}

New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null
$results = [ordered]@{}
$missing = New-Object System.Collections.Generic.List[string]
$toFetch = if ($SpecId.Count) { @($Specs | Where-Object { $SpecId -contains $_.id }) } else { $Specs }

foreach ($spec in $toFetch) {
    $urls = @(
        "https://www.wowhead.com/guide/classes/$($spec.classSlug)/$($spec.specSlug)/bis-gear"
        "https://www.wowhead.com/guide/classes/$($spec.classSlug)/$($spec.specSlug)/bis-gear-pve-$($spec.role)"
    )
    $cacheFile = Join-Path $CacheDir "$($spec.id)-bis.html"
    Write-Host "Fetching $($spec.name) trinkets..."
    $ranks = $null
    if (Test-WowheadDump $cacheFile) {
        $ranks = Get-TrinketRanksFromHtml (Get-Content -Raw -Encoding utf8 $cacheFile)
    }
    foreach ($url in $urls) {
        if ($ranks) { break }
        $tmpFile = "$cacheFile.tmp"
        $args = @(
            "--headless=new"
            "--disable-gpu"
            "--disable-extensions"
            "--no-first-run"
            "--virtual-time-budget=$VirtualTimeBudget"
            "--timeout=$([Math]::Max(25000, $VirtualTimeBudget + 15000))"
            "--dump-dom"
            $url
        )
        $errFile = Join-Path $CacheDir "$($spec.id)-bis.err"
        $proc = Start-Process -FilePath $ChromePath -ArgumentList $args -RedirectStandardOutput $tmpFile -RedirectStandardError $errFile -PassThru -WindowStyle Hidden
        if (-not $proc.WaitForExit($WaitMs)) {
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
            Write-Host "  timed out $url"
            Remove-Item $tmpFile -ErrorAction SilentlyContinue
            continue
        }
        if (-not (Test-WowheadDump $tmpFile)) {
            Write-Host "  skip unusable dump from $url"
            Remove-Item $tmpFile -ErrorAction SilentlyContinue
            continue
        }
        Copy-Item -Force $tmpFile $cacheFile
        Remove-Item $tmpFile -ErrorAction SilentlyContinue
        $ranks = Get-TrinketRanksFromHtml (Get-Content -Raw -Encoding utf8 $cacheFile)
    }
    if ($ranks) {
        $results["$($spec.id)"] = $ranks
        $raidS = @($ranks.raid.GetEnumerator() | Where-Object { $_.Value -eq "bis" }).Count
        $raidA = @($ranks.raid.GetEnumerator() | Where-Object { $_.Value -eq "upgrade" }).Count
        $mplusS = @($ranks.mplus.GetEnumerator() | Where-Object { $_.Value -eq "bis" }).Count
        $mplusA = @($ranks.mplus.GetEnumerator() | Where-Object { $_.Value -eq "upgrade" }).Count
        Write-Host ("  {0}: raid {1}S/{2}A, m+ {3}S/{4}A" -f $spec.id, $raidS, $raidA, $mplusS, $mplusA)
    } else {
        $missing.Add($spec.name)
        Write-Host "  FAILED $($spec.name)"
    }
}

function Format-RankMap($map) {
    if (-not $map -or $map.Count -eq 0) { return "{}" }
    $pairs = @($map.Keys | Sort-Object { [int]$_ } | ForEach-Object { '"{0}": "{1}"' -f $_, $map[$_] })
    return ("{{ {0} }}" -f ($pairs -join ", "))
}

function Parse-RankMap([string]$Text) {
    $ranks = [ordered]@{}
    foreach ($pair in [regex]::Matches($Text, '"(\d+)": "(bis|upgrade)"')) {
        $ranks[$pair.Groups[1].Value] = $pair.Groups[2].Value
    }
    return $ranks
}

if ($SpecId.Count -and (Test-Path $OutputPath)) {
    $existing = Get-Content -Raw -Encoding utf8 $OutputPath
    foreach ($match in [regex]::Matches($existing, '"(\d+)": \{ "raid": (\{[^}]*\}), "mplus": (\{[^}]*\}) \}')) {
        $id = $match.Groups[1].Value
        if ($results.Contains($id)) { continue }
        $ranks = [ordered]@{
            raid = Parse-RankMap $match.Groups[2].Value
            mplus = Parse-RankMap $match.Groups[3].Value
        }
        if ($ranks.raid.Count -or $ranks.mplus.Count) { $results[$id] = $ranks }
    }
}

$ordered = [ordered]@{}
foreach ($spec in $Specs) {
    $id = "$($spec.id)"
    if ($results.Contains($id)) { $ordered[$id] = $results[$id] }
}
$results = $ordered

$resolved = [System.IO.Path]::GetFullPath($OutputPath)
$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("// Wowhead Midnight Season 2 S/A raid and Mythic+ trinkets.")
$lines.Add("// Regenerated by scripts/scrape-wowhead-trinkets.ps1")
$lines.Add("// S-tier -> bis, A-tier -> upgrade. Split by raid (epic) and Mythic+ (rare).")
$lines.Add("window.SPEC_TRINKET_DEFAULTS = {")
$keys = @($results.Keys)
for ($i = 0; $i -lt $keys.Count; $i++) {
    $id = $keys[$i]
    $ranks = $results[$id]
    $comma = if ($i -lt $keys.Count - 1) { "," } else { "" }
    $lines.Add(('  "{0}": {{ "raid": {1}, "mplus": {2} }}{3}' -f $id, (Format-RankMap $ranks.raid), (Format-RankMap $ranks.mplus), $comma))
}
$lines.Add("};")
$lines.Add("")
[System.IO.File]::WriteAllLines($resolved, $lines)

Write-Host "Wrote $resolved ($($results.Count) specs)"
if ($missing.Count) {
    Write-Host "Missing: $($missing -join ', ')"
}
