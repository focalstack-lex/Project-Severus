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
$JournalDir = Join-Path $SeverusRoot "journal"
$TodayStr = Get-Date -Format "yyyy-MM-dd"
$TodayJournal = Join-Path $JournalDir "$TodayStr.md"

# Cargo emits the binary as severus-secondbrain.exe from the package name, but
# Tauri's bundling step has also produced severus_secondbrain.exe inside deps/.
# Resolve the real artifact instead of trusting one hardcoded path.
function Get-SeverusBinaryTargets {
    $rel = "src-tauri\target\release"
    return @(
        (Join-Path $DesktopDir "$rel\severus-secondbrain.exe"),
        (Join-Path $DesktopDir "$rel\severus_secondbrain.exe"),
        (Join-Path $DesktopDir "$rel\deps\severus_secondbrain.exe"),
        (Join-Path $DesktopDir "$rel\deps\severus-secondbrain.exe"),
        "C:\Program Files\Severus.ai\severus-secondbrain.exe",
        "C:\Program Files\Severus.ai\severus_secondbrain.exe",
        "C:\Program Files\Severus.ai\deps\severus_secondbrain.exe",
        "$env:LOCALAPPDATA\Severus.ai\severus-secondbrain.exe",
        "$env:LOCALAPPDATA\Severus.ai\severus_secondbrain.exe",
        "$env:LOCALAPPDATA\Severus.ai\deps\severus_secondbrain.exe"
    )
}

function Resolve-SeverusExe {
    foreach ($candidate in Get-SeverusBinaryTargets) {
        if ($candidate -and (Test-Path $candidate)) { return $candidate }
    }
    return $null
}

# PowerShell matches process names exactly, so the underscore and hyphen variants
# both have to be considered when looking for a running companion.
function Get-SeverusProcesses {
    return @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
        $_.ProcessName -like 'severus*secondbrain' -or $_.ProcessName -like 'severus.ai*'
    })
}

# Shortcuts, junctions and the sync/rollback helpers all expect the hyphenated
# name at the root of target\release. Tauri's bundling has been leaving the
# artifact in deps\ instead, which silently broke every one of those launchers.
function Ensure-CanonicalBinary {
    $canonical = Join-Path $DesktopDir "src-tauri\target\release\severus-secondbrain.exe"
    if (Test-Path $canonical) { return $canonical }

    foreach ($fallback in @(
        (Join-Path $DesktopDir "src-tauri\target\release\severus_secondbrain.exe"),
        (Join-Path $DesktopDir "src-tauri\target\release\deps\severus_secondbrain.exe"),
        (Join-Path $DesktopDir "src-tauri\target\release\deps\severus-secondbrain.exe")
    )) {
        if (-not (Test-Path $fallback)) { continue }
        Copy-Item -Path $fallback -Destination $canonical -Force -ErrorAction SilentlyContinue
        if (Test-Path $canonical) {
            Write-Host "[Severus Build] Normalized release binary to canonical path: $canonical" -ForegroundColor DarkCyan
            return $canonical
        }
    }
    return $null
}

