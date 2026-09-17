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
import ContextInspector, { type InspectorTab } from "./components/ContextInspector";
import NotesDrawer from "./components/NotesDrawer";
import JournalCapture from "./components/JournalCapture";
import AISettingsModal from "./components/AISettingsModal";
import QuickSwitcherModal from "./components/QuickSwitcherModal";
import ContextAssemblerModal from "./components/ContextAssemblerModal";
import NewNoteModal from "./components/NewNoteModal";
import ThinkingModeCapsule from "./components/ThinkingModeCapsule";
import SystemConsoleModal, { type CommandOutcome } from "./components/SystemConsoleModal";
import PasswordGateModal from "./components/PasswordGateModal";
import DualPacingCockpit from "./components/DualPacingCockpit";
import RunningModeWindow from "./components/RunningModeWindow";
import LearningHistoryModal from "./components/LearningHistoryModal";
import { type AIConfig, loadAIConfig, saveAIConfig } from "./lib/ai";
import { mapTextToIntent } from "./lib/deepseekIntent";
import {
  checkMailNow,
  formatMailSummary,
  isGmailConnected,
  loadGmailConfig,
  startGmailPolling,
  stopGmailPolling,
  GMAIL_MAIL_EVENT,
  GMAIL_CLASSROOM_EVENT,
  pollClassroom,
  formatClassroomSummary,
  type EmailUpdate,
  type ClassroomSnapshot,
  type MailPollResult,
} from "./lib/gmail";
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
  setFloatingDimensions,
  dockToTopIsland,
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
  playSpatialShiftSound,
  playStartupChime,
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
import {
  fetchStravaAthleteStats,
  loadCachedStravaStats,
  type StravaAthleteStats,
} from "./lib/strava";

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
  const [stravaStats, setStravaStats] = useState<StravaAthleteStats | null>(loadCachedStravaStats);

  useEffect(() => {
    const handleStravaUpdate = (e: Event) => {
      const custom = e as CustomEvent<StravaAthleteStats>;
      if (custom.detail) setStravaStats(custom.detail);
    };
    window.addEventListener("severus:strava-stats-updated", handleStravaUpdate);
    return () => window.removeEventListener("severus:strava-stats-updated", handleStravaUpdate);
  }, []);
  const [booting, setBooting] = useState(true);
  const [isStartupAnimating, setIsStartupAnimating] = useState(true);

  useEffect(() => {
    playStartupChime();
    const timer = window.setTimeout(() => {
      setIsStartupAnimating(false);
    }, 1100);
    return () => window.clearTimeout(timer);
  }, []);

  // Navigation & Shell Layout
  const [activeSection, setActiveSection] = useState<NavSection>("knowledge");
  const [knowledgeSubTab, setKnowledgeSubTab] = useState<KnowledgeSubTab>("graph");
  const [isFloatingMode, setIsFloatingMode] = useState<boolean>(false);
  const [isThinkingMode, setIsThinkingMode] = useState<boolean>(false);

  // Inspector & Panes
  const [notesDrawerOpen, setNotesDrawerOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("note");
  const [zenMode, setZenMode] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  // Multi-Monitor Spatial Animation & Telemetry State
  const [monitorTransition, setMonitorTransition] = useState<{
    active: boolean;
    direction: "left" | "right";
    step: "exit" | "enter" | "idle";
  }>({ active: false, direction: "right", step: "idle" });
  const [monitorBadge, setMonitorBadge] = useState<string | null>(null);

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
  const [learningHistoryOpen, setLearningHistoryOpen] = useState(false);

  // Gmail school updates
  const [gmailMeta, setGmailMeta] = useState(() => loadGmailConfig());
  const [mailUnread, setMailUnread] = useState<number | null>(null);
  const [inboxEmails, setInboxEmails] = useState<EmailUpdate[] | null>(null);
  const [classroom, setClassroom] = useState<ClassroomSnapshot | null>(null);
  const gmailMetaRef = useRef(gmailMeta);
  const [runningModeOpen, setRunningModeOpen] = useState(false);
  const [ambientQuery, setAmbientQuery] = useState<string | undefined>(undefined);

  // System control: destructive intents await the control password here
  const [pendingGate, setPendingGate] = useState<{ intent: SystemIntent; description: string } | null>(null);
  const [gateError, setGateError] = useState<string | null>(null);
  const [gateBusy, setGateBusy] = useState(false);

  // AI Config & Git
  const [aiConfig, setAiConfig] = useState<AIConfig>(loadAIConfig);
  const [gitStatus, setGitStatus] = useState<GitStatusData | null>(null);

  // Dynamic Island UI States
  const [isEdgeDocked, setIsEdgeDocked] = useState<boolean>(true);
  const [isIslandExpanded, setIsIslandExpanded] = useState<boolean>(false);
  const [isRetracted, setIsRetracted] = useState<boolean>(false);

  // Notifications & State (on-screen toast notes removed system-wide)
  const [refreshTick, setRefreshTick] = useState(0);

  const showToast = useCallback((_message: string) => {
    // Silent: on-screen toasts/notes disabled across the entire system
  }, []);

  const handleSyncStrava = useCallback(async () => {
    try {
      const stats = await fetchStravaAthleteStats();
      setStravaStats(stats);
      showToast("Strava telemetry synced.");
    } catch (err) {
      console.warn("Strava sync failed:", err);
    }
  }, [showToast]);

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
      await dockToTopIsland();
      setIsEdgeDocked(true);
      setIsRetracted(false);
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
      const dir: "left" | "right" = target === "left" ? "left" : "right";
      try {
        playSpatialShiftSound(dir);
        setMonitorTransition({ active: true, direction: dir, step: "exit" });

        // Allow spatial exit glide (140ms)
        await new Promise((resolve) => setTimeout(resolve, 140));

        await moveToMonitor(target);

        // Display destination telemetry badge
        const badgeLabel =
          target === "primary"
            ? "Display: Primary Monitor"
            : `Display: Shifted ${target.toUpperCase()}`;
        setMonitorBadge(badgeLabel);
        setMonitorTransition({ active: true, direction: dir, step: "enter" });

        setTimeout(() => {
          setMonitorTransition({ active: false, direction: dir, step: "idle" });
        }, 260);

        setTimeout(() => {
          setMonitorBadge(null);
        }, 2200);
      } catch (err) {
        console.warn(`Could not switch display: ${String(err)}`);
        setMonitorTransition({ active: false, direction: dir, step: "idle" });
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

  const islandHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retractTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAnyAppRunning =
    isThinkingMode ||
    runningModeOpen ||
    quickSwitcherOpen ||
    aiSettingsOpen ||
    systemConsoleOpen ||
    groundingOpen ||
    journalOpen ||
    newNoteModalOpen;

  const resetRetractTimer = useCallback(() => {
    if (retractTimerRef.current) {
      clearTimeout(retractTimerRef.current);
      retractTimerRef.current = null;
    }
  }, []);

  const scheduleRetract = useCallback(() => {
    resetRetractTimer();
    if (isAnyAppRunning || !isEdgeDocked) return;
    retractTimerRef.current = setTimeout(() => {
      setIsRetracted(true);
      setIsIslandExpanded(false);
    }, 2600);
  }, [isAnyAppRunning, isEdgeDocked, resetRetractTimer]);

  useEffect(() => {
    if (isAnyAppRunning || !isEdgeDocked) {
      resetRetractTimer();
      setIsRetracted(false);
    }
    return resetRetractTimer;
  }, [isAnyAppRunning, isEdgeDocked, resetRetractTimer]);

  // Wake island up whenever window receives focus or is summoned, or convert to pill on minimize
  useEffect(() => {
    const handleFocus = () => {
      resetRetractTimer();
      setIsRetracted(false);
    };
    window.addEventListener("focus", handleFocus);
    let unlistenFocus: (() => void) | null = null;
    let unlistenOpenWorkstation: (() => void) | null = null;
    let unlistenMinimize: (() => void) | null = null;

    void getCurrentWindow()
      .listen("severus:focus", handleFocus)
      .then((fn) => {
        unlistenFocus = fn;
      });

    void getCurrentWindow()
      .listen("severus:open-workstation", () => {
        void ensureWorkstation();
      })
      .then((fn) => {
        unlistenOpenWorkstation = fn;
      });

    void getCurrentWindow()
      .listen("severus:minimize-to-pill", () => {
        void handleEnterFloatingMode();
      })
      .then((fn) => {
        unlistenMinimize = fn;
      });

    return () => {
      window.removeEventListener("focus", handleFocus);
      if (unlistenFocus) unlistenFocus();
      if (unlistenOpenWorkstation) unlistenOpenWorkstation();
      if (unlistenMinimize) unlistenMinimize();
    };
  }, [handleEnterFloatingMode, ensureWorkstation, resetRetractTimer]);

  const handleIslandMouseEnter = useCallback(() => {
    resetRetractTimer();
    setIsRetracted(false);
    if (islandHoverTimerRef.current) {
      clearTimeout(islandHoverTimerRef.current);
      islandHoverTimerRef.current = null;
    }
    islandHoverTimerRef.current = setTimeout(() => {
      setIsIslandExpanded(true);
    }, 120);
  }, [resetRetractTimer]);

  const handleIslandMouseLeave = useCallback(() => {
    if (islandHoverTimerRef.current) {
      clearTimeout(islandHoverTimerRef.current);
      islandHoverTimerRef.current = null;
    }
    setIsIslandExpanded(false);
    scheduleRetract();
  }, [scheduleRetract]);

  const isFloatingModeRef = useRef(isFloatingMode);
  isFloatingModeRef.current = isFloatingMode;

  const handleDockToTopIsland = useCallback(async () => {
    try {
      await dockToTopIsland();
      localStorage.removeItem("severus:island-position");
      setIsEdgeDocked(true);
      setIsRetracted(false);
      showToast("Dynamic Island docked flush to top bezel");
    } catch (err) {
      console.warn("Failed to dock dynamic island to top:", err);
    }
  }, [showToast]);

  const isDraggingWindowRef = useRef(false);

  const handleStartDragging = useCallback(() => {
    try {
      isDraggingWindowRef.current = true;
      void getCurrentWindow().startDragging();
    } catch (err) {
      console.warn("startDragging failed:", err);
    }
  }, []);

  // Always put Dynamic Island in top center on initial boot or reload.
  // The window is created hidden (visible: false) — show it only after the
  // island is placed, so the WebView's broken first composition (dark rect
  // with raw scrollbars) is never visible. At login the IPC bridge may not
  // be ready when the page loads, so placement retries with backoff.
  useEffect(() => {
    if (!isFloatingMode) {
      void getCurrentWindow().show();
      void getCurrentWindow().center();
      return;
    }
    localStorage.removeItem("severus:island-position");
    let attempts = 0;
    let done = false;
    let timer: number | null = null;
    const place = () => {
      if (done) return;
      attempts += 1;
      try {
        setFloatingMode(true)
          .then(() => handleDockToTopIsland())
          .then(async () => {
            await getCurrentWindow().show();
            await setFloatingDimensions(781, 111);
            await new Promise((r) => setTimeout(r, 60));
            await setFloatingDimensions(780, 110);
            done = true;
          })
          .catch(() => {
            if (attempts >= 20) {
              void getCurrentWindow().show().catch(() => {});
              return;
            }
            timer = window.setTimeout(place, 500);
          });
      } catch {
        timer = window.setTimeout(place, 500);
      }
    };
    place();
    return () => {
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [isFloatingMode, handleDockToTopIsland]);

  // Global mouseup to cleanly finalize dragging: if dropped near top bezel, snap flush to top center; otherwise keep custom floating position
  useEffect(() => {
    const handleMouseUp = async () => {
      if (!isDraggingWindowRef.current) return;
      isDraggingWindowRef.current = false;
      try {
        const win = getCurrentWindow();
        const pos = await win.outerPosition();
        if (pos.y <= 30) {
          await handleDockToTopIsland();
        } else {
          setIsEdgeDocked(false);
        }
      } catch {
        // ignore
      }
    };

    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleDockToTopIsland]);

  // Listen to window movements for edge-docking status without disruptive setPosition calls
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setupMoveListener = async () => {
      try {
        const win = getCurrentWindow();
        unlisten = await win.onMoved(({ payload: pos }) => {
          if (!isFloatingModeRef.current) return;
          setIsEdgeDocked(pos.y <= 24);
        });
      } catch (err) {
        console.warn("Could not register window move listener:", err);
      }
    };

    void setupMoveListener();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    if (isFloatingMode) {
      if (runningModeOpen) {
        void setFloatingDimensions(1160, 760);
      } else if (isThinkingMode) {
        void setFloatingDimensions(780, 680);
      } else {
        void setFloatingDimensions(780, 110);
      }
    }
  }, [isFloatingMode, isThinkingMode, runningModeOpen]);

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

  // Gmail school updates: polling lifecycle + mail/classroom event listeners.
  // gmail.ts dispatches these as DOM CustomEvents on `window` (the Strava
  // pattern) — Tauri's listen() never sees them, so subscribe on the window.
  useEffect(() => {
    if (!isGmailConnected(gmailMeta)) return;
    const onMail = (event: Event) => {
      const detail = (event as CustomEvent<MailPollResult>).detail;
      setMailUnread(detail.count);
      setInboxEmails(detail.emails);
      setGmailMeta(loadGmailConfig());
      if (detail.isNew && detail.emails.length > 0) {
        speakText(formatMailSummary(detail));
      }
    };
    const onClassroom = (event: Event) => {
      setClassroom((event as CustomEvent<ClassroomSnapshot>).detail);
    };
    // Subscribe before startGmailPolling() — startClassroomPolling() dispatches
    // its cache-seed snapshot synchronously, before the first poll completes.
    window.addEventListener(GMAIL_MAIL_EVENT, onMail);
    window.addEventListener(GMAIL_CLASSROOM_EVENT, onClassroom);
    startGmailPolling();
    return () => {
      window.removeEventListener(GMAIL_MAIL_EVENT, onMail);
      window.removeEventListener(GMAIL_CLASSROOM_EVENT, onClassroom);
      stopGmailPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gmailMeta.connected]);

  const refreshGmailMeta = useCallback(() => {
    const fresh = loadGmailConfig();
    setGmailMeta(fresh);
    if (isGmailConnected(fresh)) startGmailPolling();
  }, []);

  // Pick up connect/disconnect changes made in the Settings modal
  useEffect(() => {
    if (!aiSettingsOpen) refreshGmailMeta();
  }, [aiSettingsOpen, refreshGmailMeta]);

  const handleCheckEmail = useCallback(async () => {
    const connected = isGmailConnected(gmailMetaRef.current);
    if (!connected) {
      speakText("School mail is not connected yet, Sir. Connect it in settings.");
      return;
    }
    try {
      const result = await checkMailNow();
      setMailUnread(result.count);
      if (result.emails.length > 0) setInboxEmails(result.emails);
      setGmailMeta(loadGmailConfig());
      speakText(formatMailSummary(result));
    } catch (err) {
      speakText(`I could not reach the school mail, Sir. ${err instanceof Error ? err.message : ""}`);
    }
  }, []);

  const handleCheckClassroom = useCallback(async () => {
    const connected = isGmailConnected(gmailMetaRef.current);
    if (!connected) {
      speakText("Google Classroom is not connected yet, Sir. Connect it in settings.");
      return;
    }
    try {
      const snapshot = await pollClassroom();
      setClassroom(snapshot);
      speakText(formatClassroomSummary(snapshot));
    } catch (err) {
      speakText(`I could not reach Google Classroom, Sir. ${err instanceof Error ? err.message : ""}`);
    }
  }, []);

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
    onOpenRunningMode: () => {
      setRunningModeOpen(true);
      void playVoice("action_copilot_ready.mp3");
    },
    onToggleListening: (active: boolean) => {
      handleToggleListening(active, false);
    },
    onCheckEmail: () => {
      void handleCheckEmail();
      voiceHandlersRef.current.onGeneralQuery?.("What are my latest school emails?");
    },
    onCheckClassroom: () => {
      void handleCheckClassroom();
      voiceHandlersRef.current.onGeneralQuery?.("What is due and missing in Google Classroom?");
    },
    onStravaStatus: async () => {
      try {
        const stats = await fetchStravaAthleteStats();
        setStravaStats(stats);
      } catch {
        // Ignored
      }
      voiceHandlersRef.current.onGeneralQuery?.("What is my running telemetry and Strava status?");
    },
    onSystemCommand: async (text: string) => {
      const outcome = await handleRunSystemCommand(text);
      if (outcome.ok) {
        speakText(formatReplyWithSir(outcome.message));
      } else {
        void playVoice("alert_api_error.mp3");
      }
    },
    onHideToTray: () => {
      void handleHideToTray();
    },
    onOpenDynamicIsland: () => {
      void handleEnterFloatingMode();
    },
    onGeneralQuery: (query: string) => {
      setAmbientQuery(query);
      void handleEnterFloatingMode();
      setIsThinkingMode(true);
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
      onOpenRunningMode: () => voiceHandlersRef.current.onOpenRunningMode?.(),
      onStravaStatus: () => voiceHandlersRef.current.onStravaStatus?.(),
      onToggleListening: (active) => voiceHandlersRef.current.onToggleListening?.(active),
      onSystemCommand: (text) => voiceHandlersRef.current.onSystemCommand?.(text),
      onCheckEmail: () => voiceHandlersRef.current.onCheckEmail?.(),
      onCheckClassroom: () => voiceHandlersRef.current.onCheckClassroom?.(),
      onHideToTray: () => voiceHandlersRef.current.onHideToTray?.(),
      onOpenDynamicIsland: () => voiceHandlersRef.current.onOpenDynamicIsland?.(),
      onGeneralQuery: (query) => voiceHandlersRef.current.onGeneralQuery?.(query),
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
      } else if (mod && event.shiftKey && event.key.toLowerCase() === "l") {
        event.preventDefault();
        setLearningHistoryOpen(true);
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
      <AnimatePresence>
        {monitorBadge && (
          <motion.div
            key="severus-monitor-badge"
            className="severus-monitor-badge"
            initial={{ opacity: 0, y: -16, scale: 0.92, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -10, scale: 0.96, filter: "blur(2px)" }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="severus-monitor-badge-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </span>
            <span className="severus-monitor-badge-text">{monitorBadge}</span>
          </motion.div>
        )}
      </AnimatePresence>
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

  return (
    <AnimatePresence mode="wait" initial={false}>
      {isFloatingMode ? (
        <motion.div
          key="floating-companion-mode"
          initial={{ opacity: 0, scale: 0.95, filter: "blur(4px)" }}
          animate={{
            opacity: monitorTransition.active && monitorTransition.step === "exit" ? 0.2 : 1,
            scale: monitorTransition.active && monitorTransition.step === "exit" ? 0.96 : 1,
            x: monitorTransition.active
              ? monitorTransition.step === "exit"
                ? (monitorTransition.direction === "left" ? -40 : 40)
                : 0
              : 0,
            filter: monitorTransition.active && monitorTransition.step === "exit" ? "blur(3px)" : "blur(0px)",
          }}
          exit={{ opacity: 0, scale: 0.95, filter: "blur(4px)" }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="floating-companion-viewport"
          data-tauri-drag-region
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            const target = e.target as HTMLElement | null;
            if (target?.closest("button, input, select, textarea, a, [data-no-drag]")) return;
            handleStartDragging();
          }}
        >
          {isEdgeDocked && isRetracted && !isAnyAppRunning && (
            <div
              className="dynamic-island-wake-zone"
              onMouseEnter={handleIslandMouseEnter}
              title="Hover to reveal Dynamic Island"
            />
          )}
          <div className="floating-companion-cluster">
            <AnimatePresence mode="wait">
              {isStartupAnimating ? (
                <motion.div
                  key="severus-boot-sequence"
                  initial={{ opacity: 0, scale: 0.86, filter: "blur(8px)", y: 6 }}
                  animate={{ opacity: 1, scale: 1, filter: "blur(0px)", y: 0 }}
                  exit={{ opacity: 0, scale: 0.94, filter: "blur(4px)", y: -4 }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  className="severus-boot-capsule"
                >
                  <div className="severus-boot-edge" />
                  <div className="severus-boot-glow" />
                  <div className="severus-boot-content">
                    <span className="severus-boot-pulse">
                      <span className="severus-boot-dot" />
                      <span className="severus-boot-ring" />
                    </span>
                    <span className="severus-boot-title">SEVERUS</span>
                    <span className="severus-boot-divider">·</span>
                    <span className="severus-boot-status">SYSTEMS ONLINE</span>
                  </div>
                </motion.div>
              ) : isThinkingMode ? (
                <motion.div
                  key="thinking-capsule-wrap"
                  initial={{ opacity: 0, scale: 0.92, y: -12, filter: "blur(6px)" }}
                  animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, scale: 0.94, y: -8, filter: "blur(4px)" }}
                  transition={{ type: "spring", stiffness: 400, damping: 28 }}
                >
                  <ThinkingModeCapsule
                    open={isThinkingMode}
                    onClose={() => {
                      setIsThinkingMode(false);
                      setAmbientQuery(undefined);
                    }}
                    onExpandWorkstation={() => {
                      setIsThinkingMode(false);
                      setAmbientQuery(undefined);
                      void ensureWorkstation();
                    }}
                    onOpenRunningMode={() => setRunningModeOpen(true)}
                    onOpenSettings={() => setAiSettingsOpen(true)}
                    config={aiConfig}
                    vaultNotes={notesList}
                    onShowToast={showToast}
                    initialQuery={ambientQuery}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="floating-island-wrap"
                  layout
                  initial={{ opacity: 0, scale: 0.96, y: -4 }}
                  animate={
                    isEdgeDocked && isRetracted && !isAnyAppRunning
                      ? {
                          y: -46,
                          opacity: 0,
                          scale: 0.94,
                          filter: "blur(2px)",
                        }
                      : {
                          y: 0,
                          opacity: 1,
                          scale: 1,
                          filter: "blur(0px)",
                        }
                  }
                  exit={{ opacity: 0, scale: 0.96, y: -4 }}
                  transition={{ type: "spring", stiffness: 420, damping: 28, mass: 0.8 }}
                  className={`dynamic-island-capsule ${isEdgeDocked ? "edge-docked" : "floating"} ${isIslandExpanded ? "is-expanded" : "is-compact"} ${isRetracted && isEdgeDocked && !isAnyAppRunning ? "is-retracted" : ""}`}
                  onMouseEnter={handleIslandMouseEnter}
                  onMouseLeave={handleIslandMouseLeave}
                  data-tauri-drag-region
                  onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    const target = e.target as HTMLElement | null;
                    if (target?.closest("button, input, select, textarea, a, [data-no-drag]")) return;
                    handleStartDragging();
                  }}
                >
                  {/* Smooth corner attachment flares (only when docked to top bezel) */}
                  {isEdgeDocked && (
                    <>
                      <svg
                        className="island-attachment-ear ear-left"
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M 0 0 L 16 0 L 16 16 C 16 7.163 8.837 0 0 0 Z"
                          fill="#000000"
                        />
                      </svg>
                      <svg
                        className="island-attachment-ear ear-right"
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M 16 0 L 0 0 L 0 16 C 0 7.163 7.163 0 16 0 Z"
                          fill="#000000"
                        />
                      </svg>
                    </>
                  )}

                  {/* Left: Hardware Sensor Punch-Hole & Status Beacon */}
                  <div
                    className="dynamic-island-hardware"
                    title="Click to toggle menu • Double-click to restore workstation"
                    data-no-drag
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsIslandExpanded((prev) => !prev);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      void ensureWorkstation();
                    }}
                  >
                    <span className="island-lens" title="Severus Optical Sensor" />
                    <span className="island-pulse-wrap" title="System Online • Click to toggle menu" data-no-drag>
                      <span className="island-pulse-dot" />
                      <span className="island-pulse-ring" />
                    </span>
                  </div>

                  {/* Center: Brand Glance (Compact) vs Navigation Items (Expanded) */}
                  <div className="dynamic-island-body">
                    <AnimatePresence mode="wait" initial={false}>
                      {!isIslandExpanded ? (
                        <motion.div
                          key="island-compact-brand"
                          className="dynamic-island-brand-view"
                          initial={{ opacity: 0, y: 3, filter: "blur(2px)" }}
                          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                          exit={{ opacity: 0, y: -3, filter: "blur(2px)" }}
                          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsIslandExpanded((prev) => !prev);
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            void ensureWorkstation();
                          }}
                          title="Click to expand island menu • Double-click to restore workstation window"
                          data-no-drag
                        >
                          <span className="dynamic-island-title" data-no-drag>Severus</span>
                          {stravaStats && (
                            <span
                              className="dynamic-island-metric-chip"
                              title="Weekly Mileage • Click to open Running Mode"
                              data-no-drag
                              onClick={(e) => {
                                e.stopPropagation();
                                setRunningModeOpen(true);
                              }}
                            >
                              {stravaStats.weeklyMileageKm.toFixed(1)} km
                            </span>
                          )}
                        </motion.div>
                      ) : (
                        <motion.nav
                          key="island-expanded-nav"
                          className="dynamic-island-nav-strip"
                          initial={{ opacity: 0, scale: 0.98, filter: "blur(2px)" }}
                          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                          exit={{ opacity: 0, scale: 0.98, filter: "blur(2px)" }}
                          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                          data-no-drag
                        >
                          {[
                            { label: "Severus", id: "home" },
                            { label: "Thinking", id: "thinking" },
                            { label: "Running", id: "running" },
                            { label: "Knowledge", id: "graph" },
                            { label: "Notes", id: "notes" },
                            { label: "Copilot", id: "copilot" },
                          ].map((item) => {
                            const isActive = activeSection === item.id;
                            return (
                              <button
                                key={item.id}
                                type="button"
                                className={`dynamic-island-nav-link ${isActive ? "active" : ""}`}
                                data-no-drag
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (item.id === "running") {
                                    setRunningModeOpen(true);
                                    setIsIslandExpanded(false);
                                    return;
                                  }
                                  if (item.id === "thinking") {
                                    setIsThinkingMode(true);
                                    void playVoice("action_copilot_ready.mp3");
                                    showToast("Severus: Thinking Mode activated");
                                    setIsIslandExpanded(false);
                                    return;
                                  }
                                  handleSectionSelect(item.id);
                                  setIsIslandExpanded(false);
                                }}
                              >
                                {item.label}
                              </button>
                            );
                          })}
                        </motion.nav>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Right: Audio Wavebars & Action Controls */}
                  <div className="dynamic-island-actions" data-no-drag>
                    {listeningActive && (
                      <div
                        className="island-audio-wavebars"
                        title="Hands-free listening active • Click to mute"
                        data-no-drag
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleListening(undefined, true);
                        }}
                      >
                        <span className="island-wavebar bar-1" />
                        <span className="island-wavebar bar-2" />
                        <span className="island-wavebar bar-3" />
                      </div>
                    )}
                    <button
                      type="button"
                      className={`dynamic-island-btn ${listeningActive ? "active" : ""}`}
                      data-no-drag
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleListening(undefined, true);
                      }}
                      title={
                        listeningActive
                          ? `Listening Active (Click to mute / ${MOD_KEY}+Shift+M)`
                          : `Listening Paused (Click to resume / ${MOD_KEY}+Shift+M)`
                      }
                      aria-label={listeningActive ? "Mute listening mode" : "Resume listening mode"}
                    >
                      <Icon name={listeningActive ? "mic" : "mic-off"} size={13} />
                    </button>
                    {!isEdgeDocked && (
                      <button
                        type="button"
                        className="dynamic-island-btn"
                        data-no-drag
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDockToTopIsland();
                        }}
                        title="Snap flush to top center"
                        aria-label="Snap flush to top center"
                      >
                        <Icon name="arrow-up" size={13} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="dynamic-island-btn"
                      data-no-drag
                      onClick={(e) => {
                        e.stopPropagation();
                        void ensureWorkstation();
                      }}
                      title="Expand Workstation window"
                      aria-label="Expand Workstation window"
                    >
                      <Icon name="maximize" size={13} />
                    </button>
                    <div
                      role="button"
                      tabIndex={0}
                      className="dynamic-island-drag-handle"
                      title="Drag to reposition Dynamic Island anywhere"
                      aria-label="Drag to reposition Dynamic Island"
                      onMouseDown={(e) => {
                        if (e.button !== 0) return;
                        e.preventDefault();
                        e.stopPropagation();
                        handleStartDragging();
                      }}
                    >
                      <Icon name="grip" size={13} />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

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
            onOpenRunningMode={() => setRunningModeOpen(true)}
            onSyncStrava={() => void handleSyncStrava()}
            onOpenSchoolHub={() => {
              setInspectorOpen(true);
              setInspectorTab("inbox");
            }}
            onToggleMic={() => handleToggleListening(undefined, true)}
            onToggleThinkingMode={() => setIsThinkingMode((prev) => !prev)}
            onDockIsland={() => void handleDockToTopIsland()}
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

          <AnimatePresence>
            {runningModeOpen && (
              <RunningModeWindow
                open={runningModeOpen}
                onClose={() => setRunningModeOpen(false)}
                onMinimizeToFloating={() => setRunningModeOpen(false)}
                aiConfig={aiConfig}
                onShowToast={showToast}
              />
            )}
          </AnimatePresence>

          {systemOverlays}
        </motion.div>
      ) : (
        <motion.div
          key="workstation-mode"
          initial={{ opacity: 0, scale: 0.985, filter: "blur(4px)" }}
          animate={{
            opacity: monitorTransition.active && monitorTransition.step === "exit" ? 0.2 : 1,
            scale: monitorTransition.active && monitorTransition.step === "exit" ? 0.985 : 1,
            x: monitorTransition.active
              ? monitorTransition.step === "exit"
                ? (monitorTransition.direction === "left" ? -60 : 60)
                : 0
              : 0,
            filter: monitorTransition.active && monitorTransition.step === "exit" ? "blur(3px)" : "blur(0px)",
          }}
          exit={{ opacity: 0, scale: 0.985, filter: "blur(4px)" }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className={`app workstation ${zenMode ? "zen-mode" : ""}`}
        >
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
              onOpenRunningMode={() => setRunningModeOpen(true)}
              onHideToTray={handleHideToTray}
              onMoveMonitor={handleMoveMonitor}
              onOpenJournal={() => setJournalOpen(true)}
              onOpenLearningHistory={() => setLearningHistoryOpen(true)}
              mailConnected={isGmailConnected(gmailMeta)}
              mailUnread={mailUnread}
              hubSummary={
                classroom && !classroom.error
                  ? `${classroom.dueSoon.length} due · ${classroom.missing.length} missing · ${mailUnread ?? 0} unread`
                  : null
              }
              onOpenInbox={() => {
                setInspectorOpen(true);
                setInspectorTab("inbox");
              }}
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
                    {stravaStats && (
                      <>
                        <span className="sep">/</span>
                        <span className="strava-home-badge" title="Strava Running Mileage This Week">
                          <Icon name="activity" size={12} /> <strong>{stravaStats.weeklyMileageKm.toFixed(1)} km</strong> this week
                        </span>
                      </>
                    )}
                  </div>

                  <DualPacingCockpit
                    onOpenJournalModal={() => setJournalOpen(true)}
                    onOpenSettings={() => setAiSettingsOpen(true)}
                  />

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
                  inboxEmails={inboxEmails}
                  inboxLastSync={gmailMeta.lastSyncAt}
                  inboxConnected={isGmailConnected(gmailMeta)}
                  classroom={classroom}
                  gmailDomain={gmailMeta.domain}
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
        onOpenRunningMode={() => setRunningModeOpen(true)}
        onSyncStrava={() => void handleSyncStrava()}
        onOpenSchoolHub={() => {
          setInspectorOpen(true);
          setInspectorTab("inbox");
        }}
        onToggleMic={() => handleToggleListening(undefined, true)}
        onToggleThinkingMode={() => setIsThinkingMode((prev) => !prev)}
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

      <LearningHistoryModal
        isOpen={learningHistoryOpen}
        onClose={() => setLearningHistoryOpen(false)}
      />

      <AnimatePresence>
        {runningModeOpen && (
          <RunningModeWindow
            open={runningModeOpen}
            onClose={() => setRunningModeOpen(false)}
            onMinimizeToFloating={() => {
              setRunningModeOpen(false);
              void handleEnterFloatingMode();
            }}
            aiConfig={aiConfig}
            onShowToast={showToast}
          />
        )}
      </AnimatePresence>

      {systemOverlays}
    </motion.div>
  )}
</AnimatePresence>
  );
}
