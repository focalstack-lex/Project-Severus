# Severus Directory Junction Target Collapser (P3)
# Replaces duplicate target folders with Windows directory junctions (/J)

$canonical = "C:\Users\User\Documents\Severus\desktop\src-tauri\target\release"
$progFiles = "C:\Program Files\Severus.ai"
$appData = "$env:LOCALAPPDATA\Severus.ai"

Write-Host "[Severus Junction] Establishing single canonical binary target: $canonical" -ForegroundColor Cyan

# 1. Junction C:\Program Files\Severus.ai
if (Test-Path $progFiles) {
    $item = Get-Item $progFiles
    if ($item.Attributes -notmatch "ReparsePoint") {
        Remove-Item $progFiles -Recurse -Force -ErrorAction SilentlyContinue
    }
}
if (-not (Test-Path $progFiles)) {
    cmd /c mklink /J "$progFiles" "$canonical" | Out-Null
}

# 2. Junction AppData\Local\Severus.ai
if (Test-Path $appData) {
    $item = Get-Item $appData
    if ($item.Attributes -notmatch "ReparsePoint") {
        Remove-Item $appData -Recurse -Force -ErrorAction SilentlyContinue
    }
}
if (-not (Test-Path $appData)) {
    cmd /c mklink /J "$appData" "$canonical" | Out-Null
}

# Verification
$progFilesValid = (Get-Item $progFiles).Attributes -match "ReparsePoint"
$appDataValid = (Get-Item $appData).Attributes -match "ReparsePoint"

if ($progFilesValid -and $appDataValid) {
    Write-Host "[Severus Junction] SUCCESS — Both Program Files and AppData/Local resolve to canonical target via Junction." -ForegroundColor Green
} else {
    Write-Host "[Severus Junction] WARNING — Junction creation check: ProgramFiles=$progFilesValid, AppData=$appDataValid" -ForegroundColor Yellow
}
