# Creates the Second Brain shortcuts:
#   1. Desktop shortcut to launch the app on demand
#   2. Startup-folder shortcut so it boots with the laptop (silent, via pythonw)
# Run once:  powershell -NoProfile -ExecutionPolicy Bypass -File install_shortcuts.ps1

$ErrorActionPreference = "Stop"

$pythonw = (Get-ChildItem "C:\Users\User\AppData\Local\Microsoft\WindowsApps" -Recurse -Filter "pythonw.exe" |
            Select-Object -First 1).FullName
if (-not $pythonw) { throw "pythonw.exe not found under WindowsApps" }

$app = "C:\Users\User\Documents\Severus\second-brain\app.py"
$dir = "C:\Users\User\Documents\Severus\second-brain"
$desktop = [Environment]::GetFolderPath("Desktop")

$ws = New-Object -ComObject WScript.Shell
$icon = "C:\Users\User\Documents\Severus\desktop\src-tauri\icons\icon.ico"

$sc = $ws.CreateShortcut("$desktop\Second Brain.lnk")
$sc.TargetPath = $pythonw
$sc.Arguments = "`"$app`""
$sc.WorkingDirectory = $dir
$sc.IconLocation = $icon
$sc.Description = "Second Brain - live 3D knowledge graph"
$sc.Save()
Write-Host "Created: $desktop\Second Brain.lnk"

$sc = $ws.CreateShortcut("$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\Second Brain.lnk")
$sc.TargetPath = $pythonw
$sc.Arguments = "`"$app`""
$sc.WorkingDirectory = $dir
$sc.IconLocation = $icon
$sc.Description = "Second Brain - boots at login"
$sc.Save()
Write-Host "Created: Startup\Second Brain.lnk"

# Native Severus Tauri Desktop Companion shortcut
$severusBin = "C:\Users\User\Documents\Severus\desktop\src-tauri\target\release\severus-secondbrain.exe"
if (-not (Test-Path $severusBin)) {
    $severusBin = "C:\Users\User\Documents\Severus\desktop\src-tauri\target\debug\severus-secondbrain.exe"
}

if (Test-Path $severusBin) {
    $desktopSeverus = $ws.CreateShortcut("$desktop\Severus.lnk")
    $desktopSeverus.TargetPath = $severusBin
    $desktopSeverus.WorkingDirectory = "C:\Users\User\Documents\Severus\desktop"
    $desktopSeverus.IconLocation = $icon
    $desktopSeverus.Description = "Severus - Desktop Companion & Knowledge Copilot"
    $desktopSeverus.Save()
    Write-Host "Created: $desktop\Severus.lnk"

    $startupSeverus = $ws.CreateShortcut("$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\Severus.lnk")
    $startupSeverus.TargetPath = $severusBin
    $startupSeverus.WorkingDirectory = "C:\Users\User\Documents\Severus\desktop"
    $startupSeverus.IconLocation = $icon
    $startupSeverus.Description = "Severus - Desktop Companion boots at login"
    $startupSeverus.Save()
    Write-Host "Created: Startup\Severus.lnk"
}
