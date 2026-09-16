# Severus — System Documentation (for agents)

You are reading the operating manual for an "ascended" agent environment. **`AGENTS.md` holds the
rules you must follow; this file explains the machinery those rules run on.** Read both before
making changes here. The original constitution is `Glorious_Evolution_Guide.md`.

## What this system is

A personal agent ecosystem with three layers:

1. **Rulebooks** — persistent identity and quality standards injected into every agent session
   (ZCode and Antigravity).
2. **Skills** — auditors, playbooks, and checklists in the open Agent Skills format, shared
   across tools.
3. **Second Brain** — a living desktop application: a 3D knowledge graph that ranks notes with
   PageRank, visualizes knowledge decay, watches the notes folder, and rebuilds itself live.
   It boots at login.

Design philosophy (from the guide): continuous evolution, no apex state — when you hit a
limitation, propose a concrete upgrade to this system instead of working around it.

## File map

```
C:\Users\User\Documents\Severus\
├── AGENTS.md              workspace rulebook (auto-loaded into agent context)
├── SYSTEM.md              this file
├── Glorious_Evolution_Guide.md the constitution the system was built from
├── journal\YYYY-MM-DD.md  append-only action log
├── candidates.md          T1 candidate store for self-learning protocol
├── tools\                 self-made utilities (install_shortcuts.ps1, future CLI tools)
├── second-brain\          the Python-side pipeline (see below)
└── desktop\               the Tauri v2 native desktop app (see below)
```

Outside the workspace:

```
~\.zcode\AGENTS.md                       global rules, every ZCode workspace (loads FIRST)
~\.agents\skills\<name>\SKILL.md         skills, ZCode user scope
~\.gemini\GEMINI.md                      global rules, Antigravity
~\.gemini\config\skills\<name>\SKILL.md  skills mirrored for Antigravity
Startup\Severus.lnk                      boots native Severus companion at login, silent
Desktop\Severus.lnk                      manual launch of the native Severus app
```

## The Tauri v2 desktop app (`desktop/`)

The primary native application: **Tauri 2 + Vite + React + TypeScript** (Rust backend,
WebView2 frontend). Run it with `npm run tauri dev` (from `desktop/`); release build via
`npm run tauri build`.

- **Rust backend** (`desktop/src-tauri/src/`): `graph.rs` is a faithful Rust port of the
  `build_graph.py` pipeline (same weights, damping, iterations; a unit test pins the hub note
  so the two pipelines cannot silently diverge). `notes.rs` provides note read/save/list and
  journal append (names sanitized against traversal; writes scoped to `second-brain/notes/`
  and `journal/`). `watcher.rs` uses the `notify` crate with a 500 ms debounce and emits a
  `notes-changed` event to the UI. Workspace root resolves from `SEVERUS_ROOT`, else
  `%USERPROFILE%\Documents\Severus`.
- **Frontend** (`desktop/src/`): the 3D force graph (`3d-force-graph` on WebGL), tag filter
  bar, a dual-pane markdown editor with `[[wiki-link]]` navigation (clicking a missing link
  offers to create the note) and clickable `#tags`, plus a Ctrl+J journal quick-capture.
  Freshness fade and palette live in `src/lib/colors.ts`, mirroring the Python template.
- **Plugins**: `tauri-plugin-fs` (scoped to `$HOME/Documents/Severus/**`),
  `tauri-plugin-dialog` (used for the create-note confirmation), `tauri-plugin-shell`.
- **Tests**: `cargo test` in `desktop/src-tauri/` covers the graph pipeline (against the real
  workspace, read-only), path-traversal rejection, save/read round-trip in temp dirs, and
  journal appending. Existing notes are never mutated by tests.

The native Severus application (`desktop/`) is the primary workstation companion and boots
automatically at login via `Startup\Severus.lnk` pointing to
`desktop/src-tauri/target/release/severus-secondbrain.exe`. The legacy Python `app.py`
pywebview app and `Second Brain.lnk` shortcuts have been retired and deleted.

