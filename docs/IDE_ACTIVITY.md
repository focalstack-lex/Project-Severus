# IDE Activity Collector

A fully local, append-only telemetry store that answers "what were we just
working on" from observed signals instead of reconstruction. The journal records
what was reported, git records what was committed; this store records what was
actually open, edited and saved across the editors on this machine.

Designed and implemented 2026-09-27 from Lex's four-phase plan. Additive only:
no existing route, navigation element, window behavior or collector was changed.

## Where the data lives

All files under `second-brain/activity/` (excluded from git via `.git/info/exclude`;
it is runtime telemetry, not source):

| File | Contents |
|---|---|
| `ide_activity.jsonl` | The activity store. One JSON object per line, appended only. |
| `ide_activity.jsonl.1` | Previous generation after a size rotation. |
| `collector_status.jsonl` | Collector health transitions (started, ok, missing, error). |
| `collector_state.json` | Deduplication cursors so re-reads never duplicate events. |
| `config.json` | User-editable configuration, seeded on first run. |

Event schema (field order is stable):

```json
{"ts":"2026-09-27T14:02:11.123+08:00","source":"vscode_localhistory","ide":"code",
 "workspace":"C:/Users/User/Documents/Severus","path":"desktop/src/styles.css",
 "event":"save","detail":"Workspace Edit"}
```

Event kinds: `commit` (git_log), `save` (local history), `edit` (live watcher),
`focus` (editor window focused; `path` empty, window title in `detail`).

## The four sources

1. **git_log** (every 15 min): `git log --name-only --pretty=format:%x01%H%x09%cI -n 500`
   per configured repo. First run backfills 14 days; afterwards only commits
   newer than the persisted cursor hash are emitted. If a cursor becomes
   unreachable (history rewrite) the walk falls back to the same 14 day window
   instead of duplicating everything.
2. **vscode_localhistory** (every 5 min): parses
   `%APPDATA%/<Product>/User/History/<hash>/entries.json` read-only. Verified
   present on this machine for `Code` (285 entries), `Antigravity` (604) and
   `Antigravity IDE` (38). `ZCode` and `Cursor` have no Local History store and
   are recorded as `missing` in the status log, never treated as zero activity.
   First sight of a history folder sets the cursor to its newest entry without
   emitting; saves after that are emitted incrementally.
3. **fs_watcher** (live): a recursive `notify` watcher over `watch_roots`
   (default: the Severus workspace only), debounced 2 seconds, create and
   modify events only, junk-filtered.
4. **window_poll** (every 5 s): foreground window process name and title via
   the Win32 API, matched against `editor_processes`; a focus event is emitted
   on change only.

Phase 0 recon also measured `workspaceStorage` (Code: 31 dirs, Antigravity: 32)
and the `state.vscdb` recently-opened lists were deliberately not used: SQLite
parsing would add a dependency for the lowest-fidelity source in the plan.

## Configuration (`second-brain/activity/config.json`)

Seeded on first run with the Severus root plus every sibling git repository
under `Documents`, and `watch_roots` limited to the Severus workspace to keep
OS-level watch load bounded. Edit and restart the app to apply.

| Key | Default | Meaning |
|---|---|---|
| `enabled` | all true | Per-source switches: `git`, `local_history`, `watcher`, `window_poll`. |
| `roots` | Severus + sibling repos | The allowlist. Anything outside is never persisted. |
| `watch_roots` | Severus only | Roots the live watcher watches recursively. |
| `editor_products` | Code, Antigravity, Antigravity IDE, ZCode, Cursor | APPDATA folders scanned for Local History. |
| `editor_processes` | same family + VSCodium | Process names that count as editor focus. |
| `deny_globs` | `.env`, `.env.*`, `*.pem`, `*.key`, `credentials*`, `id_rsa*`, `*.pfx`, `*.p12`, `secrets*`, `*.kdbx` | Never recorded. Matched against every path component, case-insensitive. |
| `junk_dirs` | node_modules, target, dist, build, out, coverage, .next, .venv, venv, __pycache__, .git, .gradle, .idea, .kilo, .cache, .dart_tool, .expo, site-packages | Churn never recorded. |
| `junk_files` | package-lock.json, pnpm-lock.yaml, yarn.lock, poetry.lock, composer.lock, Gemfile.lock, .DS_Store, Thumbs.db | Plus any `*.lock` file. |
| `max_age_days` | 30 | Startup trim drops older lines. |
| `max_store_bytes` | 8388608 | Startup trim and runtime rotation cap. |

## Guardrails, enforced in `ide_activity.rs`

- Metadata only. Path, timestamp, event kind, short detail. File contents are
  never read or copied; the Local History bodies stay where they are.
- Path allowlist. `resolve_root` matches each absolute path against the
  configured roots (case-insensitive, longest match) and persists the
  workspace-relative remainder only.
- Traversal proof. `parse_file_uri` rejects any URI whose decoded path contains
  a `.` or `..` component, so a crafted `entries.json` cannot escape the
  allowlist.
- Deny globs beat everything: a save to `secrets/api.json` is dropped, not
  redacted.
- No feedback loop: `second-brain/activity/` is excluded from collection.
- Fail loud: a missing store, a missing history folder, an unreadable
  `entries.json` or a failed git pass lands in `collector_status.jsonl` and on
  stderr. Healthy cycles stay silent; the query reports live liveness per
  source (heartbeat staleness), so "quiet because healthy" and "quiet because
  broken" are distinguishable.
- Fully local. No network egress anywhere in the module.

## Querying

- Tauri command: `ide_activity_query(limit?, hours?)` returns an
  `ActivitySummary` (top files, workspace and source breakdowns, per-source
  health, recent tail). Registered in `lib.rs`; no UI surface calls it yet, so
  no `verify:ui` run is required for this change.
- Terminal / agent: `python tools/ide_activity.py [--hours H] [--limit N] [--json]`.

## Dependencies

None added. `notify 8` and `chrono` were already in `Cargo.toml` for the notes
watcher, and the `windows` crate features needed here (`Win32_Foundation`,
`Win32_UI_WindowsAndMessaging`, `Win32_System_Threading`) were already enabled
for `system_control.rs`. `cargo-audit` is not installed on this machine, noted
in the verification record below.

## Verification record (2026-09-27)

- `cargo test`: 42 lib tests + 3 harness tests pass, including 11 new tests
  covering glob matching, deny and junk filters, URI decoding and traversal
  rejection, allowlist resolution, git log parsing, rotation, age trim,
  entries.json parsing, query aggregation and config seeding.
- Runtime proof: after the release build the app was launched and the store
  was observed filling with real events; see `journal/2026-09-27.md`.
