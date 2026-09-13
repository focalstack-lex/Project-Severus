//! Windows system control — Tier 1/2: OS actions and window management.
//!
//! One module owns BOTH the grammar (pure, unit-tested) and the executors, so
//! voice, the Command Console, and the LLM fallback all share the same
//! allowlisted action set. Destructive intents (lock workstation, close a
//! window) require `confirmed = true` at the executor, which the renderer only
//! sets after the control-password gate.

use serde::{Deserialize, Serialize};

use crate::Paths;

// ---------------------------------------------------------------------------
// Intent model
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(tag = "action", content = "arg", rename_all = "snake_case")]
pub enum SystemIntent {
    LaunchApp(String),
    OpenKnownFolder(String),
    OpenPath(String),
    VolumeSet(u8),
    VolumeStep(i8),
    MuteToggle,
    MediaKey(String),
    ClipboardWrite(String),
    ClipboardRead,
    Screenshot,
    FocusApp(String),
    ListWindows,
    SnapWindow {
        target: Option<String>,
        position: String,
    },
    MinimizeAll,
    SwitchDesktop(String),
    WebSearch {
        query: String,
        engine: String,
    },
    LockWorkstation,
    CloseWindow(String),
}

#[derive(Serialize, Clone, Debug)]
pub struct WindowInfo {
    pub hwnd: isize,
    pub title: String,
    pub exe: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct Resolution {
    pub intent: SystemIntent,
    pub requires_password: bool,
    pub description: String,
}

/// Destructive intents always require the control-password gate.
pub fn requires_password(intent: &SystemIntent) -> bool {
    matches!(intent, SystemIntent::LockWorkstation | SystemIntent::CloseWindow(_))
}

// ---------------------------------------------------------------------------
// Alias tables
// ---------------------------------------------------------------------------

/// App aliases → launch targets resolvable by `cmd /C start`.
fn app_alias(raw: &str) -> Option<&'static str> {
    const ALIASES: &[(&str, &str)] = &[
        ("chrome", "chrome"),
        ("google chrome", "chrome"),
        ("edge", "msedge"),
        ("microsoft edge", "msedge"),
        ("firefox", "firefox"),
        ("opera", "opera"),
        ("opera gx", "opera"),
        ("operagx", "opera"),
        ("brave", "brave"),
        ("brave browser", "brave"),
        ("vivaldi", "vivaldi"),
        ("arc", "arc"),
        ("vscode", "code"),
        ("vs code", "code"),
        ("code", "code"),
        ("explorer", "explorer"),
        ("file explorer", "explorer"),
        ("files", "explorer"),
        ("terminal", "wt"),
        ("windows terminal", "wt"),
        ("wt", "wt"),
        ("cmd", "cmd"),
        ("command prompt", "cmd"),
        ("powershell", "powershell"),
        ("spotify", "spotify"),
        ("notepad", "notepad"),
        ("calculator", "calc"),
        ("calc", "calc"),
        ("paint", "mspaint"),
        ("snipping tool", "snippingtool"),
        ("snip", "snippingtool"),
        ("task manager", "taskmgr"),
        ("settings", "ms-settings:"),
        ("word", "winword"),
        ("excel", "excel"),
        ("outlook", "outlook"),
        ("discord", "discord"),
        ("slack", "slack"),
        ("steam", "steam"),
        ("telegram", "telegram"),
        ("whatsapp", "whatsapp"),
        ("obsidian", "obsidian"),
        ("gmail", "https://mail.google.com"),
        ("classroom", "https://classroom.google.com"),
        ("reddit", "https://www.reddit.com"),
        ("stackoverflow", "https://stackoverflow.com"),
    ];
    ALIASES.iter().find(|(name, _)| *name == raw).map(|(_, target)| *target)
}

/// Known folder aliases → `shell:` URIs, or `@workspace`/`@notes` resolved
/// against the Severus workspace at execution time.
fn known_folder_alias(raw: &str) -> Option<&'static str> {
    const FOLDERS: &[(&str, &str)] = &[
        ("documents", "shell:Personal"),
        ("my documents", "shell:Personal"),
        ("downloads", "shell:Downloads"),
        ("desktop", "shell:Desktop"),
        ("pictures", "shell:My Pictures"),
        ("music", "shell:My Music"),
        ("videos", "shell:My Video"),
        ("severus", "@workspace"),
        ("severus folder", "@workspace"),
        ("workspace", "@workspace"),
        ("second brain", "@notes"),
        ("second brain folder", "@notes"),
        ("notes folder", "@notes"),
    ];
    FOLDERS.iter().find(|(name, _)| *name == raw).map(|(_, target)| *target)
}

/// Web search engines → result URL prefixes. The percent-encoded query is
/// appended and opened in the default browser.
const SEARCH_ENGINES: &[(&str, &str)] = &[
    ("google", "https://www.google.com/search?q="),
    ("youtube", "https://www.youtube.com/results?search_query="),
    ("bing", "https://www.bing.com/search?q="),
    ("duckduckgo", "https://duckduckgo.com/?q="),
    ("github", "https://github.com/search?q="),
    ("wikipedia", "https://en.wikipedia.org/w/index.php?search="),
];

fn search_engine(name: &str) -> Option<&'static str> {
    SEARCH_ENGINES.iter().find(|(key, _)| *key == name).map(|(_, url)| *url)
}

/// application/x-www-form-urlencoded: spaces become `+`, everything outside
/// the unreserved set is percent-encoded (so "c++ tutorial" survives cmd).
fn percent_encode_query(query: &str) -> String {
    let mut out = String::with_capacity(query.len());
    for byte in query.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char)
            }
            b' ' => out.push('+'),
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

fn build_search_url(engine: &str, query: &str) -> Result<String, String> {
    let prefix = search_engine(engine)
        .ok_or_else(|| format!("unknown search engine: {engine}"))?;
    Ok(format!("{prefix}{}", percent_encode_query(query)))
}

/// Detect a trailing "on <engine>" / "in <engine>" suffix and split it off.
fn split_engine_suffix(rest: &str) -> (String, String) {
    for (key, _) in SEARCH_ENGINES {
        for preposition in [" on ", " in "] {
            let suffix = format!("{preposition}{key}");
            if let Some(query) = rest.strip_suffix(&suffix) {
                return (query.trim().to_string(), key.to_string());
            }
        }
    }
    (rest.to_string(), "google".to_string())
}

