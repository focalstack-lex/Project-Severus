# Windows System Control

Tier 1/2 OS integration for the desktop app (2026-09-12): Severus now launches apps, opens folders and paths, controls volume and media, reads/writes the clipboard, takes screenshots, and manages windows — focus, snap to half/maximize/minimize, minimize-all, close, and virtual-desktop switching — driven by voice ("open chrome", "snap left", "lock the pc") or the new System Console (Ctrl+Shift+K).

The design principle is one allowlisted action set: a deterministic, unit-tested grammar lives in Rust (`src-tauri/src/system_control.rs`) and both the voice engine and the console resolve through it. When the grammar misses, the configured model (DeepSeek) maps the phrase to one of the same intents under a strict JSON schema — it can only choose from the list, and execution always re-enters the same Rust gate. Destructive actions (lock workstation, close window) require a control password (SHA-256 hash in localStorage; the executor independently re-checks the `confirmed` flag, so bypassing the UI does not bypass the gate). Scope guards: no process killing, no arbitrary keystroke injection (only fixed media/desktop chords), no sleep/shutdown, no file deletion.

Verification: 22 Rust unit tests green (grammar contract, destructive flags, unconfirmed-execution rejection), tsc/vite build clean, and the console + password flows exercised live in the dev harness. Real Win32 behavior (volume, snap, screenshot) needs one manual session in `npm run tauri dev`.

Related: [[The Ascension]], [[Second Brain]], [[UI Audit and Design System]]. #windows #voice #system-control #meta
