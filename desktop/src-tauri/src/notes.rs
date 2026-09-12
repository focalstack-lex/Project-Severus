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

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct GitFileEntry {
    pub status: String,
    pub path: String,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct GitStatusData {
    pub branch: String,
    pub is_clean: bool,
    pub modified_count: usize,
    pub untracked_count: usize,
    pub files: Vec<GitFileEntry>,
}

pub fn parse_git_status(output: &str) -> GitStatusData {
    let mut branch = "main".to_string();
    let mut files = Vec::new();
    let mut modified_count = 0;
    let mut untracked_count = 0;

    for (idx, line) in output.lines().enumerate() {
        let trimmed = line.trim();
        if idx == 0 && trimmed.starts_with("##") {
            let b_line = trimmed.trim_start_matches("##").trim();
            if let Some((b_name, _)) = b_line.split_once("...") {
                branch = b_name.trim().to_string();
            } else if let Some((b_name, _)) = b_line.split_once(' ') {
                branch = b_name.trim().to_string();
            } else if !b_line.is_empty() {
                branch = b_line.to_string();
            }
            continue;
        }

        if line.len() < 3 {
            continue;
        }

        let status_code = line[..2].trim().to_string();
        let file_path = line[3..].trim().to_string();

        if status_code == "??" {
            untracked_count += 1;
        } else {
            modified_count += 1;
        }

        files.push(GitFileEntry {
            status: status_code,
            path: file_path,
        });
    }

    let is_clean = files.is_empty();
    GitStatusData {
        branch,
        is_clean,
        modified_count,
        untracked_count,
        files,
    }
}

pub fn get_git_status(paths: &Paths) -> Result<GitStatusData, String> {
    let output = std::process::Command::new("git")
        .args(["status", "--porcelain", "-b"])
        .current_dir(&paths.root)
        .output()
        .map_err(|e| format!("cannot run git: {e}"))?;

    if !output.status.success() {
        return Err(format!(
            "git status failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(parse_git_status(&stdout))
}

pub fn open_in_editor(paths: &Paths, id: &str) -> Result<(), String> {
    sanitize_name(id)?;
    let path = note_path(paths, id);
    if !path.exists() {
        return Err(format!("note file does not exist: {}", path.display()));
    }

    let path_str = path.to_string_lossy().to_string();

    #[cfg(target_os = "windows")]
    {
        // Try launching VS Code directly
        if std::process::Command::new("cmd")
            .args(["/C", "code", &path_str])
            .spawn()
            .is_ok()
        {
            return Ok(());
        }
        // Fall back to default system shell open
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &path_str])
            .spawn()
            .map_err(|e| format!("cannot open file in default editor: {e}"))?;
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        if std::process::Command::new("code")
            .arg(&path_str)
            .spawn()
            .is_ok()
        {
            return Ok(());
        }
        std::process::Command::new("xdg-open")
            .arg(&path_str)
            .spawn()
            .map_err(|e| format!("cannot open file: {e}"))?;
        Ok(())
    }
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

    #[test]
    fn parses_git_status_output() {
        let sample = "## main...origin/main [ahead 1]\n M src/lib.rs\n?? notes/New.md\n";
        let status = parse_git_status(sample);
        assert_eq!(status.branch, "main");
        assert!(!status.is_clean);
        assert_eq!(status.modified_count, 1);
        assert_eq!(status.untracked_count, 1);
        assert_eq!(status.files.len(), 2);
        assert_eq!(status.files[0].status, "M");
        assert_eq!(status.files[0].path, "src/lib.rs");
        assert_eq!(status.files[1].status, "??");
        assert_eq!(status.files[1].path, "notes/New.md");
    }
}