// ---------------------------------------------------------------------------
// Grammar — pure, deterministic, unit-tested
// ---------------------------------------------------------------------------

fn normalize(text: &str) -> String {
    let lowered = text.to_lowercase().replace(['!', '.', '?', ',', '"', '\''], " ");
    let cleaned = lowered.split_whitespace().collect::<Vec<_>>().join(" ");
    // Strip filler so "hey severus please open chrome" works.
    const FILLERS: &[&str] = &[
        "hey severus ",
        "ok severus ",
        "okay severus ",
        "severus ",
        "please ",
        "could you ",
        "can you ",
        "would you ",
        "for me",
    ];
    let mut result = cleaned;
    loop {
        let mut changed = false;
        for filler in FILLERS {
            if let Some(stripped) = result.strip_prefix(filler) {
                result = stripped.trim().to_string();
                changed = true;
            }
            if let Some(stripped) = result.strip_suffix(filler) {
                result = stripped.trim().to_string();
                changed = true;
            }
        }
        if !changed {
            break;
        }
    }
    result
}

/// Resolve the trailing words of a command to an app target. Anything unknown
/// is returned verbatim so `start` can still attempt it.
fn resolve_app_name(rest: &str) -> Option<String> {
    let trimmed = rest.trim().trim_start_matches("the ").trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(app_alias(trimmed).unwrap_or(trimmed).to_string())
    }
}

