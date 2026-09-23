import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import JarvisHologramReactor, { type ReactorState } from "./JarvisHologramReactor";
import { type AIConfig, sendAIChat } from "../lib/ai";
import {
  speakText,
  stopSpeaking,
  isVoiceSpeaking,
  isVoiceInEchoCooldown,
  isEchoOfSeverus,
  formatReplyWithSir,
  subscribeSpeechFrame,
} from "../lib/voice";
import { appendJournal } from "../lib/tauri";
import { loadCachedStravaStats } from "../lib/strava";
import { loadAcademicSprints } from "../lib/academicSprints";
import { matchesMicMuteCommand, matchesMicUnmuteCommand, stripWakePrefix } from "../lib/voiceCommands";
import {
  voiceDiagRecord,
  voiceDiagFatalRecognitionError,
} from "../lib/voiceDiagnostics";
import { applySpeechEngine, getSpeechRecognitionCtor, recoverSpeechEngine } from "../lib/speechEngine";
import { checkSttServer, LocalSpeechRecognizer } from "../lib/localSpeechRecognizer";
import Icon, { type IconName } from "./Icon";

export interface ThinkingModeReactorProps {
  open: boolean;
  onClose: () => void;
  onExpandWorkstation: () => void;
  onOpenRunningMode?: () => void;
  onOpenSettings?: () => void;
  onOpenGraph?: () => void;
  onOpenCopilot?: () => void;
  onOpenNotes?: () => void;
  onNewNote?: () => void;
  onJournal?: () => void;
  onSystemCommand?: (text: string) => Promise<string | void>;
  config: AIConfig;
  vaultNotes?: { id: string; title: string; excerpt?: string }[];
  onShowToast?: (msg: string) => void;
  initialQuery?: string;
  /** Authoritative microphone state owned by the host, so the two never disagree. */
  listeningActive?: boolean;
  /** Request a change of the authoritative microphone state. */
  onSetListening?: (active: boolean) => void;
}

export interface ExecutiveMetric {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}

export interface FloatingResponseCardData {
  fullText: string;
  verdict: string;
  timestamp: string;
  category: "running" | "academic" | "knowledge" | "system" | "general";
  categoryLabel: string;
  categoryIcon: IconName;
  metrics: ExecutiveMetric[];
  weeklyProgress?: { current: number; target: number; percentage: number };
  referencedNotes?: string[];
  suggestion: string;
}

