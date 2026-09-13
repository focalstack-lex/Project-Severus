//! memory.rs — Severus Structured Memory Engine.
//!
//! Loads, filters, updates, and formats structured memory items from the USER/ directory.
//! Grounding summaries provide instant cognitive context to AI models.

use std::fs;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use tauri::State;
use crate::Paths;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MemoryItem {
    pub id: String,
    pub category: String,
    pub content: String,
    pub status: String,
    pub confidence: String,
    pub created_at: String,
    pub updated_at: String,
    pub source: String,
    #[serde(default)]
    pub related_project: Option<String>,
    pub importance: String,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct MemoryFilter {
    pub category: Option<String>,
    pub status: Option<String>,
    pub importance: Option<String>,
    pub search: Option<String>,
}

/// Recursively collect all `.json` files within a directory.
fn collect_json_files(dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    if !dir.exists() || !dir.is_dir() {
        return files;
    }

    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                files.extend(collect_json_files(&p));
            } else if p.extension().map_or(false, |ext| ext == "json") {
                files.push(p);
            }
        }
    }
    files
}

/// Load all structured memory items across all JSON files in USER/.
pub fn load_all_memories(user_dir: &Path) -> Result<Vec<MemoryItem>, String> {
    let json_files = collect_json_files(user_dir);
    let mut all_items = Vec::new();

    for file_path in json_files {
        match fs::read_to_string(&file_path) {
            Ok(content) => {
                match serde_json::from_str::<Vec<MemoryItem>>(&content) {
                    Ok(items) => all_items.extend(items),
                    Err(err) => {
                        eprintln!(
                            "[Memory] Warning: Failed to parse memory file {}: {}",
                            file_path.display(),
                            err
                        );
                    }
                }
            }
            Err(err) => {
                eprintln!(
                    "[Memory] Warning: Could not read memory file {}: {}",
                    file_path.display(),
                    err
                );
            }
        }
    }

    Ok(all_items)
}

/// Filter memories based on filter criteria.
pub fn filter_memories(items: Vec<MemoryItem>, filter: &MemoryFilter) -> Vec<MemoryItem> {
    items.into_iter().filter(|item| {
        if let Some(ref cat) = filter.category {
            if !cat.trim().is_empty() && !item.category.eq_ignore_ascii_case(cat.trim()) {
                return false;
            }
        }
        if let Some(ref stat) = filter.status {
            if !stat.trim().is_empty() && !item.status.eq_ignore_ascii_case(stat.trim()) {
                return false;
            }
        }
        if let Some(ref imp) = filter.importance {
            if !imp.trim().is_empty() && !item.importance.eq_ignore_ascii_case(imp.trim()) {
                return false;
            }
        }
        if let Some(ref query) = filter.search {
            let q = query.trim().to_lowercase();
            if !q.is_empty() {
                let matches_content = item.content.to_lowercase().contains(&q);
                let matches_id = item.id.to_lowercase().contains(&q);
                let matches_cat = item.category.to_lowercase().contains(&q);
                let matches_proj = item.related_project.as_deref().map_or(false, |p| p.to_lowercase().contains(&q));
                if !matches_content && !matches_id && !matches_cat && !matches_proj {
                    return false;
                }
            }
        }
        true
    }).collect()
}

/// Tauri Command: Get all user memories, optionally filtered.
#[tauri::command]
pub fn get_user_memories(
    paths: State<Paths>,
    filter: Option<MemoryFilter>,
) -> Result<Vec<MemoryItem>, String> {
    let user_dir = paths.user_dir();
    let all = load_all_memories(&user_dir)?;
    if let Some(f) = filter {
        Ok(filter_memories(all, &f))
    } else {
        Ok(all)
    }
}