/// Parse freeform text into a system intent. Returns `None` when the text does
/// not match the grammar (callers may then try the LLM fallback).
pub fn parse_command(text: &str) -> Option<Resolution> {
    let text = &normalize(text);
    if text.is_empty() {
        return None;
    }

    // --- lock workstation (destructive) ---
    if (text.contains("lock")
        && ["pc", "computer", "workstation", "windows", "machine"]
            .iter()
            .any(|w| text.contains(w)))
        || text == "lock"
    {
        return Some(Resolution {
            intent: SystemIntent::LockWorkstation,
            requires_password: true,
            description: "Lock the workstation".to_string(),
        });
    }

    // --- screenshot ---
    if ["screenshot", "screen capture", "capture screen", "screen shot", "take a shot"]
        .iter()
        .any(|k| text.contains(k))
    {
        return Some(Resolution {
            intent: SystemIntent::Screenshot,
            requires_password: false,
            description: "Capture a full-screen screenshot".to_string(),
        });
    }

    // --- list windows ---
    if ["list windows", "show windows", "what windows", "which windows", "window list", "open windows"]
        .iter()
        .any(|k| text.contains(k))
    {
        return Some(Resolution {
            intent: SystemIntent::ListWindows,
            requires_password: false,
            description: "List open windows".to_string(),
        });
    }

    // --- volume ---
    if text.contains("volume") || text.contains("mute") || text.contains("louder") || text.contains("quieter") {
        if text.contains("mute") {
            return Some(Resolution {
                intent: SystemIntent::MuteToggle,
                requires_password: false,
                description: "Toggle mute".to_string(),
            });
        }
        if text.contains("up") || text.contains("louder") {
            return Some(Resolution {
                intent: SystemIntent::VolumeStep(10),
                requires_password: false,
                description: "Volume up 10%".to_string(),
            });
        }
        if text.contains("down") || text.contains("quieter") || text.contains("softer") {
            return Some(Resolution {
                intent: SystemIntent::VolumeStep(-10),
                requires_password: false,
                description: "Volume down 10%".to_string(),
            });
        }
        if let Some(pct) = text
            .split_whitespace()
            .find(|token| !token.is_empty() && token.chars().all(|c| c.is_ascii_digit()))
            .and_then(|token| token.parse::<u8>().ok())
        {
            let clamped = pct.clamp(0, 100);
            return Some(Resolution {
                intent: SystemIntent::VolumeSet(clamped),
                requires_password: false,
                description: format!("Set volume to {clamped}%"),
            });
        }
    }

    // --- media keys ---
    if ["next track", "next song", "skip track", "skip song", "skip forward"]
        .iter()
        .any(|k| text.contains(k))
    {
        return Some(Resolution {
            intent: SystemIntent::MediaKey("next".into()),
            requires_password: false,
            description: "Next track".to_string(),
        });
    }
    if ["previous track", "previous song", "last song", "back a song"]
        .iter()
        .any(|k| text.contains(k))
    {
        return Some(Resolution {
            intent: SystemIntent::MediaKey("prev".into()),
            requires_password: false,
            description: "Previous track".to_string(),
        });
    }
    if text.contains("stop") && (text.contains("music") || text.contains("playback")) {
        return Some(Resolution {
            intent: SystemIntent::MediaKey("stop".into()),
            requires_password: false,
            description: "Stop playback".to_string(),
        });
    }
    if text.starts_with("pause")
        || text.starts_with("play")
        || text.starts_with("resume")
        || ["pause music", "play music", "resume music"].iter().any(|k| text.contains(k))
    {
        return Some(Resolution {
            intent: SystemIntent::MediaKey("play_pause".into()),
            requires_password: false,
            description: "Play / pause".to_string(),
        });
    }

    // --- virtual desktops ---
    if text.contains("desktop") {
        if ["next", "forward"].iter().any(|k| text.contains(k)) {
            return Some(Resolution {
                intent: SystemIntent::SwitchDesktop("next".into()),
                requires_password: false,
                description: "Switch to the next virtual desktop".to_string(),
            });
        }
        if ["previous", "back", "last"].iter().any(|k| text.contains(k)) {
            return Some(Resolution {
                intent: SystemIntent::SwitchDesktop("prev".into()),
                requires_password: false,
                description: "Switch to the previous virtual desktop".to_string(),
            });
        }
    }

    // --- minimize all / show desktop ---
    if text.contains("minimize all") || text.contains("minimize everything") || text.contains("show desktop") {
        return Some(Resolution {
            intent: SystemIntent::MinimizeAll,
            requires_password: false,
            description: "Minimize every window".to_string(),
        });
    }

    // --- web search ---
    if let Some(rest) = text.strip_prefix("search") {
        let rest = rest.trim();
        let rest = rest.strip_prefix("for ").unwrap_or(rest).trim();
        let rest = rest.strip_prefix("the web for ").unwrap_or(rest).trim();
        if !rest.is_empty() {
            // leading engine? e.g. "search youtube cats"
            let mut detected_engine = None;
            let mut query = rest.to_string();
            for (key, _) in SEARCH_ENGINES {
                if let Some(remaining) = rest.strip_prefix(key).map(str::trim_start) {
                    detected_engine = Some(key.to_string());
                    query = remaining.strip_prefix("for ").unwrap_or(remaining).trim().to_string();
                    break;
                }
            }
            let (query, engine) = if let Some(eng) = detected_engine {
                (query, eng)
            } else {
                split_engine_suffix(&query)
            };
            if !query.is_empty() {
                let description = format!("Search {engine} for \"{query}\"");
                return Some(Resolution {
                    intent: SystemIntent::WebSearch { query, engine },
                    requires_password: false,
                    description,
                });
            }
        }
    }
    for (verb, engine) in [
        ("google", "google"),
        ("youtube", "youtube"),
        ("yt", "youtube"),
        ("bing", "bing"),
        ("duckduckgo", "duckduckgo"),
        ("ddg", "duckduckgo"),
        ("github", "github"),
        ("wikipedia", "wikipedia"),
        ("wiki", "wikipedia"),
        ("look up", "google"),
    ] {
        if let Some(rest) = text.strip_prefix(verb) {
            let rest = rest.trim();
            if !rest.is_empty() {
                return Some(Resolution {
                    intent: SystemIntent::WebSearch { query: rest.to_string(), engine: engine.to_string() },
                    requires_password: false,
                    description: format!("Search {engine} for \"{rest}\""),
                });
            }
        }
    }

    // --- snap ---
    if let Some(rest) = text.strip_prefix("snap") {
        let rest = rest.trim();
        let position = if rest.contains("left") {
            Some("left")
        } else if rest.contains("right") {
            Some("right")
        } else if rest.contains("maximize") || rest.contains("full") {
            Some("maximize")
        } else if rest.contains("minimize") {
            Some("minimize")
        } else {
            None
        };
        if let Some(position) = position {
        let remainder = ["left", "right", "maximize", "minimize", "half", "side", "screen", "window", "to", "the"]
            .iter()
            .fold(rest.to_string(), |acc, word| acc.replace(word, " "))
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
            let target = if remainder.is_empty() {
                None
            } else {
                app_alias(&remainder).map(str::to_string)
            };
            let description = match &target {
                Some(app) => format!("Snap {app} to the {position} half"),
                None => format!("Snap the focused window to the {position} half"),
            };
            return Some(Resolution {
                intent: SystemIntent::SnapWindow { target, position: position.to_string() },
                requires_password: false,
                description,
            });
        }
    }

    // --- close window (destructive; requires an explicit app target) ---
    for verb in ["close", "quit", "kill"] {
        if let Some(rest) = text.strip_prefix(verb) {
            if let Some(app) = resolve_app_name(rest) {
                if app_alias(&app).is_some() {
                    let description = format!("Close the {app} window");
                    return Some(Resolution {
                        intent: SystemIntent::CloseWindow(app),
                        requires_password: true,
                        description,
                    });
                }
            }
        }
    }

    // --- maximize / minimize with optional target ---
    for (verb, position) in [("maximize", "maximize"), ("minimize", "minimize")] {
        if let Some(rest) = text.strip_prefix(verb) {
            let target = resolve_app_name(rest).filter(|name| app_alias(name).is_some());
            let description = match &target {
                Some(app) => format!("{verb} the {app} window"),
                None => format!("{verb} the focused window"),
            };
            return Some(Resolution {
                intent: SystemIntent::SnapWindow { target, position: position.to_string() },
                requires_password: false,
                description,
            });
        }
    }

    // --- clipboard ---
    if let Some(rest) = text.strip_prefix("clipboard") {
        let rest = rest.trim();
        return Some(Resolution {
            intent: if rest.is_empty() {
                SystemIntent::ClipboardRead
            } else {
                SystemIntent::ClipboardWrite(rest.to_string())
            },
            requires_password: false,
            description: if rest.is_empty() {
                "Read the clipboard".to_string()
            } else {
                "Copy text to the clipboard".to_string()
            },
        });
    }
    if ["read clipboard", "whats in the clipboard", "what is in the clipboard"]
        .iter()
        .any(|k| text.contains(k))
    {
        return Some(Resolution {
            intent: SystemIntent::ClipboardRead,
            requires_password: false,
            description: "Read the clipboard".to_string(),
        });
    }

    // --- focus / switch to app ---
    for verb in ["switch to", "focus", "bring up", "bring", "go to"] {
        if let Some(rest) = text.strip_prefix(verb) {
            if let Some(app) = resolve_app_name(rest) {
                if app_alias(&app).is_some() {
                    let description = format!("Bring {app} to the foreground");
                    return Some(Resolution {
                        intent: SystemIntent::FocusApp(app),
                        requires_password: false,
                        description,
                    });
                }
            }
        }
    }

    // --- open / launch ---
    for verb in ["open", "launch", "start", "run"] {
        if let Some(rest) = text.strip_prefix(verb) {
            let rest = rest.trim().trim_start_matches("up ").trim();
            if rest.is_empty() {
                continue;
            }
            // Typed paths: open "C:\foo" / open C:\foo / open %USERPROFILE%\x
            if rest.starts_with('"') || rest.contains(":\\") || rest.starts_with('%') {
                let path = rest.trim_matches('"').to_string();
                let description = format!("Open {path}");
                return Some(Resolution {
                    intent: SystemIntent::OpenPath(path),
                    requires_password: false,
                    description,
                });
            }
            if let Some(folder) = known_folder_alias(rest) {
                return Some(Resolution {
                    intent: SystemIntent::OpenKnownFolder(folder.to_string()),
                    requires_password: false,
                    description: format!("Open {rest}"),
                });
            }
            if let Some(app) = resolve_app_name(rest) {
                let description = format!("Launch {app}");
                return Some(Resolution {
                    intent: SystemIntent::LaunchApp(app),
                    requires_password: false,
                    description,
                });
            }
        }
    }

    None
}

// ---------------------------------------------------------------------------
// Executors
// ---------------------------------------------------------------------------

pub fn execute(intent: &SystemIntent, confirmed: bool, paths: &Paths) -> Result<String, String> {
    if requires_password(intent) && !confirmed {
        return Err("password confirmation required".to_string());
    }

    #[cfg(windows)]
    {
        win32::execute(intent, paths)
    }

    #[cfg(not(windows))]
    {
        let _ = (intent, paths);
        Err("system control requires Windows".to_string())
    }
}

