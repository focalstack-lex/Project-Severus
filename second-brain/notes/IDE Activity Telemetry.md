# IDE Activity Telemetry

#telemetry #observership #rust #privacy #severus

The IDE activity collector is Severus's answer to "what were we just working on" being
unanswerable from the journal (self-reported) and git (coarse, committed only). It observes
instead of reconstructing: four append-only sources feed one JSONL store at
`second-brain/activity/ide_activity.jsonl`. Canonical doc: [[docs/IDE_ACTIVITY.md]] and
`desktop/src-tauri/src/ide_activity.rs`.

## The four sources and their cursors

- git_log: `git log --name-only` per allowlisted repo, 14 day backfill on first run, then
  incremental via a persisted last-hash cursor; an unreachable cursor (history rewrite)
  falls back to the 14 day window instead of duplicating.
- vscode_localhistory: VS Code family `User/History/<hash>/entries.json` parsed read-only.
  The store is per-FILE with per-save entries, so the dedup cursor is max-timestamp per
  history folder. First sight emits nothing (baseline), then saves flow incrementally.
- fs_watcher: notify 8, recursive, 2 s drain-debounce, create and modify only.
- window_poll: foreground window process + title every 5 s, emit on change only.

Verified on this machine 2026-09-27: Local History exists for Code (285 folders),
Antigravity (604) and "Antigravity IDE" (38); ZCode and Cursor have none and must be
reported `missing`, never as zero activity. The "Active Note in Workspace Editor" field in
Severus's copilot context is the app's own NoteEditor state ([[Lex Matondo]]'s in-app note),
not an external IDE feed; nothing external fed it before this collector.

## Guardrail patterns worth reusing

- Metadata-only telemetry: paths, timestamps, diffstat-level detail; never file bodies.
- Allowlist + deny-glob + junk-filter is three separate filters: allowlist answers "is this
  ours", deny answers "is this secret-like" (.env, *.pem, credentials*), junk answers "is
  this churn" (node_modules, target, *.lock). They fail in different directions on purpose.
- Traversal-proof URI parsing: any decoded path containing a `.` or `..` component is
  rejected outright rather than resolved.
- Fail loud is a query property too: per-source heartbeats make "quiet because healthy"
  distinguishable from "quiet because broken", and missing stores get a status line, not an
  empty result.
- Append-only with startup trim (age + size) and rename rotation keeps the write path
  append-only while bounding the file.

Zero new dependencies: notify 8, chrono and the windows crate features were already in the
tree for [[UI Audit and Design System]]'s notes watcher and system_control.rs. Reuse-before-
build is what kept the diff to one module plus 19 lines in lib.rs.