$ReleaseExe = Resolve-SeverusExe

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
    $proc = Get-SeverusProcesses | Select-Object -First 1
    if ($proc) {
        Write-Host "[Severus] Restarting active companion process (PID $($proc.Id)) to bring window to center..." -ForegroundColor Green
        $proc | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 300
    }
    if (-not $ReleaseExe -or -not (Test-Path $ReleaseExe)) {
        $ReleaseExe = Resolve-SeverusExe
    }
    if (-not $ReleaseExe) {
        Write-Host "[Severus] Executable not found. Run 'severus build' first." -ForegroundColor Red
        Write-Host "[Severus] Looked in: $($DesktopDir)\src-tauri\target\release (and deps)" -ForegroundColor DarkGray
        return
    }
    # Auto-start the local voice daemons if their ports are inactive.
    # 17493 renders speech, 17494 recognizes it offline. The Tauri window has no
    # speech service, so recognition depends entirely on the 17494 bridge.
    try {
        $voiceDaemons = @(
            @{ Port = 17493; Script = "cosyvoice_severus_server.py"; Label = "CosyVoice 2 (Hugging Face)" },
            @{ Port = 17494; Script = "whisper_severus_server.py"; Label = "Whisper offline recognition" }
        )
        foreach ($daemon in $voiceDaemons) {
            $conn = Test-NetConnection -ComputerName 127.0.0.1 -Port $daemon.Port -WarningAction SilentlyContinue
            if ($conn.TcpTestSucceeded) { continue }
            $daemonScript = Join-Path $ToolsDir $daemon.Script
            if (-not (Test-Path $daemonScript)) {
                Write-Host "[Severus] Warning: voice daemon script missing: $daemonScript" -ForegroundColor Yellow
                continue
            }
            Write-Host "[Severus] Auto-starting $($daemon.Label) voice engine on port $($daemon.Port)..." -ForegroundColor DarkCyan
            python -c "import subprocess, sys; subprocess.Popen([sys.executable, r'$daemonScript'], creationflags=0x08000000)" | Out-Null
        }
    } catch {
        Write-Host "[Severus] Warning: Auto-start of local voice daemons failed: $_" -ForegroundColor Yellow
    }

    Write-Host "[Severus] Launching native companion: $ReleaseExe" -ForegroundColor Cyan
    try {
        python -c "import subprocess; subprocess.Popen([r'$ReleaseExe'], cwd=r'$DesktopDir')" | Out-Null
    } catch {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = $ReleaseExe
        $psi.WorkingDirectory = $DesktopDir
        $psi.UseShellExecute = $true
        [System.Diagnostics.Process]::Start($psi) | Out-Null
    }
}

