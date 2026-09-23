/**
 * localSpeechRecognizer.ts — fully offline speech capture for the WebView2 shell.
 *
 * WebView2 exposes the Web Speech API constructor but routes recognition to a
 * speech service it does not have, so every attempt fails with `network` and the
 * runtime ships no on-device model either (measured in the live app, 2026-09-23).
 * This module replaces that dead engine: it captures the microphone with WebAudio,
 * segments utterances on voice activity, and posts each utterance to the local
 * Whisper bridge on 127.0.0.1:17494, which needs no network service at all.
 */

import { getMicrophoneStream } from "./audioDevices";
import { voiceDiagRecord } from "./voiceDiagnostics";

export const STT_SERVER_URL = "http://127.0.0.1:17494";

/** Worklet that forwards fixed-size PCM frames to the main thread. */
const CAPTURE_WORKLET_SOURCE = `
class SeverusCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frame = new Float32Array(512);
    this.filled = 0;
    this.emptyInputs = 0;
    this.emptyReported = false;
    this.port.postMessage({ kind: "ready" });
  }
  process(inputs) {
    const input = inputs[0];
    const channel = input && input[0];
    if (!channel) {
      // Tells us whether the graph is pulling at all: a live node with no input
      // means the microphone source is not delivering samples.
      this.emptyInputs += 1;
      if (!this.emptyReported && this.emptyInputs > 100) {
        this.emptyReported = true;
        this.port.postMessage({ kind: "no-input", calls: this.emptyInputs });
      }
      return true;
    }
    for (let i = 0; i < channel.length; i += 1) {
      this.frame[this.filled] = channel[i];
      this.filled += 1;
      if (this.filled === this.frame.length) {
        this.port.postMessage({ kind: "audio", frame: this.frame.slice(0) });
        this.filled = 0;
      }
    }
    return true;
  }
}
registerProcessor("severus-capture", SeverusCaptureProcessor);
`;

export interface VadConfig {
  /** Frames kept before speech starts so the onset of a word is not clipped. */
  preRollFrames: number;
  /** Silence after speech that closes an utterance. */
  silenceFrames: number;
  /** Minimum voiced frames before an utterance is worth transcribing. */
  minSpeechFrames: number;
  /** Hard cap so one long monologue cannot grow without bound. */
  maxUtteranceFrames: number;
  /** Absolute floor for the voice threshold, independent of the noise floor. */
  minThreshold: number;
  /** Ceiling for the voice threshold. */
  maxThreshold: number;
}

export const DEFAULT_VAD_CONFIG: VadConfig = {
  preRollFrames: 10, // ~320 ms at 16 kHz / 512-sample frames
  silenceFrames: 22, // ~700 ms
  minSpeechFrames: 6, // ~190 ms
  maxUtteranceFrames: 375, // ~12 s
  minThreshold: 0.006,
  maxThreshold: 0.08,
};

export interface VadState {
  speechStarted: boolean;
  voicedFrames: number;
  silentFrames: number;
  noiseFloor: number;
  preRoll: Float32Array[];
  segment: Float32Array[];
}

export function createVadState(): VadState {
  return {
    speechStarted: false,
    voicedFrames: 0,
    silentFrames: 0,
    noiseFloor: 0,
    preRoll: [],
    segment: [],
  };
}

export function frameRms(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i += 1) {
    sum += frame[i] * frame[i];
  }
  return Math.sqrt(sum / Math.max(1, frame.length));
}

/** Voice threshold derived from the observed noise floor, so quiet rooms work. */
export function voiceThreshold(noiseFloor: number, config: VadConfig = DEFAULT_VAD_CONFIG): number {
  const adaptive = noiseFloor * 4;
  return Math.min(config.maxThreshold, Math.max(config.minThreshold, adaptive));
}

export interface VadStep {
  state: VadState;
  /** A complete utterance, ready to transcribe, or null when none closed. */
  completed: Float32Array | null;
  /** Reason a completed utterance was discarded instead of transcribed. */
  discarded?: "too-short";
}

/**
 * Advance the voice-activity state by one frame. Pure so the segmentation rules
 * can be asserted without a browser or a microphone.
 */
