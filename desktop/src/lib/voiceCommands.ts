import {
  isVoiceSpeaking,
  isVoiceInEchoCooldown,
  isEchoOfSeverus,
} from "./voice";
import { onMicrophoneChanged } from "./audioDevices";
import {
  voiceDiagRecord,
  voiceDiagFatalRecognitionError,
  voiceDiagIsFatalRecognitionError,
} from "./voiceDiagnostics";
import {
  applySpeechEngine,
  getSpeechRecognitionCtor,
  recoverSpeechEngine,
  refreshSpeechEngineStatus,
  type SpeechRecognitionCtor as SpeechRecognitionConstructor,
  type SpeechRecognitionEventLike as SpeechRecognitionEvent,
  type SpeechRecognitionInstance,
} from "./speechEngine";
import { checkSttServer, LocalSpeechRecognizer } from "./localSpeechRecognizer";

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

export const STANDALONE_HAILS = [  "system",
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

function normalizeVoiceText(text: string): string {
  return text.toLowerCase().replace(/[,.?!]/g, " ").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Leading address words, including the spellings recognizers actually produce.
 * The offline Whisper model renders "Severus" as "Severe us", so these have to
 * keep pace with {@link SEVERUS_NAME_ALIASES} rather than being guessed.
 */
const WAKE_PREFIX_ALIASES = [
  "professor snape",
  "severe us",
  "several us",
  "sever us",
  "server us",
  "severeus",
  "severous",
  "severus",
  "severis",
  "sevrus",
  "severos",
  "sewerus",
  "seberus",
  "ceverus",
  "cerberus",
  "snape",
  "system",
  "computer",
  "assistant",
  "companion",
];

const WAKE_PREFIX_REGEX = new RegExp(
  `^(?:hey|hi|hello|ok|okay|good morning|good afternoon|good evening)?\\s*(?:${WAKE_PREFIX_ALIASES.map(escapeRegExp).join("|")})\\s*,?\\s*`,
  "i",
);

/**
 * Remove a leading greeting and address word ("hey severus,", "system", ...).
 * Over-stripping is harmless because command matching tests both the raw and the
 * stripped transcript.
 */
export function stripWakePrefix(text: string): string {
  return text.replace(WAKE_PREFIX_REGEX, "").replace(/^please\s+/i, "").trim();
}

/**
 * Microphone-directed mute phrasing. Anchored on purpose: a generic audio mute
 * ("mute the volume", "mute spotify", "unmute") must reach the OS system-command
 * grammar instead of switching the recognizer off.
 */
const MIC_MUTE_PATTERNS: RegExp[] = [
  /^(?:please\s+)?(?:mute|silence|stop|disable|turn off|kill)\s+(?:your\s+|the\s+)?(?:mic|microphone|microphone input|listening|listening mode)\b/,
  /^(?:stop|pause|disable|turn off)\s+listening(?:\s+mode)?$/,
  /^(?:go to sleep|sleep mode|deafen|deafened|standby|standby mode)$/,
];

/** Mirror of {@link MIC_MUTE_PATTERNS} for restoring the microphone. */
const MIC_UNMUTE_PATTERNS: RegExp[] = [
  /^(?:please\s+)?(?:unmute|un-mute|resume|restore|re-?enable|enable|turn on|start)\s+(?:your\s+|the\s+)?(?:mic|microphone|microphone input|listening|listening mode)\b/,
  /^(?:start|resume|enable|turn on)\s+listening(?:\s+mode)?$/,
  /^(?:wake up|wake up now|are you awake|are you listening)$/,
];

/** True only for explicit microphone-mute phrasing (never for audio volume mute). */
export function matchesMicMuteCommand(text: string): boolean {
  const clean = normalizeVoiceText(text);
  if (!clean) return false;
  return MIC_MUTE_PATTERNS.some((pattern) => pattern.test(clean));
}

/** True only for explicit microphone-resume phrasing. */
export function matchesMicUnmuteCommand(text: string): boolean {
  const clean = normalizeVoiceText(text);
  if (!clean) return false;
  return MIC_UNMUTE_PATTERNS.some((pattern) => pattern.test(clean));
}

export function matchesStopListening(text: string): boolean {
  const clean = normalizeVoiceText(text);
  return (
    STOP_LISTENING_KEYWORDS.some((kw) => clean === kw || clean.includes(kw)) ||
    matchesMicMuteCommand(clean)
  );
}

export function matchesResumeListening(text: string): boolean {
  const clean = normalizeVoiceText(text);
  return (
    RESUME_LISTENING_KEYWORDS.some((kw) => clean === kw || clean.includes(kw)) ||
    matchesMicUnmuteCommand(clean)
  );
}

export function matchesWakePhrase(text: string): boolean {
  const clean = normalizeVoiceText(text);
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

  // 2. Explicit open system / wake commands (e.g. "open system", "wake system", "start system").
  // Single generic tokens ("wake", "listen", "online") must stand alone, otherwise any
  // sentence merely containing them would read as a wake phrase.
  if (SYSTEM_OPEN_COMMANDS.some((kw) => clean === kw)) {
    return true;
  }
  if (SYSTEM_OPEN_COMMANDS.some((kw) => kw.includes(" ") && clean.includes(kw))) {
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
  onHideToTray?: () => void;
  onGeneralQuery?: (query: string) => void;
  onMoveMonitor?: (target: "left" | "right" | "next" | "primary") => void;
  onThinkingMode?: () => void;
  onStravaStatus?: () => void;
  onOpenRunningMode?: () => void;
  onCheckEmail?: () => void;
  onCheckClassroom?: () => void;
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

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  return getSpeechRecognitionCtor();
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
  private consecutiveEngineFailures = 0;
  private engineUnavailableNotified = false;
  private localRecognizer: LocalSpeechRecognizer | null = null;
  private engineMode: "pending" | "local" | "webspeech" = "pending";

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
      this.stopWebSpeech();
      void this.stopLocalRecognition();
    } else {
      if (this.isListening && getVoiceCmdEnabled()) {
        if (this.engineMode === "local") {
          this.startLocalRecognition();
        } else {
          this.scheduleRestart(200);
        }
      }
    }
  }

  public start(): boolean {
    this.isListening = true;
    this.isPaused = false;
    // Probe the runtime's available engines up front so the first recognizer
    // already knows which one to use.
    void refreshSpeechEngineStatus();
    void this.selectEngine();
    return this.initRecognition();
  }

  /**
   * Prefer the local offline bridge when it is running. The Web Speech path stays
   * as the fallback for environments that do have a working speech service.
   */
  private async selectEngine(): Promise<void> {
    const health = await checkSttServer();
    const useLocal = health.online && health.backendAvailable !== false;
    const previous = this.engineMode;
    this.engineMode = useLocal ? "local" : "webspeech";

    if (previous === this.engineMode) return;

    voiceDiagRecord(
      "listener",
      useLocal ? "engine:local-bridge" : "engine:webspeech",
      useLocal ? `${health.engine} model=${health.model}` : health.detail || "local bridge offline",
    );

    if (!this.isListening || this.isPaused) return;

    // Swap onto the newly selected engine.
    if (useLocal) {
      this.stopWebSpeech();
      this.startLocalRecognition();
    } else {
      void this.stopLocalRecognition();
      this.initRecognition();
    }
  }

  private stopWebSpeech(): void {
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
        // ignore
      }
      this.recognition = null;
    }
  }

  private startLocalRecognition(): boolean {
    if (this.localRecognizer?.isRunning()) return true;

    const recognizer = new LocalSpeechRecognizer({
      // Never capture or transcribe Severus's own speech coming back through the
      // speakers: that is wasted CPU and a source of self-triggered commands.
      shouldIgnoreAudio: () => isVoiceSpeaking() || isVoiceInEchoCooldown(200),
      onTranscript: (text) => {
        const cleaned = text.toLowerCase().replace(/[,.?!]/g, " ").replace(/\s+/g, " ").trim();
        if (!cleaned) return;
        if (isVoiceSpeaking() || isVoiceInEchoCooldown(350)) {
          voiceDiagRecord("listener", "drop:self-echo-window", cleaned);
          return;
        }
        voiceDiagRecord("listener", "transcript", cleaned);
        this.processCommand(cleaned);
      },
      onStatus: (message) => {
        console.warn(`[VoiceCommandListener] ${message}`);
      },
    });

    this.localRecognizer = recognizer;
    void recognizer.start().then((ok) => {
      if (ok) return;
      // Capture failed: fall back rather than leaving voice silently dead.
      this.localRecognizer = null;
      if (this.isListening && !this.isPaused && getVoiceCmdEnabled()) {
        this.engineMode = "webspeech";
        voiceDiagRecord("listener", "engine:local-capture-failed", "falling back to the standard engine", "warn");
        this.initRecognition();
      }
    });
    return true;
  }

  private async stopLocalRecognition(): Promise<void> {
    const recognizer = this.localRecognizer;
    this.localRecognizer = null;
    if (recognizer) {
      await recognizer.stop();
    }
  }

  /**
   * The standard engine could not reach a speech service. WebView2 has none, so
   * re-probe capabilities, pull the on-device model, and report plainly when this
   * window truly has no engine rather than looping in silence.
   */
  private handleEngineFailure(lang: string): void {
    // A network failure is the signature of a runtime with no speech service, so
    // first check whether the local offline bridge can take over.
    void checkSttServer().then((health) => {
      if (health.online && health.backendAvailable !== false) {
        voiceDiagRecord("listener", "engine:local-bridge-available", `${health.engine} model=${health.model}`);
        this.engineMode = "local";
        if (this.isListening && !this.isPaused) {
          this.stopWebSpeech();
          this.startLocalRecognition();
        }
        return;
      }

      void recoverSpeechEngine(lang).then((recovery) => {
        if (recovery.retryNow) {
          voiceDiagRecord("listener", "engine:recovered", recovery.reason);
          if (this.isListening && !this.isPaused) {
            this.scheduleRestart(150);
          }
          return;
        }

        if (recovery.installable) {
          voiceDiagRecord("listener", "engine:awaiting-on-device-model", recovery.reason, "warn");
          return;
        }

        if (!this.engineUnavailableNotified) {
          this.engineUnavailableNotified = true;
          voiceDiagRecord("listener", "engine:none-available", recovery.reason, "error");
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("severus-toast", {
                detail: "No speech engine available. Start the offline voice bridge to enable listening.",
              }),
            );
          }
        }
      });
    });
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

    if (this.engineMode === "local") {
      return this.startLocalRecognition();
    }

    const SpeechRec = getSpeechRecognition();
    if (!SpeechRec) {
      console.warn("[VoiceCommandListener] Web Speech API is not supported in this environment.");
      voiceDiagRecord("listener", "api-missing", "webspeech recognition unavailable", "error");
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

    try {
      const rec = new SpeechRec();
      rec.continuous = true;
      rec.interimResults = false;
      rec.lang = "en-US";

      // WebView2 has no cloud speech service, so the standard engine fails with a
      // network error forever. Prefer fully on-device recognition when the runtime
      // offers it, downloading the model if it is only available for download.
      const strategy = applySpeechEngine(rec, rec.lang);
      voiceDiagRecord(
        "listener",
        strategy.useLocal ? "engine:on-device" : "engine:standard",
        strategy.reason,
      );

      rec.onresult = (event: SpeechRecognitionEvent) => {
        // Drop audio if Severus is currently speaking or in acoustic cooldown (350ms)
        if (isVoiceSpeaking() || isVoiceInEchoCooldown(350)) {
          voiceDiagRecord("listener", "drop:self-echo-window");
          return;
        }

        this.consecutiveEngineFailures = 0;

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
            voiceDiagRecord("listener", "transcript", cleaned);
            this.processCommand(cleaned);
          }
        }
      };

      rec.onerror = (err) => {
        const errorType = err.error || "unknown";
        if (errorType !== "no-speech" && errorType !== "network" && errorType !== "aborted") {
          console.warn("[VoiceCommandListener] Speech recognition error:", errorType);
        }
        // Recorded for every type, including the ones that used to be swallowed:
        // an unlogged failure is the reason earlier voice fixes were unverifiable.
        voiceDiagFatalRecognitionError("listener", errorType);
        this.recognition = null;

        if (errorType === "network") {
          this.consecutiveEngineFailures += 1;
          this.handleEngineFailure(rec.lang);
        }

        if (this.isListening && !this.isPaused && getVoiceCmdEnabled()) {
          // Network failures used to retry every three seconds forever, which
          // burned cycles without ever succeeding. Back off instead.
          const baseDelay = voiceDiagIsFatalRecognitionError(errorType) ? 4000 : errorType === "network" ? 3000 : 350;
          const delay =
            errorType === "network"
              ? Math.min(baseDelay * Math.pow(2, Math.min(this.consecutiveEngineFailures - 1, 3)), 30000)
              : baseDelay;
          voiceDiagRecord("listener", "restart-scheduled", `${errorType} in ${delay}ms`);
          this.scheduleRestart(delay);
        }
      };

      rec.onend = () => {
        this.recognition = null;
        // Auto-restart continuous listening with a fresh instance after audio thread reset
        if (this.isListening && !this.isPaused && getVoiceCmdEnabled()) {
          voiceDiagRecord("listener", "session-ended-restart");
          this.scheduleRestart(250);
        }
      };

      rec.start();
      this.recognition = rec;
      voiceDiagRecord("listener", "recognition-started");
      return true;
    } catch (err) {
      console.warn("[VoiceCommandListener] Failed starting voice recognition:", err);
      voiceDiagRecord("listener", "start-failed", String(err), "error");
      this.recognition = null;
      // Auto-retry after a moment if device was temporarily busy
      if (this.isListening && !this.isPaused && getVoiceCmdEnabled()) {
        this.scheduleRestart(800);
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
    this.stopWebSpeech();
    void this.stopLocalRecognition();
  }

  private processCommand(text: string): void {
    // 1. Check if Severus is currently speaking or in acoustic cooldown (350ms)
    if (isVoiceSpeaking() || isVoiceInEchoCooldown(350)) {
      voiceDiagRecord("listener", "drop:self-echo-window", text);
      return;
    }

    // 2. Filter out self-echo phrases or words spoken by Severus himself
    if (isEchoOfSeverus(text)) {
      voiceDiagRecord("listener", "drop:echo-of-severus", text);
      return;
    }

    // 3. Command execution cooldown buffer (400ms)
    const now = Date.now();
    if (now - this.lastCommandTime < 400) {
      voiceDiagRecord("listener", "drop:command-cooldown", text);
      return;
    }

    console.log(`[VoiceCommandListener] Processing command: "${text}"`);

    // Priority 0A: If in Standby mode (deafened/sleep), ignore regular speech
    if (this.isStandby) {
      if (matchesResumeListening(text)) {
        this.lastCommandTime = now;
        this.isStandby = false;
        voiceDiagRecord("listener", "standby-resumed", text);
        this.handlers.onHeard?.(text, "resume listening");
        this.handlers.onToggleListening?.(true);
      } else {
        voiceDiagRecord("listener", "drop:standby", text);
      }
      return;
    }

    // Priority 0B: Stop / Pause listening commands
    if (matchesStopListening(text)) {
      this.lastCommandTime = now;
      this.isStandby = true;
      voiceDiagRecord("listener", "standby-entered", text);
      this.handlers.onHeard?.(text, "stop listening");
      this.handlers.onToggleListening?.(false);
      return;
    }

    // Strip conversational wake prefixes: "hey severus", "system", "okay system", "hey computer", "please"
    const strippedText = stripWakePrefix(text);

    const targetText = strippedText.length > 0 ? strippedText : text;
    const checkMatch = (keywords: string[]) => matchesKeywords(text, keywords) || (strippedText.length > 0 && matchesKeywords(strippedText, keywords));

    // Priority 1: Specific action intents
    if (
      checkMatch([
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
      checkMatch([
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
      checkMatch([
        "training block",
        "training blocks",
        "my training block",
        "my training blocks",
        "current training block",
        "workout block",
        "running block",
      ])
    ) {
      this.lastCommandTime = now;
      this.handlers.onHeard?.(text, "training block");
      this.handlers.onGeneralQuery?.(targetText);
      return;
    }

    if (
      checkMatch([
        "strava",
        "running status",
        "run status",
        "running mileage",
        "weekly mileage",
        "how much did i run",
        "running stats",
        "running telemetry",
        "sync strava",
        "my runs",
      ])
    ) {
      this.lastCommandTime = now;
      this.handlers.onHeard?.(text, "strava status");
      this.handlers.onStravaStatus?.();
      return;
    }

    if (
      checkMatch([
        "open running mode",
        "start running mode",
        "running mode",
        "open running dashboard",
        "show running mode",
        "launch running mode",
        "running cockpit",
        "open running cockpit",
      ])
    ) {
      this.lastCommandTime = now;
      this.handlers.onHeard?.(text, "open running mode");
      this.handlers.onOpenRunningMode?.();
      return;
    }

    if (
      checkMatch([
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
        "hologram mode",
        "holographic mode",
        "reactor mode",
        "open dynamic island",
        "dynamic island",
        "open island",
        "jarvis mode",
        "open jarvis",
      ])
    ) {
      this.lastCommandTime = now;
      this.handlers.onHeard?.(text, "thinking mode");
      this.handlers.onThinkingMode?.();
      return;
    }

    if (
      checkMatch([
        "copilot",
        "co pilot",
        "co-pilot",
        "open copilot",
        "open the copilot",
        "show copilot",
        "launch copilot",
        "start copilot",
        "bring up copilot",
        "switch to copilot",
        "go to copilot",
        "ai copilot",
        "open ai copilot",
        "copilot view",
        "ask ai",
        "open ai",
        "ask severus",
        "talk to severus",
        "chat with severus",
        "assistant",
        "open assistant",
      ])
    ) {
      this.lastCommandTime = now;
      this.handlers.onHeard?.(text, "copilot");
      this.handlers.onOpenCopilot?.();
      return;
    }

    if (
      (() => {
        const webSearch = /^(search|google|youtube|bing|duckduckgo|ddg|wikipedia|wiki|github|look up)\s+(for\s+)?(\S.*)$/.exec(targetText);
        if (!webSearch) return false;
        const target = webSearch[3].trim().toLowerCase();
        const vaultVocab = ["note", "notes", "my notes", "the vault", "vault", "graph"];
        return !vaultVocab.some((vocab) => target.startsWith(vocab));
      })()
    ) {
      this.lastCommandTime = now;
      this.handlers.onHeard?.(text, "web search");
      this.handlers.onSystemCommand?.(targetText);
      return;
    }

    if (
      checkMatch([
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
      checkMatch([
        "check my email",
        "check email",
        "any new emails",
        "any new email",
        "new school email",
        "school mail",
        "read my email",
        "check my school mail",
        "check school mail",
        "email updates",
      ])
    ) {
      this.lastCommandTime = now;
      this.handlers.onHeard?.(text, "check email");
      this.handlers.onCheckEmail?.();
      return;
    }

    if (
      checkMatch([
        "whats due",
        "what is due",
        "due this week",
        "due soon",
        "assignments due",
        "assignment due",
        "missing work",
        "missing assignments",
        "am i missing",
        "any announcements",
        "classroom updates",
        "check my classroom",
        "check classroom",
        "my classes",
        "my courses",
        "what classes",
      ])
    ) {
      this.lastCommandTime = now;
      this.handlers.onHeard?.(text, "classroom");
      this.handlers.onCheckClassroom?.();
      return;
    }

    if (
      checkMatch([
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
      checkMatch([
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
      checkMatch([
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
      checkMatch([
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
      checkMatch([
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
        const named = /^(maximize|restore|unminimize|enlarge)\s+(the\s+)?(\S+)/.exec(targetText);
        const inAppTargets = ["window", "it", "this", "that", "severus", "view", "workstation", "screen"];
        const isNamedAppMaximize = named !== null && !inAppTargets.includes(named[3]);
        return (
          !isNamedAppMaximize &&
          checkMatch([
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
      checkMatch([
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
      checkMatch([
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
      checkMatch([
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
      checkMatch([
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
      checkMatch([
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
        const named = /^(close|quit|kill)\s+(the\s+)?(\S+)/.exec(targetText);
        const inAppTargets = [
          "it", "this", "that", "all", "them", "everything", "severus", "views", "dialogs",
          "modals", "overlays", "popovers", "window", "windows",
        ];
        const isNamedAppClose = named !== null && !inAppTargets.includes(named[3]);
        return (
          !isNamedAppClose &&
          checkMatch([
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
    const isExplicitOpen = SYSTEM_OPEN_COMMANDS.some((kw) => text === kw || text.includes(kw) || (strippedText.length > 0 && (strippedText === kw || strippedText.includes(kw))));
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
      voiceDiagRecord("listener", "matched:wake-phrase", text);
      this.handlers.onHeard?.(text, "wake phrase");
      this.handlers.onWakePhrase?.();
      return;
    }

    // Priority 3: system-control grammar — verb-led phrases
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

    if (
      checkMatch([
        "close system",
        "close the system",
        "exit system",
        "hide system",
        "close severus",
        "close workstation",
        "exit workstation",
        "send to tray",
        "hide to tray",
        "exit to tray",
      ])
    ) {
      this.lastCommandTime = now;
      this.handlers.onHeard?.(text, "close system");
      if (this.handlers.onHideToTray) {
        this.handlers.onHideToTray();
      } else {
        this.handlers.onClose?.();
      }
      return;
    }

    // Fallback: dispatch to conversational AI query engine
    this.handlers.onHeard?.(text, undefined);
    if (targetText.length > 2) {
      this.lastCommandTime = now;
      voiceDiagRecord("listener", "fallback:general-query", targetText);
      this.handlers.onGeneralQuery?.(targetText);
    } else {
      voiceDiagRecord("listener", "drop:too-short", text);
    }
  }
}
