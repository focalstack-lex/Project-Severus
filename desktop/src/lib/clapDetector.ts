/**
 * Acoustic Double-Clap Detector using Web Audio API.
 * Analyzes audio energy peaks to identify fast double-claps.
 */

export interface ClapDetectorOptions {
  threshold?: number; // Volume threshold (0.0 to 1.0)
  minIntervalMs?: number; // Minimum gap between claps (e.g. 150ms)
  maxIntervalMs?: number; // Maximum gap between claps (e.g. 700ms)
  onDoubleClap?: () => void;
  onClapSingle?: () => void;
}

export function setClapEnabled(enabled: boolean) {
  localStorage.setItem("severus_clap_enabled", JSON.stringify(enabled));
}

export function getClapEnabled(): boolean {
  const stored = localStorage.getItem("severus_clap_enabled");
  if (stored !== null) {
    try {
      return JSON.parse(stored) as boolean;
    } catch {
      return true;
    }
  }
  return true;
}

let lastKeyPressTime = 0;

export function recordKeyPress() {
  lastKeyPressTime = Date.now();
}

export class ClapDetector {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private isListening = false;
  private lastClapTime = 0;
  private animFrameId: number | null = null;

  private threshold: number;
  private minIntervalMs: number;
  private maxIntervalMs: number;
  private onDoubleClap?: () => void;
  private onClapSingle?: () => void;
  private isPeakHolding = false;

  constructor(options: ClapDetectorOptions = {}) {
    this.threshold = options.threshold ?? 0.46; // Raised threshold to ignore soft keyboard clicks
    this.minIntervalMs = options.minIntervalMs ?? 140;
    this.maxIntervalMs = options.maxIntervalMs ?? 750;
    this.onDoubleClap = options.onDoubleClap;
    this.onClapSingle = options.onClapSingle;
  }

  public async start(): Promise<boolean> {
    if (this.isListening) return true;
    if (!getClapEnabled()) return false;

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaStreamSource(this.micStream);
      
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.1;

      source.connect(this.analyser);
      this.isListening = true;
      this.loop();
      return true;
    } catch (err) {
      console.warn("[ClapDetector] Microphone access unavailable or denied:", err);
      this.isListening = false;
      return false;
    }
  }

  public stop(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }
    if (this.audioContext && this.audioContext.state !== "closed") {
      void this.audioContext.close();
      this.audioContext = null;
    }
    this.isListening = false;
  }

  private loop = () => {
    if (!this.isListening || !this.analyser) return;

    // Keyboard activity gate: Suppress clap detection if a key was pressed in the last 1.8 seconds!
    const now = Date.now();
    if (now - lastKeyPressTime < 1800) {
      this.animFrameId = requestAnimationFrame(this.loop);
      return;
    }

    const dataArray = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(dataArray);

    // Compute peak amplitude, RMS energy, and Zero Crossing Rate
    let maxVal = 0;
    let sumSq = 0;
    let zeroCrossings = 0;
    let prevSign = 0;

    for (let i = 0; i < dataArray.length; i++) {
      const val = (dataArray[i] - 128) / 128;
      const absVal = Math.abs(val);
      if (absVal > maxVal) {
        maxVal = absVal;
      }
      sumSq += val * val;

      const sign = val > 0 ? 1 : val < 0 ? -1 : 0;
      if (i > 0 && sign !== 0 && sign !== prevSign) {
        zeroCrossings++;
      }
      if (sign !== 0) prevSign = sign;
    }

    const rms = Math.sqrt(sumSq / dataArray.length);
    const crestFactor = rms > 0.001 ? maxVal / rms : 0;

    // Acoustic Transient Hand-Clap Filter:
    // Real hand claps are loud (> 0.46), have substantial frame energy (sumSq >= 0.20),
    // high peak-to-RMS crest factor (>= 4.2), and high zero-crossings (>= 18).
    // Soft keyboard clicks fail volume (> 0.46) and total frame energy (sumSq >= 0.20).
    const isTransientClap =
      maxVal > this.threshold &&
      sumSq >= 0.20 &&
      crestFactor >= 4.2 &&
      zeroCrossings >= 18;

    if (isTransientClap) {
      if (!this.isPeakHolding) {
        this.isPeakHolding = true;
        const delta = now - this.lastClapTime;

        if (delta >= this.minIntervalMs && delta <= this.maxIntervalMs) {
          // Double clap detected!
          this.lastClapTime = 0; // reset
          if (this.onDoubleClap) {
            this.onDoubleClap();
          }
        } else {
          // First clap recorded
          this.lastClapTime = now;
          if (this.onClapSingle) {
            this.onClapSingle();
          }
        }
      }
    } else if (maxVal < this.threshold * 0.4) {
      // Peak released
      this.isPeakHolding = false;
    }

    // Reset single clap if too much time passed
    if (this.lastClapTime > 0 && now - this.lastClapTime > this.maxIntervalMs) {
      this.lastClapTime = 0;
    }

    this.animFrameId = requestAnimationFrame(this.loop);
  };
}
