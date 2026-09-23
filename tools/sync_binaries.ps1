# Syncs the newly built target release binary across all 3 execution locations
$ErrorActionPreference = "Stop"

# Resolve the real artifact instead of trusting one hardcoded name: Cargo emits
# severus-secondbrain.exe, while Tauri bundling has also produced
# severus_secondbrain.exe inside deps\.
$releaseDir = "C:\Users\User\Documents\Severus\desktop\src-tauri\target\release"
$src = $null
foreach ($candidate in @(
    (Join-Path $releaseDir "severus-secondbrain.exe"),
    (Join-Path $releaseDir "severus_secondbrain.exe"),
    (Join-Path $releaseDir "deps\severus_secondbrain.exe")
)) {
    if (Test-Path $candidate) { $src = $candidate; break }
}
if (-not $src) {
    Write-Host "ERROR: No release binary found under $releaseDir. Run 'severus build' first." -ForegroundColor Red
    exit 1
}
Write-Host "Source binary: $src"

$targets = @(
    "C:\Program Files\Severus.ai\severus-secondbrain.exe",
    "$env:LOCALAPPDATA\Severus.ai\severus-secondbrain.exe"
)

# Terminate running instances (both the hyphen and underscore executable names)
Get-Process -ErrorAction SilentlyContinue |
    Where-Object { $_.ProcessName -like 'severus*secondbrain' } |
    Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

$srcHash = (Get-FileHash -Path $src -Algorithm SHA256).Hash
Write-Host "SHA256 Source:   $srcHash"

foreach ($target in $targets) {
    $parent = Split-Path -Parent $target
    if (-not (Test-Path $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }

    # A junction may already resolve this path onto the source, in which case the
    # copy is a no-op Windows rejects: compare hashes first and skip.
    if (Test-Path $target) {
        $existingHash = (Get-FileHash -Path $target -Algorithm SHA256 -ErrorAction SilentlyContinue).Hash
        if ($existingHash -eq $srcHash) {
            Write-Host "Already in parity: $target" -ForegroundColor DarkGray
            continue
        }
    }

    Copy-Item -Path $src -Destination $target -Force
    Write-Host "Synced to: $target"
}

# Verify hashes across every location that exists
$allMatch = $true
foreach ($target in $targets) {
    if (-not (Test-Path $target)) { continue }
    $hash = (Get-FileHash -Path $target -Algorithm SHA256).Hash
    Write-Host "SHA256 $($target): $hash"
    if ($hash -ne $srcHash) { $allMatch = $false }
}

if ($allMatch) {
    Write-Host "SUCCESS: All binaries are in 100% parity!" -ForegroundColor Green
} else {
    Write-Host "ERROR: Hash mismatch detected!" -ForegroundColor Red
    exit 1
}
