//! Severus Second Brain — Tauri v2 backend.
//!
//! Commands expose the knowledge graph and note/journal operations; a filesystem
//! watcher emits `notes-changed` so the UI stays live. All file IO is rooted at the
//! Severus workspace (`SEVERUS_ROOT` overrides, else `%USERPROFILE%\Documents\Severus`).

mod graph;
mod notes;
mod watcher;

use std::path::PathBuf;

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
            open_in_editor,
            get_git_status,
            get_workspace_context,
            get_voice_audio
        ])
        .setup(|app| {
            if let Some(icon) = app.default_window_icon() {
                for window in app.webview_windows().values() {
                    let _ = window.set_icon(icon.clone());
                }
            }
            let notes_dir = app.state::<Paths>().notes_dir();
            watcher::start(app.handle().clone(), notes_dir);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
