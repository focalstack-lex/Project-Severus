//! Severus Second Brain — Tauri v2 backend.
//!
//! Commands expose the knowledge graph and note/journal operations; a filesystem
//! watcher emits `notes-changed` so the UI stays live. All file IO is rooted at the
//! Severus workspace (`SEVERUS_ROOT` overrides, else `%USERPROFILE%\Documents\Severus`).

mod gmail_auth;
mod graph;
mod memory;
mod notes;
mod system_control;
mod watcher;

use std::path::PathBuf;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager, State};

pub struct Paths {
    pub root: PathBuf,
}

impl Paths {
    pub fn resolve() -> Self {
        if let Ok(root) = std::env::var("SEVERUS_ROOT") {
            if !root.trim().is_empty() {
                return Self { root: PathBuf::from(root) };
            }
        }
        let home = std::env::var("USERPROFILE").unwrap_or_else(|_| ".".to_string());
        Self { root: PathBuf::from(home).join("Documents").join("Severus") }
    }

    pub fn notes_dir(&self) -> PathBuf {
        self.root.join("second-brain").join("notes")
    }

    pub fn journal_dir(&self) -> PathBuf {
        self.root.join("journal")
    }

    pub fn voices_dir(&self) -> PathBuf {
        self.root.join("Voices")
    }

    pub fn user_dir(&self) -> PathBuf {
        self.root.join("USER")
    }
}

#[tauri::command]
fn get_graph_data(paths: State<Paths>) -> Result<graph::GraphData, String> {
    graph::compute_graph(&paths.notes_dir())
}

#[tauri::command]
fn list_notes(paths: State<Paths>) -> Vec<notes::NoteMeta> {
    notes::list_notes(&paths)
}

#[tauri::command]
fn read_note(paths: State<Paths>, id: String) -> Result<notes::NoteContent, String> {
    notes::read_note(&paths, &id)
}

#[tauri::command]
fn save_note(paths: State<Paths>, id: String, content: String) -> Result<(), String> {
    notes::save_note(&paths, &id, &content)
}

#[tauri::command]
fn append_journal(paths: State<Paths>, text: String) -> Result<String, String> {
    notes::append_journal(&paths, &text)
}

#[tauri::command]
fn read_today_journal(paths: State<Paths>) -> Result<String, String> {
    notes::read_today_journal(&paths)
}

#[tauri::command]
fn open_in_editor(paths: State<Paths>, id: String) -> Result<(), String> {
    notes::open_in_editor(&paths, &id)
}

#[tauri::command]
fn get_git_status(paths: State<Paths>) -> Result<notes::GitStatusData, String> {
    notes::get_git_status(&paths)
}

#[tauri::command]
fn get_workspace_context(paths: State<Paths>) -> notes::WorkspaceContext {
    notes::get_workspace_context(&paths)
}

#[tauri::command]
fn get_voice_audio(paths: State<Paths>, name: String) -> Result<String, String> {
    let filename = if name.ends_with(".mp3") { name } else { format!("{}.mp3", name) };
    let voice_path = paths.voices_dir().join(&filename);

    if !voice_path.starts_with(paths.voices_dir()) {
        return Err("Security violation: path traversal rejected".to_string());
    }

    let bytes = std::fs::read(&voice_path)
        .map_err(|e| format!("Could not read voice audio '{}': {}", filename, e))?;

    let b64 = base64_encode(&bytes);
    Ok(format!("data:audio/mp3;base64,{}", b64))
}

pub const TRAY_CLICK_EVENT: &'static str = "severus:open-workstation";

pub fn tray_click_emitted_event(action: &str) -> Option<&'static str> {
    match action {
        "show" | "maximize" | "left_click" => Some(TRAY_CLICK_EVENT),
        _ => None,
    }
}

pub fn calculate_floating_mode_dimensions(floating: bool) -> (f64, f64) {
    if floating {
        (780.0, 110.0)
    } else {
        (1280.0, 820.0)
    }
}

