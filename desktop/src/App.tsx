import { useCallback, useEffect, useMemo, useState } from "react";
import { confirm } from "@tauri-apps/plugin-dialog";
import GraphView, { type VisNode } from "./components/GraphView";
import TagBar from "./components/TagBar";
import SidebarNav, { type KnowledgeSubTab, type NavSection } from "./components/SidebarNav";
import TopHeader from "./components/TopHeader";
import ContextInspector from "./components/ContextInspector";
import NotesDrawer from "./components/NotesDrawer";
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
import type { GitStatusData, GraphData, GraphNode, NoteContent, NoteMeta } from "./types";
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
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [note, setNote] = useState<NoteContent | null>(null);

  // Navigation & Shell Layout
  const [activeSection, setActiveSection] = useState<NavSection>("knowledge");
  const [knowledgeSubTab, setKnowledgeSubTab] = useState<KnowledgeSubTab>("graph");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Inspector & Panes
  const [notesDrawerOpen, setNotesDrawerOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [inspectorTab, setInspectorTab] = useState<"note" | "node" | "copilot">("note");
  const [zenMode, setZenMode] = useState(false);

  // Voice & Acoustic Settings
  const [voiceMuted, setVoiceMutedState] = useState<boolean>(getVoiceMuted);
  const [clapEnabled, setClapEnabledState] = useState<boolean>(getClapEnabled);
  const [voiceCmdEnabled, setVoiceCmdEnabledState] = useState<boolean>(getVoiceCmdEnabled);

  // Modals
  const [journalOpen, setJournalOpen] = useState(false);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);
  const [groundingOpen, setGroundingOpen] = useState(false);
  const [newNoteModalOpen, setNewNoteModalOpen] = useState(false);

  // AI Config & Git
  const [aiConfig, setAiConfig] = useState<AIConfig>(loadAIConfig);
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
      // Git uninitialized
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
      // retry next tick
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
        setInspectorOpen(true);
        setInspectorTab("copilot");
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
      const foundNode = graph.nodes.find((n) => n.id.toLowerCase() === id.toLowerCase());
      if (foundNode) setSelectedNode(foundNode);

      setInspectorOpen(true);
      setInspectorTab("note");
      await refreshSelected(id);
    },
    [graph.nodes, refreshSelected],
  );

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

      if (mod && (event.key.toLowerCase() === "k" || event.key.toLowerCase() === "p")) {
        event.preventDefault();
        setQuickSwitcherOpen((prev) => {
          if (!prev) void playVoice("nav_quick_switcher.mp3");
          return !prev;
        });
      } else if (mod && event.key.toLowerCase() === "j") {
        event.preventDefault();
        setJournalOpen(true);
      } else if (mod && event.shiftKey && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setInspectorOpen(true);
        setInspectorTab("copilot");
        void playVoice("nav_copilot_open.mp3");
      } else if (mod && event.shiftKey && event.key.toLowerCase() === "g") {
        event.preventDefault();
        setGroundingOpen((prev) => {
          if (!prev) void playVoice("nav_assembler_open.mp3");
          return !prev;
        });
      } else if (mod && event.key.toLowerCase() === "b") {
        event.preventDefault();
        setNotesDrawerOpen((prev) => {
          if (!prev) void playVoice("nav_notes_drawer.mp3");
          return !prev;
        });
      } else if (mod && event.key === "\\") {
        event.preventDefault();
        setInspectorOpen((prev) => !prev);
      } else if (mod && event.altKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        void handleNewNote();
      } else if (event.key === "Escape" && zenMode) {
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

  // Dynamic Location Breadcrumb
  const breadcrumb = useMemo(() => {
    if (activeSection === "knowledge") {
      return [
        "Severus.ai",
        "Knowledge",
        knowledgeSubTab === "graph"
          ? "Graph Map"
          : knowledgeSubTab === "notes"
          ? "Notes Vault"
          : "Tags & Index",
      ];
    }
    if (activeSection === "home") return ["Severus.ai", "Home Overview"];
    if (activeSection === "work") return ["Severus.ai", "Workspaces & Tasks"];
    if (activeSection === "ai") return ["Severus.ai", "AI Copilot"];
    if (activeSection === "personal") return ["Severus.ai", "Personal Journal"];
    return ["Severus.ai", "System Settings"];
  }, [activeSection, knowledgeSubTab]);

  return (
    <div className={`app workstation human-designed ${zenMode ? "zen-mode" : ""}`}>
      {/* Streamlined Top Header */}
      {!zenMode && (
        <TopHeader
          breadcrumb={breadcrumb}
          activeSection={activeSection}
          onSelectSection={(sec) => {
            setActiveSection(sec);
            if (sec === "ai") {
              setInspectorOpen(true);
              setInspectorTab("copilot");
            }
          }}
          knowledgeSubTab={knowledgeSubTab}
          onSelectKnowledgeSubTab={setKnowledgeSubTab}
          onToggleNotesDrawer={() => setNotesDrawerOpen((prev) => !prev)}
          onOpenQuickSearch={() => {
            void playVoice("nav_quick_switcher.mp3");
            setQuickSwitcherOpen(true);
          }}
          onToggleCopilot={() => {
            if (inspectorOpen && inspectorTab === "copilot") {
              setInspectorOpen(false);
            } else {
              setInspectorOpen(true);
              setInspectorTab("copilot");
            }
          }}
          onOpenGrounding={() => setGroundingOpen(true)}
          onOpenNewNote={handleNewNote}
          onOpenAISettings={() => setAiSettingsOpen(true)}
          aiConfig={aiConfig}
          voiceMuted={voiceMuted}
          onToggleVoiceMuted={() => {
            const next = !voiceMuted;
            setVoiceMutedState(next);
            setVoiceMuted(next);
            showToast(next ? "Voice Muted" : "Voice Active");
          }}
          clapEnabled={clapEnabled}
          onToggleClapEnabled={() => {
            const next = !clapEnabled;
            setClapEnabledState(next);
            setClapEnabled(next);
            showToast(next ? "Clap Disabled" : "Clap Active");
          }}
          voiceCmdEnabled={voiceCmdEnabled}
          onToggleVoiceCmdEnabled={() => {
            const next = !voiceCmdEnabled;
            setVoiceCmdEnabledState(next);
            setVoiceCmdEnabled(next);
            showToast(next ? "Voice Commands Disabled" : "Voice Commands Active");
          }}
          gitStatus={gitStatus}
          copilotActive={inspectorOpen && inspectorTab === "copilot"}
        />
      )}

      {/* Main 3-Zone Stage */}
      <main className="main workstation-main">
        {/* ZONE 1: LEFT PRIMARY NAVIGATION SIDEBAR */}
        {!zenMode && (
          <SidebarNav
            activeSection={activeSection}
            knowledgeSubTab={knowledgeSubTab}
            onSelectSection={(sec) => {
              setActiveSection(sec);
              if (sec === "ai") {
                setInspectorOpen(true);
                setInspectorTab("copilot");
              }
            }}
            onSelectKnowledgeSubTab={setKnowledgeSubTab}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={() => setSidebarCollapsed((prev) => !prev)}
            notesDrawerOpen={notesDrawerOpen}
            onToggleNotesDrawer={() => setNotesDrawerOpen((prev) => !prev)}
            onOpenQuickSwitcher={() => setQuickSwitcherOpen(true)}
            onOpenJournal={() => setJournalOpen(true)}
            onOpenGrounding={() => setGroundingOpen(true)}
            onOpenNewNote={handleNewNote}
            onOpenAISettings={() => setAiSettingsOpen(true)}
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

        {/* ZONE 2: CENTER MAIN WORKSPACE STAGE */}
        <div className="graph-pane center-stage">
          {zenMode && (
            <button
              type="button"
              className="zen-exit-btn"
              onClick={() => setZenMode(false)}
              title="Exit Zen Fullscreen (Esc)"
            >
              ✕ Exit Zen Mode (Esc)
            </button>
          )}

          {/* Render Active View */}
          {activeSection === "home" ? (
            <div className="home-dashboard">
              <div className="dashboard-welcome">
                <h2>Welcome to Severus.ai</h2>
                <p className="subtitle">
                  Start with a question, select a concept in the graph, or write a note.
                </p>

                <div className="dashboard-actions-grid">
                  <button type="button" className="dash-card" onClick={handleNewNote}>
                    <span className="card-icon">📝</span>
                    <h4>Create a Note</h4>
                    <p>Capture ideas, research, and technical notes</p>
                  </button>
                  <button
                    type="button"
                    className="dash-card"
                    onClick={() => {
                      setActiveSection("knowledge");
                      setKnowledgeSubTab("graph");
                    }}
                  >
                    <span className="card-icon">🕸️</span>
                    <h4>Knowledge Map</h4>
                    <p>Explore relationships and PageRank hubs</p>
                  </button>
                  <button
                    type="button"
                    className="dash-card"
                    onClick={() => {
                      setInspectorOpen(true);
                      setInspectorTab("copilot");
                    }}
                  >
                    <span className="card-icon">✦</span>
                    <h4>Ask AI Copilot</h4>
                    <p>Synthesize concepts from your vault notes</p>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <GraphView
                nodes={visNodes}
                links={graph.links}
                activeTags={activeTags}
                selectedId={selectedId}
                onSelectNote={(id) => {
                  const node = graph.nodes.find((n) => n.id.toLowerCase() === id.toLowerCase());
                  if (node) setSelectedNode(node);
                  void openNote(id);
                }}
              />
              <TagBar
                tags={graph.tags}
                colors={colors}
                active={activeTags}
                onToggle={toggleTag}
                onReset={() => setActiveTags(new Set(graph.tags))}
              />
            </>
          )}
        </div>

        {/* ZONE 3: RIGHT CONTEXTUAL INSPECTOR */}
        {!zenMode && inspectorOpen && (
          <ContextInspector
            open={inspectorOpen}
            onClose={() => setInspectorOpen(false)}
            activeTab={inspectorTab}
            onSelectTab={setInspectorTab}
            note={note}
            notesList={notesList}
            onSaveNote={handleSave}
            onOpenLink={(name) => void handleOpenLink(name)}
            onToggleTag={toggleTag}
            onOpenInEditor={handleOpenInEditor}
            onNewNote={handleNewNote}
            onOpenJournal={() => setJournalOpen(true)}
            onOpenGrounding={() => setGroundingOpen(true)}
            onOpenNote={(id) => void openNote(id)}
            selectedNode={selectedNode}
            graphData={graph}
            aiConfig={aiConfig}
            onOpenAISettings={() => setAiSettingsOpen(true)}
            onSaveAsNote={async (title, content) => {
              await saveNote(title, content);
              await loadNotesList();
              await loadGraph();
            }}
            onShowToast={showToast}
          />
        )}
      </main>

      {/* Clean System Footer */}
      {!zenMode && (
        <footer className="status-bar human-footer">
          <div className="status-bar-left">
            <span className="footer-item">
              Workspace: <strong className="val">Severus</strong>
            </span>
            <span className="footer-item">
              Active Note:{" "}
              <strong className="val">
                {selectedId ? `${selectedId}.md` : "None"}
              </strong>
            </span>
          </div>
          <div className="status-bar-right">
            <span className="footer-item">
              Model: <strong className="val">{aiConfig.model}</strong>
            </span>
            <span className="footer-item">
              Graph:{" "}
              <strong className="val">
                {graph.nodes.length} nodes · {graph.links.length} links
              </strong>
            </span>
            <span className="footer-item keyhint">
              <kbd>⌘K</kbd> Search
            </span>
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
          setInspectorOpen(true);
          setInspectorTab("copilot");
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