pub fn list_windows() -> Result<Vec<WindowInfo>, String> {
    #[cfg(windows)]
    {
        win32::list_windows()
    }

    #[cfg(not(windows))]
    {
        Err("system control requires Windows".to_string())
    }
}

// ---------------------------------------------------------------------------
// Win32 implementation
// ---------------------------------------------------------------------------

#[cfg(windows)]
mod win32 {
    use super::{SystemIntent, WindowInfo};
    use crate::Paths;
    use std::os::windows::process::CommandExt;
    use windows::core::PWSTR;
    use windows::Win32::Foundation::{CloseHandle, BOOL, HWND, LPARAM, RECT, WPARAM};
    use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
    use windows::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits,
        GetMonitorInfoW, MonitorFromWindow, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER,
        DIB_RGB_COLORS, MONITORINFO, MONITOR_DEFAULTTONEAREST, SRCCOPY,
    };
    use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
    use windows::Win32::Media::Audio::{eConsole, eRender, IMMDeviceEnumerator, MMDeviceEnumerator};
    use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL, COINIT_MULTITHREADED};
    use windows::Win32::System::Shutdown::LockWorkStation;
    use windows::Win32::System::Threading::{
        AttachThreadInput, GetCurrentThreadId, OpenProcess, QueryFullProcessImageNameW,
        PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS,
        KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, VK_CONTROL, VK_LEFT, VK_LWIN, VK_MEDIA_NEXT_TRACK,
        VK_MEDIA_PLAY_PAUSE, VK_MEDIA_PREV_TRACK, VK_MEDIA_STOP, VK_RIGHT, VIRTUAL_KEY,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetForegroundWindow, GetSystemMetrics, GetWindowTextLengthW,
        GetWindowTextW, GetWindowThreadProcessId, IsIconic, IsWindowVisible, PostMessageW,
        SetForegroundWindow, SetWindowPos, ShowWindow, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN,
        SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN, SW_MAXIMIZE, SW_MINIMIZE, SW_RESTORE, SWP_NOZORDER,
        WM_CLOSE,
    };

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    pub fn execute(intent: &SystemIntent, paths: &Paths) -> Result<String, String> {
        match intent {
            SystemIntent::LaunchApp(app) => launch_app(app),
            SystemIntent::OpenKnownFolder(folder) => open_known_folder(folder, paths),
            SystemIntent::OpenPath(path) => open_path(path),
            SystemIntent::VolumeSet(pct) => volume_set(*pct),
            SystemIntent::VolumeStep(delta) => volume_step(*delta),
            SystemIntent::MuteToggle => mute_toggle(),
            SystemIntent::MediaKey(kind) => media_key(kind),
            SystemIntent::ClipboardWrite(text) => clipboard_write(text),
            SystemIntent::ClipboardRead => clipboard_read(),
            SystemIntent::Screenshot => screenshot(),
            SystemIntent::FocusApp(app) => focus_app(app),
            SystemIntent::ListWindows => {
                let windows = list_windows()?;
                Ok(windows
                    .iter()
                    .map(|w| format!("{} — {}", w.exe, w.title))
                    .collect::<Vec<_>>()
                    .join("\n"))
            }
            SystemIntent::SnapWindow { target, position } => snap_window(target.as_deref(), position),
            SystemIntent::MinimizeAll => minimize_all(),
            SystemIntent::SwitchDesktop(direction) => switch_desktop(direction),
            SystemIntent::LockWorkstation => lock_workstation(),
            SystemIntent::CloseWindow(app) => close_window(app),
            SystemIntent::WebSearch { query, engine } => web_search(query, engine),
        }
    }

    fn resolve_app_path(target: &str) -> Option<String> {
        let lower = target.to_lowercase();
        let local_appdata = std::env::var("LOCALAPPDATA").unwrap_or_default();
        let program_files = std::env::var("ProgramFiles").unwrap_or_default();
        let program_files_x86 = std::env::var("ProgramFiles(x86)").unwrap_or_default();

        if lower.contains("opera") {
            let candidates = [
                format!("{local_appdata}\\Programs\\Opera GX\\opera.exe"),
                format!("{local_appdata}\\Programs\\Opera\\opera.exe"),
                format!("{local_appdata}\\Programs\\Opera\\launcher.exe"),
                format!("{program_files}\\Opera\\launcher.exe"),
                format!("{program_files}\\Opera GX\\launcher.exe"),
                format!("{program_files_x86}\\Opera\\launcher.exe"),
            ];
            for candidate in candidates {
                if std::path::Path::new(&candidate).exists() {
                    return Some(candidate);
                }
            }
        }

        if lower.contains("brave") {
            let candidates = [
                format!("{local_appdata}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe"),
                format!("{program_files}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe"),
                format!("{program_files_x86}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe"),
            ];
            for candidate in candidates {
                if std::path::Path::new(&candidate).exists() {
                    return Some(candidate);
                }
            }
        }

        // Check HKCU and HKLM App Paths registry via `reg query`
        let exe_name = if target.ends_with(".exe") {
            target.to_string()
        } else {
            format!("{target}.exe")
        };

        for hive in ["HKCU", "HKLM"] {
            let reg_key = format!(r"{hive}\Software\Microsoft\Windows\CurrentVersion\App Paths\{exe_name}");
            if let Ok(output) = std::process::Command::new("reg")
                .args(["query", &reg_key, "/ve"])
                .creation_flags(CREATE_NO_WINDOW)
                .output()
            {
                if output.status.success() {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    for line in stdout.lines() {
                        if line.contains("REG_SZ") {
                            if let Some(pos) = line.find("REG_SZ") {
                                let path_val = line[pos + 6..].trim().trim_matches('"');
                                if !path_val.is_empty() && std::path::Path::new(path_val).exists() {
                                    return Some(path_val.to_string());
                                }
                            }
                        }
                    }
                }
            }
        }

        None
    }

    fn start_detached(target: &str) -> Result<(), String> {
        if let Some(app_path) = resolve_app_path(target) {
            std::process::Command::new(&app_path)
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
                .map(|_| ())
                .map_err(|e| format!("cannot launch '{app_path}': {e}"))
        } else {
            std::process::Command::new("cmd")
                .args(["/C", "start", "", target])
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
                .map(|_| ())
                .map_err(|e| format!("cannot launch '{target}': {e}"))
        }
    }

    fn launch_app(app: &str) -> Result<String, String> {
        start_detached(app)?;
        Ok(format!("Launched {app}"))
    }

    fn open_known_folder(folder: &str, paths: &Paths) -> Result<String, String> {
        let target = match folder {
            "@workspace" => paths.root.to_string_lossy().to_string(),
            "@notes" => paths.notes_dir().to_string_lossy().to_string(),
            other => other.to_string(),
        };
        start_detached(&target)?;
        Ok(format!("Opened {folder}"))
    }

    fn open_path(path: &str) -> Result<String, String> {
        let expanded = expand_env(path)?;
        let trimmed = expanded.trim().trim_matches('"').to_string();
        let is_url = trimmed.starts_with("http://") || trimmed.starts_with("https://");
        if !is_url && !std::path::Path::new(&trimmed).exists() {
            return Err(format!("path does not exist: {trimmed}"));
        }
        start_detached(&trimmed)?;
        Ok(format!("Opened {trimmed}"))
    }

    fn web_search(query: &str, engine: &str) -> Result<String, String> {
        let url = super::build_search_url(engine, query)?;
        start_detached(&url)?;
        Ok(format!("Opened {engine} search for \"{query}\""))
    }

    fn expand_env(path: &str) -> Result<String, String> {
        if !path.contains('%') {
            return Ok(path.to_string());
        }
        let mut result = String::new();
        let mut rest = path;
        while let Some(start) = rest.find('%') {
            result.push_str(&rest[..start]);
            let after = &rest[start + 1..];
            match after.find('%') {
                Some(end) => {
                    let name = &after[..end];
                    match std::env::var(name) {
                        Ok(value) => result.push_str(&value),
                        Err(_) => return Err(format!("unknown environment variable: {name}")),
                    }
                    rest = &after[end + 1..];
                }
                None => return Err(format!("unbalanced '%' in path: {path}")),
            }
        }
        result.push_str(rest);
        Ok(result)
    }

    // --- volume ---

    fn endpoint_volume() -> Result<IAudioEndpointVolume, String> {
        // If COM is already initialized on another thread model this returns an
        // error we can safely ignore — CoCreateInstance below still works.
        unsafe { let _ = windows::Win32::System::Com::CoInitializeEx(None, COINIT_MULTITHREADED).ok(); };
        unsafe {
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                    .map_err(|e| format!("audio device enumerator unavailable: {e}"))?;
            let device = enumerator
                .GetDefaultAudioEndpoint(eRender, eConsole)
                .map_err(|e| format!("no default audio endpoint: {e}"))?;
            device
                .Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None)
                .map_err(|e| format!("cannot control master volume: {e}"))
        }
    }

    fn volume_set(pct: u8) -> Result<String, String> {
        let endpoint = endpoint_volume()?;
        let clamped = pct.clamp(0, 100);
        unsafe {
            endpoint
                .SetMasterVolumeLevelScalar(f32::from(clamped) / 100.0, std::ptr::null())
                .map_err(|e| format!("cannot set volume: {e}"))?;
        }
        Ok(format!("Volume set to {clamped}%"))
    }

    fn volume_step(delta: i8) -> Result<String, String> {
        let endpoint = endpoint_volume()?;
        let current = unsafe { endpoint.GetMasterVolumeLevelScalar().map_err(|e| e.to_string())? };
        let next = ((current * 100.0).round() as i32 + i32::from(delta)).clamp(0, 100);
        unsafe {
            endpoint
                .SetMasterVolumeLevelScalar(next as f32 / 100.0, std::ptr::null())
                .map_err(|e| format!("cannot set volume: {e}"))?;
        }
        Ok(format!("Volume {next}%"))
    }

    fn mute_toggle() -> Result<String, String> {
        let endpoint = endpoint_volume()?;
        let muted = unsafe { endpoint.GetMute().map_err(|e| e.to_string())? }.as_bool();
        unsafe {
            endpoint
                .SetMute(!muted, std::ptr::null())
                .map_err(|e| format!("cannot toggle mute: {e}"))?;
        }
        Ok(if muted { "Unmuted".to_string() } else { "Muted".to_string() })
    }

    // --- keystrokes (fixed chords only; never arbitrary text) ---

    fn key_input(vk: VIRTUAL_KEY, extended: bool, key_up: bool) -> INPUT {
        let mut dw_flags = KEYBD_EVENT_FLAGS(0);
        if extended {
            dw_flags |= KEYEVENTF_EXTENDEDKEY;
        }
        if key_up {
            dw_flags |= KEYEVENTF_KEYUP;
        }
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT { wVk: vk, wScan: 0, dwFlags: dw_flags, time: 0, dwExtraInfo: 0 },
            },
        }
    }

    fn send_inputs(inputs: &[INPUT]) -> Result<(), String> {
        let sent = unsafe { SendInput(inputs, std::mem::size_of::<INPUT>() as i32) };
        if sent as usize != inputs.len() {
            return Err("keystroke was blocked by the system".to_string());
        }
        Ok(())
    }

    fn send_key(vk: VIRTUAL_KEY) -> Result<(), String> {
        send_inputs(&[key_input(vk, false, false), key_input(vk, false, true)])
    }

    fn send_chord(modifiers: &[VIRTUAL_KEY], key: VIRTUAL_KEY) -> Result<(), String> {
        let mut sequence: Vec<INPUT> = modifiers.iter().map(|vk| key_input(*vk, false, false)).collect();
        sequence.push(key_input(key, true, false));
        sequence.push(key_input(key, true, true));
        for vk in modifiers.iter().rev() {
            sequence.push(key_input(*vk, false, true));
        }
        send_inputs(&sequence)
    }

    fn media_key(kind: &str) -> Result<String, String> {
        let (vk, label) = match kind {
            "play_pause" => (VK_MEDIA_PLAY_PAUSE, "Play / pause toggled"),
            "next" => (VK_MEDIA_NEXT_TRACK, "Skipped to the next track"),
            "prev" => (VK_MEDIA_PREV_TRACK, "Back to the previous track"),
            "stop" => (VK_MEDIA_STOP, "Playback stopped"),
            other => return Err(format!("unknown media key: {other}")),
        };
        send_key(vk)?;
        Ok(label.to_string())
    }

    fn switch_desktop(direction: &str) -> Result<String, String> {
        match direction {
            "next" => send_chord(&[VK_CONTROL, VK_LWIN], VK_RIGHT)?,
            "prev" => send_chord(&[VK_CONTROL, VK_LWIN], VK_LEFT)?,
            other => return Err(format!("unknown desktop direction: {other}")),
        }
        Ok(match direction {
            "next" => "Switched to the next desktop".to_string(),
            _ => "Switched to the previous desktop".to_string(),
        })
    }

    // --- windows ---

    fn window_exe(hwnd: HWND) -> Option<String> {
        unsafe {
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            if pid == 0 {
                return None;
            }
            let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
            let mut buf = [0u16; 512];
            let mut len = buf.len() as u32;
            let name = QueryFullProcessImageNameW(
                process,
                PROCESS_NAME_WIN32,
                PWSTR(buf.as_mut_ptr()),
                &mut len,
            )
            .ok()
            .map(|_| {
                String::from_utf16_lossy(&buf[..len as usize])
                    .rsplit('\\')
                    .next()
                    .unwrap_or("")
                    .to_string()
            });
            let _ = CloseHandle(process);
            name
        }
    }

    fn is_cloaked(hwnd: HWND) -> bool {
        unsafe {
            let mut cloaked: u32 = 0;
            let result = DwmGetWindowAttribute(
                hwnd,
                DWMWA_CLOAKED,
                &mut cloaked as *mut u32 as *mut _,
                std::mem::size_of::<u32>() as u32,
            );
            result.is_ok() && cloaked != 0
        }
    }

    pub fn list_windows() -> Result<Vec<WindowInfo>, String> {
        struct Collector(Vec<HWND>);
        unsafe extern "system" fn callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
            let collector = unsafe { &mut *(lparam.0 as *mut Collector) };
            collector.0.push(hwnd);
            true.into()
        }

        let mut collector = Collector(Vec::new());
        unsafe {
            EnumWindows(Some(callback), LPARAM(&mut collector as *mut Collector as isize))
                .map_err(|e| format!("window enumeration failed: {e}"))?;
        }

        let mut windows = Vec::new();
        for hwnd in collector.0 {
            unsafe {
                if !IsWindowVisible(hwnd).as_bool() || is_cloaked(hwnd) {
                    continue;
                }
                let len = GetWindowTextLengthW(hwnd);
                if len <= 0 {
                    continue;
                }
                let mut buf = vec![0u16; len as usize + 1];
                GetWindowTextW(hwnd, &mut buf);
                let title = String::from_utf16_lossy(&buf[..len as usize]);
                if title.trim().is_empty() {
                    continue;
                }
                let exe = window_exe(hwnd).unwrap_or_else(|| "unknown".to_string());
                windows.push(WindowInfo { hwnd: hwnd.0 as isize, title, exe });
            }
        }
        windows.sort_by(|a, b| a.exe.cmp(&b.exe).then(a.title.cmp(&b.title)));
        Ok(windows)
    }

    fn find_window(target: &str) -> Option<WindowInfo> {
        let target_lower = target.to_lowercase();
        list_windows().ok()?.into_iter().find(|w| {
            w.exe.to_lowercase().contains(&target_lower) || w.title.to_lowercase().contains(&target_lower)
        })
    }

    fn bring_to_front(hwnd: HWND) -> Result<(), String> {
        unsafe {
            if IsIconic(hwnd).as_bool() {
                let _ = ShowWindow(hwnd, SW_RESTORE);
            }
            // Windows refuses SetForegroundWindow from background processes;
            // attaching to the foreground thread's input queue lifts the ban.
            let foreground = GetForegroundWindow();
            let foreground_thread = GetWindowThreadProcessId(foreground, None);
            let this_thread = GetCurrentThreadId();
            let _ = AttachThreadInput(this_thread, foreground_thread, true);
            let _ = SetForegroundWindow(hwnd);
            let _ = AttachThreadInput(this_thread, foreground_thread, false);
        }
        Ok(())
    }

    fn focus_app(app: &str) -> Result<String, String> {
        let found = find_window(app).ok_or_else(|| format!("no open window matches '{app}'"))?;
        bring_to_front(HWND(found.hwnd as *mut _))?;
        Ok(format!("Focused {}", found.title))
    }

    fn snap_window(target: Option<&str>, position: &str) -> Result<String, String> {
        let info = match target {
            Some(app) => find_window(app).ok_or_else(|| format!("no open window matches '{app}'"))?,
            None => {
                let hwnd = unsafe { GetForegroundWindow() };
                if hwnd.0.is_null() {
                    return Err("no focused window to snap".to_string());
                }
                WindowInfo { hwnd: hwnd.0 as isize, title: "the focused window".to_string(), exe: String::new() }
            }
        };
        let hwnd = HWND(info.hwnd as *mut _);

        match position {
            "maximize" => {
                let _ = unsafe { ShowWindow(hwnd, SW_MAXIMIZE) };
                return Ok(format!("Maximized {}", info.title));
            }
            "minimize" => {
                let _ = unsafe { ShowWindow(hwnd, SW_MINIMIZE) };
                return Ok(format!("Minimized {}", info.title));
            }
            "left" | "right" => {}
            other => return Err(format!("unknown snap position: {other}")),
        }

        unsafe {
            if IsIconic(hwnd).as_bool() {
                let _ = ShowWindow(hwnd, SW_RESTORE);
            }
            let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
            let mut monitor_info = MONITORINFO {
                cbSize: std::mem::size_of::<MONITORINFO>() as u32,
                ..Default::default()
            };
            if !GetMonitorInfoW(monitor, &mut monitor_info).as_bool() {
                return Err("cannot read monitor work area".to_string());
            }
            let work: RECT = monitor_info.rcWork;
            let half_width = (work.right - work.left) / 2;
            let (x, width) = if position == "left" {
                (work.left, half_width)
            } else {
                (work.left + half_width, work.right - work.left - half_width)
            };
            SetWindowPos(hwnd, None, x, work.top, width, work.bottom - work.top, SWP_NOZORDER)
                .map_err(|e| format!("cannot move window: {e}"))?;
        }
        Ok(format!("Snapped {} to the {position} half", info.title))
    }

    fn minimize_all() -> Result<String, String> {
        let windows = list_windows()?;
        for w in &windows {
            let _ = unsafe { ShowWindow(HWND(w.hwnd as *mut _), SW_MINIMIZE) };
        }
        Ok(format!("Minimized {} windows", windows.len()))
    }

    fn close_window(app: &str) -> Result<String, String> {
        let found = find_window(app).ok_or_else(|| format!("no open window matches '{app}'"))?;
        // WM_CLOSE is the polite path — the app gets to prompt for unsaved work.
        unsafe {
            PostMessageW(HWND(found.hwnd as *mut _), WM_CLOSE, WPARAM(0), LPARAM(0))
                .map_err(|e| format!("cannot close window: {e}"))?;
        }
        Ok(format!("Asked {} to close", found.title))
    }

    fn lock_workstation() -> Result<String, String> {
        unsafe { LockWorkStation().map_err(|e| format!("cannot lock workstation: {e}"))? };
        Ok("Workstation locked".to_string())
    }

    // --- clipboard ---

    fn clipboard_write(text: &str) -> Result<String, String> {
        arboard::Clipboard::new()
            .and_then(|mut cb| cb.set_text(text.to_string()))
            .map_err(|e| format!("clipboard unavailable: {e}"))?;
        Ok("Copied to clipboard".to_string())
    }

    fn clipboard_read() -> Result<String, String> {
        let text = arboard::Clipboard::new()
            .and_then(|mut cb| cb.get_text())
            .map_err(|e| format!("clipboard unavailable: {e}"))?;
        let preview: String = text.chars().take(80).collect();
        Ok(format!("Clipboard: {preview}"))
    }

    // --- screenshot ---

    fn screenshot() -> Result<String, String> {
        unsafe {
            let x = GetSystemMetrics(SM_XVIRTUALSCREEN);
            let y = GetSystemMetrics(SM_YVIRTUALSCREEN);
            let width = GetSystemMetrics(SM_CXVIRTUALSCREEN);
            let height = GetSystemMetrics(SM_CYVIRTUALSCREEN);
            if width <= 0 || height <= 0 {
                return Err("cannot determine screen size".to_string());
            }

            let hdc_screen = GetDC(None);
            if hdc_screen.is_invalid() {
                return Err("cannot acquire screen dc".to_string());
            }
            let hdc_mem = CreateCompatibleDC(hdc_screen);
            if hdc_mem.is_invalid() {
                let _ = ReleaseDC(None, hdc_screen);
                return Err("cannot create memory dc".to_string());
            }
            let bitmap = CreateCompatibleBitmap(hdc_screen, width, height);
            if bitmap.is_invalid() {
                let _ = DeleteDC(hdc_mem);
                let _ = ReleaseDC(None, hdc_screen);
                return Err("cannot create bitmap".to_string());
            }
            let previous = SelectObject(hdc_mem, bitmap);
            let mut pixels: Vec<u8> = Vec::new();
            let blit = BitBlt(hdc_mem, 0, 0, width, height, hdc_screen, x, y, SRCCOPY);
            if blit.is_ok() {
                let mut info = BITMAPINFO {
                    bmiHeader: BITMAPINFOHEADER {
                        biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                        biWidth: width,
                        // negative height → top-down rows
                        biHeight: -height,
                        biPlanes: 1,
                        biBitCount: 32,
                        biCompression: 0, // BI_RGB
                        biSizeImage: (width * height * 4) as u32,
                        ..Default::default()
                    },
                    ..Default::default()
                };
                let mut buffer = vec![0u8; (width * height * 4) as usize];
                let copied = GetDIBits(
                    hdc_mem,
                    bitmap,
                    0,
                    height as u32,
                    Some(buffer.as_mut_ptr() as *mut _),
                    &mut info,
                    DIB_RGB_COLORS,
                );
                if copied == height {
                    // GDI returns BGRA; the PNG encoder wants RGBA.
                    for chunk in buffer.chunks_exact_mut(4) {
                        chunk.swap(0, 2);
                    }
                    pixels = buffer;
                }
            }
            SelectObject(hdc_mem, previous);
            let _ = DeleteObject(windows::Win32::Graphics::Gdi::HGDIOBJ(bitmap.0));
            let _ = DeleteDC(hdc_mem);
            let _ = ReleaseDC(None, hdc_screen);

            if pixels.is_empty() {
                return Err("screen capture failed".to_string());
            }

            let home = std::env::var("USERPROFILE").map_err(|_| "cannot resolve home folder".to_string())?;
            let folder = std::path::PathBuf::from(home).join("Pictures").join("Severus");
            std::fs::create_dir_all(&folder).map_err(|e| format!("cannot create screenshot folder: {e}"))?;
            let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
            let path = folder.join(format!("severus-shot-{stamp}.png"));
            image::save_buffer_with_format(
                &path,
                &pixels,
                width as u32,
                height as u32,
                image::ColorType::Rgba8,
                image::ImageFormat::Png,
            )
            .map_err(|e| format!("cannot save screenshot: {e}"))?;
            Ok(format!("Screenshot saved to {}", path.display()))
        }
    }
}

