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
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, State};

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

#[tauri::command]
fn restore_window(window: tauri::Window) -> Result<(), String> {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.maximize();
    let _ = window.set_focus();
    Ok(())
}

#[tauri::command]
fn hide_to_tray(window: tauri::Window) -> Result<(), String> {
    let _ = window.hide();
    Ok(())
}

#[tauri::command]
fn set_floating_mode(window: tauri::Window, floating: bool) -> Result<(), String> {
    if floating {
        let _ = window.set_fullscreen(false);
        let _ = window.unmaximize();
        let _ = window.set_size(tauri::LogicalSize::new(720.0, 110.0));
        let _ = window.set_always_on_top(true);
        let _ = window.center();
    } else {
        let _ = window.set_always_on_top(false);
        let _ = window.set_size(tauri::LogicalSize::new(1360.0, 860.0));
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
    tauri::Builder::default()
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
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
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
                                let _ = w.set_focus();
                            }
                        }
                        "maximize" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.unminimize();
                                let _ = w.show();
                                let _ = w.maximize();
                                let _ = w.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            let app = tray.app_handle();
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.unminimize();
                                let _ = w.show();
                                let _ = w.maximize();
                                let _ = w.set_focus();
                            }
                        }
                    })
                    .build(app)?;
            }
            let notes_dir = app.state::<Paths>().notes_dir();
            watcher::start(app.handle().clone(), notes_dir);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
