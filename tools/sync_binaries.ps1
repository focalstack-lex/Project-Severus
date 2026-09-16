# Syncs the newly built target release binary across all 3 execution locations
$ErrorActionPreference = "Stop"

$src = "C:\Users\User\Documents\Severus\desktop\src-tauri\target\release\severus-secondbrain.exe"
$progFiles = "C:\Program Files\Severus.ai\severus-secondbrain.exe"
$appData = "$env:LOCALAPPDATA\Severus.ai\severus-secondbrain.exe"

# Terminate running instances
Get-Process severus-secondbrain -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

# Copy to Program Files
if (Test-Path "C:\Program Files\Severus.ai") {
    Copy-Item -Path $src -Destination $progFiles -Force
    Write-Host "Synced to: $progFiles"
}

# Copy to AppData Local
$appDataDir = "$env:LOCALAPPDATA\Severus.ai"
if (-not (Test-Path $appDataDir)) {
    New-Item -ItemType Directory -Path $appDataDir -Force | Out-Null
}
Copy-Item -Path $src -Destination $appData -Force
Write-Host "Synced to: $appData"

# Verify hashes
$h1 = (Get-FileHash $src).Hash
$h2 = (Get-FileHash $progFiles).Hash
$h3 = (Get-FileHash $appData).Hash

Write-Host "SHA256 Target:   $h1"
Write-Host "SHA256 ProgFiles:$h2"
Write-Host "SHA256 AppData:  $h3"

if ($h1 -eq $h2 -and $h2 -eq $h3) {
    Write-Host "SUCCESS: All binaries are in 100% parity!" -ForegroundColor Green
} else {
    Write-Host "ERROR: Hash mismatch detected!" -ForegroundColor Red
}