function Invoke-Status {
    Write-Host ""
    Write-Host "=== SEVERUS SYSTEM TELEMETRY DEBRIEF ===" -ForegroundColor Cyan
    
    # Process Status
    $proc = Get-SeverusProcesses | Select-Object -First 1
    if ($proc) {
        $memMB = [math]::Round($proc.WorkingSet64 / 1MB, 1)
        $procId = $proc.Id
        $startTimeStr = $proc.StartTime.ToString('hh:mm tt')
        Write-Host "Process:      ACTIVE (PID $procId, $memMB MB, started $startTimeStr)" -ForegroundColor Green
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
            $trimmedRun = $lastRun.Trim()
            Write-Host "Athletics:    $trimmedRun" -ForegroundColor Yellow
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

function New-Checkpoint {
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $tagName = "severus-pre-$timestamp"
    $checkDir = Join-Path $SeverusRoot ".severus\checkpoints"
    if (-not (Test-Path $checkDir)) {
        New-Item -ItemType Directory -Path $checkDir -Force | Out-Null
    }

    # 1. Create Git Tag
    Push-Location $SeverusRoot
    try {
        git tag $tagName 2>$null
        $gitRef = (git rev-parse HEAD 2>$null)
    } finally {
        Pop-Location
    }

    # 2. Backup Canonical Binary if exists
    $targetExe = Resolve-SeverusExe
    if (-not $targetExe) {
        $targetExe = Join-Path $DesktopDir "src-tauri\target\release\severus-secondbrain.exe"
    }
    $backupExe = Join-Path $checkDir "$tagName.exe"
    $binarySha = "none"
    if (Test-Path $targetExe) {
        Copy-Item -Path $targetExe -Destination $backupExe -Force
        $binarySha = (Get-FileHash -Path $targetExe -Algorithm SHA256).Hash
    }

    # 3. Create Manifest
    $manifest = @{
        tag = $tagName
        timestamp = $timestamp
        gitRef = $gitRef
        binarySha = $binarySha
        backupExe = $backupExe
        targetExe = $targetExe
    }
    $manifestJson = Join-Path $checkDir "$tagName.json"
    $manifest | ConvertTo-Json | Set-Content -Path $manifestJson -Encoding UTF8
    Write-Host "[Severus Checkpoint] Created pre-build checkpoint tag: $tagName" -ForegroundColor DarkCyan

    # 4. Enforce Retention Limit (default 10)
    $allManifests = Get-ChildItem -Path $checkDir -Filter "severus-pre-*.json" | Sort-Object CreationTime -Descending
    if ($allManifests.Count -gt 10) {
        $toRemove = $allManifests | Select-Object -Skip 10
        foreach ($oldItem in $toRemove) {
            $oldTag = $oldItem.BaseName
            $oldExe = Join-Path $checkDir "$oldTag.exe"
            Remove-Item $oldItem.FullName -Force -ErrorAction SilentlyContinue
            if (Test-Path $oldExe) { Remove-Item $oldExe -Force -ErrorAction SilentlyContinue }
            Push-Location $SeverusRoot
            git tag -d $oldTag 2>$null | Out-Null
            Pop-Location
            Write-Host "[Severus Checkpoint] Pruned old checkpoint: $oldTag" -ForegroundColor DarkGray
        }
    }
}

function Invoke-Rollback {
    Write-Host ""
    Write-Host "=== SEVERUS SYSTEM ROLLBACK DISPATCHER ===" -ForegroundColor Cyan
    $checkDir = Join-Path $SeverusRoot ".severus\checkpoints"
    if (-not (Test-Path $checkDir)) {
        Write-Host "Error: No checkpoints found in $checkDir" -ForegroundColor Red
        return
    }

    $latestManifestFile = Get-ChildItem -Path $checkDir -Filter "severus-pre-*.json" | Sort-Object CreationTime -Descending | Select-Object -First 1
    if (-not $latestManifestFile) {
        Write-Host "Error: No valid checkpoint manifest json found." -ForegroundColor Red
        return
    }

    $manifest = Get-Content $latestManifestFile.FullName -Raw | ConvertFrom-Json
    Write-Host "[Rollback] Restoring checkpoint $($manifest.tag) (Git: $($manifest.gitRef))..." -ForegroundColor Yellow

    # Stop active processes
    Invoke-Stop | Out-Null

    # Restore binary from backup across every known install location
    if (Test-Path $manifest.backupExe) {
        $restoredAny = $false
        foreach ($targetExe in Get-SeverusBinaryTargets) {
            $parent = Split-Path -Parent $targetExe
            if (-not (Test-Path $parent)) { continue }
            Copy-Item -Path $manifest.backupExe -Destination $targetExe -Force -ErrorAction SilentlyContinue
            if (Test-Path $targetExe) { $restoredAny = $true }
        }
        $canonicalExe = Resolve-SeverusExe
        if ($restoredAny -and $canonicalExe) {
            $restoredSha = (Get-FileHash -Path $canonicalExe -Algorithm SHA256).Hash
            Write-Host "[Rollback] Successfully restored binary SHA-256: $restoredSha across all targets." -ForegroundColor Green
        } else {
            Write-Host "[Rollback] Warning: Backup binary $($manifest.backupExe) could not be restored to any known location." -ForegroundColor Yellow
        }
    } else {
        Write-Host "[Rollback] Warning: Backup binary $($manifest.backupExe) not found." -ForegroundColor Yellow
    }

    Write-Host "[Rollback] Checkpoint $($manifest.tag) restored clean." -ForegroundColor Green
}

function Invoke-Build {
    Write-Host "[Severus Build] Creating pre-build checkpoint..." -ForegroundColor Cyan
    New-Checkpoint

    Write-Host "[Severus Build] Releasing any active process locks..." -ForegroundColor Cyan
    Invoke-Stop

    Write-Host "[Severus Build] Executing Tauri release compilation..." -ForegroundColor Cyan
    Push-Location $DesktopDir
    try {
        npx tauri build
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[Severus Build] Compilation & installer bundling successful." -ForegroundColor Green
            $builtExe = Ensure-CanonicalBinary
            if (-not $builtExe) { $builtExe = Resolve-SeverusExe }
            if ($builtExe) {
                Write-Host "[Severus Build] Verified release binary: $builtExe" -ForegroundColor DarkCyan
            } else {
                Write-Host "[Severus Build] Warning: no release binary found in target\release (checked deps too)." -ForegroundColor Yellow
            }
            $msiBundle = Join-Path $DesktopDir "src-tauri\target\release\bundle\msi\Severus.ai_0.1.0_x64_en-US.msi"
            $nsisBundle = Join-Path $DesktopDir "src-tauri\target\release\bundle\nsis\Severus.ai_0.1.0_x64-setup.exe"
            
            # Ensure Directory Junctions point to single canonical target
            $jScript = Join-Path $ToolsDir "setup_junctions.ps1"
            if (Test-Path $jScript) {
                powershell -ExecutionPolicy Bypass -File $jScript | Out-Null
                Write-Host "[Severus Build] Windows Directory Junctions verified: Program Files & AppData/Local point to canonical target." -ForegroundColor DarkGray
            }
            if (Test-Path $msiBundle) {
                Write-Host "[Severus Build] Verified fresh MSI installer bundle: $msiBundle" -ForegroundColor DarkCyan
            }
            if (Test-Path $nsisBundle) {
                Write-Host "[Severus Build] Verified fresh NSIS setup bundle: $nsisBundle" -ForegroundColor DarkCyan
            }
        } else {
            Write-Host "[Severus Build] Build exited with code $LASTEXITCODE" -ForegroundColor Red
        }
    } finally {
        Pop-Location
    }
}

function Invoke-Verify {
    Write-Host ""
    Write-Host "=== SEVERUS SYSTEM BEHAVIOURAL VERIFICATION SUITE ===" -ForegroundColor Cyan
    $failed = $false

    # 1. Rust Backend Suite
    Write-Host ""
    Write-Host "[Verify: Rust Backend] Executing cargo test --test harness..." -ForegroundColor Yellow
    Push-Location (Join-Path $DesktopDir "src-tauri")
    try {
        $cArgs = @("test", "--test", "harness", "--", "--nocapture")
        & cargo @cArgs
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[Verify: Rust Backend] FAIL - Rust harness assertions failed (code $LASTEXITCODE)." -ForegroundColor Red
            $failed = $true
        } else {
            Write-Host "[Verify: Rust Backend] PASS - All Rust backend behavioural assertions green." -ForegroundColor Green
        }
    } finally {
        Pop-Location
    }

    # 2. TypeScript Frontend Suite
    Write-Host ""
    Write-Host "[Verify: TS Frontend] Executing npx tsx src/tests/behaviour.test.ts..." -ForegroundColor Yellow
    Push-Location $DesktopDir
    try {
        $tArgs = @("tsx", "src/tests/behaviour.test.ts")
        & npx @tArgs
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[Verify: TS Frontend] FAIL - TypeScript assertions failed (code $LASTEXITCODE)." -ForegroundColor Red
            $failed = $true
        } else {
            Write-Host "[Verify: TS Frontend] PASS - All TypeScript behavioural assertions green." -ForegroundColor Green
        }
    } finally {
        Pop-Location
    }

    Write-Host ""
    if ($failed) {
        Write-Host "=== VERIFICATION FAILED - DO NOT RELEASE ===" -ForegroundColor Red
        $global:LASTEXITCODE = 1
        return
    } else {
        Write-Host "=== VERIFICATION PASSED CLEAN ===" -ForegroundColor Green
        $global:LASTEXITCODE = 0
        return
    }
}

