//! Append-only IDE activity collector for Severus.
//!
//! Answers "what were we just working on" from observed signals instead of
//! reconstruction, across every editor Lex uses:
//!
//! - `git_log`: commit and file-change events from each declared workspace repo
//!   (14 day backfill on first run, incremental afterwards).
//! - `vscode_localhistory`: save events parsed read-only from the VS Code family
//!   Local History stores (`%APPDATA%/<Product>/User/History/<hash>/entries.json`).
//!   Verified present on this machine for `Code`, `Antigravity` and
//!   `Antigravity IDE`. A product without the store is reported as `missing`
//!   in the status log, never treated as zero activity.
//! - `fs_watcher`: live edit events from a recursive `notify` watcher on the
//!   configured watch roots, debounced 2 seconds and junk-filtered.
//! - `window_poll`: editor window focus events from a 5 second foreground
//!   window title poll (process name matched against known editor products).
//!
//! Everything lands in `second-brain/activity/ide_activity.jsonl`, one JSON
//! object per line. Guardrails enforced in this module:
//!
//! - Metadata only: path, timestamp, event kind, short detail. Never file
//!   contents, so Local History bodies (which contain whatever was ever saved)
//!   are never copied anywhere.
//! - Path allowlist: only configured workspace roots are persisted.
//! - Deny globs: `.env`, keys and credential-like names are never recorded.
//! - Junk filter: dependency and build churn never reaches the store, and the
//!   activity directory itself is excluded to prevent a feedback loop.
//! - Rotation and age trim: appends are the only runtime write path; trimming
//!   by age (default 30 days) and size happens at startup, rotation on size.
//! - Fail loud: a missing store, a missing history folder or a failed cycle is
//!   written to `collector_status.jsonl` and stderr, never swallowed.
//!
//! No new dependencies: `notify` and `chrono` were already in Cargo.toml for
//! the notes watcher, and the `windows` crate features needed here
//! (`Win32_Foundation`, `Win32_UI_WindowsAndMessaging`, `Win32_System_Threading`)
//! were already enabled for `system_control.rs`.

use std::collections::{HashMap, HashSet};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::RecvTimeoutError;
use std::sync::{Arc, Mutex};
use std::time::{Duration as StdDuration, Instant, SystemTime, UNIX_EPOCH};

use chrono::{DateTime, Local, SecondsFormat, TimeZone, Utc};
use notify::Watcher;
use serde::{Deserialize, Serialize};

const STORE_FILE: &str = "ide_activity.jsonl";
const STATUS_FILE: &str = "collector_status.jsonl";
const STATE_FILE: &str = "collector_state.json";
const CONFIG_FILE: &str = "config.json";

const SOURCE_GIT: &str = "git_log";
const SOURCE_HISTORY: &str = "vscode_localhistory";
const SOURCE_WATCHER: &str = "fs_watcher";
const SOURCE_POLL: &str = "window_poll";
const SOURCE_STORE: &str = "store";

const STATUS_OK: &str = "ok";
const STATUS_MISSING: &str = "missing";
const STATUS_ERROR: &str = "error";
const STATUS_SKIPPED: &str = "skipped";
const STATUS_STARTED: &str = "started";
const STATUS_DEGRADED: &str = "degraded";

/// Retrospective window for the first git pass of a repo.
const GIT_BACKFILL_DAYS: i64 = 14;

// ---------------------------------------------------------------- data model

/// One activity record. Field order is the JSON field order in the store.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityEvent {
    pub ts: String,
    pub source: String,
    pub ide: String,
    pub workspace: String,
    pub path: String,
    pub event: String,
    pub detail: String,
}

/// One collector health record in `collector_status.jsonl`.
#[derive(Debug, Clone, Serialize)]
struct StatusEvent {
    ts: String,
    source: String,
    target: String,
    status: String,
    detail: String,
}

/// Schema of a VS Code family `History/<hash>/entries.json`.
#[derive(Debug, Deserialize)]
struct HistoryFile {
    resource: String,
    #[serde(default)]
    entries: Vec<HistoryEntry>,
}

#[derive(Debug, Deserialize)]
struct HistoryEntry {
    #[serde(default)]
    #[allow(dead_code)]
    id: String,
    #[serde(default)]
    timestamp: Option<i64>,
    #[serde(default)]
    source: Option<String>,
}

/// Cursors persisted between runs so re-reads never duplicate events.
#[derive(Debug, Serialize, Deserialize, Default)]
struct PersistedState {
    #[serde(default)]
    git_last_hash: HashMap<String, String>,
    #[serde(default)]
    history_cursor: HashMap<String, i64>,
}

struct CollectorState {
    git_last_hash: HashMap<String, String>,
    history_cursor: HashMap<String, i64>,
    status_seen: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct SourceFlags {
    pub git: bool,
    pub local_history: bool,
    pub watcher: bool,
    pub window_poll: bool,
}

impl Default for SourceFlags {
    fn default() -> Self {
        Self { git: true, local_history: true, watcher: true, window_poll: true }
    }
}

/// User-editable collector configuration, seeded at
/// `second-brain/activity/config.json` on first run.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ActivityConfig {
    pub enabled: SourceFlags,
    /// Allowlist. Paths outside these roots are never persisted.
    pub roots: Vec<String>,
    /// Subset of roots watched live by the notify watcher.
    pub watch_roots: Vec<String>,
    /// APPDATA product folders scanned for VS Code family Local History.
    pub editor_products: Vec<String>,
    /// Foreground process names that count as editor focus.
    pub editor_processes: Vec<String>,
    /// Deny globs matched against every path component (case-insensitive).
    pub deny_globs: Vec<String>,
    /// Directory names whose churn is never recorded.
    pub junk_dirs: Vec<String>,
    /// File name globs whose churn is never recorded.
    pub junk_files: Vec<String>,
    pub max_age_days: u64,
    pub max_store_bytes: u64,
    pub git_interval_secs: u64,
    pub history_interval_secs: u64,
    pub window_poll_secs: u64,
    pub watcher_debounce_ms: u64,
}

impl Default for ActivityConfig {
    fn default() -> Self {
        Self {
            enabled: SourceFlags::default(),
            roots: Vec::new(),
            watch_roots: Vec::new(),
            editor_products: vec![
                "Code".into(),
                "Antigravity".into(),
                "Antigravity IDE".into(),
                "ZCode".into(),
                "Cursor".into(),
            ],
            editor_processes: vec![
                "Code".into(),
                "Code - Insiders".into(),
                "VSCodium".into(),
                "Antigravity".into(),
                "Antigravity IDE".into(),
                "ZCode".into(),
                "Cursor".into(),
            ],
            deny_globs: vec![
                ".env".into(),
                ".env.*".into(),
                "*.pem".into(),
                "*.key".into(),
                "credentials*".into(),
                "id_rsa*".into(),
                "*.pfx".into(),
                "*.p12".into(),
                "secrets*".into(),
                "*.kdbx".into(),
            ],
            junk_dirs: vec![
                "node_modules", "target", "dist", "build", "out", "coverage",
                ".next", ".venv", "venv", "__pycache__", ".git", ".gradle",
                ".idea", ".kilo", ".cache", ".dart_tool", ".expo", "site-packages",
            ]
            .into_iter().map(String::from).collect(),
            junk_files: vec![
                "package-lock.json", "pnpm-lock.yaml", "yarn.lock",
                "poetry.lock", "composer.lock", "Gemfile.lock",
                ".DS_Store", "Thumbs.db",
                // Editor atomic-write siblings observed live on 2026-09-27:
                // "App.tsx.tmp.<pid>.<hash>" from the concurrent IDE sessions.
                "*.tmp.*", "~$*",
            ]
            .into_iter().map(String::from).collect(),
            max_age_days: 30,
            max_store_bytes: 8 * 1024 * 1024,
            git_interval_secs: 900,
            history_interval_secs: 300,
            window_poll_secs: 5,
            watcher_debounce_ms: 2000,
        }
    }
}