pub fn calculate_window_restore_bounds(_center: bool) -> (f64, f64, bool) {
    (1280.0, 820.0, true)
}

#[tauri::command]
fn restore_window(window: tauri::Window) -> Result<(), String> {
    let (width, height, unhide) = calculate_window_restore_bounds(true);
    if unhide {
        let _ = window.unminimize();
        let _ = window.show();
    }
    let _ = window.set_size(tauri::LogicalSize::new(width, height));
    let _ = window.center();
    let _ = window.set_focus();
    Ok(())
}

#[tauri::command]
fn hide_to_tray(window: tauri::Window) -> Result<(), String> {
    let _ = window.hide();
    Ok(())
}

#[derive(serde::Serialize)]
pub struct PhysicalCoordinates {
    pub x: i32,
    pub y: i32,
}

#[tauri::command]
fn set_floating_mode(window: tauri::Window, floating: bool) -> Result<(), String> {
    let (width, height) = calculate_floating_mode_dimensions(floating);
    if floating {
        let _ = window.set_fullscreen(false);
        let _ = window.unmaximize();
        let _ = window.set_size(tauri::LogicalSize::new(width, height));
        let _ = window.set_always_on_top(true);
    } else {
        let _ = window.set_always_on_top(false);
        let _ = window.set_size(tauri::LogicalSize::new(width, height));
        let _ = window.center();
        let _ = window.maximize();
        let _ = window.set_focus();
    }
    Ok(())
}

#[tauri::command]
fn set_floating_dimensions(window: tauri::Window, width: f64, height: f64) -> Result<(), String> {
    let _ = window.set_size(tauri::LogicalSize::new(width, height));
    Ok(())
}

#[tauri::command]
fn toggle_maximize(window: tauri::Window) -> Result<bool, String> {
    let is_max = window.is_maximized().unwrap_or(false);
    if is_max {
        let _ = window.unmaximize();
        Ok(false)
    } else {
        let _ = window.maximize();
        Ok(true)
    }
}

#[tauri::command]
fn maximize_window(window: tauri::Window) -> Result<(), String> {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.maximize();
    let _ = window.set_focus();
    Ok(())
}

#[tauri::command]
fn toggle_fullscreen(window: tauri::Window) -> Result<bool, String> {
    let is_fs = window.is_fullscreen().unwrap_or(false);
    let next = !is_fs;
    let _ = window.set_fullscreen(next);
    Ok(next)
}

#[tauri::command]
fn move_to_monitor(window: tauri::Window, target: String) -> Result<String, String> {    let mut monitors = window.available_monitors().map_err(|e| e.to_string())?;
    if monitors.is_empty() {
        return Err("No display monitors detected".to_string());
    }
    // Sort horizontally by physical X coordinate
    monitors.sort_by_key(|m| m.position().x);

    let current = window.current_monitor().ok().flatten();
    let curr_idx = if let Some(ref curr) = current {
        monitors.iter().position(|m| m.name() == curr.name()).unwrap_or(0)
    } else {
        0
    };

    let target_idx = match target.trim().to_lowercase().as_str() {
        "left" => {
            if curr_idx > 0 {
                curr_idx - 1
            } else {
                monitors.len() - 1
            }
        }
        "right" => {
            (curr_idx + 1) % monitors.len()
        }
        "next" | "switch" | "cycle" | "other" => {
            (curr_idx + 1) % monitors.len()
        }
        "prev" | "previous" => {
            if curr_idx > 0 {
                curr_idx - 1
            } else {
                monitors.len() - 1
            }
        }
        "primary" | "main" => {
            if let Ok(Some(pri)) = window.primary_monitor() {
                monitors.iter().position(|m| m.name() == pri.name()).unwrap_or(0)
            } else {
                0
            }
        }
        idx_str => {
            if let Ok(idx) = idx_str.parse::<usize>() {
                if idx > 0 && idx <= monitors.len() {
                    idx - 1
                } else {
                    (curr_idx + 1) % monitors.len()
                }
            } else {
                (curr_idx + 1) % monitors.len()
            }
        }
    };

    let target_monitor = &monitors[target_idx];
    let monitor_name = target_monitor
        .name()
        .map(|s| s.to_string())
        .unwrap_or_else(|| format!("Display {}", target_idx + 1));

    let was_maximized = window.is_maximized().unwrap_or(false);
    if was_maximized {
        let _ = window.unmaximize();
    }

    let m_pos = target_monitor.position();
    let m_size = target_monitor.size();
    let w_size = window.outer_size().unwrap_or(tauri::PhysicalSize::new(720, 110));

    let new_x = m_pos.x + ((m_size.width as i32 - w_size.width as i32) / 2);
    let new_y = m_pos.y + ((m_size.height as i32 - w_size.height as i32) / 2);

    window
        .set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(new_x, new_y)))
        .map_err(|e| e.to_string())?;

    if was_maximized {
        let _ = window.maximize();
    }
    let _ = window.set_focus();

    Ok(format!("Moved Severus to {}", monitor_name))
}