function Invoke-Stop {
    $procs = Get-SeverusProcesses
    if ($procs.Count -gt 0) {
        $count = $procs.Count
        $procs | Stop-Process -Force
        Write-Host "[Severus] Terminated companion process count: $count" -ForegroundColor Yellow
    } else {
        Write-Host "[Severus] No active companion process found." -ForegroundColor DarkGray
    }
}

function Invoke-LintDirectives {
    $lintScript = Join-Path $ToolsDir "lint_directives.py"
    if (-not (Test-Path $lintScript)) {
        Write-Host "Error: lint_directives.py not found at $lintScript" -ForegroundColor Red
        return
    }
    python $lintScript
    if ($LASTEXITCODE -ne 0) {
        $global:LASTEXITCODE = 1
    } else {
        $global:LASTEXITCODE = 0
    }
}

switch ($Command.ToLower()) {
    "open"            { Invoke-Open }
    "launch"          { Invoke-Open }
    "start"           { Invoke-Open }
    "status"          { Invoke-Status }
    "log"             { Invoke-Log }
    "today"           { Invoke-Today }
    "run"             { Invoke-Open }
    "running"         { Invoke-Open }
    "memory"          { Invoke-Memory }
    "graph"           { Invoke-Graph }
    "build"           { Invoke-Build }
    "checkpoint"      { New-Checkpoint }
    "rollback"        { Invoke-Rollback }
    "verify"          { Invoke-Verify }
    "test"            { Invoke-Verify }
    "lint:directives" { Invoke-LintDirectives }
    "lint"            { Invoke-LintDirectives }
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
            Write-Host "Unknown command: $Command. Use 'severus help' for list of commands." -ForegroundColor Yellow
        }
    }
}