## Second Brain internals

**Notes format** (`second-brain/notes/*.md`): markdown; the first `# heading` is the title;
inline `#tag` tokens become tags; `[[Note Name]]` becomes a directed wiki-link to that note.
Untagged notes are always visible in the graph; tags power both coloring and filtering.

**Pipeline** (`build_graph.py`, expose `build()` for programmatic use):

1. Parse notes → titles, tags, links, excerpts.
2. Edges: `[[wiki-links]]` are **directed**, weight 1.0 — they carry PageRank from the linking
   note to the linked one, so hubs that are cited by many notes grow large. Notes sharing a tag
   get a symmetric 0.3 edge.
3. PageRank: damping 0.85, 100 iterations, dangling mass redistributed.
4. Decay: freshness = exp(−age_days / 45); opacity = 0.3 + 0.7 × freshness (mtime-based).
   Old notes visibly fade — that is intentional "knowledge rot".
5. Render `graph.html`: fully self-contained (data embedded as JSON; sizes 2 + 22·(rank/max)^0.7).
   The 3D engine loads from `vendor/` first, unpkg CDN as fallback. A polling script fetches
   `/version` every 3 s and reloads the page when it changes (silent no-op if opened as a file).

**Desktop Companion** (`Severus`):

- Tauri 2 native application booting at login via `Startup\Severus.lnk`.
- Integrates live WebGL 3D knowledge graph, dual-pane editor, athletic running cockpit,
  hands-free voice interaction, system console, and AI grounding copilot.
- Maintained and registered via `tools/install_shortcuts.ps1`.

## Conventions for working here

- **New durable knowledge** → write a note in `second-brain/notes/`, use tags, and wiki-link it
  *toward* the relevant hub (link direction feeds PageRank). If the app is running the graph
  updates itself; otherwise run `python second-brain/build_graph.py`.
- **New self-made CLI tool** → `tools/`, prefer stdlib-only Python, docstring with purpose,
  usage, and an example.
- **New capability/playbook** → a skill folder in `~/.agents/skills/` (kebab-case name matching
  the folder, `name` + pushy trigger-rich `description` frontmatter), then mirror it to
  `~/.gemini/config/skills/`. Both tools read the same format — write once, use twice.
- **Rule changes** → the rulebooks live in three files (`~/.zcode/AGENTS.md`,
  `~/.gemini/GEMINI.md`, workspace `AGENTS.md`). Keep them in sync; the workspace file may
  narrow but never weaken the global ones.
- **Mandatory Session Journaling** → Every new chat session, architectural decision, code edit, build outcome, and deployment must be logged in the workspace journal (`JOURNAL.md` or `journal/YYYY-MM-DD.md`) and committed alongside code updates across all IDEs and editors.

## Troubleshooting

| Symptom | Check / fix |
|---|---|
| Graph window blank or stale | `second-brain/service.log` — look for `rebuild failed` or fallback lines |
| Port 8622 busy on launch | App is already running; find it via `tasklist /FI "IMAGENAME eq pythonw.exe"` or just exit |
| Note edit not appearing | Watcher polls every 3 s; confirm the app is running (log shows a service start) or rebuild manually |
| Graph won't render offline | `vendor/3d-force-graph.min.js` missing — restore it, or accept the CDN fallback when online |
| Shortcuts lost after profile change | Re-run `powershell -NoProfile -ExecutionPolicy Bypass -File tools\install_shortcuts.ps1` |

## Evolution queue

Known upgrade paths (propose, don't silently start): make the Tauri app the boot app
(release build + repoint the Startup shortcut), a note-capture API so agents can add notes
while either app runs without touching the filesystem directly, per-note open-in-editor from
the graph, GraphML export, and release packaging (`npm run tauri build` → installer). When you
extend this system, update this file and `AGENTS.md` in the same change — documentation that
lags the build is dead documentation.