impl ActivityConfig {
    /// Defaults with the workspace roots filled in: the Severus root itself,
    /// every sibling git repository under the same parent folder, and the
    /// Severus root as the only live-watched tree.
    fn for_root(root: &Path) -> Self {
        let mut config = Self::default();
        let mut roots = vec![root.to_string_lossy().to_string()];
        if let Some(parent) = root.parent() {
            if let Ok(entries) = fs::read_dir(parent) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p == root || !p.is_dir() || !p.join(".git").exists() {
                        continue;
                    }
                    roots.push(p.to_string_lossy().to_string());
                }
            }
        }
        roots.sort();
        roots.dedup();
        config.roots = roots;
        config.watch_roots = vec![root.to_string_lossy().to_string()];
        config
    }
}

// ---------------------------------------------------------------- summaries

#[derive(Debug, Serialize)]
pub struct NameCount {
    pub name: String,
    pub count: u64,
}

#[derive(Debug, Serialize)]
pub struct FileMover {
    pub workspace: String,
    pub path: String,
    pub count: u64,
    pub last_ts: String,
}

#[derive(Debug, Serialize)]
pub struct SourceStatus {
    pub source: String,
    pub target: String,
    pub status: String,
    pub detail: String,
}

#[derive(Debug, Serialize)]
pub struct ActivitySummary {
    pub generated_at: String,
    pub window_hours: f64,
    pub total_events: usize,
    pub malformed_lines: usize,
    pub by_workspace: Vec<NameCount>,
    pub top_files: Vec<FileMover>,
    pub by_source: Vec<NameCount>,
    pub sources: Vec<SourceStatus>,
    pub recent: Vec<ActivityEvent>,
}

// ---------------------------------------------------------------- helpers

fn now_ts() -> String {
    Local::now().to_rfc3339_opts(SecondsFormat::Millis, false)
}

fn now_unix() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn parse_ts(ts: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(ts).ok().map(|dt| dt.with_timezone(&Utc))
}

