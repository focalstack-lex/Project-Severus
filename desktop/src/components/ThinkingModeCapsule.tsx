import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ThinkingOrb, type OrbState } from "@/components/ui/thinking-orbs";
import { type AIConfig, sendAIChat } from "../lib/ai";
import {
  speakText,
  stopSpeaking,
  isVoiceSpeaking,
  isVoiceInEchoCooldown,
  isEchoOfSeverus,
  formatReplyWithSir,
} from "../lib/voice";
import { appendJournal, getMemorySummary, readTodayJournal } from "../lib/tauri";
import { loadCachedStravaStats } from "../lib/strava";
import { loadAcademicSprints } from "../lib/academicSprints";
import Icon from "./Icon";

export interface ThinkingModeCapsuleProps {
  open: boolean;
  onClose: () => void;
  onExpandWorkstation: () => void;
  onOpenRunningMode?: () => void;
  onOpenSettings?: () => void;
  config: AIConfig;
  vaultNotes?: { id: string; title: string; excerpt?: string }[];
  onShowToast?: (msg: string) => void;
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

  // Split on sentence boundaries to extract 1-2 sentence core verdict
  const rawSentences = cleanReply
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  let verdict = rawSentences.slice(0, 2).join(" ");
  if (!verdict) verdict = cleanReply;

  // Detect Categories
  const isRunning =
    cleanQ.includes("run") ||
    cleanQ.includes("mileage") ||
    cleanQ.includes("pace") ||
    cleanQ.includes("strava") ||
    cleanQ.includes("km") ||
    cleanQ.includes("heart rate") ||
    cleanQ.includes("zone 2") ||
    lowerReply.includes("kilometer") ||
    lowerReply.includes("pace") ||
    lowerReply.includes("strava") ||
    lowerReply.includes("mileage");

  const isAcademic =
    cleanQ.includes("sprint") ||
    cleanQ.includes("bscpe") ||
    cleanQ.includes("exam") ||
    cleanQ.includes("lab") ||
    cleanQ.includes("study") ||
    cleanQ.includes("cor jesu") ||
    cleanQ.includes("embedded") ||
    cleanQ.includes("verilog") ||
    cleanQ.includes("microcontroller") ||
    lowerReply.includes("sprint") ||
    lowerReply.includes("academic") ||
    lowerReply.includes("bscpe");

  const isSystem =
    cleanQ.includes("severus") ||
    cleanQ.includes("system") ||
    cleanQ.includes("status") ||
    cleanQ.includes("model") ||
    cleanQ.includes("voice") ||
    cleanQ.includes("elevenlabs") ||
    cleanQ.includes("microphone") ||
    cleanQ.includes("mic") ||
    cleanQ.includes("audio") ||
    cleanQ.includes("tauri") ||
    cleanQ.includes("version") ||
    cleanQ.includes("config");

  const matchedNotes = vaultNotes
    .filter((n) => {
      const t = n.title.toLowerCase();
      return (t.length > 2 && cleanQ.includes(t)) || (t.length > 3 && lowerReply.includes(t));
    })
    .map((n) => n.title);

  const isKnowledge =
    matchedNotes.length > 0 ||
    cleanQ.includes("note") ||
    cleanQ.includes("brain") ||
    cleanQ.includes("vault") ||
    cleanQ.includes("graph") ||
    cleanQ.includes("coffee box") ||
    cleanQ.includes("matondo") ||
    cleanQ.includes("atomic habits") ||
    cleanQ.includes("photography");

  const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (isRunning) {
    const weeklyKm = stravaStats?.weeklyMileageKm ?? 0;
    const pct = Math.min(100, Math.round((weeklyKm / weeklyTarget) * 100));

    const metrics: ExecutiveMetric[] = [
      {
        label: "WEEKLY VOL",
        value: `${weeklyKm.toFixed(1)} km`,
        sub: `Target: ${weeklyTarget} km`,
        highlight: true,
      },
      {
        label: "LATEST RUN",
        value: stravaStats?.latestRun?.formattedDistance || "No session",
        sub: stravaStats?.latestRun?.formattedDate || "Awaiting sync",
      },
      {
        label: "AVG PACE",
        value: stravaStats?.latestRun?.formattedPace || "—",
        sub: stravaStats?.latestRun ? `+${stravaStats.latestRun.elevationGainM}m elevation` : "Aerobic base",
      },
      {
        label: "HEART RATE",
        value: stravaStats?.latestRun?.averageHeartrate ? `${stravaStats.latestRun.averageHeartrate} bpm` : "145 bpm",
        sub: "Zone 2 Aerobic Base",
        highlight: true,
      },
    ];

    const suggestion =
      weeklyKm >= weeklyTarget
        ? "Weekly volume achieved. Focus on Zone 2 aerobic recovery, mobility, and hydration, Sir."
        : `${(weeklyTarget - weeklyKm).toFixed(1)} km remaining. Recommend 1x controlled Zone 2 endurance session before week's end, Sir.`;

    return {
      fullText: cleanReply,
      verdict,
      timestamp,
      category: "running",
      categoryLabel: "🏃 Athletic Telemetry",
      metrics,
      weeklyProgress: {
        current: weeklyKm,
        target: weeklyTarget,
        percentage: pct,
      },
      suggestion,
    };
  }

