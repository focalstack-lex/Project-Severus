/**
 * voiceDiagnostics.ts — Persistent diagnostic trail for the voice pipeline.
 *
 * The packaged app runs inside WebView2 with no visible console, so a recognizer
 * that fails silently leaves no evidence behind. That is why the previous voice
 * fixes could not be verified. Every lifecycle transition, recognition error,
 * drop reason and dispatch outcome is recorded here: deduplicated, bounded, and
 * persisted so it survives a restart.
 *
 * Read it at runtime from the WebView console with:
 *   window.__severusVoiceDiagnostics()
 */

export type VoiceDiagSource = "listener" | "reactor" | "settings" | "clap" | "app";
export type VoiceDiagLevel = "info" | "warn" | "error";

export interface VoiceDiagEntry {
  /** Epoch milliseconds when the event was first observed. */
  t: number;
  src: VoiceDiagSource;
  event: string;
  level: VoiceDiagLevel;
  /** How many times this event collapsed into the entry within the dedupe window. */
  count: number;
  detail?: string;
}

const STORAGE_KEY = "severus_voice_diag_log";
const MAX_ENTRIES = 120;
const DEDUPE_WINDOW_MS = 2000;

/**
 * Recognition failures that mean "this will keep failing until the environment
 * changes", as opposed to transient ones such as no-speech on a quiet room.
 */
const FATAL_RECOGNITION_ERRORS = new Set([
  "not-allowed",
  "service-not-allowed",
  "audio-capture",
]);

export const RECOGNITION_ERROR_HINTS: Record<string, string> = {
  "not-allowed":
    "Microphone access was blocked. Allow it in Windows Settings, Privacy and security, Microphone.",
  "service-not-allowed": "Speech recognition was blocked by the WebView runtime.",
  "audio-capture":
    "Another capture stream is holding the microphone. Release it and retry.",
  network: "The speech service is unreachable. Check the network connection.",
  "no-speech": "No speech was detected in the capture window.",
};

let entries: VoiceDiagEntry[] = [];
let loaded = false;
/** Latest human-readable state line, used by the header tooltip without touching storage. */
let summary = "No voice activity recorded yet.";
const surfacedFatalErrors = new Set<string>();

function hasStorage(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage !== null;
  } catch {
    return false;
  }
}

function isEntry(value: unknown): value is VoiceDiagEntry {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<VoiceDiagEntry>;
  return typeof candidate.t === "number" && typeof candidate.event === "string" && typeof candidate.src === "string";
}

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  if (!hasStorage()) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    entries = parsed.filter(isEntry).slice(-MAX_ENTRIES);
  } catch {
    entries = [];
  }
}

function persist(): void {
  if (!hasStorage()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // A full or unavailable storage quota must never break voice handling.
  }
}

function formatEntry(entry: VoiceDiagEntry): string {
  const time = new Date(entry.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const repeats = entry.count > 1 ? ` x${entry.count}` : "";
  return `${time} [${entry.src}] ${entry.event}${repeats}${entry.detail ? `: ${entry.detail}` : ""}`;
}

/**
 * Record a voice pipeline event. Consecutive identical events collapse into a
 * repeat counter so a noisy failure cannot flush the useful history.
 */
export function voiceDiagRecord(
  src: VoiceDiagSource,
  event: string,
  detail?: string,
  level: VoiceDiagLevel = "info",
): VoiceDiagEntry {
  ensureLoaded();
  const now = Date.now();
  const last = entries[entries.length - 1];

  if (last && last.src === src && last.event === event && now - last.t < DEDUPE_WINDOW_MS) {
    last.count += 1;
    last.t = now;
    if (detail) last.detail = detail;
  } else {
    entries.push({ t: now, src, event, level, count: 1, detail });
    while (entries.length > MAX_ENTRIES) entries.shift();
  }

  const stored = entries[entries.length - 1];
  summary = formatEntry(stored);
  persist();
  return stored;
}

/**
 * Surface a fatal recognition failure to the user exactly once per event per
 * session, so the cause is visible instead of buried in an unread console.
 */
export function voiceDiagFatalRecognitionError(src: VoiceDiagSource, errorType: string): void {
  const hint = RECOGNITION_ERROR_HINTS[errorType];
  voiceDiagRecord(src, `error:${errorType}`, hint, FATAL_RECOGNITION_ERRORS.has(errorType) ? "error" : "warn");

  if (!FATAL_RECOGNITION_ERRORS.has(errorType) || surfacedFatalErrors.has(errorType)) return;
  surfacedFatalErrors.add(errorType);

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("severus-toast", {
        detail: `Voice input problem: ${hint}`,
      }),
    );
  }
}

export function voiceDiagIsFatalRecognitionError(errorType: string): boolean {
  return FATAL_RECOGNITION_ERRORS.has(errorType);
}

export function voiceDiagRecent(limit = 12): VoiceDiagEntry[] {
  ensureLoaded();
  return entries.slice(-Math.max(1, limit));
}

export function voiceDiagSummary(): string {
  ensureLoaded();
  return summary;
}

export function voiceDiagErrorCount(): number {
  ensureLoaded();
  return entries.filter((entry) => entry.level === "error").length;
}

export function voiceDiagClear(): void {
  ensureLoaded();
  entries = [];
  surfacedFatalErrors.clear();
  summary = "No voice activity recorded yet.";
  persist();
}

export function voiceDiagText(limit = 40): string {
  return voiceDiagRecent(limit).map(formatEntry).join("\n");
}

if (typeof window !== "undefined") {
  const host = window as unknown as {
    __severusVoiceDiagnostics?: (limit?: number) => string;
    __severusVoiceDiagnosticsRaw?: () => VoiceDiagEntry[];
    __severusVoiceDiagnosticsClear?: () => void;
  };
  host.__severusVoiceDiagnostics = (limit?: number) => voiceDiagText(limit);
  host.__severusVoiceDiagnosticsRaw = () => voiceDiagRecent(MAX_ENTRIES);
  host.__severusVoiceDiagnosticsClear = () => voiceDiagClear();
}