/// Percent-decode a URI component without pulling in a URL crate.
fn percent_decode(s: &str) -> String {
    fn hex_val(b: u8) -> Option<u8> {
        match b {
            b'0'..=b'9' => Some(b - b'0'),
            b'a'..=b'f' => Some(b - b'a' + 10),
            b'A'..=b'F' => Some(b - b'A' + 10),
            _ => None,
        }
    }
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(h), Some(l)) = (hex_val(bytes[i + 1]), hex_val(bytes[i + 2])) {
                out.push(h * 16 + l);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Resolve a `file:///` URI from `entries.json` to a plain path.
/// Returns None for non-file schemes and for any path containing a `.` or
/// `..` component, so a crafted entries.json can never escape the allowlist
/// by traversal.
fn parse_file_uri(uri: &str) -> Option<PathBuf> {
    let rest = uri.strip_prefix("file:///")?;
    let decoded = percent_decode(rest);
    let mut p = decoded.replace('\\', "/");
    // "/c:/Users/..." is the drive-letter form; drop the leading slash.
    if p.starts_with('/') && p.chars().nth(1) == Some(':') {
        p.remove(0);
    }
    if p.is_empty() {
        return None;
    }
    let has_bad_component = p.split('/').any(|c| c == ".." || c == ".");
    if has_bad_component {
        return None;
    }
    Some(PathBuf::from(p))
}

/// Lowercased, slash-normalized key with a trailing slash, for prefix checks.
fn root_key(p: &str) -> String {
    let mut k = p.replace('\\', "/").to_lowercase();
    while k.ends_with('/') {
        k.pop();
    }
    k.push('/');
    k
}

/// Case-insensitive prefix match of a path against the allowlist roots.
/// Returns the matched workspace display path and the remainder in its
/// original case. Longest root wins.
fn resolve_root(roots: &[(String, String)], lower_path: &str, orig_path: &str) -> Option<(String, String)> {
    for (key, display) in roots {
        if lower_path.starts_with(key.as_str()) {
            // to_lowercase preserves byte length for ASCII paths; fall back to
            // the lowercased remainder for exotic names rather than panicking.
            let rel = if lower_path.len() == orig_path.len() {
                orig_path[key.len()..].to_string()
            } else {
                lower_path[key.len()..].to_string()
            };
            return Some((display.clone(), rel));
        }
    }
    None
}

/// fnmatch-style glob with `*` and `?`; inputs are expected pre-lowercased.
fn glob_match(pattern: &[u8], text: &[u8]) -> bool {
    let (mut p, mut t) = (0usize, 0usize);
    let (mut star, mut mark) = (usize::MAX, 0usize);
    while t < text.len() {
        if p < pattern.len() && (pattern[p] == b'?' || pattern[p] == text[t]) {
            p += 1;
            t += 1;
        } else if p < pattern.len() && pattern[p] == b'*' {
            star = p;
            mark = t;
            p += 1;
        } else if star != usize::MAX {
            p = star + 1;
            mark += 1;
            t = mark;
        } else {
            return false;
        }
    }
    while p < pattern.len() && pattern[p] == b'*' {
        p += 1;
    }
    p == pattern.len()
}

/// Junk filter over forward-slash path components of a workspace-relative
/// path. Covers junk directories anywhere in the path, `*.lock` files, and
/// configured junk file globs on the file name. Case-insensitive by contract:
/// components are normalized here so no caller can forget.
fn is_junk(comps: &[String], junk_dirs: &[String], junk_files: &[String]) -> bool {
    for c in comps {
        let c = c.to_lowercase();
        if junk_dirs.iter().any(|j| j == &c) {
            return true;
        }
        if c.ends_with(".lock") {
            return true;
        }
        if junk_files.iter().any(|j| glob_match(j.as_bytes(), c.as_bytes())) {
            return true;
        }
    }
    false
}

/// Deny filter: any path component matching any deny glob blocks the event.
/// Case-insensitive by the same contract as `is_junk`.
fn is_denied(comps: &[String], deny_globs: &[String]) -> bool {
    comps.iter().any(|c| {
        let c = c.to_lowercase();
        deny_globs.iter().any(|g| glob_match(g.as_bytes(), c.as_bytes()))
    })
}

/// Foreground image file name "Code.exe" becomes editor id "code".
fn process_stem(exe_name: &str) -> String {
    let lower = exe_name.to_lowercase();
    lower.strip_suffix(".exe").unwrap_or(&lower).to_string()
}

/// "Antigravity IDE" becomes "antigravity-ide" for the `ide` field.
fn product_slug(product: &str) -> String {
    product.to_lowercase().replace(' ', "-")
}

fn history_dir(product: &str) -> Option<PathBuf> {
    let appdata = std::env::var("APPDATA").ok()?;
    Some(Path::new(&appdata).join(product).join("User").join("History"))
}

/// Parse `git log --name-only --pretty=format:%x01%H%x09%cI` output into
/// (hash, committer-date, files) entries, newest first.
fn parse_git_log(text: &str) -> Vec<(String, String, Vec<String>)> {
    let mut out = Vec::new();
    for chunk in text.split('\u{1}') {
        let chunk = chunk.trim_matches(['\n', '\r']);
        if chunk.is_empty() {
            continue;
        }
        let mut lines = chunk.lines();
        let head = lines.next().unwrap_or_default();
        let mut hp = head.splitn(2, '\t');
        let hash = hp.next().unwrap_or_default().trim().to_string();
        let ts = hp.next().unwrap_or_default().trim().to_string();
        if hash.is_empty() || ts.is_empty() {
            continue;
        }
        let files = lines.map(str::trim).filter(|f| !f.is_empty()).map(String::from).collect();
        out.push((hash, ts, files));
    }
    out
}

// ---------------------------------------------------------------- the store

/// Append-only line sink with startup-free size rotation: when the file grows
/// past the cap it is closed, renamed to `<name>.1` (replacing the previous
/// generation) and reopened fresh on the next append.
struct LineSink {
    path: PathBuf,
    max_bytes: u64,
    file: Mutex<Option<std::fs::File>>,
}

impl LineSink {
    fn new(path: PathBuf, max_bytes: u64) -> Self {
        Self { path, max_bytes, file: Mutex::new(None) }
    }

    fn append_line(&self, line: &str) -> Result<(), String> {
        let mut guard = self.file.lock().map_err(|e| format!("sink lock poisoned: {e}"))?;
        if guard.is_none() {
            if let Some(parent) = self.path.parent() {
                fs::create_dir_all(parent).map_err(|e| format!("mkdir {:?}: {e}", parent))?;
            }
            let f = OpenOptions::new()
                .append(true)
                .create(true)
                .open(&self.path)
                .map_err(|e| format!("open {:?}: {e}", self.path))?;
            *guard = Some(f);
        }
        {
            let f = guard.as_mut().unwrap();
            f.write_all(line.as_bytes()).map_err(|e| format!("write {:?}: {e}", self.path))?;
            f.write_all(b"\n").map_err(|e| format!("write {:?}: {e}", self.path))?;
            f.flush().map_err(|e| format!("flush {:?}: {e}", self.path))?;
        }
        let len = guard.as_ref().unwrap().metadata().map_err(|e| format!("stat {:?}: {e}", self.path))?.len();
        if len > self.max_bytes {
            // Close the handle first: Windows refuses to rename an open file.
            *guard = None;
            let old = PathBuf::from(format!("{}.1", self.path.to_string_lossy()));
            fs::rename(&self.path, &old).map_err(|e| format!("rotate {:?}: {e}", self.path))?;
        }
        Ok(())
    }
}

pub struct ActivityStore {
    dir: PathBuf,
    /// Workspace-relative prefix of the activity dir, excluded from collection.
    activity_rel: String,
    config: ActivityConfig,
    /// (lowercased key with trailing slash, display path), longest first.
    roots: Vec<(String, String)>,
    state: Mutex<CollectorState>,
    main: LineSink,
    status: LineSink,
    /// Set when the activity dir could not be created: collectors stay off,
    /// the query still answers with the degraded status.
    degraded: bool,
    git_beat: AtomicU64,
    history_beat: AtomicU64,
    watcher_beat: AtomicU64,
    poll_beat: AtomicU64,
}

impl ActivityStore {
    pub fn new(root: &Path) -> Self {
        let dir = root.join("second-brain").join("activity");
        let mut degraded = false;
        if let Err(e) = fs::create_dir_all(&dir) {
            eprintln!("[Severus Activity] FATAL: cannot create activity dir {:?}: {}", dir, e);
            degraded = true;
        }
        let config = Self::load_config(root, &dir);
        let roots = Self::build_roots(&config.roots);
        let cap = config.max_store_bytes;
        let store = ActivityStore {
            dir: dir.clone(),
            activity_rel: "second-brain/activity".to_string(),
            state: Mutex::new(Self::load_state(&dir)),
            main: LineSink::new(dir.join(STORE_FILE), cap),
            status: LineSink::new(dir.join(STATUS_FILE), cap),
            degraded,
            git_beat: AtomicU64::new(0),
            history_beat: AtomicU64::new(0),
            watcher_beat: AtomicU64::new(0),
            poll_beat: AtomicU64::new(0),
            config,
            roots,
        };
        if !store.degraded {
            for path in [dir.join(STORE_FILE), dir.join(STATUS_FILE)] {
                if let Err(e) = store.trim_file(&path) {
                    eprintln!("[Severus Activity] startup trim failed for {:?}: {}", path, e);
                }
            }
        }
        store
    }

    fn load_config(root: &Path, dir: &Path) -> ActivityConfig {
        let path = dir.join(CONFIG_FILE);
        if !path.exists() {
            let seed = ActivityConfig::for_root(root);
            if let Ok(json) = serde_json::to_string_pretty(&seed) {
                if let Err(e) = fs::write(&path, json) {
                    eprintln!("[Severus Activity] could not seed config {:?}: {}", path, e);
                }
            }
            return seed;
        }
        match fs::read_to_string(&path).map_err(|e| e.to_string())
            .and_then(|raw| serde_json::from_str::<ActivityConfig>(&raw).map_err(|e| e.to_string()))
        {
            Ok(mut cfg) => {
                // An emptied allowlist must not silently switch the collector off.
                if cfg.roots.is_empty() {
                    eprintln!("[Severus Activity] config has empty roots; restoring workspace root");
                    cfg.roots = vec![root.to_string_lossy().to_string()];
                }
                if cfg.watch_roots.is_empty() {
                    cfg.watch_roots = cfg.roots.clone();
                }
                cfg.deny_globs = cfg.deny_globs.iter().map(|g| g.to_lowercase()).collect();
                cfg.junk_dirs = cfg.junk_dirs.iter().map(|g| g.to_lowercase()).collect();
                cfg.junk_files = cfg.junk_files.iter().map(|g| g.to_lowercase()).collect();
                cfg
            }
            Err(e) => {
                eprintln!("[Severus Activity] unreadable config {:?} ({}); using defaults", path, e);
                ActivityConfig::for_root(root)
            }
        }
    }

    fn build_roots(roots: &[String]) -> Vec<(String, String)> {
        let mut pairs: Vec<(String, String)> = roots
            .iter()
            .map(|r| {
                let display = r.replace('\\', "/");
                (root_key(r), display)
            })
            .collect();
        pairs.sort_by(|a, b| b.0.len().cmp(&a.0.len()));
        pairs.dedup_by(|a, b| a.0 == b.0);
        pairs
    }

    fn load_state(dir: &Path) -> CollectorState {
        let path = dir.join(STATE_FILE);
        let persisted: PersistedState = fs::read_to_string(&path)
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default();
        CollectorState {
            git_last_hash: persisted.git_last_hash,
            history_cursor: persisted.history_cursor,
            status_seen: HashMap::new(),
        }
    }

    fn with_state<T>(&self, f: impl FnOnce(&mut CollectorState) -> T) -> Option<T> {
        match self.state.lock() {
            Ok(mut s) => Some(f(&mut s)),
            Err(_) => {
                eprintln!("[Severus Activity] collector state lock poisoned");
                None
            }
        }
    }

    fn save_state(&self) {
        if self.degraded {
            return;
        }
        let snap = self.with_state(|s| PersistedState {
            git_last_hash: s.git_last_hash.clone(),
            history_cursor: s.history_cursor.clone(),
        });
        let Some(snap) = snap else { return };
        let target = self.dir.join(STATE_FILE);
        let tmp = self.dir.join(format!("{}.tmp", STATE_FILE));
        let write = || -> Result<(), String> {
            let json = serde_json::to_string_pretty(&snap).map_err(|e| e.to_string())?;
            fs::write(&tmp, json).map_err(|e| format!("write {:?}: {e}", tmp))?;
            fs::rename(&tmp, &target).map_err(|e| format!("rename {:?}: {e}", target))?;
            Ok(())
        };
        if let Err(e) = write() {
            eprintln!("[Severus Activity] state save failed: {}", e);
        }
    }

    fn git_cursor(&self, repo: &str) -> Option<String> {
        self.with_state(|s| s.git_last_hash.get(repo).cloned()).flatten()
    }

    fn set_git_cursor(&self, repo: &str, hash: &str) {
        self.with_state(|s| { s.git_last_hash.insert(repo.to_string(), hash.to_string()); });
    }

    fn history_cursor(&self, dir_id: &str) -> Option<i64> {
        self.with_state(|s| s.history_cursor.get(dir_id).copied()).flatten()
    }

    fn set_history_cursor(&self, dir_id: &str, ts: i64) {
        self.with_state(|s| { s.history_cursor.insert(dir_id.to_string(), ts); });
    }

    /// Allowlist resolution for an absolute path in slash form.
    fn locate(&self, lower_path: &str, orig_path: &str) -> Option<(String, String)> {
        resolve_root(&self.roots, lower_path, orig_path)
    }

    /// Content-independent filters for a workspace-relative path: the activity
    /// store itself, junk churn and denied (secret-like) names never persist.
    fn filter_rel(&self, rel: &str) -> bool {
        if rel.is_empty() {
            return false;
        }
        if rel == self.activity_rel || rel.starts_with(&format!("{}/", self.activity_rel)) {
            return false;
        }
        let comps: Vec<String> = rel.split('/').map(|c| c.to_lowercase()).collect();
        if is_junk(&comps, &self.config.junk_dirs, &self.config.junk_files) {
            return false;
        }
        if is_denied(&comps, &self.config.deny_globs) {
            return false;
        }
        true
    }

    /// Watcher callback path to event, or None when filtered out.
    fn build_edit_event(&self, path: &Path) -> Option<ActivityEvent> {
        if path.is_dir() {
            return None;
        }
        let orig = path.to_string_lossy().replace('\\', "/");
        let lower = orig.to_lowercase();
        let (workspace, rel) = self.locate(&lower, &orig)?;
        if !self.filter_rel(&rel) {
            return None;
        }
        Some(ActivityEvent {
            ts: now_ts(),
            source: SOURCE_WATCHER.into(),
            ide: "filesystem".into(),
            workspace,
            path: rel,
            event: "edit".into(),
            detail: String::new(),
        })
    }

    pub fn append_event(&self, e: ActivityEvent) {
        if self.degraded {
            return;
        }
        let line = match serde_json::to_string(&e) {
            Ok(l) => l,
            Err(err) => {
                self.record_status(SOURCE_STORE, STORE_FILE, STATUS_ERROR, &format!("serialize failed: {err}"));
                return;
            }
        };
        if let Err(err) = self.main.append_line(&line) {
            eprintln!("[Severus Activity] append failed: {}", err);
            self.record_status(SOURCE_STORE, STORE_FILE, STATUS_ERROR, &err);
        }
    }

    /// Health transition record: written to stderr always, to the status store
    /// only when the status for this source/target changed. Keeps healthy
    /// cycles silent and failures loud without flooding the status file.
    pub fn record_status(&self, source: &str, target: &str, status: &str, detail: &str) {
        eprintln!("[Severus Activity] {}/{}: {} ({})", source, target, status, detail);
        if self.degraded {
            return;
        }
        let key = format!("{}/{}", source, target);
        let changed = self
            .with_state(|s| {
                if s.status_seen.get(&key).map(String::as_str) == Some(status) {
                    false
                } else {
                    s.status_seen.insert(key, status.to_string());
                    true
                }
            })
            .unwrap_or(false);
        if !changed {
            return;
        }
        let ev = StatusEvent {
            ts: now_ts(),
            source: source.into(),
            target: target.into(),
            status: status.into(),
            detail: detail.into(),
        };
        if let Ok(line) = serde_json::to_string(&ev) {
            if let Err(e) = self.status.append_line(&line) {
                eprintln!("[Severus Activity] status append failed: {}", e);
            }
        }
    }

    /// Age and size trim for a JSONL store. Malformed lines are kept (they are
    /// evidence, and the size cap still bounds them). Atomic via temp + rename.
    fn trim_file(&self, path: &Path) -> Result<(), String> {
        if !path.is_file() {
            return Ok(());
        }
        let content = fs::read_to_string(path).map_err(|e| format!("read {:?}: {e}", path))?;
        let cutoff = Utc::now() - chrono::Duration::days(self.config.max_age_days.min(36_500) as i64);
        let max = self.config.max_store_bytes as usize;
        let mut kept: Vec<&str> = Vec::new();
        let mut dropped = 0usize;
        for line in content.lines() {
            let keep = line.trim().is_empty()
                || serde_json::from_str::<serde_json::Value>(line)
                    .ok()
                    .and_then(|v| v.get("ts").and_then(|t| t.as_str()).and_then(parse_ts))
                    .map_or(true, |dt| dt >= cutoff);
            if keep {
                kept.push(line);
            } else {
                dropped += 1;
            }
        }
        while kept.iter().map(|l| l.len() + 1).sum::<usize>() > max && !kept.is_empty() {
            kept.remove(0);
            dropped += 1;
        }
        if dropped == 0 {
            return Ok(());
        }
        let mut out = kept.join("\n");
        if !out.is_empty() {
            out.push('\n');
        }
        let tmp = path.with_extension("trim.tmp");
        fs::write(&tmp, out).map_err(|e| format!("write {:?}: {e}", tmp))?;
        fs::rename(&tmp, path).map_err(|e| format!("rename {:?}: {e}", path))?;
        Ok(())
    }

    fn beat_status(beat: u64, interval_secs: u64) -> String {
        if beat == 0 {
            return "starting".to_string();
        }
        let now = now_unix();
        if now.saturating_sub(beat) > interval_secs.saturating_mul(3).saturating_add(60) {
            "stale".to_string()
        } else {
            "ok".to_string()
        }
    }

    fn source_status(&self) -> Vec<SourceStatus> {
        let mut out = Vec::new();
        out.push(SourceStatus {
            source: SOURCE_STORE.into(),
            target: STORE_FILE.into(),
            status: if self.degraded { STATUS_DEGRADED.into() } else { STATUS_OK.into() },
            detail: if self.degraded {
                "activity dir unavailable at startup".into()
            } else {
                fs::metadata(&self.main.path).map(|m| format!("{} bytes", m.len())).unwrap_or_else(|_| "empty".into())
            },
        });
        if self.config.enabled.git {
            for (_, display) in &self.roots {
                let repo_path = display.trim_end_matches('/');
                let repo = Path::new(repo_path).join(".git").exists();
                out.push(SourceStatus {
                    source: SOURCE_GIT.into(),
                    target: display.to_string(),
                    status: if repo { Self::beat_status(self.git_beat.load(Ordering::Relaxed), self.config.git_interval_secs) } else { STATUS_SKIPPED.into() },
                    detail: if repo { "git log collector".into() } else { "not a git repository".into() },
                });
            }
        }
        if self.config.enabled.local_history {
            for product in &self.config.editor_products {
                let present = history_dir(product).map(|p| p.is_dir()).unwrap_or(false);
                out.push(SourceStatus {
                    source: SOURCE_HISTORY.into(),
                    target: product.clone(),
                    status: if present { Self::beat_status(self.history_beat.load(Ordering::Relaxed), self.config.history_interval_secs) } else { STATUS_MISSING.into() },
                    detail: if present { "Local History store present".into() } else { "no User\\History under APPDATA product folder".into() },
                });
            }
        }
        if self.config.enabled.watcher {
            let live = self.config.watch_roots.iter().filter(|r| Path::new(r).is_dir()).count();
            out.push(SourceStatus {
                source: SOURCE_WATCHER.into(),
                target: "roots".into(),
                status: if live > 0 { Self::beat_status(self.watcher_beat.load(Ordering::Relaxed), 60) } else { STATUS_MISSING.into() },
                detail: format!("{} of {} watch roots live", live, self.config.watch_roots.len()),
            });
        }
        if self.config.enabled.window_poll {
            out.push(SourceStatus {
                source: SOURCE_POLL.into(),
                target: "foreground".into(),
                status: Self::beat_status(self.poll_beat.load(Ordering::Relaxed), self.config.window_poll_secs),
                detail: "5 second foreground window poll".into(),
            });
        }
        out
    }

    /// Read the store and aggregate the requested window.
    pub fn query(&self, limit: usize, hours: f64) -> ActivitySummary {
        let cutoff = Utc::now() - chrono::Duration::milliseconds((hours * 3_600_000.0) as i64);
        let mut malformed = 0usize;
        let mut window: Vec<ActivityEvent> = Vec::new();
        if let Ok(content) = fs::read_to_string(&self.main.path) {
            for line in content.lines() {
                if line.trim().is_empty() {
                    continue;
                }
                match serde_json::from_str::<ActivityEvent>(line) {
                    Ok(e) => {
                        if parse_ts(&e.ts).map_or(false, |dt| dt >= cutoff) {
                            window.push(e);
                        }
                    }
                    Err(_) => malformed += 1,
                }
            }
        }
        let total = window.len();

        let mut ws_counts: HashMap<String, u64> = HashMap::new();
        let mut src_counts: HashMap<String, u64> = HashMap::new();
        let mut files: HashMap<(String, String), (u64, String)> = HashMap::new();
        for e in &window {
            *src_counts.entry(e.source.clone()).or_insert(0) += 1;
            let ws = if e.workspace.is_empty() { "(no workspace)".to_string() } else { e.workspace.clone() };
            *ws_counts.entry(ws).or_insert(0) += 1;
            if !e.path.is_empty() {
                let entry = files.entry((e.workspace.clone(), e.path.clone())).or_insert((0, e.ts.clone()));
                entry.0 += 1;
                if e.ts > entry.1 {
                    entry.1 = e.ts.clone();
                }
            }
        }

        let mut by_workspace: Vec<NameCount> =
            ws_counts.into_iter().map(|(name, count)| NameCount { name, count }).collect();
        by_workspace.sort_by(|a, b| b.count.cmp(&a.count).then(a.name.cmp(&b.name)));
        let mut by_source: Vec<NameCount> =
            src_counts.into_iter().map(|(name, count)| NameCount { name, count }).collect();
        by_source.sort_by(|a, b| b.count.cmp(&a.count).then(a.name.cmp(&b.name)));
        let mut top_files: Vec<FileMover> = files
            .into_iter()
            .map(|((workspace, path), (count, last_ts))| FileMover { workspace, path, count, last_ts })
            .collect();
        top_files.sort_by(|a, b| b.count.cmp(&a.count).then(b.last_ts.cmp(&a.last_ts)));
        top_files.truncate(12);

        window.sort_by(|a, b| a.ts.cmp(&b.ts));
        let start = window.len().saturating_sub(limit);
        let recent = window[start..].to_vec();

        ActivitySummary {
            generated_at: now_ts(),
            window_hours: hours,
            total_events: total,
            malformed_lines: malformed,
            by_workspace,
            top_files,
            by_source,
            sources: self.source_status(),
            recent,
        }
    }
}

// ---------------------------------------------------------------- collectors

pub fn start_collectors(store: Arc<ActivityStore>) {
    // Startup status: every configured editor product reports whether its
    // Local History store exists, so a missing store is loud, not silent.
    for product in &store.config.editor_products {
        let present = history_dir(product).map(|p| p.is_dir()).unwrap_or(false);
        store.record_status(
            SOURCE_HISTORY,
            product,
            if present { STATUS_OK } else { STATUS_MISSING },
            if present { "Local History store present" } else { "no User\\History folder in APPDATA" },
        );
    }
    for root in &store.config.roots {
        let repo = Path::new(root).join(".git").exists();
        store.record_status(
            SOURCE_GIT,
            root,
            if repo { STATUS_STARTED } else { STATUS_SKIPPED },
            if repo { "git log collector active" } else { "not a git repository" },
        );
    }
    if store.config.enabled.git {
        let s = store.clone();
        std::thread::spawn(move || git_loop(s));
    }
    if store.config.enabled.local_history {
        let s = store.clone();
        std::thread::spawn(move || history_loop(s));
    }
    if store.config.enabled.watcher {
        start_watcher(store.clone());
    }
    if store.config.enabled.window_poll {
        start_window_poll(store);
    }
}

fn git_loop(store: Arc<ActivityStore>) {
    let interval = StdDuration::from_secs(store.config.git_interval_secs.max(60));
    loop {
        for root in store.config.roots.clone() {
            if let Err(e) = collect_git_once(&store, &root) {
                store.record_status(SOURCE_GIT, &root, STATUS_ERROR, &e);
            }
        }
        store.git_beat.store(now_unix(), Ordering::Relaxed);
        store.save_state();
        std::thread::sleep(interval);
    }
}

/// One git pass over one repo. First run backfills GIT_BACKFILL_DAYS;
/// afterwards events are emitted only for commits newer than the persisted
/// cursor hash. If the cursor is unreachable (history rewrite), the walk falls
/// back to the same 14 day window instead of duplicating everything.
fn collect_git_once(store: &ActivityStore, root_display: &str) -> Result<(), String> {
    let root = Path::new(root_display);
    if !root.join(".git").exists() {
        store.record_status(SOURCE_GIT, root_display, STATUS_SKIPPED, "not a git repository");
        return Ok(());
    }
    let out = Command::new("git")
        .current_dir(root)
        .args(["-c", "core.quotepath=off", "log", "--name-only", "--pretty=format:%x01%H%x09%cI", "-n", "500"])
        .output()
        .map_err(|e| format!("git spawn failed: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "git log exited with {}: {}",
            out.status.code().unwrap_or(-1),
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    let entries = parse_git_log(&String::from_utf8_lossy(&out.stdout));
    let cursor = store.git_cursor(root_display);
    let hit = cursor.as_ref().map_or(true, |c| entries.iter().any(|(h, _, _)| h == c));
    let cutoff = Utc::now() - chrono::Duration::days(GIT_BACKFILL_DAYS);

    for (hash, ts, files) in &entries {
        if cursor.as_deref() == Some(hash.as_str()) {
            break;
        }
        if cursor.is_none() || !hit {
            let within = parse_ts(ts).map_or(false, |dt| dt >= cutoff);
            if !within {
                continue;
            }
        }
        for file in files {
            if !store.filter_rel(file) {
                continue;
            }
            store.append_event(ActivityEvent {
                ts: ts.clone(),
                source: SOURCE_GIT.into(),
                ide: "git".into(),
                workspace: root_display.to_string(),
                path: file.clone(),
                event: "commit".into(),
                detail: hash.chars().take(10).collect(),
            });
        }
    }
    if let Some((newest, _, _)) = entries.first() {
        store.set_git_cursor(root_display, newest);
    }
    Ok(())
}

fn history_loop(store: Arc<ActivityStore>) {
    let interval = StdDuration::from_secs(store.config.history_interval_secs.max(60));
    loop {
        for product in store.config.editor_products.clone() {
            if let Err(e) = collect_history_once(&store, &product) {
                store.record_status(SOURCE_HISTORY, &product, STATUS_ERROR, &e);
            }
        }
        store.history_beat.store(now_unix(), Ordering::Relaxed);
        std::thread::sleep(interval);
    }
}

/// One read-only pass over one editor product's Local History store.
/// First sight of a history folder sets the cursor to its newest entry
/// without emitting: the retrospective view is git's job. Saves after that
/// are emitted incrementally.
fn collect_history_once(store: &ActivityStore, product: &str) -> Result<(), String> {
    let hist = history_dir(product).ok_or_else(|| "APPDATA environment variable not set".to_string())?;
    if !hist.is_dir() {
        store.record_status(SOURCE_HISTORY, product, STATUS_MISSING, "no User\\History folder in APPDATA");
        return Ok(());
    }
    store.record_status(SOURCE_HISTORY, product, STATUS_OK, "Local History store present");
    let dirs = fs::read_dir(&hist).map_err(|e| format!("read_dir {:?}: {e}", hist))?;
    let slug = product_slug(product);
    for entry in dirs.flatten() {
        let dpath = entry.path();
        let efile = dpath.join("entries.json");
        if !efile.is_file() {
            continue;
        }
        let raw = match fs::read_to_string(&efile) {
            Ok(r) => r,
            Err(e) => {
                let name = dpath.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
                store.record_status(SOURCE_HISTORY, &format!("{}/{}", product, name), STATUS_ERROR, &format!("unreadable: {e}"));
                continue;
            }
        };
        let parsed: HistoryFile = match serde_json::from_str(&raw) {
            Ok(p) => p,
            Err(e) => {
                let name = dpath.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
                store.record_status(SOURCE_HISTORY, &format!("{}/{}", product, name), STATUS_ERROR, &format!("malformed entries.json: {e}"));
                continue;
            }
        };
        let res_path = match parse_file_uri(&parsed.resource) {
            Some(p) => p,
            None => continue,
        };
        let orig = res_path.to_string_lossy().replace('\\', "/");
        let lower = orig.to_lowercase();
        let dir_id = dpath.to_string_lossy().to_string();
        let cursor = store.history_cursor(&dir_id);
        let mut new_cursor = cursor;
        for entry in &parsed.entries {
            let Some(ts) = entry.timestamp else { continue };
            if new_cursor.map_or(false, |c| ts <= c) {
                continue;
            }
            if cursor.is_some() {
                if let Some((workspace, rel)) = store.locate(&lower, &orig) {
                    if store.filter_rel(&rel) {
                        store.append_event(ActivityEvent {
                            ts: Local.timestamp_millis_opt(ts).single().map(|dt| dt.to_rfc3339_opts(SecondsFormat::Millis, false)).unwrap_or_else(now_ts),
                            source: SOURCE_HISTORY.into(),
                            ide: slug.clone(),
                            workspace,
                            path: rel,
                            event: "save".into(),
                            detail: entry.source.clone().unwrap_or_else(|| "local history".into()),
                        });
                    }
                }
            }
            new_cursor = Some(new_cursor.map_or(ts, |c| c.max(ts)));
        }
        if new_cursor != cursor {
            store.set_history_cursor(&dir_id, new_cursor.unwrap_or(0));
        }
    }
    store.save_state();
    Ok(())
}

fn start_watcher(store: Arc<ActivityStore>) {
    let mut valid: Vec<PathBuf> = Vec::new();
    for r in &store.config.watch_roots {
        let p = PathBuf::from(r);
        if p.is_dir() {
            valid.push(p);
        } else {
            store.record_status(SOURCE_WATCHER, r, STATUS_MISSING, "watch root does not exist");
        }
    }
    if valid.is_empty() {
        store.record_status(SOURCE_WATCHER, "roots", STATUS_ERROR, "no existing watch roots; watcher disabled");
        return;
    }
    std::thread::spawn(move || {
        let (tx, rx) = std::sync::mpsc::channel::<PathBuf>();
        let tx_create_modify = tx.clone();
        let mut watcher = match notify::recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
            if let Ok(ev) = res {
                let passes = matches!(ev.kind, notify::EventKind::Create(_) | notify::EventKind::Modify(_));
                if passes {
                    for p in ev.paths {
                        let _ = tx_create_modify.send(p);
                    }
                }
            }
        }) {
            Ok(w) => w,
            Err(e) => {
                store.record_status(SOURCE_WATCHER, "backend", STATUS_ERROR, &format!("no native watcher available: {e}"));
                return;
            }
        };
        for r in &valid {
            if let Err(e) = watcher.watch(r, notify::RecursiveMode::Recursive) {
                store.record_status(SOURCE_WATCHER, &r.to_string_lossy(), STATUS_ERROR, &format!("watch registration failed: {e}"));
            }
        }
        store.record_status(SOURCE_WATCHER, "roots", STATUS_STARTED, &format!("watching {} roots recursively", valid.len()));
        let debounce = StdDuration::from_millis(store.config.watcher_debounce_ms.max(200));
        loop {
            let mut batch: HashSet<PathBuf> = HashSet::new();
            match rx.recv() {
                Ok(p) => { batch.insert(p); }
                Err(_) => {
                    store.record_status(SOURCE_WATCHER, "channel", STATUS_ERROR, "event channel closed");
                    return;
                }
            }
            let deadline = Instant::now() + debounce;
            loop {
                match deadline.checked_duration_since(Instant::now()) {
                    Some(remaining) => match rx.recv_timeout(remaining) {
                        Ok(p) => { batch.insert(p); }
                        Err(RecvTimeoutError::Timeout) => break,
                        Err(_) => {
                            store.record_status(SOURCE_WATCHER, "channel", STATUS_ERROR, "event channel closed");
                            return;
                        }
                    },
                    None => break,
                }
            }
            for p in &batch {
                if let Some(ev) = store.build_edit_event(p) {
                    store.append_event(ev);
                }
            }
            store.watcher_beat.store(now_unix(), Ordering::Relaxed);
        }
    });
}

fn start_window_poll(store: Arc<ActivityStore>) {
    std::thread::spawn(move || {
        let interval = StdDuration::from_secs(store.config.window_poll_secs.max(1));
        let mut last: Option<(String, String)> = None;
        loop {
            std::thread::sleep(interval);
            store.poll_beat.store(now_unix(), Ordering::Relaxed);
            match foreground_window_info() {
                Some((exe, title)) => {
                    let stem = process_stem(&exe);
                    if store.config.editor_processes.iter().any(|e| e.to_lowercase() == stem) {
                        let key = Some((stem.clone(), title.clone()));
                        if last != key {
                            last = key;
                            store.append_event(ActivityEvent {
                                ts: now_ts(),
                                source: SOURCE_POLL.into(),
                                ide: stem,
                                workspace: String::new(),
                                path: String::new(),
                                event: "focus".into(),
                                detail: title,
                            });
                        }
                    } else {
                        last = None;
                    }
                }
                None => last = None,
            }
        }
    });
}

#[cfg(windows)]
fn foreground_window_info() -> Option<(String, String)> {
    use windows::core::PWSTR;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId};

    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return None;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 {
            return None;
        }
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 512];
        let mut len = buf.len() as u32;
        let exe = QueryFullProcessImageNameW(process, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len)
            .ok()
            .map(|_| {
                String::from_utf16_lossy(&buf[..len as usize])
                    .rsplit('\\')
                    .next()
                    .unwrap_or("")
                    .to_string()
            });
        let _ = CloseHandle(process);
        let exe = exe?;
        let mut title_buf = [0u16; 512];
        let title_len = GetWindowTextW(hwnd, &mut title_buf);
        let title = String::from_utf16_lossy(&title_buf[..title_len.max(0) as usize]);
        Some((exe, title))
    }
}

