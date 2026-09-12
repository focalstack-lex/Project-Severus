import { useState, useEffect, useRef, useCallback } from "react";
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
import { appendJournal } from "../lib/tauri";
import Icon from "./Icon";

export interface ThinkingModeCapsuleProps {
  open: boolean;
  onClose: () => void;
  onExpandWorkstation: () => void;
  onOpenSettings?: () => void;
  config: AIConfig;
  vaultNotes?: { id: string; title: string; excerpt?: string }[];
  onShowToast?: (msg: string) => void;
}

interface ConversationItem {
  role: "user" | "assistant";
  content: string;
}

export function ThinkingModeCapsule({
  open,
  onClose,
  onExpandWorkstation,
  onOpenSettings,
  config,
  vaultNotes = [],
  onShowToast,
}: ThinkingModeCapsuleProps) {
  const [orbState, setOrbState] = useState<OrbState>("listening");
  const [statusText, setStatusText] = useState("Listening…");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [lastSpeechPreview, setLastSpeechPreview] = useState("");
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [conversation, setConversation] = useState<ConversationItem[]>([]);

  const isMountedRef = useRef(true);
  const openRef = useRef(open);
  const isMicMutedRef = useRef(isMicMuted);
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const cooldownTimerRef = useRef<number | null>(null);
  const currentQueryRef = useRef("");
  const isProcessingRef = useRef(false);
  const lastSpokenTextRef = useRef("");

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
        lower.includes("back to workstation");

      if (isExpandCommand) {
        stopRecognition();
        speakText("Restoring workstation, Sir.", undefined, () => {
          onExpandWorkstation();
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
      setLastSpeechPreview(clean);

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

        const systemPrompt =
          `${config.systemPrompt || "You are Severus AI, an engineering assistant and academic mentor embedded in Lex Matondo's Second Brain."}\n` +
          `You are speaking directly in hands-free live voice conversation mode.\n` +
          `IMPORTANT RULES FOR VOICE:\n` +
          `- Respond in 1 to 3 natural, concise, spoken sentences.\n` +
          `- Do NOT output markdown formatting, bullet points, headers, or code blocks.\n` +
          `- Maintain the stoic, perceptive, and brilliant persona of Professor Severus Snape.\n` +
          `- Always address the user with dignity and append ", Sir." at the very end of your response.\n` +
          `Active Vault Notes for grounding context:\n${topNotesSummary || "No notes in vault."}`;

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
        setLastSpeechPreview(replyText);
        lastSpokenTextRef.current = replyText;

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
        setLastSpeechPreview(errNotice);
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
          {liveTranscript ? `“${liveTranscript}”` : lastSpeechPreview || "Speak naturally to Severus…"}
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
  );
}

export default ThinkingModeCapsule;