function deriveExecutiveHUDData(
  userQuery: string,
  replyText: string,
  stravaStats: ReturnType<typeof loadCachedStravaStats>,
  sprintsState: ReturnType<typeof loadAcademicSprints>,
  vaultNotes: Array<{ id: string; title: string; excerpt?: string }>,
  config: AIConfig,
): FloatingResponseCardData {
  const cleanQ = userQuery.trim().toLowerCase();
  const cleanReply = replyText.trim();
  const lowerReply = cleanReply.toLowerCase();
  const weeklyTarget = parseFloat(localStorage.getItem("severus_weekly_mileage_target") || "45") || 45;

  const rawSentences = cleanReply
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  let verdict = rawSentences.slice(0, 2).join(" ");
  if (!verdict) verdict = cleanReply;

  const isRunning =
    cleanQ.includes("run") ||
    cleanQ.includes("mileage") ||
    cleanQ.includes("pace") ||
    cleanQ.includes("strava") ||
    cleanQ.includes("km") ||
    cleanQ.includes("heart rate") ||
    cleanQ.includes("zone 2") ||
    cleanQ.includes("training block") ||
    cleanQ.includes("workout") ||
    lowerReply.includes("kilometer") ||
    lowerReply.includes("pace") ||
    lowerReply.includes("strava") ||
    lowerReply.includes("mileage");

  const isAcademic =
    cleanQ.includes("sprint") ||
    cleanQ.includes("exam") ||
    cleanQ.includes("deadline") ||
    cleanQ.includes("assignment") ||
    cleanQ.includes("cpc") ||
    cleanQ.includes("study") ||
    cleanQ.includes("classroom") ||
    cleanQ.includes("due") ||
    lowerReply.includes("sprint") ||
    lowerReply.includes("exam") ||
    lowerReply.includes("deadline") ||
    lowerReply.includes("due");

  const isKnowledge =
    cleanQ.includes("note") ||
    cleanQ.includes("graph") ||
    cleanQ.includes("second brain") ||
    cleanQ.includes("vault") ||
    cleanQ.includes("pagerank") ||
    cleanQ.includes("concept") ||
    lowerReply.includes("note") ||
    lowerReply.includes("vault") ||
    lowerReply.includes("knowledge graph");

  let category: FloatingResponseCardData["category"] = "general";
  let categoryLabel = "Executive Telemetry";
  let categoryIcon: IconName = "brain";
  const metrics: ExecutiveMetric[] = [];
  let weeklyProgress: FloatingResponseCardData["weeklyProgress"] = undefined;
  let suggestion = "Ask follow-up queries freely, or command 'save to journal'.";

  if (isRunning) {
    category = "running";
    categoryLabel = "Athletic & Running Telemetry";
    categoryIcon = "activity";

    const weeklyKm = stravaStats?.weeklyMileageKm || 0;
    const progressPct = Math.min(100, Math.round((weeklyKm / weeklyTarget) * 100));
    weeklyProgress = {
      current: weeklyKm,
      target: weeklyTarget,
      percentage: progressPct,
    };

    metrics.push({
      label: "WEEKLY DISTANCE",
      value: `${weeklyKm.toFixed(1)} km`,
      sub: `${stravaStats?.weeklyRunCount || 0} runs completed`,
      highlight: true,
    });

    if (stravaStats?.latestRun) {
      metrics.push({
        label: "LATEST ACTIVITY",
        value: stravaStats.latestRun.formattedDistance,
        sub: `${stravaStats.latestRun.formattedPace} · ${stravaStats.latestRun.formattedDate}`,
      });
      if (stravaStats.latestRun.elevationGainM) {
        metrics.push({
          label: "ELEVATION",
          value: `+${stravaStats.latestRun.elevationGainM}m`,
          sub: stravaStats.latestRun.averageHeartrate
            ? `${stravaStats.latestRun.averageHeartrate} bpm avg`
            : "Heart telemetry synced",
        });
      }
    } else {
      metrics.push({
        label: "MONTHLY TOTAL",
        value: `${(stravaStats?.monthlyMileageKm || 0).toFixed(1)} km`,
        sub: "Cumulative volume",
      });
    }

    suggestion = "Command 'open running mode' for the full athletic workstation.";
  } else if (isAcademic) {
    category = "academic";
    categoryLabel = "Academic Sprint & Deliverable Status";
    categoryIcon = "school";

    const sprints = sprintsState?.sprints || [];
    const totalSprints = sprints.length;
    const doneSprints = sprints.filter((s) => s.completed).length;

    metrics.push({
      label: "ACTIVE SPRINTS",
      value: `${totalSprints} Tracks`,
      sub: `${doneSprints}/${totalSprints} milestones completed`,
      highlight: true,
    });

    const urgentSprint = sprints.find((s) => s.isPrimary) || sprints[0];
    if (urgentSprint) {
      metrics.push({
        label: "PRIMARY SPRINT",
        value: urgentSprint.title.slice(0, 18),
        sub: `Target: ${urgentSprint.dueDate || "Active Semester"}`,
      });
    }

    metrics.push({
      label: "PROGRESS",
      value: `${totalSprints > 0 ? Math.round((doneSprints / totalSprints) * 100) : 100}%`,
      sub: "Academic sprint index",
    });

    suggestion = "Command 'new note' to draft study outlines or research.";
  } else if (isKnowledge) {
    category = "knowledge";
    categoryLabel = "Second Brain Knowledge Map";
    categoryIcon = "graph";

    metrics.push({
      label: "VAULT NOTES",
      value: `${vaultNotes.length} Notes`,
      sub: "Indexed in PageRank",
      highlight: true,
    });

    metrics.push({
      label: "AI MODEL",
      value: config.model.split("/").pop()?.split(":")[0] || "Active Brain",
      sub: "Neural synthesis active",
    });

    suggestion = "Command 'open graph' or 'search [topic]' to view knowledge links.";
  } else {
    metrics.push({
      label: "NEURAL COGNITION",
      value: "100% Online",
      sub: "Local + Cloud reasoning",
      highlight: true,
    });

    metrics.push({
      label: "VAULT CONTEXT",
      value: `${vaultNotes.length} Nodes`,
      sub: "Grounding active",
    });
  }

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const referenced: string[] = [];
  vaultNotes.forEach((n) => {
    if (
      lowerReply.includes(n.title.toLowerCase()) ||
      cleanQ.includes(n.title.toLowerCase())
    ) {
      referenced.push(n.title);
    }
  });

  return {
    fullText: cleanReply,
    verdict,
    timestamp: timeStr,
    category,
    categoryLabel,
    categoryIcon,
    metrics: metrics.slice(0, 3),
    weeklyProgress,
    referencedNotes: referenced.slice(0, 3),
    suggestion,
  };
}

