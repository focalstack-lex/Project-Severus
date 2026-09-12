import { useCallback, useEffect, useMemo, useState } from "react";
import { confirm } from "@tauri-apps/plugin-dialog";
import GraphView, { type VisNode } from "./components/GraphView";
import TagBar from "./components/TagBar";
import ActivityRail from "./components/ActivityRail";
import NotesDrawer from "./components/NotesDrawer";
import RightWorkbench from "./components/RightWorkbench";
import JournalCapture from "./components/JournalCapture";
import AISettingsModal from "./components/AISettingsModal";
import QuickSwitcherModal from "./components/QuickSwitcherModal";
import { type AIConfig, loadAIConfig, saveAIConfig } from "./lib/ai";
import {
  appendJournal,
  getGraphData,
  listNotes,
  onNotesChanged,
  readNote,
  saveNote,
} from "./lib/tauri";
import { fade, freshnessOpacity, tagColors } from "./lib/colors";
import type { GraphData, NoteContent, NoteMeta } from "./types";

const EMPTY_GRAPH: GraphData = { nodes: [], links: [], tags: [] };

export default function App() {
  const [graph, setGraph] = useState<GraphData>(EMPTY_GRAPH);
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [notesList, setNotesList] = useState<NoteMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState<NoteContent | null>(null);

  // Layout & Panes
  const [notesDrawerOpen, setNotesDrawerOpen] = useState(false);
  const [workbenchOpen, setWorkbenchOpen] = useState(true);
  const [workbenchTab, setWorkbenchTab] = useState<"note" | "copilot">("note");
  const [zenMode, setZenMode] = useState(false);

  // Modals
  const [journalOpen, setJournalOpen] = useState(false);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);

  // AI Brain Config
  const [aiConfig, setAiConfig] = useState<AIConfig>(loadAIConfig);

  // Notifications & State
  const [toast, setToast] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(
      () => setToast((current) => (current === message ? null : current)),
      2600,
    );
  }, []);

  const loadGraph = useCallback(async () => {
    try {
      const data = await getGraphData();
      setGraph(data);
      setActiveTags((current) => {
        const next = new Set(current);
        for (const tag of data.tags) next.add(tag);
        return next;
      });
      setLoadError(null);
    } catch (err) {
      setLoadError(String(err));
    }
  }, []);

  const loadNotesList = useCallback(async () => {
    try {
      setNotesList(await listNotes());
    } catch {
      // keep the previous list; the next watcher tick will retry
    }
  }, []);

  const refreshSelected = useCallback(async (id: string | null) => {
    if (!id) {
      setNote(null);
      return;
    }
    try {
      setNote(await readNote(id));
    } catch {
      setNote(null);
    }
  }, []);

  useEffect(() => {
    void loadGraph();
    void loadNotesList();
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    void onNotesChanged(() => {
      void loadGraph();
      void loadNotesList();
      setRefreshTick((tick) => tick + 1);
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [loadGraph, loadNotesList]);

  const openNote = useCallback(
    async (id: string) => {
      setSelectedId(id);
      setWorkbenchOpen(true);
      setWorkbenchTab("note");
      await refreshSelected(id);
    },
    [refreshSelected],
  );

  // reload the selected note whenever the watcher signals a change
  useEffect(() => {
    if (refreshTick > 0) void refreshSelected(selectedId);
  }, [refreshTick, selectedId, refreshSelected]);

  const handleSave = useCallback(
    async (id: string, content: string) => {
      await saveNote(id, content);
      showToast(`Saved "${id}"`);
    },
    [showToast],
  );

  const handleNewNote = useCallback(async () => {
    const rawName = window.prompt("Enter new note name:");
    if (!rawName || !rawName.trim()) return;
    const trimmed = rawName.trim().replace(/\.md$/, "");
    try {
      await saveNote(trimmed, `# ${trimmed}\n\n`);
      await loadNotesList();
      await loadGraph();
      await openNote(trimmed);
      showToast(`Created note "${trimmed}"`);
    } catch (err) {
      showToast(`Could not create note: ${String(err)}`);
    }
  }, [loadNotesList, loadGraph, openNote, showToast]);

  const handleOpenLink = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const existing = notesList.find((n) => n.id.toLowerCase() === trimmed.toLowerCase());
      if (existing) {
        await openNote(existing.id);
        return;
      }
      const ok = await confirm(`Note "${trimmed}" does not exist yet. Create it?`, {
        title: "Second Brain",
        kind: "info",
      });
      if (!ok) return;
      try {
        await saveNote(trimmed, `# ${trimmed}\n\n`);
        await loadNotesList();
        await loadGraph();
        await openNote(trimmed);
        showToast(`Created "${trimmed}"`);
      } catch (err) {
        showToast(`Could not create note: ${String(err)}`);
      }
    },
    [notesList, openNote, loadNotesList, loadGraph, showToast],
  );

  const toggleTag = useCallback((tag: string) => {
    setActiveTags((current) => {
      const next = new Set(current);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }, []);

  const handleJournal = useCallback(
    async (text: string) => {
      const stamp = await appendJournal(text);
      showToast(`Journaled at ${stamp}`);
    },
    [showToast],
  );

  // Global Keyboard Shortcuts
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;

      // Quick Switcher (Ctrl+K or Ctrl+P)
      if (mod && (event.key.toLowerCase() === "k" || event.key.toLowerCase() === "p")) {
        event.preventDefault();
        setQuickSwitcherOpen((prev) => !prev);
      }
      // Quick Journal (Ctrl+J)
      else if (mod && event.key.toLowerCase() === "j") {
        event.preventDefault();
        setJournalOpen(true);
      }
      // Toggle Copilot (Ctrl+Shift+A)
      else if (mod && event.shiftKey && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setWorkbenchOpen(true);
        setWorkbenchTab("copilot");
      }
      // Toggle Notes Drawer (Ctrl+B)
      else if (mod && event.key.toLowerCase() === "b") {
        event.preventDefault();
        setNotesDrawerOpen((prev) => !prev);
      }
      // Toggle Workbench / Inspector (Ctrl+\)
      else if (mod && event.key === "\\") {
        event.preventDefault();
        setWorkbenchOpen((prev) => !prev);
      }
      // New Note (Ctrl+Alt+N)
      else if (mod && event.altKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        void handleNewNote();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleNewNote]);

  const colors = useMemo(() => tagColors(graph.tags), [graph.tags]);
  const visNodes = useMemo<VisNode[]>(
    () =>
      graph.nodes.map((node) => {
        const base = node.tags.length > 0 ? (colors[node.tags[0]] ?? "#9aa4b2") : "#9aa4b2";
        return { ...node, color: fade(base, freshnessOpacity(node.ageDays)) };
      }),
    [graph, colors],
  );

  return (
    <div className={`app workstation ${zenMode ? "zen-mode" : ""}`}>
      {/* Top Header Bar */}
      {!zenMode && (
        <header className="topbar">
          <div className="brand-wrap">
            <div className="brand">
              LEX MATONDO <span className="dim">// SEVERUS</span>
            </div>
            <div className="badge-pill live">
              <span className="live-dot" />
              <span>KNOWLEDGE ENGINE</span>
            </div>
            <div
              className="badge-pill ai-nav-pill"
              onClick={() => setAiSettingsOpen(true)}
              title="Configure AI Provider & Model"
            >
              <span className="live-dot" />
              <span>AI: {aiConfig.model}</span>
            </div>
          </div>

          {/* Center Quick Search Button */}
          <button
            type="button"
            className="topbar-search-btn"
            onClick={() => setQuickSwitcherOpen(true)}
            title="Open Command Palette (Ctrl+K)"
          >
            <span className="search-icon">⌘</span>
            <span className="search-text">Search notes or commands...</span>
            <kbd className="search-kbd">CTRL+K</kbd>
          </button>

          {/* Right Actions */}
          <div className="topbar-actions">
            <button
              className={`topbar-tool-btn ${workbenchOpen && workbenchTab === "copilot" ? "accent" : ""}`}
              onClick={() => {
                if (workbenchOpen && workbenchTab === "copilot") {
                  setWorkbenchOpen(false);
                } else {
                  setWorkbenchOpen(true);
                  setWorkbenchTab("copilot");
                }
              }}
              title="Toggle Knowledge Copilot (Ctrl+Shift+A)"
            >
              ✦ COPILOT
            </button>
            <button
              className={`topbar-tool-btn ${workbenchOpen && workbenchTab === "note" ? "accent" : ""}`}
              onClick={() => {
                if (workbenchOpen && workbenchTab === "note") {
                  setWorkbenchOpen(false);
                } else {
                  setWorkbenchOpen(true);
                  setWorkbenchTab("note");
                }
              }}
              title="Toggle Note Workspace (Ctrl+\)"
            >
              {workbenchOpen ? "HIDE WORKSPACE" : "VIEW WORKSPACE"}
            </button>
            <button onClick={() => setJournalOpen(true)} title="Quick capture (Ctrl+J)">
              + JOURNAL
            </button>
          </div>
        </header>
      )}

      {/* Main Multi-Pane Area */}
      <main className="main workstation-main">
        {/* Far Left Activity Rail */}
        {!zenMode && (
          <ActivityRail
            notesDrawerOpen={notesDrawerOpen}
            onToggleNotesDrawer={() => setNotesDrawerOpen((prev) => !prev)}
            onOpenQuickSwitcher={() => setQuickSwitcherOpen(true)}
            onOpenJournal={() => setJournalOpen(true)}
            workbenchOpen={workbenchOpen}
            activeTab={workbenchTab}
            onSelectTab={(tab) => {
              setWorkbenchTab(tab);
              setWorkbenchOpen(true);
            }}
            onToggleWorkbench={() => setWorkbenchOpen((prev) => !prev)}
            onOpenAISettings={() => setAiSettingsOpen(true)}
            zenMode={zenMode}
            onToggleZenMode={() => setZenMode((prev) => !prev)}
          />
        )}

        {/* Slide-out Notes Drawer */}
        {!zenMode && notesDrawerOpen && (
          <NotesDrawer
            open={notesDrawerOpen}
            notes={notesList}
            selectedId={selectedId}
            onSelectNote={(id) => void openNote(id)}
            onNewNote={() => void handleNewNote()}
            onClose={() => setNotesDrawerOpen(false)}
          />
        )}

        {/* Center Stage: 3D Knowledge Graph */}
        <div className="graph-pane">
          <GraphView
            nodes={visNodes}
            links={graph.links}
            activeTags={activeTags}
            onSelectNote={(id) => void openNote(id)}
          />
          <TagBar
            tags={graph.tags}
            colors={colors}
            active={activeTags}
            onToggle={toggleTag}
          />
        </div>

        {/* Right Stage: Unified Tabbed Workbench */}
        {!zenMode && workbenchOpen && (
          <RightWorkbench
            open={workbenchOpen}
            activeTab={workbenchTab}
            onSelectTab={setWorkbenchTab}
            onClose={() => setWorkbenchOpen(false)}
            note={note}
            onSaveNote={handleSave}
            onOpenLink={(name) => void handleOpenLink(name)}
            onToggleTag={toggleTag}
            aiConfig={aiConfig}
            onOpenAISettings={() => setAiSettingsOpen(true)}
          />
        )}
      </main>

      {/* Bottom Status Bar */}
      {!zenMode && (
        <footer className="status-bar">
          <div className="status-bar-left">
            <div className="status-item">
              <span>WORKBENCH:</span>{" "}
              <span className="highlight">
                {workbenchOpen ? workbenchTab.toUpperCase() : "COLLAPSED"}
              </span>
            </div>
            <div className="status-item">
              <span>ACTIVE NOTE:</span>{" "}
              <span className="highlight">
                {selectedId ? `${selectedId}.md` : "NONE (CLICK NODE / SEARCH)"}
              </span>
            </div>
          </div>
          <div className="status-bar-right">
            <div className="status-item">
              <span>AI MODEL:</span> <span className="highlight">{aiConfig.model}</span>
            </div>
            <div className="status-item">
              <span>GRAPH:</span>{" "}
              <span className="highlight">
                {graph.nodes.length} NODES · {graph.links.length} LINKS
              </span>
            </div>
            <div className="status-item">
              <kbd className="status-kbd">CTRL+K</kbd> <span>COMMANDS</span>
            </div>
          </div>
        </footer>
      )}

      {/* Modals & Command Palettes */}
      <QuickSwitcherModal
        open={quickSwitcherOpen}
        notes={notesList}
        onSelectNote={(id) => void openNote(id)}
        onNewNote={() => void handleNewNote()}
        onOpenJournal={() => setJournalOpen(true)}
        onOpenAISettings={() => setAiSettingsOpen(true)}
        onOpenCopilot={() => {
          setWorkbenchOpen(true);
          setWorkbenchTab("copilot");
        }}
        onClose={() => setQuickSwitcherOpen(false)}
      />

      <JournalCapture
        open={journalOpen}
        onClose={() => setJournalOpen(false)}
        onSubmit={handleJournal}
      />

      <AISettingsModal
        open={aiSettingsOpen}
        config={aiConfig}
        onSave={(newCfg) => {
          setAiConfig(newCfg);
          saveAIConfig(newCfg);
          showToast(`Active AI Model set to ${newCfg.model}`);
        }}
        onClose={() => setAiSettingsOpen(false)}
      />

      {loadError && <div className="toast error">Backend error: {loadError}</div>}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
