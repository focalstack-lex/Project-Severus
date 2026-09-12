import { useCallback, useEffect, useMemo, useState } from "react";
import { confirm } from "@tauri-apps/plugin-dialog";
import Icon from "./components/Icon";
import ErrorBoundary from "./components/ErrorBoundary";
import GraphView, { type VisNode } from "./components/GraphView";
import TagBar from "./components/TagBar";
import TagsIndexView from "./components/TagsIndexView";
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
const IS_MAC =
  typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform);
const MOD_KEY = IS_MAC ? "⌘" : "Ctrl";

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning, Sir.";
  if (hour < 18) return "Good afternoon, Sir.";
  return "Good evening, Sir.";
}

export default function App() {
  const [graph, setGraph] = useState<GraphData>(EMPTY_GRAPH);
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [notesList, setNotesList] = useState<NoteMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [note, setNote] = useState<NoteContent | null>(null);
  const [booting, setBooting] = useState(true);

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
      // Git may be uninitialized in this workspace
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
    } finally {
      setBooting(false);
    }
  }, []);

  const loadNotesList = useCallback(async () => {
    try {
      setNotesList(await listNotes());
    } catch {
      // retried on the next notes-changed event
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
        showToast("Double-clap detected — welcome back, Sir.");
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
        showToast("“Hey Severus” detected — welcome back, Sir.");
      },
      onOpenCopilot: () => {
        setInspectorOpen(true);
        setInspectorTab("copilot");
        void playVoice("nav_copilot_open.mp3");
        showToast("Voice command: opening Copilot");
      },
      onOpenSearch: () => {
        setQuickSwitcherOpen(true);
        void playVoice("nav_quick_switcher.mp3");
        showToast("Voice command: opening search");
      },
      onOpenGrounding: () => {
        setGroundingOpen(true);
        void playVoice("nav_assembler_open.mp3");
        showToast("Voice command: opening Grounding");
      },
      onOpenNotes: () => {
        setNotesDrawerOpen((prev) => !prev);
        void playVoice("nav_notes_drawer.mp3");
        showToast("Voice command: toggling Notes Explorer");
      },
      onNewNote: () => {
        setNewNoteModalOpen(true);
        showToast("Voice command: creating a new note");
      },
      onJournal: () => {
        setJournalOpen(true);
        showToast("Voice command: quick journal capture");
      },
      onZenMode: () => {
        setZenMode((prev) => !prev);
        void playVoice("nav_zen_on.mp3");
        showToast("Voice command: toggling Zen mode");
      },
      onClose: () => {
        setJournalOpen(false);
        setAiSettingsOpen(false);
        setQuickSwitcherOpen(false);
        setGroundingOpen(false);
        setNewNoteModalOpen(false);
        setZenMode(false);
        showToast("Voice command: closing active views");
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
        showToast(`Opening “${id}.md” in your editor…`);
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
      showToast(`Saved “${id}”`);
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
        showToast(`Created note “${trimmed}.md”`);
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
      const ok = await confirm(`Note “${trimmed}” does not exist yet. Create it?`, {
        title: "Second Brain",
        kind: "info",
      });
      if (!ok) return;
      try {
        await saveNote(trimmed, `# ${trimmed}\n\n`);
        await loadNotesList();
        await loadGraph();
        await openNote(trimmed);
        showToast(`Created “${trimmed}”`);
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
        const base = node.tags.length > 0 ? (colors[node.tags[0]] ?? "#8f98a3") : "#8f98a3";
        return { ...node, color: fade(base, freshnessOpacity(node.ageDays)) };
      }),
    [graph, colors],
  );

  const greeting = useMemo(() => greetingForHour(new Date().getHours()), []);
  const hubNodes = useMemo(
    () => [...graph.nodes].sort((a, b) => b.importance - a.importance).slice(0, 5),
    [graph.nodes],
  );
  const freshNotes = useMemo(
    () => [...graph.nodes].sort((a, b) => a.ageDays - b.ageDays).slice(0, 5),
    [graph.nodes],
  );

  return (
    <div className={`app workstation ${zenMode ? "zen-mode" : ""}`}>
      {!zenMode && (
        <TopHeader
          activeSection={activeSection}
          onSelectSection={setActiveSection}
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
            showToast(next ? "Voice muted" : "Voice active");
          }}
          clapEnabled={clapEnabled}
          onToggleClapEnabled={() => {
            const next = !clapEnabled;
            setClapEnabledState(next);
            setClapEnabled(next);
            showToast(next ? "Double-clap disabled" : "Double-clap active");
          }}
          voiceCmdEnabled={voiceCmdEnabled}
          onToggleVoiceCmdEnabled={() => {
            const next = !voiceCmdEnabled;
            setVoiceCmdEnabledState(next);
            setVoiceCmdEnabled(next);
            showToast(next ? "Voice commands disabled" : "Voice commands active");
          }}
          gitStatus={gitStatus}
          copilotActive={inspectorOpen && inspectorTab === "copilot"}
        />
      )}

      <main className="main workstation-main">
        {!zenMode && (
          <SidebarNav
            activeSection={activeSection}
            knowledgeSubTab={knowledgeSubTab}
            onSelectSection={setActiveSection}
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

        <div className="graph-pane center-stage">
          {zenMode && (
            <button
              type="button"
              className="zen-exit-btn"
              onClick={() => setZenMode(false)}
              title="Exit Zen fullscreen (Esc)"
            >
              <Icon name="close" size={12} /> Exit Zen (Esc)
            </button>
          )}

          {activeSection === "home" ? (
            <div className="home-view">
              <div className="home-view-inner">
                <h1 className="home-greeting">{greeting}</h1>
                <p className="home-lede">
                  Start with a question in the Copilot, pick up a hub note below, or capture
                  something new before it slips away.
                </p>

                <div className="home-stats">
                  <span>
                    <strong>{graph.nodes.length}</strong> notes
                  </span>
                  <span className="sep">/</span>
                  <span>
                    <strong>{graph.links.length}</strong> links
                  </span>
                  <span className="sep">/</span>
                  <span>
                    <strong>{graph.tags.length}</strong> tags
                  </span>
                  <span className="sep">/</span>
                  <span>
                    model <strong>{aiConfig.model}</strong>
                  </span>
                </div>

                <div className="home-columns">
                  <section>
                    <div className="home-section-title">Hub notes · PageRank</div>
                    <div className="home-list">
                      {hubNodes.map((node) => (
                        <button
                          key={node.id}
                          type="button"
                          className="home-row"
                          onClick={() => void openNote(node.id)}
                        >
                          <span>{node.title}</span>
                          <span className="home-row-meta">{node.importance.toFixed(1)}%</span>
                        </button>
                      ))}
                      {hubNodes.length === 0 && (
                        <span className="home-row-meta">Vault is empty — create a note.</span>
                      )}
                    </div>
                  </section>

                  <section>
                    <div className="home-section-title">Freshest notes</div>
                    <div className="home-list">
                      {freshNotes.map((node) => (
                        <button
                          key={node.id}
                          type="button"
                          className="home-row"
                          onClick={() => void openNote(node.id)}
                        >
                          <span>{node.title}</span>
                          <span className="home-row-meta">
                            {node.ageDays === 0 ? "today" : `${node.ageDays}d ago`}
                          </span>
                        </button>
                      ))}
                      {freshNotes.length === 0 && (
                        <span className="home-row-meta">Nothing indexed yet.</span>
                      )}
                    </div>
                  </section>
                </div>

                <div className="home-actions">
                  <button type="button" className="accent" onClick={handleNewNote}>
                    <Icon name="plus" size={13} /> New Note
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSection("knowledge");
                      setKnowledgeSubTab("graph");
                    }}
                  >
                    <Icon name="graph" size={13} /> Knowledge Map
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInspectorOpen(true);
                      setInspectorTab("copilot");
                    }}
                  >
                    <Icon name="spark" size={13} /> Ask Copilot
                  </button>
                  <button type="button" onClick={() => setGroundingOpen(true)}>
                    <Icon name="layers" size={13} /> Grounding
                  </button>
                </div>
              </div>
            </div>
          ) : activeSection === "knowledge" && knowledgeSubTab === "tags" ? (
            <TagsIndexView
              graph={graph}
              tagColors={colors}
              onSelectNote={(id) => void openNote(id)}
              onToggleTag={toggleTag}
            />
          ) : booting ? (
            <div className="boot-loading">
              <span>Indexing vault…</span>
              <div className="boot-loading-bar" />
            </div>
          ) : (
            <>
              <ErrorBoundary label="Knowledge graph">
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
              </ErrorBoundary>
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

        {!zenMode && inspectorOpen && (
          <ErrorBoundary label="Context inspector">
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
          </ErrorBoundary>
        )}
      </main>

      {!zenMode && (
        <footer className="status-bar">
          <div className="status-bar-left">
            <span className="footer-item">
              Workspace: <strong className="val">Severus</strong>
            </span>
            <span className="footer-item">
              Active:{" "}
              <strong className="val">{selectedId ? `${selectedId}.md` : "None"}</strong>
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
              <kbd>{MOD_KEY}K</kbd> Search
            </span>
          </div>
        </footer>
      )}

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
          showToast(`Active AI model set to ${newCfg.model}`);
        }}
        onClose={() => setAiSettingsOpen(false)}
      />

      {loadError && <div className="toast error">Backend error: {loadError}</div>}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
