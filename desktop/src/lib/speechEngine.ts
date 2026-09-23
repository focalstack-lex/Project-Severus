/**
 * speechEngine.ts — speech recognition engine selection for the Tauri WebView2 shell.
 *
 * WebView2 exposes the Web Speech API constructor but has no cloud speech service
 * wired up. Recognition therefore starts and fails immediately with a `network`
 * error, on a restart loop, producing no transcripts at all. Measured in the live
 * app on 2026-09-23: `error:network` every three seconds, zero results.
 *
 * Chromium 138 and newer can run recognition entirely on device through
 * `SpeechRecognition.processLocally`, which needs no remote service. This module
 * detects that capability, downloads the on-device model when it is merely
 * available for download, and tells each recognizer which engine to use.
 */

import { voiceDiagRecord } from "./voiceDiagnostics";

export type SpeechAvailability = "available" | "downloadable" | "downloading" | "unavailable" | "unsupported";

export interface SpeechEngineStatus {
  /** Whether the runtime exposes the capability API (`available`/`install`). */
  hasCapabilityApi: boolean;
  local: SpeechAvailability;
  remote: SpeechAvailability;
  lang: string;
  lastError?: string;
}

export interface SpeechStrategy {
  /** Set `processLocally` on the recognizer before starting it. */
  useLocal: boolean;
  /** The on-device model still has to be fetched before local use is possible. */
  needsInstall: boolean;
  /** Recognition has at least one engine that can plausibly work. */
  usable: boolean;
  reason: string;
}

export interface SpeechRecognitionAlternative {
  transcript: string;
  confidence?: number;
}

export interface SpeechRecognitionResult {
  length: number;
  isFinal?: boolean;
  [index: number]: SpeechRecognitionAlternative;
}

export interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

export interface SpeechRecognitionEventLike {
  resultIndex?: number;
  results: SpeechRecognitionResultList;
}

export interface SpeechRecognitionErrorLike {
  error: string;
}

/** The subset of the Web Speech API recognizer this application drives. */
export interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  processLocally?: boolean;
  maxAlternatives?: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  onstart?: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

export type SpeechRecognitionCtor = (new () => SpeechRecognitionInstance) & {
  available?: (options: { langs: string[]; processLocally?: boolean }) => Promise<string>;
  install?: (options: { langs: string[]; processLocally?: boolean }) => Promise<unknown>;
};

const DEFAULT_LANG = "en-US";

let status: SpeechEngineStatus = {
  hasCapabilityApi: false,
  local: "unsupported",
  remote: "unsupported",
  lang: DEFAULT_LANG,
};

let installPromise: Promise<boolean> | null = null;
let localInstallAttempted = false;

const listeners = new Set<(status: SpeechEngineStatus) => void>();

type SpeechRecognitionLike = SpeechRecognitionInstance;

export function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

export function getSpeechEngineStatus(): SpeechEngineStatus {
  return status;
}

