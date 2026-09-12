# Project Severus

> A living intelligence workspace, second-brain knowledge graph, and native desktop app.

Severus is a personal intelligence architecture built around three pillars:
1. **The Ascended Agent Rules & Skills:** Persistent operational standards (Zero Hallucination Directive, Defensive Programming, Junior Blind-Spot Protocol, Deploy Gate).
2. **Second Brain Knowledge Engine:** A mathematical knowledge graph powered by PageRank, freshness decay from file mtimes, inline `#tags`, and bi-directional `[[wiki-links]]`.
3. **Native Desktop Application (`desktop/`):** A high-performance **Tauri v2 + React + TypeScript + Rust** desktop app styled in a minimalist monochrome obsidian aesthetic ([codewithlex.site](https://codewithlex.site)).

---

## Architecture Overview

```
Severus/
├── AGENTS.md               # Workspace rules and operating constitution
├── SYSTEM.md               # System architectural documentation for agents
├── Ascension_Guide.md      # Evolutionary constitution & protocols
├── journal/                # Append-only daily action logs (YYYY-MM-DD.md)
├── tools/                  # Self-made CLI utilities and automation scripts
├── second-brain/           # Python-based reference graph generator & offline viewer
│   ├── build_graph.py      # Stdlib PageRank, decay calculation & 3D graph exporter
│   ├── notes/              # Raw Markdown knowledge repository
│   └── vendor/             # Cached 3D graph runtime for offline operation
└── desktop/                # Native Desktop Application (Tauri v2)
    ├── src-tauri/          # Rust backend (sub-ms PageRank, notify watcher, secure IPC)
    └── src/                # Vite + React + TS frontend (WebGL 3D graph, editor, journal palette)
```

---

## The Native Desktop App (`desktop/`)

### Features
- **Monochrome Obsidian Design:** Deep `#050505` background, `Geist` and `JetBrains Mono` typography, drawn SVG icon set, and a solid floating capsule top bar.
- **Interactive 3D WebGL Graph:** Real-time visual network powered by Three.js / `3d-force-graph` with dynamic node sizing by PageRank centrality and opacity fading by note age.
- **Dual-Pane Note Workspace:** Markdown note viewer/editor with live `[[wiki-links]]` navigation and `#tag` indexing.
- **Sub-Millisecond Engine:** Rust-native graph computation and debounced filesystem watcher (`notify` crate) triggering zero-latency updates.
- **Quick Journal Capture:** Global `Ctrl+J` modal command palette to append thoughts directly to today's journal.

### Running Locally

#### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Rust & Cargo](https://rustup.rs/)
- Windows WebView2 (preinstalled on Windows 10/11)

#### Development
```bash
cd desktop
npm install
npm run tauri dev
```

#### Production Build
```bash
cd desktop
npm run tauri build
```

---

## Python Second Brain CLI

To run the standalone, dependency-free reference graph builder:

```bash
python second-brain/build_graph.py
```

This compiles `second-brain/notes/*.md` into an offline interactive 3D graph at `second-brain/graph.html`.

---

## License & Author
Engineered by **Lex Matondo** ([codewithlex.site](https://codewithlex.site)).
Licensed under the [MIT License](LICENSE) (or personal open research license).
