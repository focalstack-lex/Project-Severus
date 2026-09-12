import { getTimeSinceVoicePlayback, isVoiceSpeaking } from "./voice";

const SEVERUS_ECHO_PHRASES = [
  "how may i assist",
  "assist your workflow",
  "knowledge copilot online",
  "command palette active",
  "agent grounding assembler engaged",
  "accessing your knowledge vault",
  "focus mode activated",
  "visualizing knowledge graph",
  "good morning",
  "good afternoon",
  "good evening",
  "journal entry logged",
  "committed to vault",
  "launched in vs code",
];

// Phonetic spelling variations recognized by Web Speech API for "Severus"
const SEVERUS_NAME_ALIASES = [
  "severus",
  "severes",
  "severe us",
  "sever us",
  "server us",
  "severis",
  "sevrus",
  "several us",
  "severe",
  "service",
  "surverus",
  "soverus",
  "syverus",
  "cyrus",
  "severed",
];

function matchesWakePhrase(text: string): boolean {
  if (SEVERUS_NAME_ALIASES.some((alias) => text.includes(alias))) {
    return true;
  }
  if (
    text.includes("wake up") ||
    text.includes("open up") ||
    text.includes("hello severus") ||
    text.includes("hi severus")
  ) {
    return true;
  }
  return false;
}

function matchesKeywords(text: string, keywords: string[]): boolean {
  return keywords.some((kw) => text.includes(kw));
}

/**
 * 100% Free Hands-Free Voice Command Engine using native Web Speech API.
 */

export interface VoiceCommandHandlers {
  onWakePhrase?: () => void;
  onOpenCopilot?: () => void;
  onOpenSearch?: () => void;
  onOpenGrounding?: () => void;
  onOpenNotes?: () => void;
  onNewNote?: () => void;
  onJournal?: () => void;
  onZenMode?: () => void;
  onClose?: () => void;
}

export function setVoiceCmdEnabled(enabled: boolean) {
  localStorage.setItem("severus_voice_cmd_enabled", JSON.stringify(enabled));
}

export function getVoiceCmdEnabled(): boolean {
  const stored = localStorage.getItem("severus_voice_cmd_enabled");
  if (stored !== null) {
    try {
      return JSON.parse(stored) as boolean;
    } catch {
      return true;
    }
  }
  return true;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEvent {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
    };
  };
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

export class VoiceCommandListener {
  private recognition: SpeechRecognitionInstance | null = null;
  private isListening = false;
  private lastCommandTime = 0;
  private handlers: VoiceCommandHandlers;

  constructor(handlers: VoiceCommandHandlers) {
    this.handlers = handlers;
  }

  public start(): boolean {
    if (this.isListening) return true;
    if (!getVoiceCmdEnabled()) return false;

    const SpeechRec = getSpeechRecognition();
    if (!SpeechRec) {
      console.warn("[VoiceCommandListener] Web Speech API is not supported in this environment.");
      return false;
    }

    try {
      this.recognition = new SpeechRec();
      this.recognition.continuous = true;
      this.recognition.interimResults = false;
      this.recognition.lang = "en-US";

      this.recognition.onresult = (event: SpeechRecognitionEvent) => {
        const lastIndex = (event.results as unknown as Array<unknown>).length - 1;
        if (lastIndex < 0) return;
        const transcript = event.results[lastIndex]?.[0]?.transcript?.trim().toLowerCase();
        if (transcript) {
          console.log(`[VoiceCommandListener] Speech recognized transcript: "${transcript}"`);
          this.processCommand(transcript);
        }
      };

      this.recognition.onerror = (err) => {
        if (err.error !== "no-speech") {
          console.warn("[VoiceCommandListener] Speech recognition error:", err.error);
        }
      };

      this.recognition.onend = () => {
        // Auto-restart continuous listening if still enabled
        if (this.isListening) {
          try {
            this.recognition?.start();
          } catch {
            // Ignore restart collisions
          }
        }
      };

      this.recognition.start();
      this.isListening = true;
      return true;
    } catch (err) {
      console.warn("[VoiceCommandListener] Failed starting voice recognition:", err);
      this.isListening = false;
      return false;
    }
  }

  public stop(): void {
    this.isListening = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // Ignore stop errors
      }
      this.recognition = null;
    }
  }

  private processCommand(text: string): void {
    // 1. Check if Severus is currently speaking or spoke recently (<1.0s)
    if (isVoiceSpeaking() || getTimeSinceVoicePlayback() < 1000) {
      return;
    }

    // 2. Filter out self-echo phrases spoken by Severus himself
    if (SEVERUS_ECHO_PHRASES.some((phrase) => text.includes(phrase))) {
      return;
    }

    // 3. Command execution cooldown buffer (1.2s)
    const now = Date.now();
    if (now - this.lastCommandTime < 1200) {
      return;
    }

    console.log(`[VoiceCommandListener] Matched voice command for: "${text}"`);

    if (matchesWakePhrase(text)) {
      this.lastCommandTime = now;
      this.handlers.onWakePhrase?.();
    } else if (matchesKeywords(text, ["copilot", "co pilot", "co-pilot", "assistant"])) {
      this.lastCommandTime = now;
      this.handlers.onOpenCopilot?.();
    } else if (matchesKeywords(text, ["search", "palette", "command", "find", "lookup"])) {
      this.lastCommandTime = now;
      this.handlers.onOpenSearch?.();
    } else if (matchesKeywords(text, ["grounding", "assembler", "context", "agent"])) {
      this.lastCommandTime = now;
      this.handlers.onOpenGrounding?.();
    } else if (matchesKeywords(text, ["notes", "explorer", "drawer", "sidebar", "vault"])) {
      this.lastCommandTime = now;
      this.handlers.onOpenNotes?.();
    } else if (matchesKeywords(text, ["new note", "create note", "add note", "make note"])) {
      this.lastCommandTime = now;
      this.handlers.onNewNote?.();
    } else if (matchesKeywords(text, ["journal", "quick journal", "log", "capture"])) {
      this.lastCommandTime = now;
      this.handlers.onJournal?.();
    } else if (matchesKeywords(text, ["zen", "focus", "full screen", "fullscreen"])) {
      this.lastCommandTime = now;
      this.handlers.onZenMode?.();
    } else if (matchesKeywords(text, ["close", "cancel", "exit", "hide", "dismiss"])) {
      this.lastCommandTime = now;
      this.handlers.onClose?.();
    }
  }
}
