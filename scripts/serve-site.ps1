# Serve site/ for local preview.
#   powershell -File scripts/serve-site.ps1
param(
    [int]$Port = 8765
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\site")).Path
$prefix = "http://127.0.0.1:$Port/"

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "Preview: $prefix"
Write-Host "Serving $root"
Write-Host "Press Ctrl+C to stop."

$types = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
}

try {
    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        $path = $ctx.Request.Url.AbsolutePath.TrimStart("/")
        if ([string]::IsNullOrWhiteSpace($path)) { $path = "index.html" }
        $full = [System.IO.Path]::GetFullPath((Join-Path $root $path))
        if (-not $full.StartsWith($root) -or -not (Test-Path $full) -or (Get-Item $full).PSIsContainer) {
            $ctx.Response.StatusCode = 404
            $ctx.Response.Close()
            continue
        }
        $bytes = [System.IO.File]::ReadAllBytes($full)
        $ext = [System.IO.Path]::GetExtension($full)
        $ctx.Response.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { "application/octet-stream" }
        $ctx.Response.Headers.Set("Cache-Control", "no-store")
        $ctx.Response.ContentLength64 = $bytes.Length
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        $ctx.Response.Close()
    }
}
finally {
    $listener.Stop()
}