/// Tauri Command: Get high-importance cognitive grounding memories.
#[tauri::command]
pub fn get_grounding_memories(paths: State<Paths>) -> Result<Vec<MemoryItem>, String> {
    let user_dir = paths.user_dir();
    let all = load_all_memories(&user_dir)?;

    let mut grounding = all.into_iter().filter(|item| {
        item.category == "hard_constraint"
            || item.importance == "high"
            || item.category == "identity"
            || (item.category == "projects" && item.status == "current")
    }).collect::<Vec<_>>();

    // Sort: hard_constraints first, then identity, then high-importance others
    grounding.sort_by(|a, b| {
        let rank = |item: &MemoryItem| match item.category.as_str() {
            "hard_constraint" => 0,
            "identity" => 1,
            "communication_style" => 2,
            "projects" => 3,
            "preferences" => 4,
            _ => 5,
        };
        rank(a).cmp(&rank(b))
    });

    Ok(grounding)
}

/// Tauri Command: Generate compact summary string for LLM system prompts.
#[tauri::command]
pub fn get_memory_summary(paths: State<Paths>) -> Result<String, String> {
    let user_dir = paths.user_dir();
    let all = load_all_memories(&user_dir)?;

    let mut identities = Vec::new();
    let mut education = Vec::new();
    let mut constraints = Vec::new();
    let mut projects = Vec::new();
    let mut habits_goals = Vec::new();
    let mut fitness = Vec::new();

    for item in all {
        if item.category == "hard_constraint" {
            constraints.push(format!("• {}", item.content));
        } else if item.category == "identity" {
            identities.push(format!("• {}", item.content));
        } else if item.category == "education" && item.status == "current" {
            education.push(format!("• {}", item.content));
        } else if item.category == "projects" && item.status == "current" {
            projects.push(format!("• {}", item.content));
        } else if item.category == "fitness" {
            fitness.push(format!("• {}", item.content));
        } else if (item.category == "goals" || item.category == "routines") && item.importance == "high" {
            habits_goals.push(format!("• {}", item.content));
        }
    }

    let summary = format!(
        "[SEVERUS STRUCTURED USER MEMORY — LEX MATONDO]\n\
        IDENTITY & REGIONAL CONTEXT:\n{}\n\n\
        EDUCATION & ACADEMICS:\n{}\n\n\
        FITNESS & RUNNING PHILOSOPHY:\n{}\n\n\
        MANDATORY HARD CONSTRAINTS (STRICT):\n{}\n\n\
        ACTIVE PROJECTS:\n{}\n\n\
        PRIMARY HABITS & GOALS:\n{}",
        if identities.is_empty() { "• Lex Matondo (20-year-old, Cor Jesu College of Digos, Davao Region)".to_string() } else { identities.join("\n") },
        if education.is_empty() { "• Bachelor of Science in Computer Engineering (BSCpE) student at Cor Jesu College of Digos".to_string() } else { education.join("\n") },
        if fitness.is_empty() { "• Endurance runner and hybrid athlete (Zone 2 aerobic base, 80/20 training distribution)".to_string() } else { fitness.join("\n") },
        if constraints.is_empty() { "• Do not change structure. Never describe Lex as based in Manila.".to_string() } else { constraints.join("\n") },
        if projects.is_empty() { "• Project Severus".to_string() } else { projects.join("\n") },
        if habits_goals.is_empty() { "• Systems over motivation (Atomic Habits)".to_string() } else { habits_goals.join("\n") }
    );

    Ok(summary)
}

/// Determine candidate JSON relative path for a memory item category.
fn category_to_rel_path(category: &str, status: &str) -> &'static str {
    match category.to_lowercase().as_str() {
        "identity" => "identity.json",
        "education" => "education.json",
        "skills" => "skills.json",
        "preferences" => "preferences.json",
        "hard_constraint" | "hard_constraints" => "hard_constraints.json",
        "communication_style" => "communication_style.json",
        "projects" => match status.to_lowercase().as_str() {
            "completed" => "projects/completed.json",
            "uncertain" | "idea" | "ideas" => "projects/ideas.json",
            "deprecated" | "archived" => "projects/archived.json",
            _ => "projects/active.json",
        },
        "goals" => "goals/technical.json",
        "routines" => "routines.json",
        "fitness" => "fitness.json",
        "equipment" => "equipment.json",
        "creative_work" => "creative_work.json",
        "portfolio" => "portfolio.json",
        "businesses" => "businesses.json",
        "decisions" => "decisions.json",
        "workflows" => "workflows.json",
        "historical_context" => "historical_context.json",
        _ => "preferences.json",
    }
}

