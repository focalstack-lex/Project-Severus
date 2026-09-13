import {
  isVoiceSpeaking,
  isVoiceInEchoCooldown,
  isEchoOfSeverus,
} from "./voice";
import { onMicrophoneChanged, getMicrophoneStream } from "./audioDevices";

// Phonetic spelling variations recognized by Web Speech API for "Severus" (Severus Snape)
export const SEVERUS_NAME_ALIASES = [
  "severus",
  "snape",
  "severus snape",
  "professor snape",
  "severes",
  "severe us",
  "sever us",
  "server us",
  "severis",
  "sevrus",
  "several us",
  "surverus",
  "soverus",
  "syverus",
  "cyrus",
  "severous",
  "zephyrus",
  "severos",
  // Common phonetic misrecognitions across diverse accents & speech styles:
  "sewerus",
  "sewerous",
  "seweris",
  "seweras",
  "seberus",
  "seberous",
  "seberis",
  "seberos",
  "ceverus",
  "ceberus",
  "cerberus",
  "ceferus",
  "sheverus",
  "sheberus",
  "cheverus",
  "cheverous",
  "sephirus",
  "sephiroth",
  "zepherus",
  "zeprus",
  "sefirus",
  "sever",
  "severs",
  "severest",
  "severas",
  "soveris",
  "sir verus",
  "sir veris",
  "ser verus",
  "ser veris",
  "sir ferus",
  "the verus",
  "savor us",
  "save us",
  "save rus",
  "say ver us",
  "set verus",
  "seven us",
  "seve rus",
  "servus",
  "severo",
];

export const SYSTEM_OPEN_COMMANDS = [
  "open system",
  "open the system",
  "open up system",
  "wake system",
  "wake up system",
  "start system",
  "launch system",
  "show system",
  "bring up system",
  "activate system",
  "turn on system",
  "system on",
  "system online",
  "open workstation",
  "open the workstation",
  "wake workstation",
  "show workstation",
  "restore workstation",
  "open severus",
  "open severus system",
  "open snape",
  "wake severus",
  "wake up severus",
  "wake up snape",
  "open assistant",
  "wake assistant",
  "open companion",
  "wake companion",
  "open computer",
  "wake up",
  "wake up now",
  "wake",
  "rise and shine",
  "are you awake",
  "are you listening",
  "listen",
  "online",
];

export const STANDALONE_HAILS = [
  "system",
  "hey system",
  "hi system",
  "hello system",
  "ok system",
  "okay system",
  "computer",
  "hey computer",
  "hi computer",
  "hello computer",
  "assistant",
  "hey assistant",
  "hi assistant",
  "hello assistant",
  "companion",
  "hey companion",
  "hi companion",
  "hello companion",
];

export const STOP_LISTENING_KEYWORDS = [
  "stop listening",
  "stop listening mode",
  "turn off listening",
  "turn off listening mode",
  "pause listening",
  "pause listening mode",
  "disable listening",
  "mute microphone",
  "mute mic",
  "go to sleep",
  "sleep mode",
  "deafen",
  "standby",
  "standby mode",
];

export const RESUME_LISTENING_KEYWORDS = [
  "start listening",
  "start listening mode",
  "turn on listening",
  "turn on listening mode",
  "resume listening",
  "resume listening mode",
  "enable listening",
  "unmute microphone",
  "unmute mic",
  "wake up",
  "wake up now",
  "wake up severus",
  "severus wake up",
  "severus start listening",
  "severus resume listening",
  "hey severus start listening",
  "hey severus resume listening",
  "system start listening",
  "system resume listening",
  "wake system",
];

export function matchesStopListening(text: string): boolean {
  const clean = text.toLowerCase().replace(/[,.?!]/g, " ").replace(/\s+/g, " ").trim();
  return STOP_LISTENING_KEYWORDS.some((kw) => clean === kw || clean.includes(kw));
}

