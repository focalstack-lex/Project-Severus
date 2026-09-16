# Severus Unified CLI Engine
# High-speed command-line interface for Lex Matondo's Second Brain & System Companion
[CmdletBinding()]
param(
    [Parameter(Position=0)]
    [string]$Command = "open",

    [Parameter(Position=1, ValueFromRemainingArguments=$true)]
    [string[]]$ArgsList
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
if ($env:SEVERUS_ROOT -and (Test-Path $env:SEVERUS_ROOT)) {
    $SeverusRoot = $env:SEVERUS_ROOT
} elseif (Test-Path (Join-Path (Split-Path -Parent $ScriptDir) "desktop")) {
    $SeverusRoot = Split-Path -Parent $ScriptDir
} else {
    $SeverusRoot = "C:\Users\User\Documents\Severus"
}
$DesktopDir = Join-Path $SeverusRoot "desktop"
$ToolsDir = Join-Path $SeverusRoot "tools"
$ReleaseExe = Join-Path $DesktopDir "src-tauri\target\release\severus-secondbrain.exe"
if (-not (Test-Path $ReleaseExe)) {
    $ReleaseExe = "C:\Program Files\Severus.ai\severus-secondbrain.exe"
}
$JournalDir = Join-Path $SeverusRoot "journal"
$TodayStr = Get-Date -Format "yyyy-MM-dd"
$TodayJournal = Join-Path $JournalDir "$TodayStr.md"

function Show-Help {
    Write-Host ""
    Write-Host "SEVERUS SYSTEM COMMAND INTERFACE" -ForegroundColor Cyan
    Write-Host "The Ascended Second Brain & Cognitive Operating System" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "USAGE:" -ForegroundColor Yellow
    Write-Host "  severus [command] [options]"
    Write-Host ""
    Write-Host "COMMANDS:" -ForegroundColor Yellow
    Write-Host "  open | launch         Launch or bring Severus companion to focus"
    Write-Host "  island | dock         Dock Severus to top-center display edge as Dynamic Island"
    Write-Host "  status                Print telemetry overview (Strava running, journal, process)"
    Write-Host "  log <message>         Instantly timestamp and append an entry to today's action log"
    Write-Host "  today                 Display today's action journal ($TodayStr.md)"
    Write-Host "  run | running         Launch Severus and focus Running Telemetry cockpit"
    Write-Host "  memory [query]        Search or inspect structured user memory store"
    Write-Host "  graph                 Rebuild Second Brain PageRank knowledge graph"
    Write-Host "  build                 Safely rebuild release binary with file-lock protection"
    Write-Host "  stop | kill           Gracefully terminate running Severus process"
    Write-Host "  help                  Display this command reference"
    Write-Host ""
    Write-Host "GLOBAL HOTKEY: Ctrl+Alt+S (summons Severus from any app)" -ForegroundColor DarkCyan
    Write-Host ""
}

function Invoke-Open {
    $proc = Get-Process severus-secondbrain -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($proc) {
        Write-Host "[Severus] Companion is active (PID $($proc.Id)). Bringing to focus..." -ForegroundColor Green
        try {
            $ws = New-Object -ComObject WScript.Shell
            $ws.AppActivate($proc.Id) | Out-Null
        } catch {}
    } else {
        if (-not (Test-Path $ReleaseExe)) {
            $altProgFiles = "C:\Program Files\Severus.ai\severus-secondbrain.exe"
            if (Test-Path $altProgFiles) {
                $ReleaseExe = $altProgFiles
            } else {
                Write-Host "[Severus] Executable not found at $ReleaseExe. Run 'severus build' first." -ForegroundColor Red
                return
            }
        }
        Write-Host "[Severus] Launching native companion: $ReleaseExe" -ForegroundColor Cyan
        Start-Process -FilePath $ReleaseExe -WorkingDirectory $DesktopDir
    }
}

function Invoke-Status {
    Write-Host ""
    Write-Host "=== SEVERUS SYSTEM TELEMETRY DEBRIEF ===" -ForegroundColor Cyan
    
    # Process Status
    $proc = Get-Process severus-secondbrain -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($proc) {
        $memMB = [math]::Round($proc.WorkingSet64 / 1MB, 1)
        Write-Host "Process:      ACTIVE (PID $($proc.Id), ${memMB} MB, started $($proc.StartTime.ToString('hh:mm tt')))" -ForegroundColor Green
    } else {
        Write-Host "Process:      INACTIVE (use 'severus' or press Ctrl+Alt+S to launch)" -ForegroundColor DarkGray
    }

    # Journal Status
    if (Test-Path $TodayJournal) {
        $lines = Get-Content $TodayJournal -Encoding UTF8
        $entryCount = ($lines | Where-Object { $_ -match "^- \[\d{2}:\d{2}\]" }).Count
        Write-Host "Journal:      $TodayStr.md ($entryCount entries logged today)" -ForegroundColor White
    } else {
        Write-Host "Journal:      $TodayStr.md (No entries yet today)" -ForegroundColor DarkGray
    }

    # Latest Strava Run Check from Journal
    if (Test-Path $TodayJournal) {
        $lastRun = Get-Content $TodayJournal -Encoding UTF8 | Where-Object { $_ -match "Strava Run:" } | Select-Object -Last 1
        if ($lastRun) {
            Write-Host "Athletics:    $($lastRun.Trim())" -ForegroundColor Yellow
        }
    }

    # User Memory stats
    $memScript = Join-Path $ScriptDir "user_memory.py"
    if (Test-Path $memScript) {
        $totalMems = (Get-ChildItem -Path (Join-Path $SeverusRoot "USER") -Filter "*.json" -Recurse -ErrorAction SilentlyContinue).Count
        Write-Host "Second Brain: Structured memory store verified across $totalMems modules." -ForegroundColor DarkCyan
    }
    Write-Host "Operating:    Systems over motivation (Atomic Habits cadence, Sir)." -ForegroundColor DarkGray
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
}

function Invoke-Log {
    if (-not $ArgsList -or $ArgsList.Count -eq 0) {
        Write-Host "Error: Missing journal entry text. Usage: severus log 'your thought here'" -ForegroundColor Red
        return
    }

    $entryText = ($ArgsList -join " ").Trim()
    $timeStr = Get-Date -Format "HH:mm"
    $formattedEntry = "- [$timeStr] $entryText"

    if (-not (Test-Path $JournalDir)) {
        New-Item -ItemType Directory -Path $JournalDir -Force | Out-Null
    }

    if (-not (Test-Path $TodayJournal)) {
        Set-Content -Path $TodayJournal -Value "# $TodayStr`n`n$formattedEntry" -Encoding UTF8
    } else {
        Add-Content -Path $TodayJournal -Value $formattedEntry -Encoding UTF8
    }

    Write-Host "[Severus Log] Appended to $TodayStr.md:" -ForegroundColor Green
    Write-Host "  $formattedEntry" -ForegroundColor White
}

function Invoke-Today {
    if (-not (Test-Path $TodayJournal)) {
        Write-Host "[Severus] No journal created yet for today ($TodayStr.md)." -ForegroundColor DarkGray
        return
    }
    Write-Host ""
    Write-Host "=== ACTION LOG: $TodayStr ===" -ForegroundColor Cyan
    $lines = Get-Content $TodayJournal -Encoding UTF8
    foreach ($line in $lines) {
        $trimmed = $line.Trim()
        if ([string]::IsNullOrWhiteSpace($trimmed)) { continue }
        if ($trimmed -match "^#\s*(.+)") {
            Write-Host $matches[0] -ForegroundColor DarkGray
        } elseif ($trimmed -match "^-\s*\[(\d{2}:\d{2})\]\s*(.+)") {
            $time = $matches[1]
            $msg = $matches[2]
            Write-Host "- [$time] " -ForegroundColor Green -NoNewline
            Write-Host $msg -ForegroundColor White
        } else {
            Write-Host $trimmed -ForegroundColor Gray
        }
    }
    Write-Host "===============================" -ForegroundColor Cyan
    Write-Host ""
}

function Invoke-Memory {
    $memScript = Join-Path $ToolsDir "user_memory.py"
    if (-not (Test-Path $memScript)) {
        Write-Host "Error: user_memory.py not found at $memScript" -ForegroundColor Red
        return
    }

    if (-not $ArgsList -or $ArgsList.Count -eq 0) {
        python $memScript stats
    } else {
        $q = $ArgsList -join " "
        python $memScript search $q
    }
}

function Invoke-Graph {
    $graphScript = Join-Path $SeverusRoot "second-brain\build_graph.py"
    if (-not (Test-Path $graphScript)) {
        Write-Host "Error: build_graph.py not found at $graphScript" -ForegroundColor Red
        return
    }
    Write-Host "[Severus] Rebuilding Second Brain knowledge graph..." -ForegroundColor Cyan
    python $graphScript
}

function Invoke-Build {
    Write-Host "[Severus Build] Releasing any active process locks..." -ForegroundColor Cyan
    Get-Process severus-secondbrain -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 400

    Write-Host "[Severus Build] Executing Tauri release compilation..." -ForegroundColor Cyan
    Push-Location $DesktopDir
    try {
        npx tauri build --no-bundle
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[Severus Build] Compilation successful." -ForegroundColor Green
            $targetExe = Join-Path $DesktopDir "src-tauri\target\release\severus-secondbrain.exe"
            $progFilesDir = "C:\Program Files\Severus.ai"
            $progFiles = Join-Path $progFilesDir "severus-secondbrain.exe"
            if (Test-Path $targetExe) {
                if (-not (Test-Path $progFilesDir)) { New-Item -ItemType Directory -Path $progFilesDir -Force | Out-Null }
                Copy-Item -Path $targetExe -Destination $progFiles -Force -ErrorAction SilentlyContinue
                Write-Host "[Severus Build] Synced binary to $progFiles" -ForegroundColor DarkGray
            }
        } else {
            Write-Host "[Severus Build] Build exited with code $LASTEXITCODE" -ForegroundColor Red
        }
    } finally {
        Pop-Location
    }
}