export function advanceVad(
  state: VadState,
  frame: Float32Array,
  config: VadConfig = DEFAULT_VAD_CONFIG,
): VadStep {
  const rms = frameRms(frame);
  const threshold = voiceThreshold(state.noiseFloor, config);
  const voiced = rms > threshold;

  const next: VadState = {
    speechStarted: state.speechStarted,
    voicedFrames: state.voicedFrames,
    silentFrames: state.silentFrames,
    noiseFloor: state.noiseFloor,
    preRoll: state.preRoll,
    segment: state.segment,
  };

  if (!voiced) {
    // Track the noise floor only while idle, so speech never raises it.
    next.noiseFloor = state.noiseFloor === 0 ? rms : state.noiseFloor * 0.95 + rms * 0.05;
  }

  if (!state.speechStarted) {
    if (voiced) {
      next.speechStarted = true;
      next.voicedFrames = 1;
      next.silentFrames = 0;
      next.segment = [...state.preRoll, frame];
      next.preRoll = [];
    } else {
      const preRoll = [...state.preRoll, frame];
      while (preRoll.length > config.preRollFrames) preRoll.shift();
      next.preRoll = preRoll;
    }
    return { state: next, completed: null };
  }

  next.segment = [...state.segment, frame];

  if (voiced) {
    next.voicedFrames = state.voicedFrames + 1;
    next.silentFrames = 0;
  } else {
    next.silentFrames = state.silentFrames + 1;
  }

  const closedBySilence = next.silentFrames >= config.silenceFrames;
  const closedByLength = next.segment.length >= config.maxUtteranceFrames;
  if (!closedBySilence && !closedByLength) {
    return { state: next, completed: null };
  }

  const complete = next.segment;
  const fresh = createVadState();
  fresh.noiseFloor = next.noiseFloor;

  if (next.voicedFrames < config.minSpeechFrames) {
    return { state: fresh, completed: null, discarded: "too-short" };
  }
  return { state: fresh, completed: concatFrames(complete) };
}

export function concatFrames(frames: Float32Array[]): Float32Array {
  const total = frames.reduce((sum, frame) => sum + frame.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const frame of frames) {
    out.set(frame, offset);
    offset += frame.length;
  }
  return out;
}

/** Convert mono float samples to the 16-bit PCM the bridge server expects. */
export function encodePcm16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    out[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return out;
}

export interface SttHealth {
  online: boolean;
  engine?: string;
  model?: string;
  modelReady?: boolean;
  backendAvailable?: boolean;
  detail?: string;
}

