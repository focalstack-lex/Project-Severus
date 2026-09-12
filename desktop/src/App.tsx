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
import ContextAssemblerModal from "./components/ContextAssemblerModal";
import NewNoteModal from "./components/NewNoteModal";
import { type AIConfig, loadAIConfig, saveAIConfig } from "./lib/ai";
import {
  appendJournal,
  getGitStatus,
  getGraphData,
  listNotes,
  onNotesChanged,
  openInEditor,
  readNote,
  restoreWindow,
  saveNote,
} from "./lib/tauri";
import { fade, freshnessOpacity, tagColors } from "./lib/colors";
import type { GitStatusData, GraphData, NoteContent, NoteMeta } from "./types";
import {
  getVoiceMuted,
  playTimeGreeting,
  playVoice,
  preloadVoice,
  setVoiceMuted,
} from "./lib/voice";
import { ClapDetector, getClapEnabled, recordKeyPress, setClapEnabled } from "./lib/clapDetector";
import {
  VoiceCommandListener,
  getVoiceCmdEnabled,
  setVoiceCmdEnabled,
} from "./lib/voiceCommands";

const EMPTY_GRAPH: GraphData = { nodes: [], links: [], tags: [] };

export default function App() {
  const [graph, setGraph] = useState<GraphData>(EMPTY_GRAPH);
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [notesList, setNotesList] = useState<NoteMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState<NoteContent | null>(null);

  // Voice & Acoustic Settings
  const [voiceMuted, setVoiceMutedState] = useState<boolean>(getVoiceMuted);
  const [clapEnabled, setClapEnabledState] = useState<boolean>(getClapEnabled);
  const [voiceCmdEnabled, setVoiceCmdEnabledState] = useState<boolean>(getVoiceCmdEnabled);

  // Layout & Panes
  const [notesDrawerOpen, setNotesDrawerOpen] = useState(false);
  const [workbenchOpen, setWorkbenchOpen] = useState(true);
  const [workbenchTab, setWorkbenchTab] = useState<"note" | "copilot">("note");
  const [zenMode, setZenMode] = useState(false);

  // Modals
  const [journalOpen, setJournalOpen] = useState(false);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);
  const [groundingOpen, setGroundingOpen] = useState(false);
  const [newNoteModalOpen, setNewNoteModalOpen] = useState(false);

  // AI Brain Config
  const [aiConfig, setAiConfig] = useState<AIConfig>(loadAIConfig);

  // Git Telemetry
  const [gitStatus, setGitStatus] = useState<GitStatusData | null>(null);

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

  const refreshGitStatus = useCallback(async () => {
    try {
      const status = await getGitStatus();
      setGitStatus(status);
    } catch {
      // Git may be uninitialized or outside PATH; fail silently
    }
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
    void refreshGitStatus();
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    void onNotesChanged(() => {
      void loadGraph();
      void loadNotesList();
      void refreshGitStatus();
      setRefreshTick((tick) => tick + 1);
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [loadGraph, loadNotesList, refreshGitStatus]);

  // Preload voice files and start ClapDetector
  useEffect(() => {
    void preloadVoice("Good morning, Sir!.mp3");
    void preloadVoice("Good afternoon, Sir!.mp3");
    void preloadVoice("Good evening, Sir!.mp3");
    void preloadVoice("action_vscode_launch.mp3");
    void preloadVoice("action_note_created.mp3");
    void preloadVoice("action_journal_captured.mp3");

    if (!clapEnabled) return;

    const detector = new ClapDetector({
      onDoubleClap: () => {
        // Unminimize & restore native window to full focus
        void restoreWindow().catch(() => {});
        void playTimeGreeting();
        showToast("👏 Double-clap detected — Welcome back, Sir!");
      },
    });

    void detector.start();

    return () => {
      detector.stop();
    };
  }, [clapEnabled, showToast]);

  // Hands-free Voice Command Engine effect
  useEffect(() => {
    if (!voiceCmdEnabled) return;

    const listener = new VoiceCommandListener({
      onWakePhrase: () => {
        void restoreWindow().catch(() => {});
        void playTimeGreeting();
        showToast("🗣️ 'Hey Severus!' detected — Welcome back, Sir!");
      },
      onOpenCopilot: () => {
        setWorkbenchOpen(true);
        setWorkbenchTab("copilot");
        void playVoice("nav_copilot_open.mp3");
        showToast("🗣️ Voice Command: Opening Copilot");
      },
      onOpenSearch: () => {
        setQuickSwitcherOpen(true);
        void playVoice("nav_quick_switcher.mp3");
        showToast("🗣️ Voice Command: Opening Search");
      },
      onOpenGrounding: () => {
        setGroundingOpen(true);
        void playVoice("nav_assembler_open.mp3");
        showToast("🗣️ Voice Command: Opening Grounding Assembler");
      },
      onOpenNotes: () => {
        setNotesDrawerOpen((prev) => !prev);
        void playVoice("nav_notes_drawer.mp3");
        showToast("🗣️ Voice Command: Toggling Notes Explorer");
      },
      onNewNote: () => {
        setNewNoteModalOpen(true);
        showToast("🗣️ Voice Command: Creating New Note");
      },
      onJournal: () => {
        setJournalOpen(true);
        showToast("🗣️ Voice Command: Quick Journal Capture");
      },
      onZenMode: () => {
        setZenMode((prev) => !prev);
        void playVoice("nav_zen_on.mp3");
        showToast("🗣️ Voice Command: Toggling Zen Mode");
      },
      onClose: () => {
        setJournalOpen(false);
        setAiSettingsOpen(false);
        setQuickSwitcherOpen(false);
        setGroundingOpen(false);
        setNewNoteModalOpen(false);
        setZenMode(false);
        showToast("🗣️ Voice Command: Closing active views");
      },
    });

    listener.start();

    return () => {
      listener.stop();
    };
  }, [voiceCmdEnabled, showToast]);

  const handleOpenInEditor = useCallback(
    async (id: string) => {
      try {
        await openInEditor(id);
        void playVoice("action_vscode_launch.mp3");
        showToast(`Opening "${id}.md" in editor…`);
      } catch (err) {
        void playVoice("alert_api_error.mp3");
        showToast(`Could not open editor: ${String(err)}`);
      }
    },
    [showToast],
  );

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
      void playVoice("auto_note_saved.mp3");
      showToast(`Saved "${id}"`);
    },
    [showToast],
  );

  const handleCreateNote = useCallback(
    async (trimmed: string, initialContent?: string) => {
      try {
        await saveNote(trimmed, initialContent ?? `# ${trimmed}\n\n#note\n\n`);
        await loadNotesList();
        await loadGraph();
        await openNote(trimmed);
        void playVoice("action_note_created.mp3");
        showToast(`Created note "${trimmed}.md"`);
      } catch (err) {
        void playVoice("alert_api_error.mp3");
        showToast(`Could not create note: ${String(err)}`);
      }
    },
    [loadNotesList, loadGraph, openNote, showToast],
  );

  const handleNewNote = useCallback(() => {
    setNewNoteModalOpen(true);
  }, []);

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
      void playVoice("action_journal_captured.mp3");
      showToast(`Journaled at ${stamp}`);
    },
    [showToast],
  );

  // Global Keyboard Shortcuts & Activity Tracker
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      recordKeyPress();
      const mod = event.ctrlKey || event.metaKey;

      // Quick Switcher (Ctrl+K or Ctrl+P)
      if (mod && (event.key.toLowerCase() === "k" || event.key.toLowerCase() === "p")) {
        event.preventDefault();
        setQuickSwitcherOpen((prev) => {
          if (!prev) void playVoice("nav_quick_switcher.mp3");
          return !prev;
        });
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
        void playVoice("nav_copilot_open.mp3");
      }
      // Toggle Grounding Assembler (Ctrl+Shift+G)
      else if (mod && event.shiftKey && event.key.toLowerCase() === "g") {
        event.preventDefault();
        setGroundingOpen((prev) => {
          if (!prev) void playVoice("nav_assembler_open.mp3");
          return !prev;
        });
      }
      // Toggle Notes Drawer (Ctrl+B)
      else if (mod && event.key.toLowerCase() === "b") {
        event.preventDefault();
        setNotesDrawerOpen((prev) => {
          if (!prev) void playVoice("nav_notes_drawer.mp3");
          return !prev;
        });
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
      // Exit Zen Mode (Escape)
      else if (event.key === "Escape" && zenMode) {
        event.preventDefault();
        setZenMode(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleNewNote, zenMode]);

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
            <img src="/logo.png" alt="Severus" className="topbar-logo-img" />
            <div className="brand">
              LEX MATONDO <span className="dim">// SEVERUS.AI</span>
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
            <div
              className={`badge-pill ai-nav-pill voice-nav-pill ${voiceMuted ? "muted" : ""}`}
              onClick={() => {
                const next = !voiceMuted;
                setVoiceMutedState(next);
                setVoiceMuted(next);
                showToast(next ? "Voice Audio Muted" : "Voice Audio Active");
              }}
              title="Toggle Severus Voice Audio"
            >
              <span className={`live-dot ${voiceMuted ? "muted" : ""}`} />
              <span>{voiceMuted ? "🎙️ VOICE: OFF" : "🎙️ VOICE: ON"}</span>
            </div>
            <div
              className={`badge-pill ai-nav-pill voice-nav-pill ${!clapEnabled ? "muted" : ""}`}
              onClick={() => {
                const next = !clapEnabled;
                setClapEnabledState(next);
                setClapEnabled(next);
                showToast(next ? "Clap Detector Disabled" : "Clap Detector Active (Greet on 2 Claps)");
              }}
              title="Toggle Double-Clap Detection (Greet on 2 Claps)"
            >
              <span className={`live-dot ${!clapEnabled ? "muted" : ""}`} />
              <span>{clapEnabled ? "👏 CLAP: ON" : "👏 CLAP: OFF"}</span>
            </div>
            <div
              className={`badge-pill ai-nav-pill voice-nav-pill ${!voiceCmdEnabled ? "muted" : ""}`}
              onClick={() => {
                const next = !voiceCmdEnabled;
                setVoiceCmdEnabledState(next);
                setVoiceCmdEnabled(next);
                showToast(next ? "Voice Commands Disabled" : "Voice Commands Active (Hands-Free)");
              }}
              title="Toggle Hands-Free Voice Commands (Say 'Open Copilot', 'Search', 'Zen Mode', etc.)"
            >
              <span className={`live-dot ${!voiceCmdEnabled ? "muted" : ""}`} />
              <span>{voiceCmdEnabled ? "🗣️ VOICE CMD: ON" : "🗣️ VOICE CMD: OFF"}</span>
            </div>
          </div>

          {/* Center Quick Search Button */}
          <button
            type="button"
            className="topbar-search-btn"
            onClick={() => {
              void playVoice("nav_quick_switcher.mp3");
              setQuickSwitcherOpen(true);
            }}
            title="Open Command Palette (Ctrl+K)"
          >
            <span className="search-icon">⌘</span>
            <span className="search-text">Search notes or commands...</span>
            <kbd className="search-kbd">CTRL+K</kbd>
          </button>

          {/* Right Actions */}
          <div className="topbar-actions">
            <button
              className={`topbar-tool-btn ${workbenchOpen && workbenchTab === "copilot" ? "active" : ""}`}
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
              className={`topbar-tool-btn ${workbenchOpen && workbenchTab === "note" ? "active" : ""}`}
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
            onOpenGrounding={() => setGroundingOpen(true)}
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
            gitStatus={gitStatus}
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
          {zenMode && (
            <button
              type="button"
              className="zen-exit-btn"
              onClick={() => setZenMode(false)}
              title="Exit Zen Fullscreen (Esc)"
            >
              ✕ EXIT ZEN (ESC)
            </button>
          )}
          <GraphView
            nodes={visNodes}
            links={graph.links}
            activeTags={activeTags}
            selectedId={selectedId}
            onSelectNote={(id) => void openNote(id)}
          />
          <TagBar
            tags={graph.tags}
            colors={colors}
            active={activeTags}
            onToggle={toggleTag}
            onReset={() => setActiveTags(new Set(graph.tags))}
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
            notesList={notesList}
            onSaveNote={handleSave}
            onOpenLink={(name) => void handleOpenLink(name)}
            onToggleTag={toggleTag}
            onOpenInEditor={handleOpenInEditor}
            onNewNote={handleNewNote}
            onOpenJournal={() => setJournalOpen(true)}
            onOpenGrounding={() => setGroundingOpen(true)}
            aiConfig={aiConfig}
            onOpenAISettings={() => setAiSettingsOpen(true)}
            onSaveAsNote={async (title, content) => {
              await saveNote(title, content);
              await loadNotesList();
              await loadGraph();
            }}
            onShowToast={showToast}
            onOpenNote={(id) => void openNote(id)}
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
              <span>GIT:</span>{" "}
              <span className="highlight">
                {gitStatus
                  ? `${gitStatus.branch} (${gitStatus.is_clean ? "clean" : `${gitStatus.modified_count} mod`})`
                  : "READY"}
              </span>
            </div>
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
              <kbd className="status-kbd">CTRL+SHIFT+G</kbd> <span>GROUNDING</span>
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
        onOpenGrounding={() => setGroundingOpen(true)}
        onClose={() => setQuickSwitcherOpen(false)}
      />

      <NewNoteModal
        open={newNoteModalOpen}
        existingNotes={notesList}
        onClose={() => setNewNoteModalOpen(false)}
        onCreate={handleCreateNote}
      />

      <ContextAssemblerModal
        open={groundingOpen}
        notes={notesList}
        activeNote={note}
        onClose={() => setGroundingOpen(false)}
        onShowToast={showToast}
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
