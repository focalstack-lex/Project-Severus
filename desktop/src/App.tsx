import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirm } from "@tauri-apps/plugin-dialog";
import Icon from "./components/Icon";
import ErrorBoundary from "./components/ErrorBoundary";
import GraphView, { type VisNode } from "./components/GraphView";
import TagBar from "./components/TagBar";
import TagsIndexView from "./components/TagsIndexView";
import { type KnowledgeSubTab, type NavSection } from "./components/SidebarNav";
import TopHeader from "./components/TopHeader";
import ContextInspector from "./components/ContextInspector";
import NotesDrawer from "./components/NotesDrawer";
import JournalCapture from "./components/JournalCapture";
import AISettingsModal from "./components/AISettingsModal";
import QuickSwitcherModal from "./components/QuickSwitcherModal";
import ContextAssemblerModal from "./components/ContextAssemblerModal";
import NewNoteModal from "./components/NewNoteModal";
import ThinkingModeCapsule from "./components/ThinkingModeCapsule";
import SystemConsoleModal, { type CommandOutcome } from "./components/SystemConsoleModal";
import PasswordGateModal from "./components/PasswordGateModal";
import { PillBase } from "@/components/ui/3d-adaptive-navigation-bar";
import { type AIConfig, loadAIConfig, saveAIConfig } from "./lib/ai";
import { mapTextToIntent } from "./lib/deepseekIntent";
import {
  executeSystemIntent,
  hasControlPassword,
  resolveSystemCommand,
  setControlPassword,
  verifyControlPassword,
  type SystemIntent,
} from "./lib/systemControl";
import {
  appendJournal,
  getGitStatus,
  getGraphData,
  listNotes,
  onNotesChanged,
  openInEditor,
  readNote,
  hideToTray,
  saveNote,
  setFloatingMode,
  moveToMonitor,
  toggleMaximize,
  maximizeWindow,
  toggleFullscreen,
} from "./lib/tauri";
import { fade, freshnessOpacity, tagColors } from "./lib/colors";
import type { GitStatusData, GraphData, GraphNode, NoteContent, NoteMeta } from "./types";
import {
  formatReplyWithSir,
  getTimeGreetingData,
  getVoiceMuted,
  playTimeGreeting,
  playVoice,
  preloadVoice,
  setVoiceMuted,
  speakText,
} from "./lib/voice";
import { ClapDetector, getClapEnabled, recordKeyPress, setClapEnabled } from "./lib/clapDetector";
import {
  VoiceCommandListener,
  type VoiceCommandHandlers,
  getVoiceCmdEnabled,
  setVoiceCmdEnabled,
} from "./lib/voiceCommands";

const EMPTY_GRAPH: GraphData = { nodes: [], links: [], tags: [] };
const IS_MAC =
  typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform);