export function matchesResumeListening(text: string): boolean {
  const clean = text.toLowerCase().replace(/[,.?!]/g, " ").replace(/\s+/g, " ").trim();
  return RESUME_LISTENING_KEYWORDS.some((kw) => clean === kw || clean.includes(kw));
}

export function matchesWakePhrase(text: string): boolean {
  const clean = text.toLowerCase().replace(/[,.?!]/g, " ").replace(/\s+/g, " ").trim();
  if (!clean) return false;

  // 1. Explicitly reject phrases that are Severus's own speech echoes
  if (
    clean.includes("at your service") ||
    clean.includes("assist your workflow") ||
    clean.includes("how may i assist") ||
    clean.includes("up rather early") ||
    clean.includes("working late") ||
    clean === "good morning sir" ||
    clean === "good afternoon sir" ||
    clean === "good evening sir" ||
    clean === "good morning" ||
    clean === "good afternoon" ||
    clean === "good evening"
  ) {
    return false;
  }

  // 2. Explicit open system / wake commands (e.g. "open system", "wake system", "start system")
  if (SYSTEM_OPEN_COMMANDS.some((kw) => clean === kw || clean.includes(kw))) {
    return true;
  }

  // 3. Standalone system / assistant address words (e.g. user simply says "system" or "hey system")
  if (STANDALONE_HAILS.some((hail) => clean === hail)) {
    return true;
  }

  // 4. Standalone Severus name aliases (e.g. "Severus", "Hey Severus", "Hello Severus")
  const strippedOfGreetings = clean
    .replace(/^(hey|hi|hello|ok|okay|good morning|good afternoon|good evening)?\s*/i, "")
    .trim();

  if (SEVERUS_NAME_ALIASES.some((alias) => strippedOfGreetings === alias || clean === alias)) {
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
  onOpenSystem?: () => void;
  onToggleListening?: (active: boolean) => void;
  onOpenCopilot?: () => void;
  onOpenGraph?: () => void;
  onOpenNotes?: () => void;
  onOpenSearch?: () => void;
  onOpenGrounding?: () => void;
  onNewNote?: () => void;
  onJournal?: () => void;
  onOpenHome?: () => void;
  onZenMode?: () => void;
  onMaximize?: () => void;
  onFloat?: () => void;
  onClose?: () => void;
  onMoveMonitor?: (target: "left" | "right" | "next" | "primary") => void;
  onThinkingMode?: () => void;
  onSystemCommand?: (transcript: string) => void;
  onHeard?: (transcript: string, matchedAction?: string) => void;
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

interface SpeechRecognitionItem {
  transcript: string;
}

interface SpeechRecognitionResultItem {
  length: number;
  [index: number]: SpeechRecognitionItem;
}

interface SpeechRecognitionEvent {
  resultIndex?: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultItem;
  };
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
  private isPaused = false;
  private isStandby = false;
  private lastCommandTime = 0;
  private restartTimeout: number | null = null;
  private handlers: VoiceCommandHandlers;
  private unsubMic: (() => void) | null = null;

  constructor(handlers: VoiceCommandHandlers) {
    this.handlers = handlers;
    this.unsubMic = onMicrophoneChanged(() => {
      if (this.isListening && !this.isPaused) {
        this.scheduleRestart(150);
      }
    });
  }

  public updateHandlers(handlers: VoiceCommandHandlers) {
    this.handlers = handlers;
  }

  public setStandby(standby: boolean): void {
    this.isStandby = standby;
  }

  public getStandby(): boolean {
    return this.isStandby;
  }

  public setPaused(paused: boolean): void {
    if (this.isPaused === paused) return;
    this.isPaused = paused;
    if (paused) {
      if (this.restartTimeout !== null) {
        window.clearTimeout(this.restartTimeout);
        this.restartTimeout = null;
      }
      if (this.recognition) {
        try {
          this.recognition.onend = null;
          this.recognition.onerror = null;
          this.recognition.onresult = null;
          this.recognition.abort();
        } catch {
          // Ignore
        }
        this.recognition = null;
      }
    } else {
      if (this.isListening && getVoiceCmdEnabled()) {
        this.scheduleRestart(200);
      }
    }
  }

  public start(): boolean {
    this.isListening = true;
    this.isPaused = false;
    return this.initRecognition();
  }

  private scheduleRestart(delayMs = 200): void {
    if (this.restartTimeout !== null) {
      window.clearTimeout(this.restartTimeout);
    }
    this.restartTimeout = window.setTimeout(() => {
      this.restartTimeout = null;
      if (this.isListening && !this.isPaused && getVoiceCmdEnabled()) {
        this.initRecognition();
      }
    }, delayMs);
  }

  private initRecognition(): boolean {
    if (!this.isListening || this.isPaused || !getVoiceCmdEnabled()) {
      return false;
    }

    const SpeechRec = getSpeechRecognition();
    if (!SpeechRec) {
      console.warn("[VoiceCommandListener] Web Speech API is not supported in this environment.");
      return false;
    }

    // Cleanly terminate any prior instance before creating fresh one
    if (this.recognition) {
      try {
        this.recognition.onend = null;
        this.recognition.onerror = null;
        this.recognition.onresult = null;
        this.recognition.abort();
      } catch {
        // Ignored
      }
      this.recognition = null;
    }

    // Bind media stream for chosen microphone
    void getMicrophoneStream().catch(() => {});

    try {
      const rec = new SpeechRec();
      rec.continuous = true;
      rec.interimResults = false;
      rec.lang = "en-US";

      rec.onresult = (event: SpeechRecognitionEvent) => {
        // Drop audio if Severus is currently speaking or in acoustic cooldown (350ms)
        if (isVoiceSpeaking() || isVoiceInEchoCooldown(350)) {
          return;
        }

        const results = event.results;
        const lastIndex = results.length - 1;
        if (lastIndex < 0) return;

        const rawTranscript = results[lastIndex]?.[0]?.transcript;
        if (rawTranscript) {
          const cleaned = rawTranscript
            .toLowerCase()
            .replace(/[,.?!]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          if (cleaned) {
            console.log(`[VoiceCommandListener] Speech recognized transcript: "${cleaned}"`);
            this.processCommand(cleaned);
          }
        }
      };

      rec.onerror = (err) => {
        if (err.error !== "no-speech") {
          console.warn("[VoiceCommandListener] Speech recognition error:", err.error);
        }
        if (this.isListening && !this.isPaused) {
          this.scheduleRestart(400);
        }
      };

      rec.onend = () => {
        // Auto-restart continuous listening with a fresh instance after audio thread reset
        if (this.isListening && !this.isPaused) {
          this.scheduleRestart(200);
        }
      };

      rec.start();
      this.recognition = rec;
      return true;
    } catch (err) {
      console.warn("[VoiceCommandListener] Failed starting voice recognition:", err);
      // Auto-retry after a moment if device was temporarily busy
      if (this.isListening && !this.isPaused) {
        this.scheduleRestart(600);
      }
      return false;
    }
  }

  public stop(): void {
    this.isListening = false;
    this.isPaused = false;
    if (this.unsubMic) {
      this.unsubMic();
      this.unsubMic = null;
    }
    if (this.restartTimeout !== null) {
      window.clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
    if (this.recognition) {
      try {
        this.recognition.onend = null;
        this.recognition.onerror = null;
        this.recognition.onresult = null;
        this.recognition.stop();
      } catch {
        // Ignore stop errors
      }
      this.recognition = null;
    }
  }

  private processCommand(text: string): void {
    // 1. Check if Severus is currently speaking or in acoustic cooldown (350ms)
    if (isVoiceSpeaking() || isVoiceInEchoCooldown(350)) {
      return;
    }

    // 2. Filter out self-echo phrases or words spoken by Severus himself
    if (isEchoOfSeverus(text)) {
      return;
    }

    // 3. Command execution cooldown buffer (400ms)
    const now = Date.now();
    if (now - this.lastCommandTime < 400) {
      return;
    }

    console.log(`[VoiceCommandListener] Processing command: "${text}"`);

    // Priority 0A: If in Standby mode (deafened/sleep), ignore ALL regular speech and video audio!
    // ONLY explicit resume listening / wake up commands will reactivate Severus.
    if (this.isStandby) {
      if (matchesResumeListening(text)) {
        this.lastCommandTime = now;
        this.isStandby = false;
        this.handlers.onHeard?.(text, "resume listening");
        this.handlers.onToggleListening?.(true);
      }
      return;
    }

    // Priority 0B: Stop / Pause listening commands (e.g. "stop listening", "go to sleep", "mute mic")
    if (matchesStopListening(text)) {
      this.lastCommandTime = now;
      this.isStandby = true;
      this.handlers.onHeard?.(text, "stop listening");
      this.handlers.onToggleListening?.(false);
      return;
    }

    // Priority 1: Specific action intents (checked BEFORE general wake phrase so "Severus, open copilot" executes the copilot command!)
    if (
      matchesKeywords(text, [
        "new note",
        "create note",
        "create a note",
        "add note",
        "make note",
        "make a note",
        "write note",
        "take a note",
        "take note",
        "compose note",
        "draft note",
      ])
    ) {
      this.lastCommandTime = now;
      this.handlers.onHeard?.(text, "new note");
      this.handlers.onNewNote?.();
      return;
    }

    if (
      matchesKeywords(text, [
        "journal",
        "quick journal",
        "daily journal",
        "log entry",
        "log thought",
        "capture thought",
        "log journal",
        "capture journal",
        "write in journal",
        "diary",
      ])
    ) {
      this.lastCommandTime = now;
      this.handlers.onHeard?.(text, "journal");
      this.handlers.onJournal?.();
      return;
    }

    if (
      matchesKeywords(text, [
        "thinking mode",
        "start thinking",
        "enter thinking",
        "live voice chat",
        "live chat",
        "voice chat",
        "talk with severus",
        "conversation mode",
        "companion chat",
        "start conversation",
        "thinking pill",
      ])
    ) {
      this.lastCommandTime = now;
      this.handlers.onHeard?.(text, "thinking mode");
      this.handlers.onThinkingMode?.();
      return;
    }

    if (
      matchesKeywords(text, [
        "copilot",
        "co pilot",
        "co-pilot",
        "assistant",
        "ask ai",
        "open ai",
        "ask severus",
        "talk to severus",
        "chat with severus",
        "ai copilot",
        "copilot view",
      ])
    ) {
      this.lastCommandTime = now;
      this.handlers.onHeard?.(text, "copilot");
      this.handlers.onOpenCopilot?.();
      return;
    }

    if (
      matchesKeywords(text, [
        "search",
        "find note",
        "search note",
        "palette",
        "command palette",
        "quick switcher",
        "switcher",
        "finder",
        "lookup",
      ])
    ) {
      this.lastCommandTime = now;
      this.handlers.onHeard?.(text, "search");
      this.handlers.onOpenSearch?.();
      return;
    }

    if (
      matchesKeywords(text, [
        "grounding",
        "assembler",
        "context assembler",
        "context grounding",
        "agent grounding",
        "ground context",
      ])
    ) {
      this.lastCommandTime = now;
      this.handlers.onHeard?.(text, "grounding");
      this.handlers.onOpenGrounding?.();
      return;
    }

    if (
      matchesKeywords(text, [
        "graph",
        "knowledge graph",
        "knowledge map",
        "mind map",
        "show graph",
        "open graph",
        "visualization",
        "network",
      ])
    ) {
      this.lastCommandTime = now;
      this.handlers.onHeard?.(text, "knowledge graph");
      this.handlers.onOpenGraph?.();
      return;
    }

    if (
      matchesKeywords(text, [
        "notes",
        "open notes",
        "show notes",
        "note vault",
        "vault",
        "explorer",
        "notes drawer",
        "all notes",
        "my notes",
      ])
    ) {
      this.lastCommandTime = now;
      this.handlers.onHeard?.(text, "notes");
      this.handlers.onOpenNotes?.();
      return;
    }

    if (
      matchesKeywords(text, [
        "home",
        "dashboard",
        "main view",
        "overview",
        "front page",
        "welcome view",
      ])
    ) {
      this.lastCommandTime = now;
      this.handlers.onHeard?.(text, "home");
      this.handlers.onOpenHome?.();
      return;
    }

    if (
      matchesKeywords(text, [
        "zen mode",
        "zen",
        "focus mode",
        "distraction free",
        "pure focus",
      ])
    ) {
      this.lastCommandTime = now;
      this.handlers.onHeard?.(text, "zen mode");
      this.handlers.onZenMode?.();
      return;
    }

    if (
      (() => {
        // "maximize chrome" names a target window → system grammar.
        const named = /^(maximize|restore|unminimize|enlarge)\s+(the\s+)?(\S+)/.exec(text);
        const inAppTargets = ["window", "it", "this", "that", "severus", "view", "workstation", "screen"];
        const isNamedAppMaximize = named !== null && !inAppTargets.includes(named[3]);
        return (
          !isNamedAppMaximize &&
          matchesKeywords(text, [
            "maximize",
            "maximize window",
            "maximize screen",
            "full screen",
            "fullscreen",
            "full screen window",
            "fullscreen window",
            "go full screen",
            "enter full screen",
            "make it full screen",
            "make full screen",
            "toggle full screen",
            "toggle fullscreen",
            "full screen mode",
            "fullscreen mode",
            "enlarge",
            "unminimize",
            "restore window",
            "open workstation",
            "expand window",
            "expand workstation",
            "full size",
          ])
        );
      })()
    ) {
      this.lastCommandTime = now;
      this.handlers.onHeard?.(text, "maximize");
      this.handlers.onMaximize?.();
      return;
    }

    if (
      matchesKeywords(text, [
        "float",
        "floating",
        "companion",
        "desktop pill",
        "pill mode",
        "floating pill",
        "compact mode",
        "switch to pill",
      ])
    ) {
      this.lastCommandTime = now;
      this.handlers.onHeard?.(text, "floating mode");
      this.handlers.onFloat?.();
      return;
    }

    if (
      matchesKeywords(text, [
        "left monitor",
        "left screen",
        "left display",
        "move to left",
        "move left",
        "put in left monitor",
        "put in left",
        "put on left",
        "switch to left",
        "place on left",
        "go to left monitor",
        "send to left",
      ])
    ) {
      this.lastCommandTime = now;
      this.handlers.onHeard?.(text, "left monitor");
      this.handlers.onMoveMonitor?.("left");
      return;
    }

    if (
      matchesKeywords(text, [
        "right monitor",
        "right screen",
        "right display",
        "move to right",
        "move right",
        "put in right monitor",
        "put in right",
        "put on right",
        "switch to right",
        "place on right",
        "go to right monitor",
        "send to right",
      ])
    ) {
      this.lastCommandTime = now;
      this.handlers.onHeard?.(text, "right monitor");
      this.handlers.onMoveMonitor?.("right");
      return;
    }

    if (
      matchesKeywords(text, [
        "next monitor",
        "switch monitor",
        "switch screen",
        "switch places",
        "change monitor",
        "other monitor",
        "other screen",
        "cycle monitor",
        "next screen",
        "next display",
        "move monitor",
      ])
    ) {
      this.lastCommandTime = now;
      this.handlers.onHeard?.(text, "switch monitor");
      this.handlers.onMoveMonitor?.("next");
      return;
    }

    if (
      matchesKeywords(text, [
        "primary monitor",
        "main monitor",
        "main screen",
        "main display",
        "primary screen",
        "center monitor",
        "home screen",
      ])
    ) {
      this.lastCommandTime = now;
      this.handlers.onHeard?.(text, "primary monitor");
      this.handlers.onMoveMonitor?.("primary");
      return;
    }

    if (
      (() => {
        // "close chrome" names an app → belongs to the system grammar, not
        // the in-app close (which dismisses dialogs / hides to tray).
        const named = /^(close|quit|kill)\s+(the\s+)?(\S+)/.exec(text);
        const inAppTargets = [
          "it", "this", "that", "all", "them", "everything", "severus", "views", "dialogs",
          "modals", "overlays", "popovers", "window", "windows",
        ];
        const isNamedAppClose = named !== null && !inAppTargets.includes(named[3]);
        return (
          !isNamedAppClose &&
          matchesKeywords(text, [
            "close",
            "cancel",
            "dismiss",
            "exit to tray",
            "hide window",
            "hide to tray",
            "minimize to tray",
            "tray",
          ])
        );
      })()
    ) {
      this.lastCommandTime = now;
      this.handlers.onHeard?.(text, "close");
      this.handlers.onClose?.();
      return;
    }

    // Priority 2: Explicit Open System Commands vs General Wake Phrases
    const isExplicitOpen = SYSTEM_OPEN_COMMANDS.some((kw) => text === kw || text.includes(kw));
    if (isExplicitOpen) {
      this.lastCommandTime = now;
      this.handlers.onHeard?.(text, "open system");
      if (this.handlers.onOpenSystem) {
        this.handlers.onOpenSystem();
      } else {
        this.handlers.onWakePhrase?.();
      }
      return;
    }

    if (matchesWakePhrase(text)) {
      this.lastCommandTime = now;
      this.handlers.onHeard?.(text, "wake phrase");
      this.handlers.onWakePhrase?.();
      return;
    }

    // Strip conversational wake prefixes: "hey severus", "system", "okay system", "hey computer", "please"
    const prefixRegex =
      /^(hey|hi|hello|ok|okay|good morning|good afternoon|good evening)?\s*(severus|professor snape|snape|system|computer|assistant|companion|server|sewerus|seberus|severis)\s*,?\s*/i;
    const strippedText = text
      .replace(prefixRegex, "")
      .replace(/^please\s+/i, "")
      .trim();

    // Priority 3: system-control grammar — verb-led phrases (e.g. "open opera", "close chrome")
    const SYSTEM_VERB_PREFIX =
      /^(open|launch|start|run|snap|switch to|focus|bring|go to|close|quit|kill|maximize|restore|unminimize|minimize|volume|mute|unmute|louder|quieter|play|pause|resume|stop the|skip|screenshot|screen capture|clipboard|read clipboard|lock|list windows|show windows|what windows|which windows|window list|open windows|minimize all|show desktop|take a shot|next (track|song|desktop)|previous (track|song|desktop)|back a song)\b/;

    if (
      this.handlers.onSystemCommand &&
      (SYSTEM_VERB_PREFIX.test(text) || (strippedText.length > 0 && SYSTEM_VERB_PREFIX.test(strippedText)))
    ) {
      const targetCmd = strippedText.length > 0 && SYSTEM_VERB_PREFIX.test(strippedText) ? strippedText : text;
      this.lastCommandTime = now;
      this.handlers.onHeard?.(text, "system command");
      this.handlers.onSystemCommand(targetCmd);
      return;
    }

    // Priority 4: Wake Phrase on stripped text (if user said e.g. "please open system")
    if (strippedText.length > 0 && matchesWakePhrase(strippedText)) {
      this.lastCommandTime = now;
      this.handlers.onHeard?.(text, "wake phrase");
      this.handlers.onWakePhrase?.();
      return;
    }

    // Fallback: notify that phrase was heard even if no command was matched
    this.handlers.onHeard?.(text, undefined);
  }
}