#[tauri::command]
fn system_resolve_command(text: String) -> Result<system_control::Resolution, String> {
    system_control::parse_command(&text).ok_or_else(|| "no matching system command".to_string())
}

#[tauri::command]
fn system_execute(
    paths: State<Paths>,
    intent: system_control::SystemIntent,
    confirmed: bool,
) -> Result<String, String> {
    system_control::execute(&intent, confirmed, &paths)
}

#[tauri::command]
fn system_list_windows() -> Result<Vec<system_control::WindowInfo>, String> {
    system_control::list_windows()
}

#[tauri::command]
fn open_sound_settings() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", "ms-settings:sound"])
            .spawn()
            .map_err(|e| format!("Could not open sound settings: {e}"))?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(())
    }
}

fn base64_encode(data: &[u8]) -> String {
    const ENGINE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut buf = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = chunk.get(1).map(|&b| b as usize).unwrap_or(0);
        let b2 = chunk.get(2).map(|&b| b as usize).unwrap_or(0);
        let triple = (b0 << 16) | (b1 << 8) | b2;

        buf.push(ENGINE[(triple >> 18) & 0x3F] as char);
        buf.push(ENGINE[(triple >> 12) & 0x3F] as char);
        if chunk.len() > 1 {
            buf.push(ENGINE[(triple >> 6) & 0x3F] as char);
        } else {
            buf.push('=');
        }
        if chunk.len() > 2 {
            buf.push(ENGINE[triple & 0x3F] as char);
        } else {
            buf.push('=');
        }
    }
    buf
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    std::panic::set_hook(Box::new(|info| {
        let msg = format!("SEVERUS PANIC: {:?}\n", info);
        let _ = std::fs::write("C:\\Users\\User\\Documents\\Severus\\panic.log", &msg);
    }));

    let result = tauri::Builder::default()
        .manage(Paths::resolve())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_graph_data,
            list_notes,
            read_note,
            save_note,
            append_journal,
            read_today_journal,
            open_in_editor,
            get_git_status,
            get_workspace_context,
            get_voice_audio,
            restore_window,
            hide_to_tray,
            set_floating_mode,
            move_to_monitor,
            system_resolve_command,
            system_execute,
            system_list_windows,
            memory::get_user_memories,
            memory::get_grounding_memories,
            memory::get_memory_summary,
            memory::save_user_memory,
            memory::delete_user_memory,
            open_sound_settings,
            toggle_maximize,
            maximize_window,
            toggle_fullscreen,
            set_floating_dimensions,
            gmail_auth::gmail_begin_auth,
            gmail_auth::secure_store,
            gmail_auth::secure_load,
            gmail_auth::secure_delete
        ])
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    let _ = window.hide();
                }
                tauri::WindowEvent::Focused(true) => {
                    let _ = window.emit("severus:focus", ());
                }
                _ => {}
            }
            if let Ok(true) = window.is_minimized() {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.emit("severus:minimize-to-pill", ());
            }
        })
        .setup(|app| {
            if let Some(icon) = app.default_window_icon() {
                for window in app.webview_windows().values() {
                    let _ = window.set_icon(icon.clone());
                }

                let show_i = MenuItem::with_id(app, "show", "Show Severus", true, None::<&str>)?;
                let max_i = MenuItem::with_id(app, "maximize", "Maximize Window", true, None::<&str>)?;
                let sep = PredefinedMenuItem::separator(app)?;
                let quit_i = MenuItem::with_id(app, "quit", "Quit Severus", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&show_i, &max_i, &sep, &quit_i])?;

                let _tray = TrayIconBuilder::new()
                    .icon(icon.clone())
                    .tooltip("Severus.ai — Second Brain")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "show" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.unminimize();
                                let _ = w.show();
                                let _ = w.center();
                                let _ = w.set_focus();
                                let _ = w.emit("severus:open-workstation", ());
                            }
                        }
                        "maximize" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.unminimize();
                                let _ = w.show();
                                let _ = w.maximize();
                                let _ = w.set_focus();
                                let _ = w.emit("severus:open-workstation", ());
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        match event {
                            TrayIconEvent::Click {
                                button: MouseButton::Left,
                                ..
                            }
                            | TrayIconEvent::DoubleClick {
                                button: MouseButton::Left,
                                ..
                            } => {
                                let app = tray.app_handle();
                                if let Some(w) = app.get_webview_window("main") {
                                    let _ = w.unminimize();
                                    let _ = w.show();
                                    let _ = w.center();
                                    let _ = w.set_focus();
                                    let _ = w.emit("severus:open-workstation", ());
                                }
                            }
                            _ => {}
                        }
                    })
                    .build(app)?;
            }
            let notes_dir = app.state::<Paths>().notes_dir();
            watcher::start(app.handle().clone(), notes_dir);

            // Auto-spawn the local voice daemons when their ports are inactive.
            // 17493 renders speech, 17494 recognizes it offline: WebView2 has no
            // speech service, so recognition depends entirely on the bridge.
            let root_dir = app.state::<Paths>().root.clone();
            std::thread::spawn(move || {
                let daemons = [
                    (17493u16, "cosyvoice_severus_server.py", Vec::<String>::new()),
                    (17494u16, "whisper_severus_server.py", Vec::<String>::new()),
                ];

                for (port, script_name, extra_args) in daemons {
                    let addr = format!("127.0.0.1:{}", port);
                    let parse_result = addr.parse();
                    if parse_result.is_err() {
                        eprintln!("[Severus Tauri] Warning: invalid daemon address {}", addr);
                        continue;
                    }
                    let socket_addr = parse_result.unwrap();
                    if std::net::TcpStream::connect_timeout(&socket_addr, std::time::Duration::from_millis(500)).is_ok() {
                        continue;
                    }

                    let script = root_dir.join("tools").join(script_name);
                    if !script.exists() {
                        eprintln!("[Severus Tauri] Warning: daemon script missing: {:?}", script);
                        continue;
                    }

                    let mut cmd = std::process::Command::new("python");
                    cmd.arg(&script);
                    for arg in &extra_args {
                        cmd.arg(arg);
                    }
                    #[cfg(target_os = "windows")]
                    {
                        use std::os::windows::process::CommandExt;
                        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
                    }
                    match cmd.spawn() {
                        Ok(_) => println!("[Severus Tauri] Started local voice daemon {} on port {}", script_name, port),
                        Err(e) => eprintln!(
                            "[Severus Tauri] Warning: Failed to spawn {} on port {}: {}",
                            script_name, port, e
                        ),
                    }
                }
            });

            // Center main desktop window on startup
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.center();
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }

            Ok(())
        })
        .run(tauri::generate_context!());

    if let Err(e) = result {
        let msg = format!("SEVERUS RUN ERROR: {:?}\n", e);
        let _ = std::fs::write("C:\\Users\\User\\Documents\\Severus\\panic.log", &msg);
        panic!("error while running tauri application: {:?}", e);
    }
}