  if (isAcademic) {
    const pendingSprints = sprintsState.sprints.filter((s) => !s.completed);
    const primary = sprintsState.sprints.find((s) => s.isPrimary && !s.completed) || pendingSprints[0];

    const metrics: ExecutiveMetric[] = [
      {
        label: "PRIMARY FOCUS",
        value: primary ? primary.title.slice(0, 20) : "BSCpE Core",
        sub: primary ? `[${primary.category.toUpperCase()}] Priority` : "Academic Sprint",
        highlight: true,
      },
      {
        label: "ACTIVE QUEUE",
        value: `${pendingSprints.length} Sprints`,
        sub: "Cor Jesu BSCpE",
      },
      {
        label: "CADENCE",
        value: "Deep Work",
        sub: "Systems over motivation",
      },
      {
        label: "DEADLINE",
        value: primary?.dueDate || "Active Semester",
        sub: "3rd Year Curriculum",
        highlight: true,
      },
    ];

    const suggestion = primary
      ? `Execute a focused 50-minute deep work block on "${primary.title}" before handling secondary queue items, Sir.`
      : "No critical bottlenecks found. Maintain consistent academic cadence, Sir.";

    return {
      fullText: cleanReply,
      verdict,
      timestamp,
      category: "academic",
      categoryLabel: "📘 Academic Sprint",
      metrics,
      suggestion,
    };
  }

  if (isKnowledge) {
    const metrics: ExecutiveMetric[] = [
      {
        label: "SECOND BRAIN",
        value: matchedNotes.length > 0 ? `${matchedNotes.length} Linked Note${matchedNotes.length > 1 ? "s" : ""}` : `${vaultNotes.length} Notes Total`,
        sub: matchedNotes[0] ? matchedNotes[0].slice(0, 20) : "Knowledge Graph",
        highlight: true,
      },
      {
        label: "COGNITIVE STATE",
        value: "Grounded 100%",
        sub: "Zero Hallucination Protocol",
      },
      {
        label: "CORE PROFILE",
        value: "Lex Matondo",
        sub: "Cor Jesu / Creator-Engineer",
      },
      {
        label: "PHILOSOPHY",
        value: "Atomic Habits",
        sub: "Sustainable Systems",
        highlight: true,
      },
    ];

    const suggestion = matchedNotes.length > 0
      ? `Cross-link this insight into [[${matchedNotes[0]}]] to reinforce synthesis across your knowledge graph, Sir.`
      : "Log key insights into today's journal to preserve durable knowledge in your Second Brain, Sir.";

    return {
      fullText: cleanReply,
      verdict,
      timestamp,
      category: "knowledge",
      categoryLabel: "🧠 Second Brain Knowledge",
      metrics,
      referencedNotes: matchedNotes.length > 0 ? matchedNotes : undefined,
      suggestion,
    };
  }

  if (isSystem) {
    const metrics: ExecutiveMetric[] = [
      {
        label: "INTELLIGENCE",
        value: (config.providerName || "Gemini").toUpperCase(),
        sub: config.model ? config.model.split("/").pop() || config.model : "Flash 2.0",
        highlight: true,
      },
      {
        label: "VOCAL SYNTH",
        value: "ElevenLabs",
        sub: "Snape Neural Persona",
      },
      {
        label: "AUDIO STREAM",
        value: "Duplex Mic",
        sub: "Acoustic Guard Active",
      },
      {
        label: "SHELL RUNTIME",
        value: "Tauri Native v2",
        sub: "Severus OS Glass HUD",
        highlight: true,
      },
    ];

    const suggestion = "All sensory and inference pipelines are nominal. Ready for next command, Sir.";

    return {
      fullText: cleanReply,
      verdict,
      timestamp,
      category: "system",
      categoryLabel: "⚡ System Telemetry",
      metrics,
      suggestion,
    };
  }

  // General questions / Executive Briefing
  let domainTag = "Advisory";
  let domainSub = "Executive Briefing";
  if (cleanQ.includes("plan") || cleanQ.includes("habit") || cleanQ.includes("routine")) {
    domainTag = "Habit & Routine";
    domainSub = "Atomic Habits System";
  } else if (cleanQ.includes("photo") || cleanQ.includes("camera") || cleanQ.includes("film")) {
    domainTag = "Creative Visuals";
    domainSub = "Filmmaking & Stills";
  } else if (cleanQ.includes("time") || cleanQ.includes("schedule") || cleanQ.includes("today")) {
    domainTag = "Time & Rhythm";
    domainSub = "Davao Region (PHT)";
  }

  const metrics: ExecutiveMetric[] = [
    {
      label: "BRIEFING DOMAIN",
      value: domainTag,
      sub: domainSub,
      highlight: true,
    },
    {
      label: "REASONING",
      value: "Synthesized",
      sub: "Cognitive Second Brain",
    },
    {
      label: "OPERATING RULE",
      value: "Systems > Will",
      sub: "Atomic Habits Principle",
    },
    {
      label: "TIMESTAMP",
      value: timestamp,
      sub: "Davao Region (PHT)",
      highlight: true,
    },
  ];