/** Probe the local bridge. Cheap enough to call before every engine decision. */
export async function checkSttServer(timeoutMs = 1200): Promise<SttHealth> {
  if (typeof fetch !== "function") return { online: false, detail: "fetch unavailable" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${STT_SERVER_URL}/health`, { signal: controller.signal });
    if (!res.ok) return { online: false, detail: `HTTP ${res.status}` };
    const data = await res.json();
    return {
      online: data?.status === "online",
      engine: data?.engine,
      model: data?.model,
      modelReady: Boolean(data?.model_ready),
      backendAvailable: Boolean(data?.backend_available),
      detail: data?.load_error || undefined,
    };
  } catch (err) {
    return { online: false, detail: String(err) };
  } finally {
    clearTimeout(timer);
  }
}

export interface LocalSpeechRecognizerOptions {
  onTranscript: (text: string) => void;
  onStatus?: (message: string) => void;
  /**
   * True while audio must be discarded, for example while Severus is speaking.
   * Checked per frame so a half-captured utterance is dropped cleanly.
   */
  shouldIgnoreAudio?: () => boolean;
  config?: Partial<VadConfig>;
  sampleRate?: number;
  requestTimeoutMs?: number;
}

/**
 * Continuous microphone capture with utterance segmentation and offline
 * transcription. Mirrors the surface the Web Speech listener needs: start, stop,
 * and a transcript callback.
 */
export class LocalSpeechRecognizer {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private sink: GainNode | null = null;
  private running = false;
  private vad: VadState = createVadState();
  private config: VadConfig;
  private inFlight = false;
  private queued: Float32Array | null = null;
  private abortController: AbortController | null = null;
  private readonly options: LocalSpeechRecognizerOptions;
  private sampleRate: number;
  private gestureResumeCleanup: (() => void) | null = null;
  private framesSeen = 0;
  private rmsSum = 0;
  private lastReportAt = 0;

  constructor(options: LocalSpeechRecognizerOptions) {
    this.options = options;
    this.config = { ...DEFAULT_VAD_CONFIG, ...(options.config || {}) };
    this.sampleRate = options.sampleRate ?? 16000;
  }

  public isRunning(): boolean {
    return this.running;
  }

  public async start(): Promise<boolean> {
    if (this.running) return true;

    try {
      const stream = await getMicrophoneStream();
      // A 16 kHz context makes the browser resample the device for us, which is
      // exactly the rate the Whisper bridge expects.
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const context = new AudioCtx({ sampleRate: this.sampleRate });

      const workletUrl = URL.createObjectURL(new Blob([CAPTURE_WORKLET_SOURCE], { type: "application/javascript" }));
      try {
        await context.audioWorklet.addModule(workletUrl);
      } finally {
        URL.revokeObjectURL(workletUrl);
      }

      const source = context.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(context, "severus-capture");
      // A muted path to the destination keeps the graph pulling audio without
      // routing the microphone to the speakers.
      const sink = context.createGain();
      sink.gain.value = 0;

      source.connect(node);
      node.connect(sink);
      sink.connect(context.destination);
      node.port.onmessage = (event: MessageEvent) => {
        const message = event.data as { kind?: string; frame?: Float32Array; calls?: number };
        if (message?.kind === "audio" && message.frame) {
          this.handleFrame(message.frame);
          return;
        }
        if (message?.kind === "ready") {
          voiceDiagRecord("app", "local-stt:worklet-ready");
          return;
        }
        if (message?.kind === "no-input") {
          voiceDiagRecord(
            "app",
            "local-stt:no-input",
            `worklet ran ${message.calls} times with no input channel`,
            "error",
          );
        }
      };

      if (context.state === "suspended") {
        await context.resume().catch(() => {});
      }

      this.stream = stream;
      this.context = context;
      this.node = node;
      this.sink = sink;
      this.vad = createVadState();
      this.running = true;
      this.sampleRate = context.sampleRate;
      this.ensureContextRunning();
      voiceDiagRecord("app", "local-stt:capture-started", `sampleRate=${this.sampleRate} state=${context.state}`);
      return true;
    } catch (err) {
      voiceDiagRecord("app", "local-stt:capture-failed", String(err), "error");
      this.options.onStatus?.("Microphone capture failed for offline recognition.");
      await this.stop();
      return false;
    }
  }

  /**
   * Chromium will not run an AudioContext created without a user gesture, and a
   * suspended context delivers no frames at all. Resume immediately, retry once
   * on the first interaction, and never block startup waiting for it.
   */
  private ensureContextRunning(): void {
    const context = this.context;
    if (!context) return;

    if (context.state === "running") return;

    const attemptResume = () => {
      if (!this.context || this.context.state === "running") return;
      this.context.resume().catch((err) => {
        voiceDiagRecord("app", "local-stt:resume-failed", String(err), "warn");
      });
    };

    attemptResume();

    if (typeof window !== "undefined") {
      const onGesture = () => {
        attemptResume();
        window.removeEventListener("pointerdown", onGesture, true);
        window.removeEventListener("keydown", onGesture, true);
      };
      window.addEventListener("pointerdown", onGesture, true);
      window.addEventListener("keydown", onGesture, true);
      this.gestureResumeCleanup = onGesture;
    }
  }

  public async stop(): Promise<void> {
    this.running = false;
    this.inFlight = false;
    this.queued = null;
    this.vad = createVadState();

    if (this.gestureResumeCleanup && typeof window !== "undefined") {
      window.removeEventListener("pointerdown", this.gestureResumeCleanup, true);
      window.removeEventListener("keydown", this.gestureResumeCleanup, true);
      this.gestureResumeCleanup = null;
    }

    if (this.abortController) {
      try {
        this.abortController.abort();
      } catch {
        // ignore
      }
      this.abortController = null;
    }

    if (this.node) {
      try {
        this.node.port.onmessage = null;
        this.node.disconnect();
      } catch {
        // ignore
      }
      this.node = null;
    }
    if (this.sink) {
      try {
        this.sink.disconnect();
      } catch {
        // ignore
      }
      this.sink = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.context && this.context.state !== "closed") {
      try {
        await this.context.close();
      } catch {
        // ignore
      }
    }
    this.context = null;
  }

  /** Discard any partially captured utterance, for example while Severus speaks. */
  public resetUtterance(): void {
    this.vad = createVadState();
  }

  private handleFrame(frame: Float32Array): void {
    if (!this.running) return;

    this.reportFrameProgress(frame);

    if (this.options.shouldIgnoreAudio?.()) {
      // Hold the state reset so audio captured during playback cannot leak into
      // the next utterance.
      if (this.vad.speechStarted || this.vad.segment.length > 0) {
        this.resetUtterance();
      }
      return;
    }

    const result = advanceVad(this.vad, frame, this.config);
    this.vad = result.state;
    if (result.discarded === "too-short") {
      voiceDiagRecord("app", "local-stt:discarded", "too-short");
      return;
    }
    if (result.completed) {
      this.enqueue(result.completed);
    }
  }

  /**
   * Report capture health periodically. Without this, a suspended audio context
   * looks exactly like a quiet room: both produce no transcripts and no errors.
   */
  private reportFrameProgress(frame: Float32Array): void {
    this.framesSeen += 1;
    this.rmsSum += frameRms(frame);

    const now = Date.now();
    if (this.lastReportAt === 0) {
      this.lastReportAt = now;
      return;
    }
    if (now - this.lastReportAt < 5000) return;

    const averageRms = this.rmsSum / Math.max(1, this.framesSeen);
    voiceDiagRecord(
      "app",
      "local-stt:frames",
      `${this.framesSeen} frames in ${Math.round((now - this.lastReportAt) / 1000)}s, avgRms=${averageRms.toFixed(4)}, ctx=${this.context?.state ?? "none"}`,
    );
    this.framesSeen = 0;
    this.rmsSum = 0;
    this.lastReportAt = now;
  }

  private enqueue(samples: Float32Array): void {
    // One utterance in flight and at most one waiting: speech arriving faster
    // than the model can transcribe would otherwise pile up and lag badly.
    if (this.inFlight) {
      this.queued = samples;
      return;
    }
    void this.transcribe(samples);
  }

  private async transcribe(samples: Float32Array): Promise<void> {
    this.inFlight = true;
    const payload = encodePcm16(samples);
    const controller = new AbortController();
    this.abortController = controller;
    const timeout = setTimeout(() => controller.abort(), this.options.requestTimeoutMs ?? 20000);
    const started = Date.now();

    try {
      const res = await fetch(`${STT_SERVER_URL}/transcribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Severus-Sample-Rate": String(this.sampleRate),
        },
        body: payload.buffer as ArrayBuffer,
        signal: controller.signal,
      });

      if (!res.ok) {
        voiceDiagRecord("app", "local-stt:http-error", `HTTP ${res.status}`, "warn");
        return;
      }

      const data = await res.json();
      const text = typeof data?.text === "string" ? data.text.trim() : "";
      const latency = Date.now() - started;
      if (!text) {
        voiceDiagRecord("app", "local-stt:empty", `rejected=${data?.rejected} reason=${data?.reason ?? ""} ${latency}ms`);
        return;
      }

      voiceDiagRecord("app", "local-stt:transcript", `${text} (${latency}ms)`);
      this.options.onTranscript(text);
    } catch (err) {
      const aborted = (err as Error)?.name === "AbortError";
      voiceDiagRecord("app", "local-stt:request-failed", aborted ? "timeout" : String(err), aborted ? "warn" : "error");
    } finally {
      clearTimeout(timeout);
      this.abortController = null;
      this.inFlight = false;
      const next = this.queued;
      this.queued = null;
      if (next && this.running) {
        void this.transcribe(next);
      }
    }
  }
}