const MOD_KEY = IS_MAC ? "⌘" : "Ctrl";

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
  const [isFloatingMode, setIsFloatingMode] = useState<boolean>(true);
  const [isThinkingMode, setIsThinkingMode] = useState<boolean>(false);

  // Inspector & Panes
  const [notesDrawerOpen, setNotesDrawerOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [inspectorTab, setInspectorTab] = useState<"note" | "node" | "copilot">("note");
  const [zenMode, setZenMode] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  // Voice & Acoustic Settings
  const [voiceMuted, setVoiceMutedState] = useState<boolean>(getVoiceMuted);
  const [clapEnabled, setClapEnabledState] = useState<boolean>(getClapEnabled);
  const [voiceCmdEnabled, setVoiceCmdEnabledState] = useState<boolean>(getVoiceCmdEnabled);
  const [listeningActive, setListeningActive] = useState<boolean>(true);
  const voiceListenerRef = useRef<VoiceCommandListener | null>(null);

  const handleToggleListening = useCallback((targetActive?: boolean, playAudio = false) => {
    setListeningActive((prev) => {
      const next = typeof targetActive === "boolean" ? targetActive : !prev;
      if (voiceListenerRef.current) {
        voiceListenerRef.current.setStandby(!next);
      }
      if (playAudio) {
        if (next) {
          void playVoice("listening_resumed");
        } else {
          void playVoice("listening_paused");
        }
      }
      return next;
    });
  }, []);

  // Modals
  const [journalOpen, setJournalOpen] = useState(false);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);
  const [groundingOpen, setGroundingOpen] = useState(false);
  const [newNoteModalOpen, setNewNoteModalOpen] = useState(false);
  const [systemConsoleOpen, setSystemConsoleOpen] = useState(false);

  // System control: destructive intents await the control password here
  const [pendingGate, setPendingGate] = useState<{ intent: SystemIntent; description: string } | null>(null);
  const [gateError, setGateError] = useState<string | null>(null);
  const [gateBusy, setGateBusy] = useState(false);

  // AI Config & Git
  const [aiConfig, setAiConfig] = useState<AIConfig>(loadAIConfig);
  const [gitStatus, setGitStatus] = useState<GitStatusData | null>(null);

  // Notifications & State (on-screen toast notes removed system-wide)
  const [refreshTick, setRefreshTick] = useState(0);

  const showToast = useCallback((_message: string) => {
    // Silent: on-screen toasts/notes disabled across the entire system
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
    } catch (err) {
      console.error("Failed loading graph:", err);
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

  const handleSectionSelect = useCallback(
    async (id: string) => {
      setIsFloatingMode(false);
      try {
        await setFloatingMode(false);
      } catch (e) {
        console.error("Failed to restore full window:", e);
      }

      if (id === "graph") {
        setActiveSection("knowledge");
        setKnowledgeSubTab("graph");
        void playVoice("nav_graph_open.mp3");
      } else if (id === "notes") {
        setActiveSection("knowledge");
        setKnowledgeSubTab("notes");
        setNotesDrawerOpen(true);
        void playVoice("nav_notes_drawer.mp3");
      } else if (id === "copilot") {
        setActiveSection("knowledge");
        setInspectorOpen(true);
        setInspectorTab("copilot");
        void playVoice("nav_copilot_open.mp3");
      } else if (id === "home") {
        setActiveSection("home");
        void playVoice("greeting_sir");
      }
    },
    [],
  );

  const handleEnterFloatingMode = useCallback(async () => {
    setIsFloatingMode(true);
    try {
      await setFloatingMode(true);
    } catch (e) {
      console.error("Failed to enter floating mode:", e);
    }
  }, []);

  const handleHideToTray = useCallback(async () => {
    try {
      await hideToTray();
    } catch (e) {
      console.error("Failed to hide to tray:", e);
    }
  }, []);

  const ensureWorkstation = useCallback(async () => {
    setIsFloatingMode(false);
    try {
      await setFloatingMode(false);
    } catch {
      // ignore
    }
    try {
      await maximizeWindow();
      setIsMaximized(true);
    } catch {
      // ignore
    }
  }, []);

  const handleToggleMaximize = useCallback(async () => {
    try {
      const max = await toggleMaximize();
      setIsMaximized(max);
    } catch {
      // ignore
    }
  }, []);

  const handleMoveMonitor = useCallback(
    async (target: "left" | "right" | "next" | "primary" = "next") => {
      try {
        await moveToMonitor(target);
      } catch (err) {
        console.warn(`Could not switch display: ${String(err)}`);
      }
    },
    [],
  );

  // --- System control (Tier 1/2): grammar first, model fallback second ---
  const handleRunSystemCommand = useCallback(
    async (text: string): Promise<CommandOutcome> => {
      try {
        const normalized = text.toLowerCase().trim();
        if (
          normalized === "stop listening" ||
          normalized === "turn off listening" ||
          normalized === "pause listening" ||
          normalized === "mute mic" ||
          normalized === "mute microphone" ||
          normalized === "deafen"
        ) {
          handleToggleListening(false, true);
          return {
            ok: true,
            message: "Listening mode paused, Sir.",
          };
        }
        if (
          normalized === "start listening" ||
          normalized === "turn on listening" ||
          normalized === "resume listening" ||
          normalized === "unmute mic" ||
          normalized === "unmute microphone" ||
          normalized === "wake up"
        ) {
          handleToggleListening(true, true);
          return {
            ok: true,
            message: "Listening mode active, Sir.",
          };
        }
        if (
          normalized === "system" ||
          normalized === "open system" ||
          normalized === "open the system" ||
          normalized === "wake system" ||
          normalized === "start system" ||
          normalized === "severus" ||
          normalized === "open severus" ||
          normalized === "open workstation" ||
          normalized === "restore workstation"
        ) {
          void ensureWorkstation();
          void playVoice("system_initialized");
          return {
            ok: true,
            message: "System initialized, Sir.",
          };
        }

        let resolution = await resolveSystemCommand(text).catch(() => null);
        if (!resolution) {
          // Deterministic grammar missed — the configured model maps the phrase
          // onto one of the same allowlisted intents, or nothing.
          const mapped = await mapTextToIntent(text, aiConfig).catch(() => null);
          if (!mapped) {
            void playVoice("alert_api_error.mp3");
            return {
              ok: false,
              message: "No matching system command, and the model could not map the phrase.",
            };
          }
          resolution = {
            intent: mapped,
            requires_password: mapped.action === "lock_workstation" || mapped.action === "close_window",
            description: `${mapped.action.replace(/_/g, " ")} — via ${aiConfig.model}`,
          };
        }
        if (resolution.requires_password) {
          setGateError(null);
          setPendingGate({ intent: resolution.intent, description: resolution.description });
          return { ok: true, message: `${resolution.description} — control password required` };
        }
        const message = await executeSystemIntent(resolution.intent, false);
        return { ok: true, message };
      } catch (err) {
        void playVoice("alert_api_error.mp3");
        return { ok: false, message: String(err) };
      }
    },
    [aiConfig, handleToggleListening],
  );

  const handleGateConfirm = useCallback(
    async (password: string) => {
      if (!pendingGate) return;
      setGateBusy(true);
      setGateError(null);
      try {
        if (hasControlPassword()) {
          const authorized = await verifyControlPassword(password);
          if (!authorized) {
            setGateError("Incorrect password.");
            return;
          }
        } else {
          await setControlPassword(password);
        }
        const message = await executeSystemIntent(pendingGate.intent, true);
        setPendingGate(null);
        console.log(`[system] ${message}`);
      } catch (err) {
        setGateError(String(err));
      } finally {
        setGateBusy(false);
      }
    },
    [pendingGate],
  );

  useEffect(() => {
    void setFloatingMode(true).catch(() => {});
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

  const lastGreetingTimeRef = useRef<number>(0);
  const startupGreetingPlayedRef = useRef<boolean>(false);
  const startupGreetingTimerRef = useRef<number | null>(null);

  const handlePlayGreeting = useCallback(
    (expand = false) => {
      if (expand) {
        void ensureWorkstation();
      }
      const now = Date.now();
      // Debounce voice playback (4s) to eliminate echo loops while keeping UI responsiveness immediate
      if (now - lastGreetingTimeRef.current < 4000) {
        return;
      }
      lastGreetingTimeRef.current = now;
      void playTimeGreeting();
    },
    [ensureWorkstation],
  );

  // 1. Startup greeting: when Severus boots up or app launches, greet the user after settle delay
  useEffect(() => {
    startupGreetingTimerRef.current = window.setTimeout(() => {
      startupGreetingTimerRef.current = null;
      startupGreetingPlayedRef.current = true;
      handlePlayGreeting(false);
    }, 1500);
    return () => {
      if (startupGreetingTimerRef.current !== null) {
        window.clearTimeout(startupGreetingTimerRef.current);
        startupGreetingTimerRef.current = null;
      }
    };
  }, [handlePlayGreeting]);

  // 2. Laptop Sleep/Resume & Lid-Open Detection:
  // Detects when the laptop resumes from sleep / modern standby / lid open by tracking timer intervals.
  useEffect(() => {
    let lastTick = Date.now();
    const ticker = window.setInterval(() => {
      const now = Date.now();
      const delta = now - lastTick;
      lastTick = now;
      // If timer frozen for > 7 seconds, Windows was suspended/sleeping
      if (delta > 7000) {
        console.log(`[LaptopResume] System resumed from sleep (gap: ${Math.round(delta / 1000)}s). Greeting user...`);
        window.setTimeout(() => {
          handlePlayGreeting(false);
        }, 1200);
      }
    }, 2000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const now = Date.now();
        if (now - lastTick > 7000) {
          window.setTimeout(() => {
            handlePlayGreeting(false);
          }, 1200);
        }
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(ticker);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [handlePlayGreeting]);

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
        handlePlayGreeting(true);
      },
    });

    void detector.start();

    return () => {
      detector.stop();
    };
  }, [clapEnabled, handlePlayGreeting]);

  // Hands-free Voice Command Handlers ref (preserves active microphone stream across UI re-renders)
  const voiceHandlersRef = useRef<VoiceCommandHandlers>({});
  voiceHandlersRef.current = {
    onOpenSystem: () => {
      if (startupGreetingTimerRef.current !== null) {
        window.clearTimeout(startupGreetingTimerRef.current);
        startupGreetingTimerRef.current = null;
      }
      startupGreetingPlayedRef.current = true;
      void ensureWorkstation();
      void playVoice("system_initialized");
    },
    onWakePhrase: () => {
      if (startupGreetingTimerRef.current !== null) {
        window.clearTimeout(startupGreetingTimerRef.current);
        startupGreetingTimerRef.current = null;
      }
      void ensureWorkstation();
      // If startup greeting already played recently (or within current session),
      // avoid redundant time greetings when opening the system; acknowledge cleanly
      if (startupGreetingPlayedRef.current && Date.now() - lastGreetingTimeRef.current < 180000) {
        void playVoice("system_initialized");
      } else {
        handlePlayGreeting(true);
      }
    },
    onOpenCopilot: () => {
      void ensureWorkstation();
      setActiveSection("knowledge");
      setInspectorOpen(true);
      setInspectorTab("copilot");
      void playVoice("nav_copilot_open.mp3");
    },
    onOpenGraph: () => {
      void ensureWorkstation();
      setActiveSection("knowledge");
      setKnowledgeSubTab("graph");
      void playVoice("nav_graph_open.mp3");
    },
    onOpenNotes: () => {
      void ensureWorkstation();
      setActiveSection("knowledge");
      setKnowledgeSubTab("notes");
      setNotesDrawerOpen(true);
      void playVoice("nav_notes_drawer.mp3");
    },
    onOpenSearch: () => {
      void ensureWorkstation();
      setQuickSwitcherOpen(true);
      void playVoice("nav_quick_switcher.mp3");
    },
    onOpenGrounding: () => {
      void ensureWorkstation();
      setGroundingOpen(true);
      void playVoice("nav_assembler_open.mp3");
    },
    onNewNote: () => {
      void ensureWorkstation();
      setNewNoteModalOpen(true);
    },
    onJournal: () => {
      void ensureWorkstation();
      setJournalOpen(true);
    },
    onOpenHome: () => {
      void ensureWorkstation();
      setActiveSection("home");
      void playVoice("greeting_sir");
    },
    onZenMode: () => {
      void ensureWorkstation();
      setZenMode((prev) => {
        const next = !prev;
        void toggleFullscreen();
        return next;
      });
      void playVoice("nav_zen_on.mp3");
    },
    onMaximize: () => {
      void ensureWorkstation();
      void playVoice("system_initialized");
    },
    onFloat: () => {
      void handleEnterFloatingMode();
    },
    onClose: () => {
      if (
        journalOpen ||
        aiSettingsOpen ||
        quickSwitcherOpen ||
        groundingOpen ||
        newNoteModalOpen ||
        zenMode
      ) {
        if (zenMode) {
          void toggleFullscreen();
        }
        setJournalOpen(false);
        setAiSettingsOpen(false);
        setQuickSwitcherOpen(false);
        setGroundingOpen(false);
        setNewNoteModalOpen(false);
        setZenMode(false);
      } else {
        void handleHideToTray();
      }
    },
    onMoveMonitor: (target: "left" | "right" | "next" | "primary") => {
      void handleMoveMonitor(target);
    },
    onThinkingMode: () => {
      void handleEnterFloatingMode();
      setIsThinkingMode(true);
      void playVoice("action_copilot_ready.mp3");
    },
    onToggleListening: (active: boolean) => {
      handleToggleListening(active, false);
    },
    onSystemCommand: async (text: string) => {
      const outcome = await handleRunSystemCommand(text);
      if (outcome.ok) {
        speakText(formatReplyWithSir(outcome.message));
      } else {
        void playVoice("alert_api_error.mp3");
      }
    },
  };

  // Hands-free Voice Command Engine effect (stable mount, immune to UI state teardowns)
  useEffect(() => {
    if (!voiceCmdEnabled) {
      voiceListenerRef.current?.stop();
      voiceListenerRef.current = null;
      return;
    }

    const listener = new VoiceCommandListener({
      onWakePhrase: () => voiceHandlersRef.current.onWakePhrase?.(),
      onOpenSystem: () => voiceHandlersRef.current.onOpenSystem?.(),
      onOpenCopilot: () => voiceHandlersRef.current.onOpenCopilot?.(),
      onOpenGraph: () => voiceHandlersRef.current.onOpenGraph?.(),
      onOpenNotes: () => voiceHandlersRef.current.onOpenNotes?.(),
      onOpenSearch: () => voiceHandlersRef.current.onOpenSearch?.(),
      onOpenGrounding: () => voiceHandlersRef.current.onOpenGrounding?.(),
      onNewNote: () => voiceHandlersRef.current.onNewNote?.(),
      onJournal: () => voiceHandlersRef.current.onJournal?.(),
      onOpenHome: () => voiceHandlersRef.current.onOpenHome?.(),
      onZenMode: () => voiceHandlersRef.current.onZenMode?.(),
      onMaximize: () => voiceHandlersRef.current.onMaximize?.(),
      onFloat: () => voiceHandlersRef.current.onFloat?.(),
      onClose: () => voiceHandlersRef.current.onClose?.(),
      onMoveMonitor: (target) => voiceHandlersRef.current.onMoveMonitor?.(target),
      onThinkingMode: () => voiceHandlersRef.current.onThinkingMode?.(),
      onToggleListening: (active) => voiceHandlersRef.current.onToggleListening?.(active),
      onSystemCommand: (text) => voiceHandlersRef.current.onSystemCommand?.(text),
    });

    voiceListenerRef.current = listener;
    listener.setStandby(!listeningActive);
    listener.start();

    return () => {
      listener.stop();
      voiceListenerRef.current = null;
    };
  }, [voiceCmdEnabled]);

  // Pause background command listener when Thinking Mode is actively listening to avoid mic collision
  useEffect(() => {
    voiceListenerRef.current?.setPaused(isThinkingMode);
  }, [isThinkingMode]);

  const handleOpenInEditor = useCallback(
    async (id: string) => {
      try {
        await openInEditor(id);
        void playVoice("action_vscode_launch.mp3");
      } catch (err) {
        void playVoice("alert_api_error.mp3");
        console.error(`Could not open editor: ${String(err)}`);
      }
    },
    [],
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
    },
    [],
  );

  const handleCreateNote = useCallback(
    async (trimmed: string, initialContent?: string) => {
      try {
        await saveNote(trimmed, initialContent ?? `# ${trimmed}\n\n#note\n\n`);
        await loadNotesList();
        await loadGraph();
        await openNote(trimmed);
        void playVoice("action_note_created.mp3");
      } catch (err) {
        void playVoice("alert_api_error.mp3");
        console.error(`Could not create note: ${String(err)}`);
      }
    },
    [loadNotesList, loadGraph, openNote],
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
      } catch (err) {
        console.error(`Could not create note: ${String(err)}`);
      }
    },
    [notesList, openNote, loadNotesList, loadGraph],
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
      await appendJournal(text);
      void playVoice("action_journal_captured.mp3");
    },
    [],
  );

  // Global Keyboard Shortcuts & Activity Tracker
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      recordKeyPress();
      const mod = event.ctrlKey || event.metaKey;

      if (mod && event.shiftKey && event.key.toLowerCase() === "m") {
        event.preventDefault();
        handleToggleListening(undefined, true);
      } else if (mod && event.shiftKey && event.key.toLowerCase() === "k") {
        // Must precede the Ctrl+K branch — Shift+K would otherwise match it.
        event.preventDefault();
        setSystemConsoleOpen(true);
      } else if (mod && (event.key.toLowerCase() === "k" || event.key.toLowerCase() === "p")) {
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
        void toggleFullscreen();
      } else if (event.key === "F11") {
        event.preventDefault();
        void toggleFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleNewNote, zenMode, handleToggleListening]);

  const colors = useMemo(() => tagColors(graph.tags), [graph.tags]);
  const visNodes = useMemo<VisNode[]>(
    () =>
      graph.nodes.map((node) => {
        const base = node.tags.length > 0 ? (colors[node.tags[0]] ?? "#8f98a3") : "#8f98a3";
        return { ...node, color: fade(base, freshnessOpacity(node.ageDays)) };
      }),
    [graph, colors],
  );

  const greeting = useMemo(() => getTimeGreetingData().text, []);
  const hubNodes = useMemo(
    () => [...graph.nodes].sort((a, b) => b.importance - a.importance).slice(0, 5),
    [graph.nodes],
  );
  const freshNotes = useMemo(
    () => [...graph.nodes].sort((a, b) => a.ageDays - b.ageDays).slice(0, 5),
    [graph.nodes],
  );

  // System-control overlays are reachable from both the floating companion and
  // the full workstation shell — voice commands work from either.
  const systemOverlays = (
    <>
      <SystemConsoleModal
        open={systemConsoleOpen}
        onClose={() => setSystemConsoleOpen(false)}
        onRunCommand={handleRunSystemCommand}
      />
      <PasswordGateModal
        open={pendingGate !== null}
        description={pendingGate?.description ?? ""}
        isNewPassword={!hasControlPassword()}
        error={gateError}
        busy={gateBusy}
        onConfirm={(password) => void handleGateConfirm(password)}
        onCancel={() => {
          setPendingGate(null);
          setGateError(null);
        }}
      />
    </>
  );

  if (isFloatingMode) {
    return (
      <div
        className="floating-companion-viewport"
        data-tauri-drag-region
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          const target = e.target as HTMLElement | null;
          if (target?.closest("button, input, select, textarea, a, [data-no-drag]")) return;
          try {
            void getCurrentWindow().startDragging();
          } catch {
            // ignore
          }
        }}
      >
        <div className="floating-companion-cluster">
          <AnimatePresence mode="wait">
            {isThinkingMode ? (
              <motion.div
                key="thinking-capsule-wrap"
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              >
                <ThinkingModeCapsule
                  open={isThinkingMode}
                  onClose={() => setIsThinkingMode(false)}
                  onExpandWorkstation={() => {
                    setIsThinkingMode(false);
                    void ensureWorkstation();
                  }}
                  onOpenSettings={() => setAiSettingsOpen(true)}
                  config={aiConfig}
                  vaultNotes={notesList}
                  onShowToast={showToast}
                />
              </motion.div>
            ) : (
              <motion.div
                key="floating-row-wrap"
                initial={{ opacity: 0, scale: 0.95, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 4 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                className="floating-companion-row"
              >
                <PillBase
                  theme="dark"
                  items={[
                    { label: "Severus", id: "home" },
                    { label: "Thinking", id: "thinking" },
                    { label: "Knowledge", id: "graph" },
                    { label: "Notes", id: "notes" },
                    { label: "Copilot", id: "copilot" },
                  ]}
                  onChange={(id) => {
                    if (id === "thinking") {
                      setIsThinkingMode(true);
                      void playVoice("action_copilot_ready.mp3");
                      showToast("Severus: Thinking Mode activated");
                      return;
                    }
                    handleSectionSelect(id);
                  }}
                />
                <button
                  type="button"
                  className={`floating-mic-toggle ${listeningActive ? "active" : "paused"}`}
                  onClick={() => handleToggleListening(undefined, true)}
                  title={
                    listeningActive
                      ? `Listening Mode Active (Click or say "Stop listening" / ${MOD_KEY}+Shift+M)`
                      : `Listening Mode Paused (Click or say "Start listening" / ${MOD_KEY}+Shift+M)`
                  }
                  aria-label={listeningActive ? "Mute listening mode" : "Resume listening mode"}
                >
                  {listeningActive ? (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                      <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                  ) : (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="1" y1="1" x2="23" y2="23" />
                      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                      <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                  )}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {quickSwitcherOpen && (
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
            onOpenSystemConsole={() => setSystemConsoleOpen(true)}
            onClose={() => setQuickSwitcherOpen(false)}
          />
        )}

        {newNoteModalOpen && (
          <NewNoteModal
            open={newNoteModalOpen}
            existingNotes={notesList}
            onClose={() => setNewNoteModalOpen(false)}
            onCreate={handleCreateNote}
          />
        )}

        {groundingOpen && (
          <ContextAssemblerModal
            open={groundingOpen}
            notes={notesList}
            activeNote={note}
            onClose={() => setGroundingOpen(false)}
            onShowToast={showToast}
          />
        )}

        {journalOpen && (
          <JournalCapture
            open={journalOpen}
            onClose={() => setJournalOpen(false)}
            onSubmit={handleJournal}
          />
        )}

        {aiSettingsOpen && (
          <AISettingsModal
            open={aiSettingsOpen}
            config={aiConfig}
            onSave={(newCfg) => {
              setAiConfig(newCfg);
              saveAIConfig(newCfg);
            }}
            onClose={() => setAiSettingsOpen(false)}
          />
        )}

        {systemOverlays}
      </div>
    );
  }

  return (
    <div className={`app workstation ${zenMode ? "zen-mode" : ""}`}>
      <AnimatePresence>
        {!zenMode && (
          <motion.div
            key="topheader-wrap"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            style={{ width: "100%", zIndex: 60 }}
          >
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
              }}
              clapEnabled={clapEnabled}
              onToggleClapEnabled={() => {
                const next = !clapEnabled;
                setClapEnabledState(next);
                setClapEnabled(next);
              }}
              voiceCmdEnabled={voiceCmdEnabled}
              onToggleVoiceCmdEnabled={() => {
                const next = !voiceCmdEnabled;
                setVoiceCmdEnabledState(next);
                setVoiceCmdEnabled(next);
              }}
              listeningActive={listeningActive}
              onToggleListening={() => handleToggleListening(undefined, true)}
              gitStatus={gitStatus}
              copilotActive={inspectorOpen && inspectorTab === "copilot"}
              onToggleFloatingMode={handleEnterFloatingMode}
              onToggleMaximize={handleToggleMaximize}
              isMaximized={isMaximized}
              onEnterThinkingMode={() => {
                void handleEnterFloatingMode();
                setIsThinkingMode(true);
                void playVoice("action_copilot_ready.mp3");
              }}
              onHideToTray={handleHideToTray}
              onMoveMonitor={handleMoveMonitor}
              onOpenJournal={() => setJournalOpen(true)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <main className="main workstation-main">
        <AnimatePresence>
          {!zenMode && (notesDrawerOpen || (activeSection === "knowledge" && knowledgeSubTab === "notes")) && (
            <motion.div
              key="notes-drawer-wrap"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: "auto", opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              style={{ overflow: "hidden", display: "flex", flexShrink: 0 }}
            >
              <NotesDrawer
                open={true}
                notes={notesList}
                selectedId={selectedId}
                onSelectNote={(id) => void openNote(id)}
                onNewNote={() => void handleNewNote()}
                onClose={() => {
                  setNotesDrawerOpen(false);
                  if (knowledgeSubTab === "notes") {
                    setKnowledgeSubTab("graph");
                  }
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="graph-pane center-stage">
          {zenMode && (
            <button
              type="button"
              className="zen-exit-btn"
              onClick={() => {
                setZenMode(false);
                void toggleFullscreen();
              }}
              title="Exit Zen fullscreen (Esc)"
            >
              <Icon name="close" size={12} /> Exit Zen (Esc)
            </button>
          )}

          <AnimatePresence mode="wait">
            {activeSection === "home" ? (
              <motion.div
                key="home-view"
                className="home-view"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
              >
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
                    <button type="button" onClick={() => setSystemConsoleOpen(true)}>
                      <Icon name="keyboard" size={13} /> System Console
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : activeSection === "knowledge" && knowledgeSubTab === "tags" ? (
              <motion.div
                key="tags-view"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                style={{ width: "100%", height: "100%" }}
              >
                <TagsIndexView
                  graph={graph}
                  tagColors={colors}
                  onSelectNote={(id) => void openNote(id)}
                  onToggleTag={toggleTag}
                />
              </motion.div>
            ) : booting ? (
              <motion.div
                key="booting-view"
                className="boot-loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <span>Indexing vault…</span>
                <div className="boot-loading-bar" />
              </motion.div>
            ) : (
              <motion.div
                key="graph-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  position: "relative",
                }}
              >
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
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {!zenMode && inspectorOpen && (
            <motion.div
              key="context-inspector-wrap"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: "auto", opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              style={{ overflow: "hidden", display: "flex", flexShrink: 0 }}
            >
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
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {!zenMode && (
          <motion.footer
            key="status-bar-wrap"
            className="status-bar"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            data-tauri-drag-region
            onMouseDown={(e) => {
              if (e.button !== 0) return;
              const target = e.target as HTMLElement | null;
              if (target?.closest("button, input, select, textarea, a, [data-no-drag]")) return;
              try {
                void getCurrentWindow().startDragging();
              } catch {
                // ignore
              }
            }}
          >
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
          </motion.footer>
        )}
      </AnimatePresence>

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
        onOpenSystemConsole={() => setSystemConsoleOpen(true)}
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
        }}
        onClose={() => setAiSettingsOpen(false)}
      />

      {systemOverlays}
    </div>
  );
}