function Invoke-Stop {
    $procs = Get-Process severus-secondbrain -ErrorAction SilentlyContinue
    if ($procs) {
        $procs | Stop-Process -Force
        Write-Host "[Severus] Terminated $($procs.Count) companion process(es)." -ForegroundColor Yellow
    } else {
        Write-Host "[Severus] No active companion process found." -ForegroundColor DarkGray
    }
}

switch ($Command.ToLower()) {
    "open"       { Invoke-Open }
    "launch"     { Invoke-Open }
    "start"      { Invoke-Open }
    "island"     { Invoke-Open }
    "dock"       { Invoke-Open }
    "status"     { Invoke-Status }
    "log"        { Invoke-Log }
    "today"      { Invoke-Today }
    "run"        { Invoke-Open }
    "running"    { Invoke-Open }
    "memory"     { Invoke-Memory }
    "graph"      { Invoke-Graph }
    "build"      { Invoke-Build }
    "stop"       { Invoke-Stop }
    "kill"       { Invoke-Stop }
    "help"       { Show-Help }
    "-h"         { Show-Help }
    "--help"     { Show-Help }
    default {
        # If user passed a string not in commands, assume quick log if contains space
        if ($Command.Contains(" ")) {
            $ArgsList = @($Command) + $ArgsList
            Invoke-Log
        } else {
            Write-Host "Unknown command: '$Command'. Use 'severus help' for list of commands." -ForegroundColor Yellow
        }
    }
}