// ---------------------------------------------------------------------------
// Tests — the grammar is the contract every caller shares
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn intent_of(text: &str) -> SystemIntent {
        parse_command(text).expect(text).intent
    }

    #[test]
    fn parses_launch_commands() {
        assert_eq!(intent_of("open chrome"), SystemIntent::LaunchApp("chrome".into()));
        assert_eq!(intent_of("launch spotify"), SystemIntent::LaunchApp("spotify".into()));
        assert_eq!(intent_of("start notepad"), SystemIntent::LaunchApp("notepad".into()));
        assert_eq!(intent_of("open opera"), SystemIntent::LaunchApp("opera".into()));
        assert_eq!(intent_of("open opera gx"), SystemIntent::LaunchApp("opera".into()));
        assert_eq!(intent_of("launch brave"), SystemIntent::LaunchApp("brave".into()));
    }

    #[test]
    fn strips_filler_words() {
        assert_eq!(
            intent_of("HEY SEVERUS, please Open CHROME!"),
            SystemIntent::LaunchApp("chrome".into())
        );
        assert_eq!(
            intent_of("hey severus can you open vs code for me"),
            SystemIntent::LaunchApp("code".into())
        );
    }

    #[test]
    fn opens_known_folders() {
        assert_eq!(
            intent_of("open documents"),
            SystemIntent::OpenKnownFolder("shell:Personal".into())
        );
        assert_eq!(intent_of("open severus"), SystemIntent::OpenKnownFolder("@workspace".into()));
        assert_eq!(
            intent_of("open second brain"),
            SystemIntent::OpenKnownFolder("@notes".into())
        );
    }

    #[test]
    fn opens_typed_paths() {
        // The grammar lowercases everything; Windows paths are case-insensitive
        // so `start` opens them correctly regardless.
        assert_eq!(
            intent_of("open C:\\Users\\lex\\demo"),
            SystemIntent::OpenPath("c:\\users\\lex\\demo".into())
        );
        assert_eq!(
            intent_of("open \"C:\\Program Files\""),
            SystemIntent::OpenPath("c:\\program files".into())
        );
        assert_eq!(
            intent_of("open %USERPROFILE%\\notes"),
            SystemIntent::OpenPath("%userprofile%\\notes".into())
        );
    }

    #[test]
    fn parses_volume_commands() {
        assert_eq!(intent_of("volume to 40"), SystemIntent::VolumeSet(40));
        assert_eq!(intent_of("set volume 65"), SystemIntent::VolumeSet(65));
        assert_eq!(intent_of("volume to 150"), SystemIntent::VolumeSet(100));
        assert_eq!(intent_of("volume up"), SystemIntent::VolumeStep(10));
        assert_eq!(intent_of("quieter please"), SystemIntent::VolumeStep(-10));
        assert_eq!(intent_of("volume down"), SystemIntent::VolumeStep(-10));
        assert_eq!(intent_of("mute"), SystemIntent::MuteToggle);
        assert_eq!(intent_of("unmute"), SystemIntent::MuteToggle);
    }

    #[test]
    fn parses_media_keys() {
        assert_eq!(intent_of("next track"), SystemIntent::MediaKey("next".into()));
        assert_eq!(intent_of("skip song"), SystemIntent::MediaKey("next".into()));
        assert_eq!(intent_of("previous track"), SystemIntent::MediaKey("prev".into()));
        assert_eq!(intent_of("pause"), SystemIntent::MediaKey("play_pause".into()));
        assert_eq!(intent_of("play music"), SystemIntent::MediaKey("play_pause".into()));
        assert_eq!(intent_of("stop the music"), SystemIntent::MediaKey("stop".into()));
    }

    #[test]
    fn parses_desktops_and_minimize_all() {
        assert_eq!(intent_of("next desktop"), SystemIntent::SwitchDesktop("next".into()));
        assert_eq!(intent_of("previous desktop"), SystemIntent::SwitchDesktop("prev".into()));
        assert_eq!(intent_of("minimize all"), SystemIntent::MinimizeAll);
        assert_eq!(intent_of("show desktop"), SystemIntent::MinimizeAll);
    }

    #[test]
    fn parses_snap_commands() {
        assert_eq!(
            intent_of("snap left"),
            SystemIntent::SnapWindow { target: None, position: "left".into() }
        );
        assert_eq!(
            intent_of("snap chrome left"),
            SystemIntent::SnapWindow { target: Some("chrome".into()), position: "left".into() }
        );
        assert_eq!(
            intent_of("snap vscode right"),
            SystemIntent::SnapWindow { target: Some("code".into()), position: "right".into() }
        );
        assert_eq!(
            intent_of("maximize"),
            SystemIntent::SnapWindow { target: None, position: "maximize".into() }
        );
        assert_eq!(
            intent_of("minimize spotify"),
            SystemIntent::SnapWindow { target: Some("spotify".into()), position: "minimize".into() }
        );
    }

    #[test]
    fn destructive_intents_require_password() {
        let lock = parse_command("lock the pc").unwrap();
        assert_eq!(lock.intent, SystemIntent::LockWorkstation);
        assert!(lock.requires_password);

        let close = parse_command("close chrome").unwrap();
        assert_eq!(close.intent, SystemIntent::CloseWindow("chrome".into()));
        assert!(close.requires_password);

        assert!(!parse_command("open chrome").unwrap().requires_password);
        assert!(requires_password(&SystemIntent::LockWorkstation));
        assert!(!requires_password(&SystemIntent::Screenshot));
    }

    #[test]
    fn execute_refuses_unconfirmed_destructive_intents() {
        let paths = Paths { root: std::env::temp_dir() };
        let err = execute(&SystemIntent::LockWorkstation, false, &paths).unwrap_err();
        assert_eq!(err, "password confirmation required");
    }

    #[test]
    fn parses_clipboard_commands() {
        assert_eq!(intent_of("clipboard"), SystemIntent::ClipboardRead);
        assert_eq!(
            intent_of("clipboard hello world"),
            SystemIntent::ClipboardWrite("hello world".into())
        );
        assert_eq!(intent_of("read clipboard"), SystemIntent::ClipboardRead);
    }

    #[test]
    fn parses_focus_and_screenshot() {
        assert_eq!(intent_of("switch to chrome"), SystemIntent::FocusApp("chrome".into()));
        assert_eq!(intent_of("focus vscode"), SystemIntent::FocusApp("code".into()));
        assert_eq!(intent_of("screenshot"), SystemIntent::Screenshot);
        assert_eq!(intent_of("take a screenshot"), SystemIntent::Screenshot);
        assert_eq!(intent_of("list windows"), SystemIntent::ListWindows);
        assert_eq!(intent_of("what windows are open"), SystemIntent::ListWindows);
    }

    #[test]
    fn rejects_non_commands() {
        assert!(parse_command("what did you have for breakfast").is_none());
        assert!(parse_command("close").is_none(), "bare close belongs to the in-app handler");
        assert!(parse_command("").is_none());
        assert!(parse_command("hey severus").is_none());
    }

    #[test]
    fn parses_web_search_commands() {
        assert_eq!(
            intent_of("search cats"),
            SystemIntent::WebSearch { query: "cats".into(), engine: "google".into() }
        );
        assert_eq!(
            intent_of("search for rust on youtube"),
            SystemIntent::WebSearch { query: "rust".into(), engine: "youtube".into() }
        );
        assert_eq!(
            intent_of("youtube lofi hip hop"),
            SystemIntent::WebSearch { query: "lofi hip hop".into(), engine: "youtube".into() }
        );
        assert_eq!(
            intent_of("google rust documentation"),
            SystemIntent::WebSearch { query: "rust documentation".into(), engine: "google".into() }
        );
        assert_eq!(
            intent_of("github tauri"),
            SystemIntent::WebSearch { query: "tauri".into(), engine: "github".into() }
        );
    }
}
