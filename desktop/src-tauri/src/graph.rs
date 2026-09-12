//! Second Brain graph pipeline — Rust port of `second-brain/build_graph.py`.
//!
//! Same algorithm and constants: directed `[[wiki-links]]` carry weight 1.0 and feed
//! PageRank, shared `#tags` create symmetric 0.3 edges. Freshness decay is applied by the
//! frontend (45-day half-life) from the raw `ageDays` this pipeline emits. A test asserts
//! the real workspace's hub note ranks first, keeping this pipeline and the Python one in
//! sync.

use std::collections::HashMap;
use std::fs;
use std::path::Path;

use serde::Serialize;

pub const WIKI_LINK_WEIGHT: f64 = 1.0;
pub const SHARED_TAG_WEIGHT: f64 = 0.3;
pub const DAMPING: f64 = 0.85;
pub const ITERATIONS: usize = 100;

#[derive(Serialize, Clone)]
pub struct GraphNode {
    pub id: String,
    pub title: String,
    pub tags: Vec<String>,
    pub excerpt: String,
    pub importance: f64,
    pub size: f64,
    #[serde(rename = "ageDays")]
    pub age_days: f64,
}

#[derive(Serialize, Clone)]
pub struct GraphLink {
    pub source: String,
    pub target: String,
    pub weight: f64,
}

#[derive(Serialize, Clone)]
pub struct GraphData {
    pub nodes: Vec<GraphNode>,
    pub links: Vec<GraphLink>,
    pub tags: Vec<String>,
}

pub struct RawNote {
    pub id: String,
    pub title: String,
    pub tags: Vec<String>,
    pub links: Vec<String>,
    pub excerpt: String,
    pub age_days: f64,
}

fn is_word(c: char) -> bool {
    c.is_alphanumeric() || c == '_'
}

/// Same behavior as the Python `(?<!\w)#([A-Za-z][A-Za-z0-9_-]*)` scanner.
pub fn extract_tags(text: &str) -> Vec<String> {
    let chars: Vec<char> = text.chars().collect();
    let mut tags: Vec<String> = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '#'
            && (i == 0 || !is_word(chars[i - 1]))
            && i + 1 < chars.len()
            && chars[i + 1].is_ascii_alphabetic()
        {
            let start = i + 1;
            let mut j = start;
            while j < chars.len() && (chars[j].is_ascii_alphanumeric() || chars[j] == '_' || chars[j] == '-') {
                j += 1;
            }
            tags.push(chars[start..j].iter().collect::<String>().to_lowercase());
            i = j;
        } else {
            i += 1;
        }
    }
    tags.sort();
    tags.dedup();
    tags
}

pub fn extract_links(text: &str) -> Vec<String> {
    let mut links = Vec::new();
    let mut rest = text;
    while let Some(start) = rest.find("[[") {
        let after = &rest[start + 2..];
        let Some(end) = after.find("]]") else { break };
        let name = after[..end].trim();
        if !name.is_empty() {
            links.push(name.to_string());
        }
        rest = &after[end + 2..];
    }
    links
}

/// First `# Heading` line (a single `#`, whitespace, then content); falls back to the stem.
pub fn extract_title(text: &str, stem: &str) -> String {
    for line in text.lines() {
        if let Some(rest) = line.strip_prefix('#') {
            let trimmed = rest.trim_start();
            // matches "#\s+..." but not "## Sub" (second '#' is not whitespace) and not bare "#"
            if rest.len() > trimmed.len() && !trimmed.is_empty() {
                return trimmed.trim_end().to_string();
            }
        }
    }
    stem.to_string()
}

