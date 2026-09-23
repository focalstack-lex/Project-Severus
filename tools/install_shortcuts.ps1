# Creates the Severus native shortcuts:
#   1. Desktop shortcut to launch Severus on demand
#   2. Startup-folder shortcut so it boots with the laptop
# Cleans up any retired legacy Python "Second Brain.lnk" shortcuts.
# Run once:  powershell -NoProfile -ExecutionPolicy Bypass -File install_shortcuts.ps1

$ErrorActionPreference = "Stop"

$desktop = [Environment]::GetFolderPath("Desktop")
$startup = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"

# Clean up retired Python Second Brain shortcuts
if (Test-Path "$desktop\Second Brain.lnk") {
    Remove-Item -Path "$desktop\Second Brain.lnk" -Force
    Write-Host "Removed legacy: $desktop\Second Brain.lnk"
}
if (Test-Path "$startup\Second Brain.lnk") {
    Remove-Item -Path "$startup\Second Brain.lnk" -Force
    Write-Host "Removed legacy: $startup\Second Brain.lnk"
}

$ws = New-Object -ComObject WScript.Shell
$icon = "C:\Users\User\Documents\Severus\desktop\src-tauri\icons\icon.ico"

# Native Severus Tauri Desktop Companion shortcut
# Resolve the real artifact: Cargo emits severus-secondbrain.exe, while Tauri
# bundling has also produced severus_secondbrain.exe inside deps\.
$severusCandidates = @(
    "C:\Users\User\Documents\Severus\desktop\src-tauri\target\release\severus-secondbrain.exe",
    "C:\Users\User\Documents\Severus\desktop\src-tauri\target\release\severus_secondbrain.exe",
    "C:\Users\User\Documents\Severus\desktop\src-tauri\target\release\deps\severus_secondbrain.exe",
    "C:\Users\User\Documents\Severus\desktop\src-tauri\target\debug\severus-secondbrain.exe",
    "$env:LOCALAPPDATA\Severus.ai\severus-secondbrain.exe"
)
$severusBin = $null
foreach ($candidate in $severusCandidates) {
    if ($candidate -and (Test-Path $candidate)) { $severusBin = $candidate; break }
}

if ($severusBin) {
    Write-Host "Resolved Severus binary: $severusBin"
} else {
    Write-Warning "No Severus binary found. Run 'severus build' first. Checked: $($severusCandidates -join '; ')"
}

if ($severusBin) {
    $desktopSeverus = $ws.CreateShortcut("$desktop\Severus.lnk")
    $desktopSeverus.TargetPath = $severusBin
    $desktopSeverus.WorkingDirectory = "C:\Users\User\Documents\Severus\desktop"
    $desktopSeverus.IconLocation = $icon
    $desktopSeverus.Hotkey = "Ctrl+Alt+S"
    $desktopSeverus.Description = "Severus - Desktop Companion (Summon: Ctrl+Alt+S)"
    $desktopSeverus.Save()
    Write-Host "Created: $desktop\Severus.lnk (Global Hotkey: Ctrl+Alt+S)"

    $startupSeverus = $ws.CreateShortcut("$startup\Severus.lnk")
    $startupSeverus.TargetPath = $severusBin
    $startupSeverus.WorkingDirectory = "C:\Users\User\Documents\Severus\desktop"
    $startupSeverus.IconLocation = $icon
    $startupSeverus.Hotkey = "Ctrl+Alt+S"
    $startupSeverus.Description = "Severus - Desktop Companion boots at login (Summon: Ctrl+Alt+S)"
    $startupSeverus.Save()
    Write-Host "Created: Startup\Severus.lnk (Global Hotkey: Ctrl+Alt+S)"

    # Register severus CLI in WindowsApps shim folder (instantly reachable in PATH)
    $winApps = "$env:LOCALAPPDATA\Microsoft\WindowsApps"
    if (Test-Path $winApps) {
        Copy-Item -Path "$PSScriptRoot\severus.cmd" -Destination "$winApps\severus.cmd" -Force
        Copy-Item -Path "$PSScriptRoot\severus.ps1" -Destination "$winApps\severus.ps1" -Force
        Write-Host "Registered CLI: $winApps\severus.cmd (accessible globally via 'severus')"
    }

    # Also ensure tools folder is persistently in User PATH
    $toolsDir = "C:\Users\User\Documents\Severus\tools"
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($userPath -notlike "*$toolsDir*") {
        [Environment]::SetEnvironmentVariable("Path", "$userPath;$toolsDir", "User")
        Write-Host "Appended to User PATH: $toolsDir"
    }
} else {
    Write-Warning "Severus binary not found at $severusBin"
}