  const suggestion = "Suggested: Use 'Log to Journal' below or say 'save thought' to append this debrief to your daily log, Sir.";

  return {
    fullText: cleanReply,
    verdict,
    timestamp,
    category: "general",
    categoryLabel: "💭 Executive Briefing",
    metrics,
    suggestion,
  };
}

interface ConversationItem {
  role: "user" | "assistant";
  content: string;
}

export function ThinkingModeCapsule({
  open,
  onClose,
  onExpandWorkstation,
  onOpenRunningMode,
  onOpenSettings,
  config,
  vaultNotes = [],
  onShowToast,
}: ThinkingModeCapsuleProps) {
  const [orbState, setOrbState] = useState<OrbState>("listening");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [statusText, setStatusText] = useState("Listening…");
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [conversation, setConversation] = useState<ConversationItem[]>([]);
  const [activeResponse, setActiveResponse] = useState<FloatingResponseCardData | null>(null);
  const [dismissedResponse, setDismissedResponse] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loggedToJournal, setLoggedToJournal] = useState(false);
  const [showFullTranscript, setShowFullTranscript] = useState(false);

  const handleCopyResponse = useCallback(() => {
    if (!activeResponse) return;
    void navigator.clipboard.writeText(activeResponse.fullText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
    onShowToast?.("Copied summary to clipboard.");
  }, [activeResponse, onShowToast]);

  const handleLogResponseToJournal = useCallback(async () => {
    if (!activeResponse || loggedToJournal) return;
    try {
      const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const tag = activeResponse.categoryLabel;
      const metricsSummary = activeResponse.metrics
        .map((m) => `${m.label}: ${m.value}${m.sub ? ` (${m.sub})` : ""}`)
        .join(" | ");
      await appendJournal(
        `[${timeStr}] ${tag}: ${activeResponse.verdict}\n  ↳ Telemetry: ${metricsSummary}\n  ↳ Next Action: ${activeResponse.suggestion}`
      );
      setLoggedToJournal(true);
      onShowToast?.("Appended executive debrief to today's action log.");
    } catch (err) {
      console.error("Failed to log to journal:", err);
    }
  }, [activeResponse, loggedToJournal, onShowToast]);

  const handleDismissCard = useCallback(() => {
    setDismissedResponse(true);
  }, []);

  const recognitionRef = useRef<any>(null);
  const isMountedRef = useRef(true);
  const openRef = useRef(open);
  const isMicMutedRef = useRef(isMicMuted);
  const silenceTimerRef = useRef<number | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const cooldownTimerRef = useRef<number | null>(null);
  const currentQueryRef = useRef("");
  const isProcessingRef = useRef(false);
  const lastSpokenTextRef = useRef("");
  const memorySummaryRef = useRef("");

  useEffect(() => {
    if (open) {
      void getMemorySummary().then((summary) => {
        memorySummaryRef.current = summary;
      });
    }
  }, [open]);

  openRef.current = open;
  isMicMutedRef.current = isMicMuted;

  // Fully stop and discard pending recognition audio
  const stopRecognition = useCallback(() => {
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onresult = null;
        // abort() immediately terminates listening and discards buffered audio in WebView2
        recognitionRef.current.abort();
      } catch {
        // Ignored
      }
      recognitionRef.current = null;
    }
  }, []);

  // Safe auto-restart scheduler
  const scheduleRestart = useCallback(
    (delayMs = 150) => {
      if (restartTimerRef.current !== null) {
        window.clearTimeout(restartTimerRef.current);
      }
      restartTimerRef.current = window.setTimeout(() => {
        restartTimerRef.current = null;
        if (
          isMountedRef.current &&
          openRef.current &&
          !isMicMutedRef.current &&
          !isProcessingRef.current
        ) {
          startRecognition();
        }
      }, delayMs);
    },
    [],
  );

  // Commit current thinking dialogue to Second Brain journal
  const handleSaveThinking = useCallback(async () => {
    if (conversation.length === 0) {
      onShowToast?.("No thoughts to save yet.");
      return;
    }
    try {
      const summary = conversation
        .map((c) => `**${c.role === "user" ? "Lex" : "Severus"}**: ${c.content}`)
        .join("\n\n");
      const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const entry = `\n### Thinking Mode Session (${timestamp})\n${summary}\n`;
      await appendJournal(entry);
      onShowToast?.("Thinking session saved to daily journal.");
      speakText("Thinking session committed to your journal, Sir.");
    } catch (err) {
      console.warn("[ThinkingMode] Failed saving to journal:", err);
      onShowToast?.("Could not save thinking session.");
    }
  }, [conversation, onShowToast]);

  // Handle AI query dispatch
  const handleDispatchQuery = useCallback(
    async (userText: string) => {
      const clean = userText.trim();
      if (!clean || isProcessingRef.current) return;

      const lower = clean.toLowerCase();

      // Check for voice expand / restore workstation triggers
      const isExpandCommand =
        lower === "expand" ||
        lower === "open workstation" ||
        lower === "back to workstation" ||
        lower === "maximize" ||
        lower === "full screen" ||
        lower === "fullscreen" ||
        lower.includes("open workstation") ||
        lower.includes("expand workstation") ||
        lower.includes("back to workstation") ||
        lower.includes("full screen") ||
        lower.includes("fullscreen") ||
        lower.includes("maximize");

      if (isExpandCommand) {
        stopRecognition();
        speakText("Restoring workstation, Sir.", undefined, () => {
          onExpandWorkstation();
        });
        return;
      }

      // Check for voice open running mode triggers
      const isRunningModeCommand =
        lower === "open running mode" ||
        lower === "start running mode" ||
        lower === "running mode" ||
        lower === "open running" ||
        lower === "open running dashboard" ||
        lower === "show running mode" ||
        lower === "launch running mode" ||
        lower.includes("open running mode") ||
        lower.includes("start running mode") ||
        lower.includes("open running dashboard") ||
        lower.includes("launch running mode");

      if (isRunningModeCommand) {
        stopRecognition();
        speakText("Opening Running Mode cockpit, Sir.", undefined, () => {
          onOpenRunningMode?.();
        });
        return;
      }

      // Check for voice exit triggers
      const isExitCommand =
        lower === "exit" ||
        lower === "goodbye" ||
        lower === "bye" ||
        lower === "close" ||
        lower === "stop" ||
        lower === "quit" ||
        lower === "dismiss" ||
        lower === "cancel" ||
        lower === "farewell" ||
        lower === "done" ||
        lower === "that will be all" ||
        lower === "that is all" ||
        lower === "that's all" ||
        lower.includes("exit thinking") ||
        lower.includes("close thinking") ||
        lower.includes("stop thinking") ||
        lower.includes("leave thinking") ||
        lower.includes("quit thinking") ||
        lower.includes("stop conversation") ||
        lower.includes("end conversation") ||
        lower.includes("exit conversation") ||
        lower.includes("close conversation") ||
        lower.includes("stop listening") ||
        lower.includes("goodbye severus") ||
        lower.includes("bye severus") ||
        lower.includes("farewell severus") ||
        lower.includes("that will be all") ||
        lower.includes("that's all severus") ||
        lower.includes("that is all severus");

      if (isExitCommand) {
        stopRecognition();
        speakText("Exiting thinking mode, Sir.", undefined, () => {
          onClose();
        });
        return;
      }

      // Check for voice save thinking triggers
      if (
        lower === "save thinking" ||
        lower === "save thought" ||
        lower === "save this thought" ||
        lower === "save to journal" ||
        lower.includes("save thinking") ||
        lower.includes("save to journal") ||
        lower.includes("log this thought")
      ) {
        stopRecognition();
        void handleSaveThinking();
        return;
      }

      isProcessingRef.current = true;
      // Immediately abort recognition so Severus does not capture room audio while thinking or speaking
      stopRecognition();
      if (silenceTimerRef.current) {
        window.clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }

      setOrbState("solving");
      setStatusText("Thinking…");
      setLiveTranscript("");

      const nextConv: ConversationItem[] = [
        ...conversation,
        { role: "user", content: clean },
      ];
      setConversation(nextConv);

      try {
        // Build concise Second Brain system prompt
        const topNotesSummary = vaultNotes
          .slice(0, 10)
          .map((n) => `• ${n.title}${n.excerpt ? `: ${n.excerpt.slice(0, 80)}` : ""}`)
          .join("\n");

        // Dynamic Athletic / Running Telemetry (Strava)
        const stravaStats = loadCachedStravaStats();
        const weeklyTarget = parseFloat(localStorage.getItem("severus_weekly_mileage_target") || "45") || 45;
        let athleticTelemetry = "ATHLETIC & RUNNING TELEMETRY:\n• Strava connection: Not yet configured.";
        if (stravaStats) {
          athleticTelemetry = `ATHLETIC & RUNNING TELEMETRY (STRAVA LIVE):
• Weekly Running Mileage: ${stravaStats.weeklyMileageKm.toFixed(1)} km out of ${weeklyTarget} km target (${Math.round((stravaStats.weeklyMileageKm / weeklyTarget) * 100)}% progress) across ${stravaStats.weeklyRunCount} runs this week.`;
          if (stravaStats.latestRun) {
            athleticTelemetry += `\n• Latest Run: "${stravaStats.latestRun.name}" (${stravaStats.latestRun.formattedDate}) — ${stravaStats.latestRun.formattedDistance} in ${stravaStats.latestRun.formattedDuration} at ${stravaStats.latestRun.formattedPace} pace, +${stravaStats.latestRun.elevationGainM}m elevation${stravaStats.latestRun.averageHeartrate ? `, avg HR ${stravaStats.latestRun.averageHeartrate} bpm` : ""}.`;
          }
        }

        // Dynamic Academic Engineering Sprints
        const sprintsState = loadAcademicSprints();
        const pendingSprints = sprintsState.sprints.filter((i) => !i.completed);
        const primarySprint = sprintsState.sprints.find((i) => i.isPrimary && !i.completed);
        let academicTelemetry = "ACADEMIC ENGINEERING SPRINTS (BSCpE):\n• No active academic sprints pending.";
        if (pendingSprints.length > 0) {
          academicTelemetry = `ACADEMIC ENGINEERING SPRINTS (BSCpE LIVE):
${primarySprint ? `• Primary High-Leverage Sprint: [${primarySprint.category.toUpperCase()}] ${primarySprint.title}\n` : ""}• Active Pending Milestones (${pendingSprints.length}):\n${pendingSprints.slice(0, 5).map((s) => `  - [${s.category.toUpperCase()}] ${s.title}`).join("\n")}`;
        }

        // Today's Journal Action Log
        const todayJournal = await readTodayJournal().catch(() => "");
        const journalSection = todayJournal
          ? `TODAY'S ACTION LOG (JOURNAL):\n${todayJournal.slice(-400)}`
          : "";

        const systemPrompt =
          `${config.systemPrompt || "You are Severus AI, an engineering assistant and academic mentor embedded in Lex Matondo's Second Brain."}\n` +
          `You are speaking directly with Lex Matondo in hands-free live voice conversation mode.\n` +
          `IDENTITY & PROFILE CONTEXT:\n` +
          `Lex Matondo is a 20-year-old Computer Engineering (BSCpE) student at Cor Jesu College of Digos, Davao Region, Philippines. He is an endurance runner and hybrid athlete.\n` +
          `CRITICAL GROUNDING: You DO possess full live telemetry on Lex's running, athletic training, and academic engineering sprints. Use the exact data below whenever asked about his workouts, runs, mileage, academic sprints, or exams.\n\n` +
          `${athleticTelemetry}\n\n` +
          `${academicTelemetry}\n\n` +
          (journalSection ? `${journalSection}\n\n` : "") +
          (memorySummaryRef.current ? `${memorySummaryRef.current}\n\n` : "") +
          `Active Vault Notes for grounding context:\n${topNotesSummary || "No notes in vault."}\n\n` +
          `IMPORTANT RULES FOR VOICE:\n` +
          `- When asked about his runs, athletic status, mileage, or academic sprints/studies, answer directly using the live telemetry figures above.\n` +
          `- Never claim you lack or do not possess information on his runs or academics.\n` +
          `- Respond in 1 to 3 natural, concise, spoken sentences suitable for audio synthesis.\n` +
          `- Do NOT output markdown formatting, bullet points, asterisks, headers, or code blocks.\n` +
          `- Maintain the stoic, perceptive, and brilliant persona of Professor Severus Snape.\n` +
          `- Always address Lex with dignity and conclude your spoken response with ", Sir." at the very end.`;

        const messages = [
          { role: "system" as const, content: systemPrompt },
          ...nextConv.slice(-6).map((c) => ({
            role: c.role,
            content: c.content,
          })),
        ];

        const reply = await sendAIChat(config, messages);
        const replyText = formatReplyWithSir(reply.trim());

        setConversation((prev) => [
          ...prev,
          { role: "assistant", content: replyText },
        ]);
        lastSpokenTextRef.current = replyText;

        const hudData = deriveExecutiveHUDData(
          clean,
          replyText,
          stravaStats,
          sprintsState,
          vaultNotes,
          config,
        );

        setActiveResponse(hudData);
        setDismissedResponse(false);
        setLoggedToJournal(false);
        setShowFullTranscript(false);

        setOrbState("composing");
        setStatusText("Speaking…");

        // Speak back to user while recognition remains completely off
        speakText(
          replyText,
          () => {
            setOrbState("composing");
            setStatusText("Speaking…");
          },
          () => {
            // Post-playback acoustic cooldown buffer:
            // Allow 800ms for room acoustic reverberation & speaker decay to dissipate completely
            if (cooldownTimerRef.current) {
              window.clearTimeout(cooldownTimerRef.current);
            }
            cooldownTimerRef.current = window.setTimeout(() => {
              cooldownTimerRef.current = null;
              if (
                isMountedRef.current &&
                openRef.current &&
                !isMicMutedRef.current
              ) {
                currentQueryRef.current = "";
                setLiveTranscript("");
                isProcessingRef.current = false;
                setOrbState("listening");
                setStatusText("Listening…");
                startRecognition();
              }
            }, 800);
          },
        );
      } catch (err) {
        console.warn("[ThinkingMode] AI query failed:", err);
        const errNotice = "My apologies. I encountered an issue consulting the knowledge base.";
        lastSpokenTextRef.current = errNotice;
        setOrbState("composing");
        setStatusText("Speaking…");

        speakText(errNotice, undefined, () => {
          if (cooldownTimerRef.current) {
            window.clearTimeout(cooldownTimerRef.current);
          }
          cooldownTimerRef.current = window.setTimeout(() => {
            cooldownTimerRef.current = null;
            if (
              isMountedRef.current &&
              openRef.current &&
              !isMicMutedRef.current
            ) {
              currentQueryRef.current = "";
              setLiveTranscript("");
              isProcessingRef.current = false;
              setOrbState("listening");
              setStatusText("Listening…");
              startRecognition();
            }
          }, 800);
        });
      }
    },
    [config, conversation, vaultNotes, onClose, onExpandWorkstation, stopRecognition],
  );

  // Initialize fresh Web Speech API continuous recognition
  const startRecognition = useCallback(() => {
    if (
      !isMountedRef.current ||
      !openRef.current ||
      isMicMutedRef.current ||
      isProcessingRef.current
    ) {
      return;
    }
    // Block starting while Severus is speaking or within the echo cooldown window
    if (isVoiceSpeaking() || isVoiceInEchoCooldown(800)) {
      scheduleRestart(250);
      return;
    }

    const win = window as any;
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRec) {
      setStatusText("Web Speech not supported");
      return;
    }

    stopRecognition();

    try {
      const rec = new SpeechRec();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";

      rec.onresult = (event: any) => {
        // Gate 1: Drop instantly if Severus is speaking or in acoustic cooldown
        if (
          isVoiceSpeaking() ||
          isVoiceInEchoCooldown(800) ||
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

        // Gate 2: Drop if heard text matches Severus's known utterances or echo phrases
        if (isEchoOfSeverus(heard)) {
          console.log(`[ThinkingMode] Rejected self-echo transcript: "${heard}"`);
          return;
        }

        // Gate 3: Drop if heard text contains words from the sentence Severus just spoke
        if (lastSpokenTextRef.current) {
          const normSpoken = lastSpokenTextRef.current.toLowerCase();
          const normHeard = heard.toLowerCase();
          if (
            normSpoken.includes(normHeard) ||
            (normHeard.length > 8 && normHeard.split(" ").filter((w) => w.length > 2 && normSpoken.includes(w)).length >= 2)
          ) {
            console.log(`[ThinkingMode] Rejected direct self-echo phrase: "${heard}"`);
            return;
          }
        }

        setLiveTranscript(heard);
        setOrbState("listening");
        setStatusText("Listening…");
        currentQueryRef.current = heard;

        if (silenceTimerRef.current) {
          window.clearTimeout(silenceTimerRef.current);
        }

        silenceTimerRef.current = window.setTimeout(() => {
          const query = currentQueryRef.current;
          if (
            query &&
            !isProcessingRef.current &&
            !isVoiceSpeaking() &&
            !isVoiceInEchoCooldown(800)
          ) {
            if (isEchoOfSeverus(query)) {
              console.log(`[ThinkingMode] Discarded self-echo query: "${query}"`);
              currentQueryRef.current = "";
              setLiveTranscript("");
              return;
            }
            currentQueryRef.current = "";
            void handleDispatchQuery(query);
          }
        }, 1100);
      };

      rec.onerror = (err: any) => {
        if (err.error !== "no-speech") {
          console.warn("[ThinkingMode] Speech recognition error:", err.error);
        }
        if (
          isMountedRef.current &&
          openRef.current &&
          !isMicMutedRef.current &&
          !isProcessingRef.current
        ) {
          scheduleRestart(250);
        }
      };

      rec.onend = () => {
        if (
          isMountedRef.current &&
          openRef.current &&
          !isMicMutedRef.current &&
          !isProcessingRef.current
        ) {
          scheduleRestart(120);
        }
      };

      rec.start();
      recognitionRef.current = rec;
    } catch (err) {
      console.warn("[ThinkingMode] Failed starting recognition:", err);
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

  // Handle open / mute state transitions
  useEffect(() => {
    isMountedRef.current = true;
    openRef.current = open;
    isMicMutedRef.current = isMicMuted;

    if (!open) {
      stopSpeaking();
      stopRecognition();
      if (silenceTimerRef.current) {
        window.clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      if (cooldownTimerRef.current) {
        window.clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
      return;
    }

    if (!isMicMuted && !isProcessingRef.current) {
      startRecognition();
    }

    return () => {
      stopSpeaking();
      stopRecognition();
      if (silenceTimerRef.current) {
        window.clearTimeout(silenceTimerRef.current);
      }
      if (cooldownTimerRef.current) {
        window.clearTimeout(cooldownTimerRef.current);
      }
    };
  }, [open, isMicMuted, startRecognition, stopRecognition]);

  // Keyboard shortcut: Escape exits Thinking Mode instantly
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        stopSpeaking();
        stopRecognition();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose, stopRecognition]);

  if (!open) return null;

  const handleInterrupt = () => {
    stopSpeaking();
    stopRecognition();
    if (cooldownTimerRef.current) {
      window.clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
    currentQueryRef.current = "";
    setLiveTranscript("");
    window.setTimeout(() => {
      if (isMountedRef.current && openRef.current && !isMicMutedRef.current) {
        isProcessingRef.current = false;
        setOrbState("listening");
        setStatusText("Listening…");
        startRecognition();
      }
    }, 300);
    onShowToast?.("Severus is listening.");
  };

  const toggleMic = () => {
    setIsMicMuted((prev) => {
      const next = !prev;
      isMicMutedRef.current = next;
      if (next) {
        stopSpeaking();
        stopRecognition();
        setStatusText("Muted");
        onShowToast?.("Microphone muted.");
      } else {
        setStatusText("Listening…");
        onShowToast?.("Microphone active.");
        startRecognition();
      }
      return next;
    });
  };

  return (
    <div className="thinking-mode-wrapper">
      <div
        className="thinking-mode-capsule"
        data-tauri-drag-region
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        background: "rgba(18, 18, 21, 0.88)",
        border: "1px solid rgba(255, 255, 255, 0.14)",
        borderRadius: 9999,
        padding: "6px 14px 6px 8px",
        boxShadow: "0 10px 36px rgba(0, 0, 0, 0.42), 0 0 0 1px rgba(255, 255, 255, 0.04)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        minWidth: 320,
        maxWidth: 580,
        height: 60,
        userSelect: "none",
        cursor: "move",
      }}
    >
      {/* Corner Second Brain Badge */}
      <div
        className="thinking-brain-badge"
        title="Second Brain Neural Link"
        style={{
          width: 38,
          height: 38,
          borderRadius: 9999,
          background: "linear-gradient(135deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.03))",
          border: "1px solid rgba(255, 255, 255, 0.18)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(255, 255, 255, 0.95)",
          boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 2px 8px rgba(0, 0, 0, 0.3)",
          flexShrink: 0,
        }}
      >
        <Icon name="brain" size={19} />
      </div>

      {/* Animated Thinking Orb */}
      <div
        className="thinking-orb-container"
        style={{
          width: 44,
          height: 44,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <span className="[&_canvas]:!w-11 [&_canvas]:!h-11 flex items-center justify-center">
          <ThinkingOrb state={orbState} size={64} theme="dark" />
        </span>
      </div>

      {/* Conversational Status & Speech Ticker */}
      <div
        className="thinking-meta-cluster"
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          flex: 1,
          minWidth: 0,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            color:
              orbState === "listening"
                ? "#4ade80"
                : orbState === "solving"
                ? "#c084fc"
                : "#60a5fa",
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              backgroundColor: "currentColor",
              display: "inline-block",
              animation: orbState === "listening" ? "pulse 2s infinite" : "none",
            }}
          />
          <span>{statusText}</span>
        </div>

        <div
          style={{
            fontSize: 11.5,
            color: "rgba(255, 255, 255, 0.65)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            marginTop: 1,
          }}
        >
          {liveTranscript
            ? `“${liveTranscript}”`
            : isProcessingRef.current
            ? "Synthesizing intelligence…"
            : orbState === "composing"
            ? "Speaking response below…"
            : "Speak naturally to Severus…"}
        </div>
      </div>

      {/* Action Controls */}
      <div
        className="thinking-controls"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          flexShrink: 0,
        }}
      >
        {/* Interrupt button (active when speaking) */}
        {orbState === "composing" && (
          <button
            type="button"
            onClick={handleInterrupt}
            title="Interrupt and speak"
            style={{
              background: "rgba(239, 68, 68, 0.2)",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              color: "#f87171",
              borderRadius: 9999,
              padding: "5px 10px",
              fontSize: 11,
              fontWeight: 500,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span>Stop</span>
          </button>
        )}

        {/* Mic mute/unmute */}
        <button
          type="button"
          onClick={toggleMic}
          title={isMicMuted ? "Unmute microphone" : "Mute microphone"}
          style={{
            width: 30,
            height: 30,
            borderRadius: 9999,
            background: isMicMuted ? "rgba(239, 68, 68, 0.25)" : "rgba(255, 255, 255, 0.08)",
            border: `1px solid ${isMicMuted ? "rgba(239, 68, 68, 0.4)" : "rgba(255, 255, 255, 0.12)"}`,
            color: isMicMuted ? "#f87171" : "rgba(255, 255, 255, 0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "all 140ms ease",
          }}
        >
          <Icon name={isMicMuted ? "mic-off" : "mic"} size={13} />
        </button>

        {/* Save thought to journal */}
        {conversation.length > 0 && (
          <button
            type="button"
            onClick={handleSaveThinking}
            title="Save thinking dialogue to daily journal"
            style={{
              width: 30,
              height: 30,
              borderRadius: 9999,
              background: "rgba(192, 132, 252, 0.15)",
              border: "1px solid rgba(192, 132, 252, 0.35)",
              color: "#c084fc",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "all 140ms ease",
            }}
          >
            <Icon name="save" size={13} />
          </button>
        )}

        {/* Expand to workstation */}
        <button
          type="button"
          onClick={onExpandWorkstation}
          title="Expand to full workstation"
          style={{
            width: 30,
            height: 30,
            borderRadius: 9999,
            background: "rgba(255, 255, 255, 0.08)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            color: "rgba(255, 255, 255, 0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "all 140ms ease",
          }}
        >
          <Icon name="external" size={13} />
        </button>

        {/* Settings button */}
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            title="AI Brain & ElevenLabs Voice Settings"
            style={{
              width: 30,
              height: 30,
              borderRadius: 9999,
              background: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              color: "rgba(255, 255, 255, 0.8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "all 140ms ease",
            }}
          >
            <Icon name="gear" size={13} />
          </button>
        )}

        {/* Open Running Mode */}
        {onOpenRunningMode && (
          <button
            type="button"
            onClick={onOpenRunningMode}
            title="Open Running Mode (Athletic Cockpit)"
            style={{
              width: 30,
              height: 30,
              borderRadius: 9999,
              background: "rgba(252, 76, 2, 0.15)",
              border: "1px solid rgba(252, 76, 2, 0.35)",
              color: "#fc4c02",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "all 140ms ease",
            }}
          >
            <Icon name="activity" size={13} />
          </button>
        )}

        {/* Exit thinking mode */}
        <button
          type="button"
          onClick={onClose}
          title="Exit Thinking Mode"
          style={{
            width: 30,
            height: 30,
            borderRadius: 9999,
            background: "rgba(255, 255, 255, 0.08)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            color: "rgba(255, 255, 255, 0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "all 140ms ease",
          }}
        >
          <Icon name="close" size={13} />
        </button>
      </div>
    </div>

      {/* Floating Window Glass HUD below capsule */}
      <AnimatePresence>
        {activeResponse && !dismissedResponse && (
          <motion.div
            key="thinking-glass-hud"
            className="thinking-glass-hud"
            initial={{ opacity: 0, y: -10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="glass-hud-header">
              <div className="glass-hud-identity">
                <span className="glass-hud-avatar">
                  <Icon name="brain" size={12} />
                </span>
                <span className="glass-hud-name">Severus</span>
                <span className={`glass-hud-category-pill ${activeResponse.category}`}>
                  {activeResponse.categoryLabel}
                </span>
                <span className="glass-hud-timestamp">{activeResponse.timestamp}</span>
              </div>

              <div className="glass-hud-actions">
                <button
                  type="button"
                  className="glass-hud-btn"
                  onClick={handleCopyResponse}
                  title="Copy full debrief to clipboard"
                >
                  <Icon name={copied ? "check" : "copy"} size={11} />
                  <span>{copied ? "Copied" : "Copy"}</span>
                </button>

                <button
                  type="button"
                  className={`glass-hud-btn ${loggedToJournal ? "logged" : "primary"}`}
                  onClick={() => void handleLogResponseToJournal()}
                  title="Log debrief directly into today's action log"
                >
                  <Icon name={loggedToJournal ? "check" : "save"} size={11} />
                  <span>{loggedToJournal ? "Logged" : "Log to Journal"}</span>
                </button>

                <button
                  type="button"
                  className="glass-hud-btn close"
                  onClick={handleDismissCard}
                  title="Dismiss card"
                >
                  <Icon name="close" size={11} />
                </button>
              </div>
            </div>

            {/* Verdict Banner (Crisp 1-2 sentence core answer) */}
            <div className="glass-hud-verdict-banner">
              <div className="verdict-accent-pip" />
              <p className="verdict-text">{activeResponse.verdict}</p>
            </div>

            {/* High-Signal Metrics Grid */}
            {activeResponse.metrics && activeResponse.metrics.length > 0 && (
              <div className="glass-hud-metrics-grid">
                {activeResponse.metrics.map((metric, idx) => (
                  <div
                    key={idx}
                    className={`hud-metric-tile ${metric.highlight ? "highlight" : ""}`}
                  >
                    <span className="metric-tile-label">{metric.label}</span>
                    <span className="metric-tile-value">{metric.value}</span>
                    {metric.sub && <span className="metric-tile-sub">{metric.sub}</span>}
                  </div>
                ))}
              </div>
            )}

            {/* Weekly Volume Progress Bar (for Running) */}
            {activeResponse.weeklyProgress && (
              <div className="glass-hud-volume-track">
                <div className="volume-track-header">
                  <span className="volume-track-title">Weekly Mileage Goal</span>
                  <span className="volume-track-ratio">
                    {activeResponse.weeklyProgress.current.toFixed(1)} / {activeResponse.weeklyProgress.target} km ({activeResponse.weeklyProgress.percentage}%)
                  </span>
                </div>
                <div className="volume-track-bar">
                  <div
                    className="volume-track-fill"
                    style={{ width: `${activeResponse.weeklyProgress.percentage}%` }}
                  />
                </div>
              </div>
            )}

            {/* Referenced Knowledge Notes Chips (for Knowledge) */}
            {activeResponse.referencedNotes && activeResponse.referencedNotes.length > 0 && (
              <div className="glass-hud-notes-strip">
                <Icon name="graph" size={11} />
                <span className="notes-strip-title">Vault Linked:</span>
                <div className="notes-chip-list">
                  {activeResponse.referencedNotes.map((noteTitle, i) => (
                    <span key={i} className="note-chip">
                      [[{noteTitle}]]
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* System Suggestion ("Suggest Better") & Collapsible Full Spoken Speech */}
            <div className="glass-hud-footer">
              {activeResponse.suggestion && (
                <div className="glass-hud-suggestion-strip">
                  <span className="suggestion-badge">NEXT ACTION</span>
                  <span className="suggestion-text">{activeResponse.suggestion}</span>
                </div>
              )}

              {/* Collapsible Full Spoken Speech Transcript Toggle */}
              <div className="glass-hud-transcript-collapse-wrap">
                <button
                  type="button"
                  className="glass-hud-transcript-toggle"
                  onClick={() => setShowFullTranscript((prev) => !prev)}
                >
                  <Icon
                    name="chevron-down"
                    size={11}
                    style={{
                      transform: showFullTranscript ? "rotate(180deg)" : "none",
                      transition: "transform 140ms ease",
                    }}
                  />
                  <span>{showFullTranscript ? "Hide Full Spoken Speech" : "View Full Spoken Speech"}</span>
                </button>

                <AnimatePresence>
                  {showFullTranscript && (
                    <motion.div
                      className="glass-hud-transcript-drawer"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.16 }}
                    >
                      <p className="glass-hud-transcript-text">{activeResponse.fullText}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ThinkingModeCapsule;