export function ThinkingModeReactor({
  open,
  onClose,
  onExpandWorkstation,
  onOpenRunningMode,
  onOpenSettings,
  onOpenGraph,
  onOpenCopilot,
  onOpenNotes,
  onNewNote,
  onJournal,
  onSystemCommand,
  config,
  vaultNotes = [],
  onShowToast,
  initialQuery,
  listeningActive = true,
  onSetListening,
}: ThinkingModeReactorProps) {
  const [reactorState, setReactorState] = useState<ReactorState>("idle");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [isMicMuted, setIsMicMuted] = useState(!listeningActive);
  const [statusText, setStatusText] = useState("Standing by…");
  const [audioAmp, setAudioAmp] = useState(0);

  const [activeResponse, setActiveResponse] = useState<FloatingResponseCardData | null>(null);
  const [showFullTranscript, setShowFullTranscript] = useState(false);
  const [loggedToJournal, setLoggedToJournal] = useState(false);

  const [stravaStats, setStravaStats] = useState(() => loadCachedStravaStats());
  const [sprintsState, setSprintsState] = useState(() => loadAcademicSprints());

  const recognitionRef = useRef<any>(null);
  const currentQueryRef = useRef("");
  const silenceTimerRef = useRef<number | null>(null);
  const isProcessingRef = useRef(false);
  const isMountedRef = useRef(true);
  const openRef = useRef(open);
  const isMicMutedRef = useRef(isMicMuted);
  const lastSpokenTextRef = useRef("");
  const cooldownTimerRef = useRef<number | null>(null);
  /** Always points at the current recognition starter, so restarts never run a stale closure. */
  const startRecognitionRef = useRef<() => void>(() => {});
  /** Consecutive engine-level recognition failures, used to back off retries. */
  const engineFailuresRef = useRef(0);
  /** Which recognition engine this session uses, resolved once per mount. */
  const engineModeRef = useRef<"pending" | "local" | "webspeech">("pending");
  const localRecognizerRef = useRef<LocalSpeechRecognizer | null>(null);

  /**
   * Prefer the local offline bridge. WebView2 has no speech service, so the
   * standard engine is only useful in a real browser.
   */
  const resolveEngine = useCallback(async () => {
    if (engineModeRef.current !== "pending") return engineModeRef.current;
    const health = await checkSttServer();
    const useLocal = health.online && health.backendAvailable !== false;
    engineModeRef.current = useLocal ? "local" : "webspeech";
    voiceDiagRecord(
      "reactor",
      useLocal ? "engine:local-bridge" : "engine:webspeech",
      useLocal ? `${health.engine} model=${health.model}` : health.detail || "local bridge offline",
    );
    return engineModeRef.current;
  }, []);

  openRef.current = open;
  isMicMutedRef.current = isMicMuted;

  // Subscribe to voice speech amplitude for organic reactive waves
  useEffect(() => {
    return subscribeSpeechFrame((amp) => {
      setAudioAmp(amp);
    });
  }, []);

  // Refresh background data caches
  useEffect(() => {
    setStravaStats(loadCachedStravaStats());
    setSprintsState(loadAcademicSprints());
  }, [open]);

  /**
   * The host owns the microphone state. Mirroring it here means a mute can never
   * latch silently across sessions: opening the reactor always reflects reality,
   * and a resume from the header or by voice reaches this component.
   */
  useEffect(() => {
    setIsMicMuted(!listeningActive);
  }, [listeningActive]);

  /** Route every microphone control through one place, so host and reactor agree. */
  const applyListeningState = useCallback(
    (active: boolean) => {
      voiceDiagRecord("reactor", active ? "mic:resume-requested" : "mic:mute-requested");
      setIsMicMuted(!active);
      onSetListening?.(active);
    },
    [onSetListening],
  );

  // Cleanly stop speech recognition
  const stopRecognition = useCallback(() => {
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.stop();
      } catch {
        // Ignored
      }
      recognitionRef.current = null;
    }
    const local = localRecognizerRef.current;
    localRecognizerRef.current = null;
    if (local) {
      void local.stop();
    }
  }, []);

  /**
   * Restarts always dispatch through the ref, never through a captured
   * `startRecognition` binding. A `useCallback` with an empty dependency list
   * would otherwise re-run the first render's closure for the whole session.
   */
  const scheduleRestart = useCallback((delayMs = 250) => {
    if (
      !isMountedRef.current ||
      !openRef.current ||
      isMicMutedRef.current ||
      isProcessingRef.current
    ) {
      return;
    }
    window.setTimeout(() => {
      if (
        isMountedRef.current &&
        openRef.current &&
        !isMicMutedRef.current &&
        !isProcessingRef.current
      ) {
        startRecognitionRef.current();
      }
    }, delayMs);
  }, []);

  // Dispatch AI Query and stream response
  const handleDispatchQuery = useCallback(
    async (queryText: string) => {
      const clean = queryText.trim();
      if (!clean || isProcessingRef.current) return;

      isProcessingRef.current = true;
      stopRecognition();
      stopSpeaking();

      setLiveTranscript(clean);
      setReactorState("solving");
      setStatusText("Synthesizing answer…");

      // Helper to speak output and reset recognition loop
      const speakAndDeliver = (replyText: string, customCategory?: FloatingResponseCardData["category"]) => {
        lastSpokenTextRef.current = replyText;
        const hudData = deriveExecutiveHUDData(
          clean,
          replyText,
          stravaStats,
          sprintsState,
          vaultNotes,
          config,
        );
        if (customCategory) {
          hudData.category = customCategory;
        }

        setActiveResponse(hudData);
        setLoggedToJournal(false);
        setReactorState("speaking");
        setStatusText("Speaking…");

        speakText(
          replyText,
          () => {
            setReactorState("speaking");
            setStatusText("Speaking…");
          },
          () => {
            if (cooldownTimerRef.current) {
              window.clearTimeout(cooldownTimerRef.current);
            }
            cooldownTimerRef.current = window.setTimeout(() => {
              cooldownTimerRef.current = null;
              lastSpokenTextRef.current = "";
              if (
                isMountedRef.current &&
                openRef.current &&
                !isMicMutedRef.current
              ) {
                currentQueryRef.current = "";
                setLiveTranscript("");
                isProcessingRef.current = false;
                setReactorState("listening");
                setStatusText("Listening…");
                startRecognitionRef.current();
              }
            }, 750);
          },
        );
      };

      try {
        voiceDiagRecord("reactor", "dispatch", clean);
        const cleanLower = clean.toLowerCase();
        const stripped = stripWakePrefix(cleanLower);
        const cmd = stripped || cleanLower;

        // 1. Local Workstation & HUD Action Handling
        if (cmd.includes("open running") || cmd.includes("running mode") || cmd.includes("running cockpit") || cmd.includes("running dashboard")) {
          onOpenRunningMode?.();
          speakAndDeliver("Opening athletic running cockpit, Sir.", "running");
          return;
        }

        if (
          cmd === "open workstation" ||
          cmd === "expand workstation" ||
          cmd === "open system" ||
          cmd === "restore workstation" ||
          cmd === "show workstation" ||
          cmd === "maximize"
        ) {
          onExpandWorkstation();
          speakAndDeliver("Workstation restored to full screen, Sir.", "system");
          return;
        }

        if (cmd.includes("open graph") || cmd.includes("show graph") || cmd.includes("knowledge graph") || cmd.includes("mind map")) {
          onOpenGraph?.();
          onExpandWorkstation();
          speakAndDeliver("Knowledge graph opened in workstation, Sir.", "knowledge");
          return;
        }

        if (
          cmd.includes("copilot") ||
          cmd.includes("ask ai") ||
          cmd.includes("open ai") ||
          cmd === "assistant" ||
          cmd === "open assistant"
        ) {
          onOpenCopilot?.();
          onExpandWorkstation();
          speakAndDeliver("AI Copilot opened in workstation, Sir.", "knowledge");
          return;
        }

        if (cmd.includes("new note") || cmd.includes("create note") || cmd.includes("take a note") || cmd.includes("write note")) {
          onNewNote?.();
          onExpandWorkstation();
          speakAndDeliver("Creating new note draft in workstation, Sir.", "knowledge");
          return;
        }

        if (cmd.includes("open notes") || cmd.includes("show notes") || cmd.includes("notes drawer") || cmd.includes("vault")) {
          onOpenNotes?.();
          onExpandWorkstation();
          speakAndDeliver("Opening notes vault in workstation, Sir.", "knowledge");
          return;
        }

        if (cmd.includes("save to journal") || cmd.includes("log to journal") || cmd.includes("capture thought") || cmd.includes("write journal")) {
          if (onJournal) {
            onJournal();
            speakAndDeliver("Opening daily journal capture, Sir.", "system");
          } else {
            await handleSaveToJournal();
          }
          return;
        }

        // Microphone control is anchored phrasing only. An audio command such as
        // "mute the volume" or "unmute" therefore falls through to the OS grammar
        // below instead of switching the recognizer off.
        if (matchesMicUnmuteCommand(cmd)) {
          applyListeningState(true);
          speakAndDeliver("Microphone live again and listening, Sir.", "system");
          return;
        }

        if (matchesMicMuteCommand(cmd)) {
          applyListeningState(false);
          speakAndDeliver("Microphone muted, Sir. Tap the mic control or say start listening to resume.", "system");
          return;
        }

        if (
          cmd === "close" ||
          cmd === "exit" ||
          cmd === "hide to tray" ||
          cmd === "minimize to tray" ||
          cmd === "dismiss" ||
          cmd === "send to tray" ||
          cmd === "tray"
        ) {
          speakText("Minimizing to system tray, Sir.", undefined, () => onClose());
          return;
        }

        // 2. OS System Command Execution (Launch apps, volume, mute, screenshot, window controls)
        if (onSystemCommand) {
          const outcome = await onSystemCommand(cmd).catch(() => null);
          if (outcome && typeof outcome === "string" && outcome.trim().length > 0) {
            speakAndDeliver(formatReplyWithSir(outcome), "system");
            return;
          }
        }

        // 3. Fallback: Cognitive Second Brain Synthesis via AI LLM
        const notesContext = vaultNotes
          .slice(0, 10)
          .map((n) => `Note: ${n.title}\n${n.excerpt || ""}`)
          .join("\n\n");

        const messages = [
          {
            role: "system" as const,
            content: `You are Severus, Lex Matondo's personal JARVIS-style cognitive operating system and Second Brain. Address Lex respectfully as 'Sir' at the end of key replies. Be concise, fast, punchy, and helpful.\n\nKnowledge Notes:\n${notesContext}`,
          },
          { role: "user" as const, content: clean },
        ];

        const reply = await sendAIChat(config, messages);
        const replyText = formatReplyWithSir(reply.trim());
        speakAndDeliver(replyText);
      } catch (err) {
        console.warn("[ThinkingModeReactor] AI query failed:", err);
        const errNotice = "My apologies, Sir. I encountered an issue consulting the knowledge base.";
        lastSpokenTextRef.current = errNotice;
        setReactorState("speaking");
        setStatusText("Speaking…");

        speakText(errNotice, undefined, () => {
          if (cooldownTimerRef.current) {
            window.clearTimeout(cooldownTimerRef.current);
          }
          cooldownTimerRef.current = window.setTimeout(() => {
            cooldownTimerRef.current = null;
            lastSpokenTextRef.current = "";
            if (
              isMountedRef.current &&
              openRef.current &&
              !isMicMutedRef.current
            ) {
              currentQueryRef.current = "";
              setLiveTranscript("");
              isProcessingRef.current = false;
              setReactorState("listening");
              setStatusText("Listening…");
              startRecognitionRef.current();
            }
          }, 750);
        });
      }
    },
    [
      config,
      vaultNotes,
      stravaStats,
      sprintsState,
      stopRecognition,
      onOpenRunningMode,
      onExpandWorkstation,
      onOpenGraph,
      onNewNote,
      onOpenNotes,
      onJournal,
      onSystemCommand,
      onClose,
      applyListeningState,
    ],
  );

  // Initialize Speech Recognition
  const startRecognition = useCallback(() => {
    if (
      !isMountedRef.current ||
      !openRef.current ||
      isMicMutedRef.current ||
      isProcessingRef.current
    ) {
      return;
    }

    if (isVoiceSpeaking() || isVoiceInEchoCooldown(750)) {
      scheduleRestart(250);
      return;
    }

    // Offline bridge: one complete utterance arrives per spoken phrase, so it
    // dispatches immediately instead of waiting on a silence timer.
    if (engineModeRef.current === "local") {
      if (localRecognizerRef.current?.isRunning()) return;

      const recognizer = new LocalSpeechRecognizer({
        shouldIgnoreAudio: () => isVoiceSpeaking() || isVoiceInEchoCooldown(300),
        onTranscript: (text) => {
          const cleaned = text.trim();
          if (!cleaned) return;
          if (isVoiceSpeaking() || isVoiceInEchoCooldown(750)) return;
          if (isEchoOfSeverus(cleaned)) return;

          engineFailuresRef.current = 0;
          setLiveTranscript(cleaned);
          setReactorState("listening");
          setStatusText("Listening...");
          voiceDiagRecord("reactor", "transcript", cleaned);
          currentQueryRef.current = "";
          void handleDispatchQuery(cleaned);
        },
      });

      localRecognizerRef.current = recognizer;
      void recognizer.start().then((ok) => {
        if (ok) return;
        engineModeRef.current = "webspeech";
        voiceDiagRecord("reactor", "engine:local-capture-failed", "falling back to the standard engine", "warn");
        scheduleRestart(400);
      });
      setReactorState("listening");
      setStatusText("Listening...");
      return;
    }

    const SpeechRec = getSpeechRecognitionCtor();
    if (!SpeechRec) {
      setStatusText("Web Speech not supported");
      voiceDiagRecord("reactor", "api-missing", "webspeech recognition unavailable", "error");
      return;
    }

    stopRecognition();

    try {
      const rec = new SpeechRec();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";

      // Prefer on-device recognition: this runtime has no cloud speech service.
      const strategy = applySpeechEngine(rec, rec.lang);
      voiceDiagRecord("reactor", strategy.useLocal ? "engine:on-device" : "engine:standard", strategy.reason);

      rec.onresult = (event: any) => {
        if (
          isVoiceSpeaking() ||
          isVoiceInEchoCooldown(750) ||
          isProcessingRef.current
        ) {
          return;
        }

        let interim = "";
        let final = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          if (item.isFinal) {
            final += item[0].transcript;
          } else {
            interim += item[0].transcript;
          }
        }

        const heard = (final || interim).trim();
        if (!heard) return;

        // Gate: Drop if heard text matches Severus's own echo
        if (isEchoOfSeverus(heard)) {
          return;
        }

        if (lastSpokenTextRef.current && (isVoiceSpeaking() || isVoiceInEchoCooldown(800))) {
          const normSpoken = lastSpokenTextRef.current.toLowerCase().replace(/[^a-z0-9]/g, " ").trim();
          const normHeard = heard.toLowerCase().replace(/[^a-z0-9]/g, " ").trim();
          if (
            normHeard.length >= 14 &&
            (normSpoken === normHeard || normSpoken.includes(normHeard) || (normSpoken.length >= 20 && normHeard.includes(normSpoken)))
          ) {
            return;
          }
        }

        setLiveTranscript(heard);
        setReactorState("listening");
        setStatusText("Listening...");
        currentQueryRef.current = heard;
        engineFailuresRef.current = 0;
        voiceDiagRecord("reactor", "transcript", heard);

        if (silenceTimerRef.current) {
          window.clearTimeout(silenceTimerRef.current);
        }

        silenceTimerRef.current = window.setTimeout(() => {
          const query = currentQueryRef.current;
          if (
            query &&
            !isProcessingRef.current &&
            !isVoiceSpeaking() &&
            !isVoiceInEchoCooldown(750)
          ) {
            currentQueryRef.current = "";
            void handleDispatchQuery(query);
          }
        }, 1100);
      };

      rec.onerror = (err: any) => {
        const errorType = err.error || "unknown";
        if (errorType !== "no-speech") {
          console.warn("[ThinkingModeReactor] Speech recognition error:", errorType);
        }
        voiceDiagFatalRecognitionError("reactor", errorType);
        recognitionRef.current = null;

        if (errorType === "network") {
          engineFailuresRef.current += 1;
          // No cloud speech service exists in this runtime: re-probe and pull the
          // on-device model instead of retrying the dead engine every 300ms.
          void recoverSpeechEngine(rec.lang).then((recovery) => {
            if (recovery.retryNow && isMountedRef.current && openRef.current && !isMicMutedRef.current) {
              scheduleRestart(150);
            }
          });
        }

        if (
          isMountedRef.current &&
          openRef.current &&
          !isMicMutedRef.current &&
          !isProcessingRef.current
        ) {
          const backoff = errorType === "network" ? Math.min(3000 * engineFailuresRef.current, 15000) : 300;
          scheduleRestart(backoff);
        }
      };

      rec.onend = () => {
        recognitionRef.current = null;
        if (
          isMountedRef.current &&
          openRef.current &&
          !isMicMutedRef.current &&
          !isProcessingRef.current
        ) {
          scheduleRestart(150);
        }
      };

      rec.start();
      recognitionRef.current = rec;
      setReactorState("listening");
      setStatusText("Listening...");
      voiceDiagRecord("reactor", "recognition-started");
    } catch (err) {
      console.warn("[ThinkingModeReactor] Failed starting recognition:", err);
      voiceDiagRecord("reactor", "start-failed", String(err), "error");
      if (
        isMountedRef.current &&
        openRef.current &&
        !isMicMutedRef.current &&
        !isProcessingRef.current
      ) {
        scheduleRestart(500);
      }
    }
  }, [stopRecognition, scheduleRestart, handleDispatchQuery]);

  // Keep the restart path pointed at the newest starter without making the
  // open/mute effect depend on it, which would tear down recognition on every
  // re-render of the host application.
  useEffect(() => {
    startRecognitionRef.current = startRecognition;
  }, [startRecognition]);

  // Initial Query Handler
  useEffect(() => {
    if (open && initialQuery && initialQuery.trim().length > 2) {
      void handleDispatchQuery(initialQuery);
    }
  }, [open, initialQuery, handleDispatchQuery]);

  // Handle open / mute transitions. Recognition is started through the ref so a
  // host re-render cannot cancel an utterance in progress.
  useEffect(() => {
    if (open && !isMicMuted) {
      // Resolve the engine before starting so the bridge check is not raced.
      void resolveEngine().then(() => startRecognitionRef.current());
    } else {
      stopRecognition();
      if (!open) {
        // Re-probe on the next open: the bridge may have been started since.
        engineModeRef.current = "pending";
      }
      if (isMicMuted) {
        setReactorState("idle");
        setStatusText("Microphone muted. Tap the mic to resume.");
      }
    }
  }, [open, isMicMuted, stopRecognition, resolveEngine]);

  // Keyboard shortcut: Escape closes / minimizes to tray
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // Quick save thinking entry to daily journal
  const handleSaveToJournal = async () => {
    if (!activeResponse || loggedToJournal) return;
    try {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const entry = `\n- [${timeStr}] Thinking Mode Session: ${activeResponse.verdict}\n`;
      await appendJournal(entry);
      setLoggedToJournal(true);
      onShowToast?.("Session logged to daily journal, Sir.");
      speakText("Session logged to your journal, Sir.");
    } catch (err) {
      console.warn("[ThinkingModeReactor] Failed saving to journal:", err);
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <div
        className="jarvis-reactor-backdrop-overlay"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          pointerEvents: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at center, rgba(6, 182, 212, 0.04) 0%, rgba(0, 0, 0, 0.65) 100%)",
          backdropFilter: "blur(12px)",
        }}
      >
        <motion.div
          className="jarvis-reactor-cockpit-window"
          drag
          dragMomentum={false}
          initial={{ opacity: 0, scale: 0.85, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 12 }}
          transition={{ type: "spring", stiffness: 350, damping: 26 }}
          style={{
            pointerEvents: "auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            cursor: "grab",
            userSelect: "none",
          }}
        >
          {/* Holographic Header Bar */}
          <div
            className="jarvis-hud-header"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 16px",
              borderRadius: 9999,
              background: "rgba(10, 15, 25, 0.75)",
              border: "1px solid rgba(6, 182, 212, 0.28)",
              boxShadow: "0 0 20px rgba(6, 182, 212, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.15)",
              marginBottom: 12,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: 9999,
                background:
                  reactorState === "listening"
                    ? "#4ade80"
                    : reactorState === "solving"
                    ? "#c084fc"
                    : "#06b6d4",
                boxShadow: `0 0 8px ${
                  reactorState === "listening"
                    ? "#4ade80"
                    : reactorState === "solving"
                    ? "#c084fc"
                    : "#06b6d4"
                }`,
              }}
            />
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.14em",
                color: "#22d3ee",
                fontFamily: "monospace",
                textTransform: "uppercase",
              }}
            >
              SEVERUS COGNITIVE REACTOR
            </span>
            <span style={{ fontSize: 11, opacity: 0.4, color: "#fff" }}>·</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "rgba(255, 255, 255, 0.8)",
              }}
            >
              {statusText}
            </span>
          </div>

          {/* Core 3D Holographic Particle Waveform Reactor */}
          <div
            className="jarvis-reactor-core-wrap"
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <JarvisHologramReactor
              state={reactorState}
              size={280}
              audioAmplitude={audioAmp}
              onClick={() => applyListeningState(isMicMuted)}
            />

            {/* Quick Action Halo (Orbital Controls) */}
            <div
              className="jarvis-halo-controls"
              style={{
                position: "absolute",
                inset: -14,
                pointerEvents: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              {/* Left Action: Mic Mute */}
              <button
                type="button"
                onClick={() => applyListeningState(isMicMuted)}
                title={isMicMuted ? "Unmute Microphone" : "Mute Microphone"}
                style={{
                  pointerEvents: "auto",
                  width: 36,
                  height: 36,
                  borderRadius: 9999,
                  background: isMicMuted ? "rgba(239, 68, 68, 0.2)" : "rgba(10, 15, 25, 0.8)",
                  border: isMicMuted ? "1px solid #ef4444" : "1px solid rgba(6, 182, 212, 0.3)",
                  color: isMicMuted ? "#ef4444" : "#22d3ee",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                }}
              >
                <Icon name={isMicMuted ? "mic-off" : "mic"} size={16} />
              </button>

              {/* Center-Right: AI Settings (if handler provided) */}
              {onOpenSettings && (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  title="Configure AI & Voices"
                  style={{
                    pointerEvents: "auto",
                    width: 36,
                    height: 36,
                    borderRadius: 9999,
                    background: "rgba(10, 15, 25, 0.8)",
                    border: "1px solid rgba(6, 182, 212, 0.3)",
                    color: "rgba(255, 255, 255, 0.7)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                  }}
                >
                  <Icon name="gear" size={16} />
                </button>
              )}

              {/* Right Action: Close to Tray */}
              <button
                type="button"
                onClick={onClose}
                title="Exit to System Tray"
                style={{
                  pointerEvents: "auto",
                  width: 36,
                  height: 36,
                  borderRadius: 9999,
                  background: "rgba(10, 15, 25, 0.8)",
                  border: "1px solid rgba(6, 182, 212, 0.3)",
                  color: "rgba(255, 255, 255, 0.8)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                }}
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          </div>

          {/* Live Transcript Ticker Bubble */}
          <AnimatePresence>
            {liveTranscript && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.95 }}
                style={{
                  maxWidth: 480,
                  marginTop: -6,
                  marginBottom: 12,
                  padding: "8px 18px",
                  borderRadius: 12,
                  background: "rgba(10, 15, 25, 0.85)",
                  border: "1px solid rgba(6, 182, 212, 0.35)",
                  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.6)",
                  textAlign: "center",
                  color: "#e0f2fe",
                  fontSize: 13,
                  fontWeight: 500,
                  letterSpacing: "-0.01em",
                }}
              >
                “{liveTranscript}”
              </motion.div>
            )}
          </AnimatePresence>

          {/* Executive Response HUD Card */}
          <AnimatePresence>
            {activeResponse && (
              <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.96 }}
                transition={{ type: "spring", stiffness: 320, damping: 24 }}
                style={{
                  width: 520,
                  maxWidth: "92vw",
                  borderRadius: 16,
                  background: "rgba(8, 12, 20, 0.92)",
                  border: "1px solid rgba(6, 182, 212, 0.35)",
                  boxShadow: "0 16px 40px rgba(0, 0, 0, 0.8), 0 0 30px rgba(6, 182, 212, 0.15)",
                  padding: 18,
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                }}
              >
                {/* Response Card Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        background: "rgba(6, 182, 212, 0.15)",
                        border: "1px solid rgba(6, 182, 212, 0.3)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#22d3ee",
                      }}
                    >
                      <Icon name={activeResponse.categoryIcon} size={15} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#22d3ee", textTransform: "uppercase" }}>
                        {activeResponse.categoryLabel}
                      </div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
                        {activeResponse.timestamp}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button
                      type="button"
                      onClick={handleSaveToJournal}
                      disabled={loggedToJournal}
                      style={{
                        padding: "5px 10px",
                        borderRadius: 8,
                        background: loggedToJournal ? "rgba(74, 222, 128, 0.15)" : "rgba(255, 255, 255, 0.06)",
                        border: loggedToJournal ? "1px solid rgba(74, 222, 128, 0.3)" : "1px solid rgba(255, 255, 255, 0.12)",
                        color: loggedToJournal ? "#4ade80" : "rgba(255, 255, 255, 0.8)",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: loggedToJournal ? "default" : "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      <Icon name="save" size={12} />
                      <span>{loggedToJournal ? "Logged" : "Log Journal"}</span>
                    </button>

                    {onOpenRunningMode && activeResponse.category === "running" && (
                      <button
                        type="button"
                        onClick={onOpenRunningMode}
                        style={{
                          padding: "5px 10px",
                          borderRadius: 8,
                          background: "rgba(234, 88, 12, 0.15)",
                          border: "1px solid rgba(234, 88, 12, 0.35)",
                          color: "#fb923c",
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                        }}
                      >
                        <Icon name="activity" size={12} />
                        <span>Running Cockpit</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={onExpandWorkstation}
                      style={{
                        padding: "5px 10px",
                        borderRadius: 8,
                        background: "rgba(6, 182, 212, 0.12)",
                        border: "1px solid rgba(6, 182, 212, 0.35)",
                        color: "#22d3ee",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      <Icon name="maximize" size={12} />
                      <span>Workstation</span>
                    </button>
                  </div>
                </div>

                {/* Verdict Headline / Expandable Transcript */}
                <div
                  onClick={() => setShowFullTranscript((prev) => !prev)}
                  title="Click to toggle full transcript"
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    lineHeight: 1.5,
                    color: "#f8fafc",
                    cursor: "pointer",
                  }}
                >
                  {showFullTranscript ? activeResponse.fullText : activeResponse.verdict}
                </div>

                {/* Structured Metrics Chips */}
                {activeResponse.metrics.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${activeResponse.metrics.length}, 1fr)`, gap: 8 }}>
                    {activeResponse.metrics.map((m) => (
                      <div
                        key={m.label}
                        style={{
                          padding: "8px 12px",
                          borderRadius: 10,
                          background: m.highlight ? "rgba(6, 182, 212, 0.08)" : "rgba(255, 255, 255, 0.03)",
                          border: m.highlight ? "1px solid rgba(6, 182, 212, 0.22)" : "1px solid rgba(255, 255, 255, 0.06)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 2,
                        }}
                      >
                        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: "#94a3b8", textTransform: "uppercase" }}>
                          {m.label}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: m.highlight ? "#22d3ee" : "#f1f5f9" }}>
                          {m.value}
                        </span>
                        {m.sub && (
                          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
                            {m.sub}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

export default ThinkingModeReactor;