export function subscribeSpeechEngine(listener: (next: SpeechEngineStatus) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function normalizeAvailability(value: unknown): SpeechAvailability {
  if (value === "available" || value === "downloadable" || value === "downloading" || value === "unavailable") {
    return value;
  }
  return "unsupported";
}

/**
 * Decide what a recognizer should do given the runtime's capabilities.
 * Pure so the decision can be asserted without a browser.
 */
export function resolveSpeechStrategy(engine: SpeechEngineStatus): SpeechStrategy {
  if (!engine.hasCapabilityApi) {
    return {
      useLocal: false,
      needsInstall: false,
      usable: engine.remote !== "unsupported",
      reason: "runtime exposes no on-device capability API, using the standard engine",
    };
  }

  if (engine.local === "available") {
    return {
      useLocal: true,
      needsInstall: false,
      usable: true,
      reason: "on-device model ready, running fully offline",
    };
  }

  if (engine.local === "downloading" || engine.local === "downloadable") {
    // The remote service is the only engine usable until the model lands. In
    // WebView2 that engine does not exist, so the model download is the fix.
    return {
      useLocal: false,
      needsInstall: true,
      usable: true,
      reason: "on-device model not installed yet, downloading it",
    };
  }

  if (engine.remote === "available") {
    return {
      useLocal: false,
      needsInstall: false,
      usable: true,
      reason: "on-device model unavailable, using the remote service",
    };
  }

  return {
    useLocal: false,
    needsInstall: false,
    usable: false,
    reason: "no speech engine available in this runtime",
  };
}

async function queryAvailability(
  ctor: SpeechRecognitionCtor,
  lang: string,
  processLocally: boolean,
): Promise<SpeechAvailability> {
  if (typeof ctor.available !== "function") return "unsupported";
  try {
    return normalizeAvailability(await ctor.available({ langs: [lang], processLocally }));
  } catch (err) {
    voiceDiagRecord("app", "speech-engine:available-threw", String(err), "warn");
    return "unsupported";
  }
}

/**
 * Refresh the cached engine status. Safe to call repeatedly; the result is kept
 * until the next explicit refresh.
 */
export async function refreshSpeechEngineStatus(lang = DEFAULT_LANG): Promise<SpeechEngineStatus> {
  const ctor = getSpeechRecognitionCtor();
  if (!ctor) {
    status = { hasCapabilityApi: false, local: "unsupported", remote: "unsupported", lang };
    return status;
  }

  const hasCapabilityApi = typeof ctor.available === "function";
  if (!hasCapabilityApi) {
    status = { hasCapabilityApi: false, local: "unsupported", remote: "unsupported", lang };
    return status;
  }

  const local = await queryAvailability(ctor, lang, true);
  const remote = await queryAvailability(ctor, lang, false);
  status = { hasCapabilityApi, local, remote, lang };

  voiceDiagRecord("app", "speech-engine:capabilities", `local=${local} remote=${remote} lang=${lang}`);
  listeners.forEach((listener) => {
    try {
      listener(status);
    } catch {
      // A broken listener must not break engine detection.
    }
  });
  return status;
}

function isOnDeviceModelReady(): boolean {
  return status.local === "available";
}

/**
 * Download the on-device model when the runtime offers it for download. Returns
 * true once local recognition is possible. Repeated calls share one attempt.
 */
export async function ensureOnDeviceSpeechModel(lang = DEFAULT_LANG): Promise<boolean> {
  if (isOnDeviceModelReady()) return true;
  if (installPromise) return installPromise;

  const ctor = getSpeechRecognitionCtor();
  if (!ctor || typeof ctor.install !== "function") return false;
  if (localInstallAttempted && !isOnDeviceModelReady()) {
    // One download attempt per session; a second would only repeat the failure.
    return false;
  }
  localInstallAttempted = true;

  voiceDiagRecord("app", "speech-engine:install-started", `lang=${lang}`);

  installPromise = (async () => {
    try {
      await ctor.install!({ langs: [lang], processLocally: true });
      await refreshSpeechEngineStatus(lang);
      const ok = isOnDeviceModelReady();
      voiceDiagRecord(
        "app",
        ok ? "speech-engine:install-complete" : "speech-engine:install-incomplete",
        `local=${status.local}`,
        ok ? "info" : "warn",
      );
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("severus-toast", {
            detail: ok
              ? "Offline voice model ready. Severus now listens without the speech service."
              : "Offline voice model could not be installed by this runtime.",
          }),
        );
      }
      return ok;
    } catch (err) {
      voiceDiagRecord("app", "speech-engine:install-failed", String(err), "error");
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("severus-toast", {
            detail: "Offline voice model download failed. Voice input cannot run without it in this window.",
          }),
        );
      }
      return false;
    } finally {
      installPromise = null;
    }
  })();

  return installPromise;
}

/**
 * Apply the resolved strategy to a recognizer instance, downloading the model in
 * the background when it is not installed yet.
 */
export function applySpeechEngine(rec: SpeechRecognitionLike, lang = DEFAULT_LANG): SpeechStrategy {
  const strategy = resolveSpeechStrategy(status);

  if (strategy.useLocal && "processLocally" in rec) {
    rec.processLocally = true;
  } else if ("processLocally" in rec) {
    rec.processLocally = false;
  }

  if (strategy.needsInstall && !installPromise) {
    void ensureOnDeviceSpeechModel(lang);
  }

  return strategy;
}

/** Reset cached engine state, used by tests and the settings modal's retry action. */
export function resetSpeechEngineState(): void {
  installPromise = null;
  localInstallAttempted = false;
  status = { hasCapabilityApi: false, local: "unsupported", remote: "unsupported", lang: DEFAULT_LANG };
}

export interface EngineRecovery {
  /** The next recognizer can start immediately without repeating the failure. */
  retryNow: boolean;
  /** Local processing will be used from now on. */
  useLocal: boolean;
  /** The on-device model is being fetched, so a later attempt may succeed. */
  installable: boolean;
  reason: string;
}

/**
 * React to an engine failure (typically `network`, meaning no speech service is
 * reachable). Re-probes capabilities, pulls the on-device model when the runtime
 * offers it, and reports whether retrying is worthwhile.
 */
export async function recoverSpeechEngine(lang = DEFAULT_LANG): Promise<EngineRecovery> {
  const engine = await refreshSpeechEngineStatus(lang);
  const strategy = resolveSpeechStrategy(engine);

  if (strategy.useLocal) {
    voiceDiagRecord("app", "speech-engine:recovered-on-device", strategy.reason);
    return { retryNow: true, useLocal: true, installable: false, reason: strategy.reason };
  }

  if (strategy.needsInstall) {
    const ready = await ensureOnDeviceSpeechModel(lang);
    return {
      retryNow: ready,
      useLocal: ready,
      installable: true,
      reason: ready ? "on-device model installed" : strategy.reason,
    };
  }

  return { retryNow: false, useLocal: false, installable: false, reason: strategy.reason };
}