fn extract_excerpt(text: &str) -> String {
    let Some(paragraph) = text
        .split("\n\n")
        .map(str::trim)
        .find(|p| !p.is_empty() && !p.starts_with('#'))
    else {
        return String::new();
    };

    // unwrap [[wiki-links]], keep the text
    let mut unwrapped = String::new();
    let mut rest = paragraph;
    while let Some(pos) = rest.find("[[") {
        unwrapped.push_str(&rest[..pos]);
        let after = &rest[pos + 2..];
        let Some(end) = after.find("]]") else { break };
        unwrapped.push_str(&after[..end]);
        rest = &after[end + 2..];
    }
    unwrapped.push_str(rest);

    // drop tag '#'s and emphasis '*'s, mirroring the Python excerpt cleanup
    let chars: Vec<char> = unwrapped.chars().collect();
    let mut cleaned = String::new();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c == '*' {
            i += 1;
        } else if c == '#'
            && (i == 0 || !is_word(chars[i - 1]))
            && i + 1 < chars.len()
            && chars[i + 1].is_ascii_alphabetic()
        {
            i += 1;
        } else {
            cleaned.push(c);
            i += 1;
        }
    }

    let cleaned = cleaned.trim();
    let mut excerpt: String = cleaned.chars().take(220).collect();
    if cleaned.chars().count() > 220 {
        excerpt.push('…');
    }
    excerpt
}

/// Tolerant scan: unreadable or non-`.md` entries are skipped, malformed syntax simply
/// yields empty fields. A missing directory surfaces as an error.
pub fn scan_notes(notes_dir: &Path) -> Result<Vec<RawNote>, String> {
    let entries = fs::read_dir(notes_dir)
        .map_err(|e| format!("cannot read notes directory {}: {e}", notes_dir.display()))?;
    let mut notes = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let Ok(content) = fs::read_to_string(&path) else { continue };
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else { continue };
        let age_days = fs::metadata(&path)
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.elapsed().ok())
            .map(|d| d.as_secs_f64() / 86_400.0)
            .unwrap_or(0.0)
            .max(0.0);
        notes.push(RawNote {
            id: stem.to_string(),
            title: extract_title(&content, stem),
            tags: extract_tags(&content),
            links: extract_links(&content),
            excerpt: extract_excerpt(&content),
            age_days: (age_days * 10.0).round() / 10.0,
        });
    }
    notes.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(notes)
}

pub fn compute_graph(notes_dir: &Path) -> Result<GraphData, String> {
    let notes = scan_notes(notes_dir)?;
    if notes.is_empty() {
        return Ok(GraphData { nodes: Vec::new(), links: Vec::new(), tags: Vec::new() });
    }

    let by_lower: HashMap<String, &str> =
        notes.iter().map(|n| (n.id.to_lowercase(), n.id.as_str())).collect();

    let mut edges: HashMap<(String, String), f64> = HashMap::new();
    for note in &notes {
        for link in &note.links {
            if let Some(target) = by_lower.get(&link.to_lowercase()) {
                add_edge(&mut edges, &note.id, target, WIKI_LINK_WEIGHT);
            }
        }
    }
    for i in 0..notes.len() {
        for j in (i + 1)..notes.len() {
            if notes[i].tags.iter().any(|t| notes[j].tags.contains(t)) {
                add_edge(&mut edges, &notes[i].id, &notes[j].id, SHARED_TAG_WEIGHT);
                add_edge(&mut edges, &notes[j].id, &notes[i].id, SHARED_TAG_WEIGHT);
            }
        }
    }

    let count = notes.len() as f64;
    let mut out_weight: HashMap<&str, f64> = HashMap::new();
    for note in &notes {
        out_weight.insert(note.id.as_str(), 0.0);
    }
    for (source, weight) in &edges {
        *out_weight.entry(source.0.as_str()).or_insert(0.0) += weight;
    }

    let mut ranks: HashMap<&str, f64> =
        notes.iter().map(|n| (n.id.as_str(), 1.0 / count)).collect();
    for _ in 0..ITERATIONS {
        let dangling: f64 = ranks
            .iter()
            .filter(|(id, _)| out_weight.get(**id).copied().unwrap_or(0.0) == 0.0)
            .map(|(_, rank)| rank)
            .sum();
        let mut next: HashMap<&str, f64> = notes
            .iter()
            .map(|n| (n.id.as_str(), (1.0 - DAMPING) / count + DAMPING * dangling / count))
            .collect();
        for ((source, target), weight) in &edges {
            let out = out_weight.get(source.as_str()).copied().unwrap_or(0.0);
            if out > 0.0 {
                *next.entry(target.as_str()).or_insert(0.0) +=
                    DAMPING * ranks[source.as_str()] * (weight / out);
            }
        }
        ranks = next;
    }

    let total: f64 = ranks.values().sum();
    let max: f64 = ranks.values().copied().fold(f64::MIN, f64::max);
    let mut tags: Vec<String> = notes.iter().flat_map(|n| n.tags.clone()).collect();
    tags.sort();
    tags.dedup();

    let nodes = notes
        .iter()
        .map(|note| {
            let rank = ranks.get(note.id.as_str()).copied().unwrap_or(0.0);
            GraphNode {
                id: note.id.clone(),
                title: note.title.clone(),
                tags: note.tags.clone(),
                excerpt: note.excerpt.clone(),
                importance: round2(rank / total * 100.0),
                size: round2(2.0 + 22.0 * (rank / max).powf(0.7)),
                age_days: note.age_days,
            }
        })
        .collect();

    let mut links: Vec<GraphLink> = edges
        .into_iter()
        .map(|((source, target), weight)| GraphLink { source, target, weight: round2(weight) })
        .collect();
    links.sort_by(|a, b| a.source.cmp(&b.source).then(a.target.cmp(&b.target)));

    Ok(GraphData { nodes, links, tags })
}

