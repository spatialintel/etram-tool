# Sync canonical webapp source → local run mirror (for npm on G: drive issues).
# Canonical (edit here): <project>/webapp
# Run mirror:           C:\temp\etram-webapp
#
# Usage:
#   .\scripts\sync_webapp_local.ps1
#   .\scripts\sync_webapp_local.ps1 -Pull   # reverse: local → canonical (only if you edited on C:)

param(
  [switch]$Pull
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Canonical = Join-Path $ProjectRoot "webapp"
$Local = "C:\temp\etram-webapp"

if (-not (Test-Path $Canonical)) { throw "Canonical webapp missing: $Canonical" }

$src = if ($Pull) { $Local } else { $Canonical }
$dst = if ($Pull) { $Canonical } else { $Local }

if (-not (Test-Path $src)) { throw "Source missing: $src" }
New-Item -ItemType Directory -Force -Path $dst | Out-Null

$excludeDirs = @("node_modules", "dist", ".vite")
Write-Host "Syncing $src -> $dst"
Write-Host "Excluding: $($excludeDirs -join ', ')"

# Robocopy mirrors source files; /XD skips heavy/local-only dirs
$xd = @()
foreach ($d in $excludeDirs) { $xd += @("/XD", $d) }
$args = @($src, $dst, "/MIR", "/NFL", "/NDL", "/NJH", "/NJS", "/nc", "/ns", "/np") + $xd
& robocopy @args | Out-Null
$code = $LASTEXITCODE
if ($code -ge 8) { throw "robocopy failed with exit $code" }

Write-Host "Done. Canonical source of truth remains: $Canonical"
if (-not $Pull) {
  Write-Host "Run UI from: cd $Local; npm install; npm run dev"
}
