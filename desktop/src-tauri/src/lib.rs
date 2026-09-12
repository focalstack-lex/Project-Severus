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
            get_git_status
        ])
        .setup(|app| {
            let notes_dir = app.state::<Paths>().notes_dir();
            watcher::start(app.handle().clone(), notes_dir);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
