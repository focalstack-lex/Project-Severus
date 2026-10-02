# Tanaw

A calm, focused file manager for Windows, with notes and to-dos beside your files. Tanaw is Tagalog for "view". It is Lex's own product, free and open source under the MIT license, and it runs locally only: no accounts, no telemetry, and a single network call for a user-confirmed update check. Source lives at `E:\PROJECTS\Desktop File Manager` and publishes to `github.com/focalstack-lex/Tanaw.` (the trailing period is part of the repository name).

## Architecture & Stack
- **Shell**: Tauri 2 with a frameless window, a custom title bar holding the tabs, and minimal capabilities (core defaults plus four window controls).
- **Core**: Rust owns every side effect. The renderer never touches the filesystem or the database; it calls typed commands through one IPC module. This choice (approach A) also prepares the planned LLM assistant, which will call the same validated commands as tools.
- **Data**: SQLite (rusqlite, bundled) with numbered migrations tracked by `user_version`, WAL mode, and quarantine of a damaged file instead of a crash.
- **Renderer**: React 19, TypeScript, Vite, zustand stores, lucide icons, Geist and JetBrains Mono vendored under the OFL.
- **Design**: monochrome chrome with color only for information, light and dark token tables, a Ctrl+K command palette as the single source of shortcuts.

## Delivery Plan
Five pieces, each with its own plan and gate: foundation, file manager, search, productivity (notes and to-dos), portability and release. The binding design is `docs/superpowers/specs/2026-10-02-tanaw-v1-design.md`; the assistant gets its own spec after v1 ships.

## Verification
The foundation shipped with the full Severus gate from the first commit: ESLint invariants (zero emoji, zero em or en dash, no silent catch, no committed secret), vitest, a token contrast script, a Playwright drive of the mocked renderer with captured evidence, `cargo test` and clippy with unwrap, expect and panic denied, a generated code map with a freshness check, and CI on Linux and Windows. The native app was also driven for real by attaching Playwright to the WebView2 debugging port through a dev-only config override, which proved the IPC round trip, the window-control permissions and settings persistence without moving the mouse.

## Lessons
- Closing a Tauri app with `taskkill` without `/F` broadcasts WM_CLOSE to its hidden event-loop window and can leave a windowless process behind. Test closing with WM_CLOSE to the main window, which is what Alt+F4 does.
- WebView2 ignores `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` when the app passes its own browser arguments, so a debugging port needs `additionalBrowserArgs` in a config override.

Related: [[Lex Matondo]], [[The Glorious Evolution]], [[Agentic Verification and Guardrails]], [[Second Brain]], [[LGU System]].

#project #tauri #rust #react #typescript #file-manager #open-source