#[cfg(not(windows))]
fn foreground_window_info() -> Option<(String, String)> {
    None
}

// ---------------------------------------------------------------- tests

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn temp_root(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "severus-activity-{}-{}-{}",
            tag,
            std::process::id(),
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().subsec_nanos()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn glob_match_handles_stars_questions_and_exact() {
        assert!(glob_match(b"*.pem", b"server.pem"));
        assert!(!glob_match(b"*.pem", b"server.pfx"));
        assert!(glob_match(b".env", b".env"));
        assert!(!glob_match(b".env", b".env.local"));
        assert!(glob_match(b".env.*", b".env.local"));
        assert!(glob_match(b"credentials*", b"credentials.json"));
        assert!(glob_match(b"id_rsa*", b"id_rsa"));
        assert!(!glob_match(b"id_rsa*", b"id_ed25519"));
        assert!(glob_match(b"*.key", b"api.key"));
        assert!(glob_match(b"?at.py", b"cat.py"));
    }

    #[test]
    fn denied_globs_match_any_component_case_insensitively() {
        let deny = vec![".env".to_string(), "credentials*".to_string()];
        assert!(is_denied(&["desktop".into(), ".env".into()], &deny));
        assert!(is_denied(&[".ENV".into()], &deny));
        assert!(is_denied(&["config".into(), "credentials.json".into()], &deny));
        assert!(!is_denied(&["desktop".into(), "src".into(), "App.tsx".into()], &deny));
    }

    #[test]
    fn junk_filter_catches_dirs_lock_files_and_names() {
        let dirs = vec!["node_modules".to_string(), "target".to_string()];
        let files = vec!["pnpm-lock.yaml".to_string()];
        assert!(is_junk(&["desktop".into(), "node_modules".into(), "x.js".into()], &dirs, &files));
        assert!(is_junk(&["src-tauri".into(), "target".into(), "debug".into(), "app.exe".into()], &dirs, &files));
        assert!(is_junk(&["Cargo.lock".into()], &dirs, &files));
        assert!(is_junk(&["web".into(), "pnpm-lock.yaml".into()], &dirs, &files));
        assert!(!is_junk(&["desktop".into(), "src".into(), "App.tsx".into()], &dirs, &files));
    }

    #[test]
    fn file_uris_decode_drives_and_reject_traversal() {
        let p = parse_file_uri("file:///c%3A/Users/User/Documents/Severus/desktop/src/App.tsx").unwrap();
        assert_eq!(p.to_string_lossy().replace('/', "\\"), "c:\\Users\\User\\Documents\\Severus\\desktop\\src\\App.tsx");
        let p = parse_file_uri("file:///e%3A/BSCPE-2/FILES/SAMPLE%20PROJECT%20-%20LOGIN/COMPLETE_SETUP_AND_START.bat").unwrap();
        assert!(p.to_string_lossy().contains("SAMPLE PROJECT"));
        assert!(parse_file_uri("file:///c%3A/Users/x/%2e%2e/secret").is_none());
        assert!(parse_file_uri("file:///c%3A/Users/x/./y").is_none());
        assert!(parse_file_uri("http://example.com/x").is_none());
        assert!(parse_file_uri("file://server/share/x").is_none());
    }

    #[test]
    fn root_resolution_prefers_longest_match_and_keeps_case() {
        let roots = build_roots_for_test(&[
            "C:/Users/User/Documents",
            "C:/Users/User/Documents/Severus",
        ]);
        let lower = "c:/users/user/documents/severus/desktop/src/app.tsx";
        let orig = "C:/Users/User/Documents/Severus/desktop/src/App.tsx";
        let (ws, rel) = resolve_root(&roots, lower, orig).unwrap();
        assert_eq!(ws, "C:/Users/User/Documents/Severus");
        assert_eq!(rel, "desktop/src/App.tsx");
        let (ws, rel) = resolve_root(&roots, "c:/users/user/documents/other/x.txt", "C:/Users/User/Documents/other/x.txt").unwrap();
        assert_eq!(ws, "C:/Users/User/Documents");
        assert_eq!(rel, "other/x.txt");
        assert!(resolve_root(&roots, "c:/windows/system32/cmd.exe", "C:/Windows/System32/cmd.exe").is_none());
    }

    fn build_roots_for_test(roots: &[&str]) -> Vec<(String, String)> {
        let owned: Vec<String> = roots.iter().map(|s| s.to_string()).collect();
        ActivityStore::build_roots(&owned)
    }

    #[test]
    fn git_log_parse_extracts_hash_ts_and_files() {
        let sample = "\u{1}abc123\t2026-09-27T09:00:00+08:00\ndesktop/src/App.tsx\ndesktop/src/styles.css\n\r\n\u{1}def456\t2026-09-26T18:30:00+08:00\ntools/severus.ps1\n";
        let entries = parse_git_log(sample);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].0, "abc123");
        assert_eq!(entries[0].1, "2026-09-27T09:00:00+08:00");
        assert_eq!(entries[0].2, vec!["desktop/src/App.tsx", "desktop/src/styles.css"]);
        assert_eq!(entries[1].2, vec!["tools/severus.ps1"]);
    }

    #[test]
    fn append_rotates_past_size_cap_and_keeps_valid_json() {
        let root = temp_root("rotate");
        let act = root.join("second-brain").join("activity");
        fs::create_dir_all(&act).unwrap();
        fs::write(act.join(CONFIG_FILE), json!({ "max_store_bytes": 900 }).to_string()).unwrap();
        let store = ActivityStore::new(&root);
        for i in 0..40 {
            store.append_event(ActivityEvent {
                ts: now_ts(),
                source: "test".into(),
                ide: "test".into(),
                workspace: "C:/tmp".into(),
                path: format!("src/file_{}.tsx", i),
                event: "edit".into(),
                detail: String::new(),
            });
        }
        let main_path = root.join("second-brain").join("activity").join(STORE_FILE);
        let rotated = PathBuf::from(format!("{}.1", main_path.to_string_lossy()));
        assert!(rotated.exists(), "rotation should have produced a .1 generation");
        let main_lines = fs::read_to_string(&main_path).unwrap().lines().count();
        assert!(main_lines < 40, "main store should have been reset by rotation");
        for line in fs::read_to_string(&rotated).unwrap().lines() {
            let v: serde_json::Value = serde_json::from_str(line).unwrap();
            assert!(v.get("ts").is_some());
        }
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn startup_trim_drops_lines_older_than_max_age() {
        let root = temp_root("trim");
        let act = root.join("second-brain").join("activity");
        fs::create_dir_all(&act).unwrap();
        fs::write(act.join(CONFIG_FILE), json!({ "max_age_days": 30 }).to_string()).unwrap();
        let old = (Utc::now() - chrono::Duration::days(40)).to_rfc3339();
        let fresh = (Utc::now() - chrono::Duration::days(1)).to_rfc3339();
        let mk = |ts: &str, path: &str| {
            json!({ "ts": ts, "source": "test", "ide": "test", "workspace": "w", "path": path, "event": "edit", "detail": "" }).to_string()
        };
        fs::write(act.join(STORE_FILE), format!("{}\n{}\n", mk(&old, "old/file.ts"), mk(&fresh, "new/file.ts"))).unwrap();
        let _store = ActivityStore::new(&root);
        let content = fs::read_to_string(act.join(STORE_FILE)).unwrap();
        assert!(!content.contains("old/file.ts"), "40 day old line must be trimmed");
        assert!(content.contains("new/file.ts"), "1 day old line must survive");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn history_entries_parse_with_optional_source() {
        let raw = r#"{"version":1,"resource":"file:///c%3A/Users/User/Documents/Python%20Test/visualizer.py","entries":[{"id":"D9Sq.py","source":"Workspace Edit","timestamp":1777800479998},{"id":"3ibR.py","timestamp":1777801327160}]}"#;
        let parsed: HistoryFile = serde_json::from_str(raw).unwrap();
        assert_eq!(parsed.entries.len(), 2);
        assert_eq!(parsed.entries[0].source.as_deref(), Some("Workspace Edit"));
        assert_eq!(parsed.entries[1].timestamp, Some(1777801327160));
        assert!(parsed.resource.starts_with("file:///c%3A/"));
    }

    #[test]
    fn query_aggregates_windows_files_and_sources() {
        let root = temp_root("query");
        let store = ActivityStore::new(&root);
        for (path, src) in [("src/a.ts", "git_log"), ("src/a.ts", "git_log"), ("src/b.ts", "fs_watcher")] {
            store.append_event(ActivityEvent {
                ts: now_ts(),
                source: src.into(),
                ide: "test".into(),
                workspace: "C:/proj".into(),
                path: path.into(),
                event: "commit".into(),
                detail: String::new(),
            });
        }
        store.append_event(ActivityEvent {
            ts: now_ts(),
            source: "window_poll".into(),
            ide: "code".into(),
            workspace: String::new(),
            path: String::new(),
            event: "focus".into(),
            detail: "a.ts - proj - Visual Studio Code".into(),
        });
        let summary = store.query(10, 24.0);
        assert_eq!(summary.total_events, 4);
        assert_eq!(summary.top_files[0].path, "src/a.ts");
        assert_eq!(summary.top_files[0].count, 2);
        assert!(summary.by_source.iter().any(|s| s.name == "git_log" && s.count == 2));
        assert!(summary.sources.iter().any(|s| s.source == SOURCE_STORE && s.status == STATUS_OK));
        assert_eq!(summary.recent.len(), 4);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn config_seed_discovers_sibling_repos() {
        let root = temp_root("seed");
        let sibling = root.parent().unwrap().join(format!("severus-seed-sibling-{}", std::process::id()));
        fs::create_dir_all(sibling.join(".git")).unwrap();
        let config = ActivityConfig::for_root(&root);
        let root_norm = root.to_string_lossy().replace('\\', "/");
        let sibling_norm = sibling.to_string_lossy().replace('\\', "/");
        assert!(config.roots.iter().any(|r| r.replace('\\', "/") == root_norm), "workspace root must be in the allowlist");
        assert!(config.roots.iter().any(|r| r.replace('\\', "/") == sibling_norm), "sibling git repo should be discovered");
        assert_eq!(config.watch_roots, vec![root.to_string_lossy().to_string()], "only the workspace root is watched by default");
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&sibling);
    }
}
