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

Write-Host "pythonw: $pythonw"
