//! Note and journal file operations. Every mutation is scoped to
//! `second-brain/notes/` and `journal/`; names are sanitized against traversal.

use std::fs;
use std::io::Write;
use std::path::PathBuf;

use serde::Serialize;

use crate::graph;
use crate::Paths;

#[derive(Serialize)]
pub struct NoteMeta {
    pub id: String,
    pub title: String,
    pub tags: Vec<String>,
}

#[derive(Serialize)]
pub struct NoteContent {
    pub id: String,
    pub title: String,
    pub content: String,
}

fn sanitize_name(name: &str) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("note name is empty".into());
    }
    if name.contains('/') || name.contains('\\') || name.contains("..") {
        return Err("note name must not contain path separators".into());
    }
    Ok(())
}

fn note_path(paths: &Paths, id: &str) -> PathBuf {
    let file = if id.to_lowercase().ends_with(".md") { id.to_string() } else { format!("{id}.md") };
    paths.notes_dir().join(file)
}

pub fn list_notes(paths: &Paths) -> Vec<NoteMeta> {
    let Ok(notes) = graph::scan_notes(&paths.notes_dir()) else { return Vec::new() };
    notes
        .into_iter()
        .map(|n| NoteMeta { id: n.id, title: n.title, tags: n.tags })
        .collect()
}

pub fn read_note(paths: &Paths, id: &str) -> Result<NoteContent, String> {
    sanitize_name(id)?;
    let path = note_path(paths, id);
    let content = fs::read_to_string(&path).map_err(|e| format!("cannot read note '{id}': {e}"))?;
    let title = graph::extract_title(&content, id);
    Ok(NoteContent { id: id.to_string(), title, content })
}

pub fn save_note(paths: &Paths, id: &str, content: &str) -> Result<(), String> {
    sanitize_name(id)?;
    let path = note_path(paths, id);
    fs::write(&path, content).map_err(|e| format!("cannot write note '{id}': {e}"))
}

pub fn append_journal(paths: &Paths, text: &str) -> Result<String, String> {
    let text = text.trim();
    if text.is_empty() {
        return Err("journal entry is empty".into());
    }
    let dir = paths.journal_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("cannot create journal directory: {e}"))?;

    let date = chrono::Local::now().format("%Y-%m-%d").to_string();
    let time = chrono::Local::now().format("%H:%M").to_string();
    let path = dir.join(format!("{date}.md"));

    let mut block = String::new();
    if !path.exists() {
        block.push_str(&format!("# {date}\n"));
    }
    block.push_str(&format!("- [{time}] {text}\n"));

    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("cannot open journal: {e}"))?;
    file.write_all(block.as_bytes())
        .map_err(|e| format!("cannot write journal: {e}"))?;
    Ok(format!("{date} {time}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn test_paths(tag: &str) -> (Paths, PathBuf) {
        let base =
            std::env::temp_dir().join(format!("severus-notes-test-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(base.join("second-brain").join("notes")).unwrap();
        fs::create_dir_all(base.join("journal")).unwrap();
        (Paths { root: base.clone() }, base)
    }

    #[test]
    fn rejects_path_traversal() {
        let (paths, base) = test_paths("traversal");
        assert!(read_note(&paths, "../AGENTS").is_err());
        assert!(read_note(&paths, "a\\b").is_err());
        assert!(save_note(&paths, "..", "x").is_err());
        assert!(!base.join("AGENTS.md").exists());
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn save_then_read_roundtrip() {
        let (paths, base) = test_paths("roundtrip");
        save_note(&paths, "New Note", "# New Note\n\nBody with #tag.\n").unwrap();
        let note = read_note(&paths, "New Note").unwrap();
        assert_eq!(note.title, "New Note");
        assert!(note.content.contains("#tag"));
        assert!(base.join("second-brain").join("notes").join("New Note.md").exists());
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn journal_appends_timestamped_entries() {
        let (paths, base) = test_paths("journal");
        append_journal(&paths, "first entry").unwrap();
        append_journal(&paths, "second entry").unwrap();
        let date = chrono::Local::now().format("%Y-%m-%d").to_string();
        let content =
            fs::read_to_string(base.join("journal").join(format!("{date}.md"))).unwrap();
        assert_eq!(content.lines().count(), 3); // heading + 2 entries
        assert!(content.contains("first entry") && content.contains("second entry"));
        let _ = fs::remove_dir_all(&base);
    }
}