/// Tauri Command: Save or update a memory item in the structured store.
#[tauri::command]
pub fn save_user_memory(paths: State<Paths>, item: MemoryItem) -> Result<(), String> {
    let user_dir = paths.user_dir();
    let json_files = collect_json_files(&user_dir);

    // First check if an existing item has this ID
    for file_path in &json_files {
        if let Ok(content) = fs::read_to_string(file_path) {
            if let Ok(mut items) = serde_json::from_str::<Vec<MemoryItem>>(&content) {
                if let Some(pos) = items.iter().position(|i| i.id == item.id) {
                    items[pos] = item;
                    let formatted = serde_json::to_string_pretty(&items)
                        .map_err(|e| format!("Failed to serialize memory items: {e}"))?;
                    fs::write(file_path, formatted)
                        .map_err(|e| format!("Failed to write to {}: {e}", file_path.display()))?;
                    return Ok(());
                }
            }
        }
    }

    // If new, append to the appropriate category file
    let rel_path = category_to_rel_path(&item.category, &item.status);
    let target_file = user_dir.join(rel_path);

    let mut items = if target_file.exists() {
        let content = fs::read_to_string(&target_file)
            .map_err(|e| format!("Failed to read target file {}: {e}", target_file.display()))?;
        serde_json::from_str::<Vec<MemoryItem>>(&content).unwrap_or_default()
    } else {
        Vec::new()
    };

    items.push(item);
    let formatted = serde_json::to_string_pretty(&items)
        .map_err(|e| format!("Failed to serialize memory items: {e}"))?;
    fs::write(&target_file, formatted)
        .map_err(|e| format!("Failed to write to {}: {e}", target_file.display()))?;

    Ok(())
}

/// Tauri Command: Delete a memory item by ID.
#[tauri::command]
pub fn delete_user_memory(paths: State<Paths>, id: String) -> Result<bool, String> {
    let user_dir = paths.user_dir();
    let json_files = collect_json_files(&user_dir);

    for file_path in json_files {
        if let Ok(content) = fs::read_to_string(&file_path) {
            if let Ok(mut items) = serde_json::from_str::<Vec<MemoryItem>>(&content) {
                if let Some(pos) = items.iter().position(|i| i.id == id) {
                    items.remove(pos);
                    let formatted = serde_json::to_string_pretty(&items)
                        .map_err(|e| format!("Failed to serialize memory items: {e}"))?;
                    fs::write(&file_path, formatted)
                        .map_err(|e| format!("Failed to write to {}: {e}", file_path.display()))?;
                    return Ok(true);
                }
            }
        }
    }

    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_filter_memories_by_category_and_search() {
        let items = vec![
            MemoryItem {
                id: "hc-001".to_string(),
                category: "hard_constraint".to_string(),
                content: "Do not modify existing navigation".to_string(),
                status: "hard_constraint".to_string(),
                confidence: "high".to_string(),
                created_at: "2026-09-13T20:00:00Z".to_string(),
                updated_at: "2026-09-13T20:00:00Z".to_string(),
                source: "test".to_string(),
                related_project: None,
                importance: "high".to_string(),
            },
            MemoryItem {
                id: "ident-001".to_string(),
                category: "identity".to_string(),
                content: "Lex Matondo, BSCpE student".to_string(),
                status: "current".to_string(),
                confidence: "high".to_string(),
                created_at: "2026-09-13T20:00:00Z".to_string(),
                updated_at: "2026-09-13T20:00:00Z".to_string(),
                source: "test".to_string(),
                related_project: None,
                importance: "high".to_string(),
            },
        ];

        let filter_cat = MemoryFilter {
            category: Some("hard_constraint".to_string()),
            ..Default::default()
        };
        let res = filter_memories(items.clone(), &filter_cat);
        assert_eq!(res.len(), 1);
        assert_eq!(res[0].id, "hc-001");

        let filter_search = MemoryFilter {
            search: Some("navigation".to_string()),
            ..Default::default()
        };
        let res_search = filter_memories(items, &filter_search);
        assert_eq!(res_search.len(), 1);
        assert_eq!(res_search[0].id, "hc-001");
    }
}