fn add_edge(edges: &mut HashMap<(String, String), f64>, source: &str, target: &str, weight: f64) {
    if source != target {
        edges
            .entry((source.to_string(), target.to_string()))
            .and_modify(|existing| *existing = existing.max(weight))
            .or_insert(weight);
    }
}

fn round2(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Paths;
    use std::path::PathBuf;

    fn temp_dir(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("severus-graph-test-{name}-{}", std::process::id()))
    }

    #[test]
    fn real_workspace_hub_is_the_ascension() {
        // Cross-checks this pipeline against the Python one, which reported the same hub.
        let paths = Paths::resolve();
        let data = compute_graph(&paths.notes_dir()).expect("graph computation failed");
        assert!(!data.nodes.is_empty(), "no notes found in the workspace");
        let hub = data
            .nodes
            .iter()
            .max_by(|a, b| a.importance.total_cmp(&b.importance))
            .expect("non-empty");
        assert_eq!(hub.id, "The Ascension", "hub note should rank highest");
        assert!(hub.importance > 30.0, "hub importance unexpectedly low: {}", hub.importance);
    }

    #[test]
    fn empty_dir_yields_empty_graph() {
        let dir = temp_dir("empty");
        fs::create_dir_all(&dir).unwrap();
        let data = compute_graph(&dir).unwrap();
        assert!(data.nodes.is_empty() && data.links.is_empty() && data.tags.is_empty());
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn links_carry_pagerank_and_tags_bridge() {
        let dir = temp_dir("pipeline");
        let notes = dir.join("notes");
        fs::create_dir_all(&notes).unwrap();
        fs::write(notes.join("A.md"), "# A\n\nPoints to [[B]]. #x\n").unwrap();
        fs::write(notes.join("B.md"), "# B\n\nTagged #x and #y.\n").unwrap();
        fs::write(notes.join("C.md"), "# C\n\nAlone.\n").unwrap();

        let data = compute_graph(&notes).unwrap();
        // A→B wiki-link (1.0, merged over the shared-tag 0.3 in that direction) + B→A 0.3
        assert_eq!(data.links.len(), 2);
        let a = data.nodes.iter().find(|n| n.id == "A").unwrap();
        let c = data.nodes.iter().find(|n| n.id == "C").unwrap();
        assert!(
            a.importance > c.importance,
            "linked+tagged node should outrank the isolated one"
        );
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn malformed_notes_do_not_crash() {
        let dir = temp_dir("malformed");
        let notes = dir.join("notes");
        fs::create_dir_all(&notes).unwrap();
        fs::write(notes.join("Broken.md"), "no heading, [[unclosed, #\n#").unwrap();
        let data = compute_graph(&notes).unwrap();
        assert_eq!(data.nodes.len(), 1);
        assert_eq!(data.nodes[0].title, "Broken"); // falls back to the file stem
        fs::remove_dir_all(&dir).ok();
    }
}
