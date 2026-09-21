import { getVoiceAudio } from "./tauri";

const voiceCache = new Map<string, string>();

export function setVoiceMuted(muted: boolean) {
  localStorage.setItem("severus_voice_muted", JSON.stringify(muted));
}

export function getVoiceMuted(): boolean {
  const stored = localStorage.getItem("severus_voice_muted");
  if (stored !== null) {
    try {
      return JSON.parse(stored) as boolean;
    } catch {
      return false;
    }
  }
  return false;
}

// Pre-load audio string into memory cache
export async function preloadVoice(soundName: string): Promise<string | null> {
  if (voiceCache.has(soundName)) {
    return voiceCache.get(soundName)!;
  }
  try {
    const dataUrl = await getVoiceAudio(soundName);
    voiceCache.set(soundName, dataUrl);
    return dataUrl;
  } catch (err) {
    console.warn(`[VoiceManager] Could not preload voice '${soundName}':`, err);
    return null;
  }
}

export const SEVERUS_ECHO_PHRASES = [
  "how may i assist",
  "assist your workflow",
  "knowledge copilot online",
  "command palette active",
  "agent grounding assembler engaged",
  "accessing your knowledge vault",
  "focus mode activated",
  "visualizing knowledge graph",
  "at your service",
  "journal entry logged",
  "committed to vault",
  "committed to knowledge vault",
  "launched in visual studio code",
  "launched in vs code",
  "note saved to vault",
  "api connection failure",
  "security violation rejected",
  "repository state synchronized",
  "exiting thinking mode",
  "consulting the knowledge base",
  "severus is listening",
  "thinking mode activated",
  "good morning sir",
  "good morning",
  "good afternoon sir",
  "good afternoon",
  "good evening sir",
  "good evening",
  "working late sir",
  "working late",
  "up rather early",
  "up rather early i observe",
  "system initialized",
  "system initialized sir",
  "listening mode paused",
  "listening mode paused sir",
  "listening mode active",
  "listening mode active sir",
  "listening resumed",
  "listening resumed sir",
];

interface SpokenPhraseRecord {
  phrase: string;
  time: number;
}

const recentSpokenPhrases: SpokenPhraseRecord[] = [];

export function recordSpokenPhrase(phrase: string): void {
  const clean = phrase
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length > 3) {
    const now = Date.now();
    recentSpokenPhrases.push({ phrase: clean, time: now });
    while (
      recentSpokenPhrases.length > 8 ||
      (recentSpokenPhrases.length > 0 && now - recentSpokenPhrases[0].time > 10000)
    ) {
      recentSpokenPhrases.shift();
    }
  }
}

export function isEchoOfSeverus(heardText: string): boolean {
  const cleanHeard = heardText
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleanHeard) return false;

  const now = Date.now();

  // If Severus isn't speaking and hasn't spoken in the last 2.5 seconds,
  // acoustic room reverb has completely decayed. Any audio heard is genuine user speech.
  if (!isSpeakingVoice && now - lastPlaybackEndTime > 2500) {
    return false;
  }

  // 1. Direct match with static Severus echo phrases
  if (cleanHeard.length >= 8) {
    for (const phrase of SEVERUS_ECHO_PHRASES) {
      if (cleanHeard === phrase || cleanHeard.includes(phrase)) {
        return true;
      }
    }
  }

  // 2. Check recently spoken phrases within acoustic echo decay window (2.5 seconds)
  for (const record of recentSpokenPhrases) {
    if (now - record.time > 2500) continue;
    const spoken = record.phrase;

    // An echo from speakers into a microphone is a substantial segment
    // of Severus's own sentence, NOT an isolated user command.
    if (
      cleanHeard.length >= 8 &&
      (cleanHeard === spoken ||
        cleanHeard.includes(spoken) ||
        (cleanHeard.length >= 14 && spoken.includes(cleanHeard)))
    ) {
      return true;
    }
  }

  return false;
}

let activeAudio: HTMLAudioElement | null = null;
let isSpeakingVoice = false;
let speakingTimeout: number | null = null;
let lastPlaybackEndTime = 0;

type SpeechFrameCallback = (amplitude: number) => void;
const speechFrameListeners = new Set<SpeechFrameCallback>();
let speechAnimFrameId: number | null = null;

export function subscribeSpeechFrame(cb: SpeechFrameCallback): () => void {
  speechFrameListeners.add(cb);
  return () => speechFrameListeners.delete(cb);
}

function notifySpeechFrame(amp: number) {
  for (const cb of speechFrameListeners) {
    try {
      cb(amp);
    } catch {
      // ignore listener errors
    }
  }
}

function startSpeechFrameLoop() {
  if (speechAnimFrameId !== null) return;
  const loop = () => {
    if (isSpeakingVoice) {
      // Compute organic speech acoustic envelope pulse based on sine harmonics
      const now = Date.now() / 1000;
      const wave1 = Math.sin(now * 12) * 0.4;
      const wave2 = Math.sin(now * 22) * 0.3;
      const wave3 = Math.sin(now * 38) * 0.3;
      const rawAmp = Math.abs(wave1 + wave2 + wave3);
      notifySpeechFrame(Math.min(1, Math.max(0.15, rawAmp)));
      speechAnimFrameId = requestAnimationFrame(loop);
    } else {
      notifySpeechFrame(0);
      speechAnimFrameId = null;
    }
  };
  speechAnimFrameId = requestAnimationFrame(loop);
}

export function isVoiceSpeaking(): boolean {
  return isSpeakingVoice;
}

export function getTimeSinceVoicePlayback(): number {
  if (isSpeakingVoice) return 0;
  return Date.now() - lastPlaybackEndTime;
}

export function isVoiceInEchoCooldown(cooldownMs = 350): boolean {
  if (isSpeakingVoice) return true;
  return Date.now() - lastPlaybackEndTime < cooldownMs;
}

export function formatReplyWithSir(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (/\bSir[.!?]?$/i.test(trimmed)) return trimmed;
  const lastChar = trimmed.slice(-1);
  if (lastChar === "." || lastChar === "!" || lastChar === "?") {
    const base = trimmed.slice(0, -1).trim();
    return `${base}, Sir${lastChar}`;
  }
  return `${trimmed}, Sir.`;
}

const elevenAudioCache = new Map<string, string>();

export const VOICE_SCRIPTS: Record<string, string> = {
  // Navigation & Workspace Sections
  "nav_copilot_open.mp3": "Knowledge copilot online, Sir.",
  "nav_copilot_open": "Knowledge copilot online, Sir.",
  "nav_quick_switcher.mp3": "Command palette active, Sir.",
  "nav_quick_switcher": "Command palette active, Sir.",
  "nav_notes_drawer.mp3": "Accessing your knowledge vault, Sir.",
  "nav_notes_drawer": "Accessing your knowledge vault, Sir.",
  "nav_assembler_open.mp3": "Agent grounding assembler engaged, Sir.",
  "nav_assembler_open": "Agent grounding assembler engaged, Sir.",
  "nav_graph_open.mp3": "Visualizing knowledge graph, Sir.",
  "nav_graph_open": "Visualizing knowledge graph, Sir.",
  "nav_zen_on.mp3": "Focus mode activated, Sir.",
  "nav_zen_on": "Focus mode activated, Sir.",

  // Time & System Greetings
  "greeting_sir": "At your service. How may I assist your workflow, Sir?",
  "system_initialized": "System initialized, Sir.",
  "system_initialized.mp3": "System initialized, Sir.",
  "listening_paused": "Listening mode paused, Sir.",
  "listening_paused.mp3": "Listening mode paused, Sir.",
  "listening_resumed": "Listening mode active, Sir.",
  "listening_resumed.mp3": "Listening mode active, Sir.",
  "Good morning, Sir!.mp3": "Good morning, Sir.",
  "Good afternoon, Sir!.mp3": "Good afternoon, Sir.",
  "Good evening, Sir!.mp3": "Good evening, Sir.",
  "Good morning, Sir!": "Good morning, Sir.",
  "Good afternoon, Sir!": "Good afternoon, Sir.",
  "Good evening, Sir!": "Good evening, Sir.",

  // Actions & Execution
  "action_copilot_ready.mp3": "Knowledge copilot online. How may I assist your workflow, Sir?",
  "action_copilot_ready": "Knowledge copilot online. How may I assist your workflow, Sir?",
  "action_note_created.mp3": "New note committed to knowledge vault, Sir.",
  "action_note_created": "New note committed to knowledge vault, Sir.",
  "action_journal_captured.mp3": "Journal entry logged, Sir.",
  "action_journal_captured": "Journal entry logged, Sir.",
  "action_vscode_launch.mp3": "Launched in Visual Studio Code, Sir.",
  "action_vscode_launch": "Launched in Visual Studio Code, Sir.",
  "action_synthesized_note.mp3": "Synthesized note generated, Sir.",
  "action_synthesized_note": "Synthesized note generated, Sir.",
  "action_context_copied.mp3": "Context copied to clipboard, Sir.",
  "action_context_copied": "Context copied to clipboard, Sir.",
  "auto_note_saved.mp3": "Note saved to vault, Sir.",
  "auto_note_saved": "Note saved to vault, Sir.",

  // Alerts & System Sync
  "alert_api_error.mp3": "API connection failure. Please review your system settings, Sir.",
  "alert_api_error": "API connection failure. Please review your system settings, Sir.",
  "alert_security_block.mp3": "Security violation rejected, Sir.",
  "alert_security_block": "Security violation rejected, Sir.",
  "auto_git_updated.mp3": "Git repository state synchronized, Sir.",
  "auto_git_updated": "Git repository state synchronized, Sir.",
  "auto_pagerank_updated.mp3": "Knowledge graph PageRank recalculated, Sir.",
  "auto_pagerank_updated": "Knowledge graph PageRank recalculated, Sir.",
  "auto_sync_complete.mp3": "Knowledge base synchronization complete, Sir.",
  "auto_sync_complete": "Knowledge base synchronization complete, Sir.",
  "auto_telemetry_refreshed.mp3": "System telemetry refreshed, Sir.",
  "auto_telemetry_refreshed": "System telemetry refreshed, Sir.",
  "diag_all_passed.mp3": "All system diagnostics passed, Sir.",
  "diag_all_passed": "All system diagnostics passed, Sir.",
};

export interface TimeGreetingData {
  text: string;
  extendedScript: string;
  soundFile: string;
}

export function getTimeGreetingData(d = new Date()): TimeGreetingData {
  const hour = d.getHours();
  // 05:00 - 11:59: Morning
  if (hour >= 5 && hour < 12) {
    return {
      text: "Good morning, Sir.",
      extendedScript: "Good morning, Sir. How may I assist your workflow, Sir?",
      soundFile: "Good morning, Sir!.mp3",
    };
  }
  // 12:00 - 16:59: Afternoon
  if (hour >= 12 && hour < 17) {
    return {
      text: "Good afternoon, Sir.",
      extendedScript: "Good afternoon, Sir. How may I assist your workflow, Sir?",
      soundFile: "Good afternoon, Sir!.mp3",
    };
  }
  // 17:00 - 21:59: Evening
  if (hour >= 17 && hour < 22) {
    return {
      text: "Good evening, Sir.",
      extendedScript: "Good evening, Sir. How may I assist your workflow, Sir?",
      soundFile: "Good evening, Sir!.mp3",
    };
  }
  // 22:00 - 02:59: Late Night
  if (hour >= 22 || hour < 3) {
    return {
      text: "Working late, Sir.",
      extendedScript: "Working late, Sir. How may I assist your workflow, Sir?",
      soundFile: "Good evening, Sir!.mp3",
    };
  }
  // 03:00 - 04:59: Early Morning / Dawn (e.g. 03:58 AM)
  return {
    text: "Good morning, Sir.",
    extendedScript: "Good morning, Sir. Up rather early, I observe. How may I assist your workflow, Sir?",
    soundFile: "Good morning, Sir!.mp3",
  };
}

export function getScriptForSound(soundName: string): string {
  if (soundName === "greeting_sir") {
    return getTimeGreetingData().extendedScript;
  }
  const cleanKey = soundName.trim();
  if (VOICE_SCRIPTS[cleanKey]) return VOICE_SCRIPTS[cleanKey];
  const withoutExt = cleanKey.replace(/\.mp3$/i, "");
  if (VOICE_SCRIPTS[withoutExt]) return VOICE_SCRIPTS[withoutExt];
  return formatReplyWithSir(withoutExt.replace(/[\._\-]/g, " ").trim());
}

async function playVoiceboxPhrase(
  phrase: string,
  config: VoiceboxConfig,
): Promise<boolean> {
  const baseUrl = (config.baseUrl || "http://127.0.0.1:17493").replace(/\/+$/, "");
  const profileId = config.profileId || config.voiceId || "default";

  const cacheKey = `${baseUrl}_${profileId}_${phrase}`;
  let audioUrl = elevenAudioCache.get(cacheKey);

  if (!audioUrl) {
    try {
      // 1. Try Voicebox /generate endpoint first
      let res = await fetch(`${baseUrl}/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          text: phrase,
          profile_id: profileId,
        }),
      }).catch(() => null);

      // 2. Try OpenAI-compatible /v1/audio/speech endpoint if /generate is unavailable
      if (!res || !res.ok) {
        res = await fetch(`${baseUrl}/v1/audio/speech`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
          },
          body: JSON.stringify({
            input: phrase,
            voice: profileId,
            model: "tts-1",
          }),
        }).catch(() => null);
      }

      if (!res || !res.ok) {
        console.warn(`[VoiceManager] Voicebox local TTS returned error for '${phrase}', using local voice fallback.`);
        return false;
      }

      const blob = await res.blob();
      audioUrl = URL.createObjectURL(blob);
      elevenAudioCache.set(cacheKey, audioUrl);
    } catch (err) {
      console.warn(`[VoiceManager] Voicebox server network error for '${phrase}', using local voice fallback:`, err);
      return false;
    }
  }

  try {
    if (activeAudio) {
      activeAudio.pause();
      activeAudio.currentTime = 0;
    }

    if (speakingTimeout !== null) {
      clearTimeout(speakingTimeout);
      speakingTimeout = null;
    }

    isSpeakingVoice = true;
    startSpeechFrameLoop();
    const audio = new Audio(audioUrl);
    activeAudio = audio;

    const resetSpeaking = () => {
      isSpeakingVoice = false;
      lastPlaybackEndTime = Date.now();
      if (speakingTimeout !== null) {
        clearTimeout(speakingTimeout);
        speakingTimeout = null;
      }
    };

    speakingTimeout = window.setTimeout(resetSpeaking, 15000);
    audio.onended = resetSpeaking;
    audio.onpause = resetSpeaking;
    audio.onerror = resetSpeaking;

    await audio.play();
    return true;
  } catch (err) {
    isSpeakingVoice = false;
    lastPlaybackEndTime = Date.now();
    console.warn(`[VoiceManager] Failed playing Voicebox audio for '${phrase}':`, err);
    return false;
  }
}

async function playLocalVoiceFallback(soundName: string): Promise<boolean> {
  try {
    let dataUrl = voiceCache.get(soundName);
    if (!dataUrl) {
      dataUrl = await getVoiceAudio(soundName);
      voiceCache.set(soundName, dataUrl);
    }

    if (activeAudio) {
      activeAudio.pause();
      activeAudio.currentTime = 0;
    }

    if (speakingTimeout !== null) {
      clearTimeout(speakingTimeout);
      speakingTimeout = null;
    }

    isSpeakingVoice = true;
    startSpeechFrameLoop();
    const audio = new Audio(dataUrl);
    activeAudio = audio;

    const resetSpeaking = () => {
      isSpeakingVoice = false;
      lastPlaybackEndTime = Date.now();
      if (speakingTimeout !== null) {
        clearTimeout(speakingTimeout);
        speakingTimeout = null;
      }
    };

    speakingTimeout = window.setTimeout(resetSpeaking, 10000);
    audio.onended = resetSpeaking;
    audio.onpause = resetSpeaking;
    audio.onerror = resetSpeaking;

    await audio.play();
    return true;
  } catch (err) {
    isSpeakingVoice = false;
    lastPlaybackEndTime = Date.now();
    return false;
  }
}

export async function playVoice(soundName: string): Promise<void> {
  if (getVoiceMuted()) return;

  const phrase = getScriptForSound(soundName);
  recordSpokenPhrase(phrase);

  // 1. If Voicebox is configured and enabled, speak dynamically via Voicebox Local AI Engine
  const voiceboxCfg = loadVoiceboxConfig();
  if (
    voiceboxCfg.enabled !== false &&
    voiceboxCfg.baseUrl?.trim()
  ) {
    const success = await playVoiceboxPhrase(phrase, voiceboxCfg);
    if (success) return;
  }

  // 2. Fall back to local hardcoded MP3 if available (pre-recorded authentic audio only)
  await playLocalVoiceFallback(soundName);
}

export async function playTimeGreeting(): Promise<void> {
  if (getVoiceMuted()) return;
  const greetingData = getTimeGreetingData();

  // 1. If Voicebox is configured and enabled, speak tailored time greeting
  const voiceboxCfg = loadVoiceboxConfig();
  if (
    voiceboxCfg.enabled !== false &&
    voiceboxCfg.baseUrl?.trim()
  ) {
    recordSpokenPhrase(greetingData.extendedScript);
    const success = await playVoiceboxPhrase(greetingData.extendedScript, voiceboxCfg);
    if (success) return;
  }

  // 2. Fall back to local hardcoded MP3 if Voicebox is unconfigured or offline
  await playLocalVoiceFallback(greetingData.soundFile);
}

export interface VoiceboxConfig {
  baseUrl?: string;
  profileId?: string;
  voiceId?: string;
  apiKey?: string;
  modelId?: string;
  enabled?: boolean;
}

export type ElevenLabsConfig = VoiceboxConfig;

export interface VoicePreset {
  id: string;
  name: string;
  category: "premade" | "cloned" | "library" | "custom";
  accent?: string;
  description: string;
}

export const FREE_PREMADE_VOICES: VoicePreset[] = [
  {
    id: "default",
    name: "Voicebox Default (Local)",
    category: "custom",
    accent: "Neural Local",
    description: "Default voice profile running on your local Voicebox engine (http://127.0.0.1:17493).",
  },
  {
    id: "severus",
    name: "Severus Snape (Local Clone)",
    category: "cloned",
    accent: "Deep British Male",
    description: "Cloned Severus voice profile running on local Voicebox server.",
  },
];

export const VOICEBOX_STORAGE_KEY = "severus_voicebox_config";
export const ELEVENLABS_STORAGE_KEY = "severus_elevenlabs_config";

export function loadVoiceboxConfig(): VoiceboxConfig {
  try {
    const raw = localStorage.getItem(VOICEBOX_STORAGE_KEY) || localStorage.getItem(ELEVENLABS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const metaEnv = (import.meta as any).env || {};
    return {
      baseUrl: parsed.baseUrl || metaEnv.VITE_VOICEBOX_BASE_URL || "http://127.0.0.1:17493",
      profileId: parsed.profileId || parsed.voiceId || metaEnv.VITE_VOICEBOX_PROFILE_ID || "default",
      voiceId: parsed.profileId || parsed.voiceId || metaEnv.VITE_VOICEBOX_PROFILE_ID || "default",
      apiKey: parsed.apiKey || metaEnv.VITE_VOICEBOX_API_KEY || "",
      enabled: parsed.enabled !== false,
    };
  } catch {
    const metaEnv = (import.meta as any).env || {};
    return {
      baseUrl: metaEnv.VITE_VOICEBOX_BASE_URL || "http://127.0.0.1:17493",
      profileId: metaEnv.VITE_VOICEBOX_PROFILE_ID || "default",
      voiceId: metaEnv.VITE_VOICEBOX_PROFILE_ID || "default",
      apiKey: metaEnv.VITE_VOICEBOX_API_KEY || "",
      enabled: true,
    };
  }
}

export const loadElevenLabsConfig = loadVoiceboxConfig;

export function saveVoiceboxConfig(cfg: VoiceboxConfig): void {
  try {
    localStorage.setItem(VOICEBOX_STORAGE_KEY, JSON.stringify(cfg));
    localStorage.setItem(ELEVENLABS_STORAGE_KEY, JSON.stringify(cfg));
  } catch (err) {
    console.error("Failed saving Voicebox config:", err);
  }
}

export const saveElevenLabsConfig = saveVoiceboxConfig;

export async function fetchVoiceboxProfiles(
  baseUrlOverride?: string,
): Promise<VoicePreset[]> {
  const cfg = loadVoiceboxConfig();
  const baseUrl = (baseUrlOverride || cfg.baseUrl || "http://127.0.0.1:17493").replace(/\/+$/, "");

  try {
    let res = await fetch(`${baseUrl}/profiles`, {
      headers: cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {},
    }).catch(() => null);

    if (!res || !res.ok) {
      res = await fetch(`${baseUrl}/v1/models`).catch(() => null);
    }

    if (res && res.ok) {
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.profiles || data.data || [];
      if (Array.isArray(list) && list.length > 0) {
        return list.map((p: any) => ({
          id: p.id || p.profile_id || p.name || "default",
          name: p.name || p.id || "Voicebox Profile",
          category: "custom" as const,
          accent: p.engine || p.language || "Local AI",
          description: p.description || p.model || "Local Voicebox Voice Profile",
        }));
      }
    }
  } catch (err) {
    console.warn("[Voicebox] Profile fetch failed:", err);
  }

  return FREE_PREMADE_VOICES;
}

export const fetchElevenLabsVoices = fetchVoiceboxProfiles;

export async function speakWithVoicebox(
  text: string,
  config: VoiceboxConfig,
  onStart?: () => void,
  onEnd?: () => void,
): Promise<boolean> {
  if (config.enabled === false) {
    return false;
  }

  const baseUrl = (config.baseUrl || "http://127.0.0.1:17493").replace(/\/+$/, "");
  const profileId = config.profileId || config.voiceId || "default";

  const clean = text
    .replace(/```[\s\S]*?```/g, "Code block omitted.")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_#~>]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) {
    onEnd?.();
    return true;
  }

  try {
    recordSpokenPhrase(clean);

    let res = await fetch(`${baseUrl}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        text: clean,
        profile_id: profileId,
      }),
    }).catch(() => null);

    if (!res || !res.ok) {
      res = await fetch(`${baseUrl}/v1/audio/speech`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          input: clean,
          voice: profileId,
          model: "tts-1",
        }),
      }).catch(() => null);
    }

    if (!res || !res.ok) {
      console.warn(`[Voicebox] Local TTS returned error for '${clean}'`);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("severus-toast", {
            detail: `Voicebox server unavailable at ${baseUrl}. Ensure jamiepine/voicebox is running.`,
          }),
        );
      }
      return false;
    }

    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);

    if (activeAudio) {
      activeAudio.pause();
      activeAudio.currentTime = 0;
    }

    if (speakingTimeout !== null) {
      clearTimeout(speakingTimeout);
      speakingTimeout = null;
    }

    isSpeakingVoice = true;
    startSpeechFrameLoop();
    const audio = new Audio(objectUrl);
    activeAudio = audio;

    const cleanup = () => {
      isSpeakingVoice = false;
      lastPlaybackEndTime = Date.now();
      URL.revokeObjectURL(objectUrl);
      if (speakingTimeout !== null) {
        clearTimeout(speakingTimeout);
        speakingTimeout = null;
      }
      onEnd?.();
    };

    speakingTimeout = window.setTimeout(cleanup, 45000);
    audio.onended = cleanup;
    audio.onpause = cleanup;
    audio.onerror = cleanup;

    onStart?.();
    await audio.play();
    return true;
  } catch (err) {
    console.warn("[Voicebox] Failed streaming audio:", err);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("severus-toast", {
          detail: `Voicebox connection error (${String(err)}) — using local voice fallback.`,
        }),
      );
    }
    return false;
  }
}

export const speakWithElevenLabs = speakWithVoicebox;

export async function testVoiceboxConnection(
  config: VoiceboxConfig,
): Promise<{ ok: boolean; message: string }> {
  const baseUrl = (config.baseUrl || "http://127.0.0.1:17493").replace(/\/+$/, "");

  try {
    const healthRes = await fetch(`${baseUrl}/health`).catch(() => null);
    if (healthRes && healthRes.ok) {
      const genRes = await fetch(`${baseUrl}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Voicebox connection verified, Sir.", profile_id: config.profileId || "default" }),
      }).catch(() => null);

      if (genRes && genRes.ok) {
        const blob = await genRes.blob();
        const objectUrl = URL.createObjectURL(blob);
        const audio = new Audio(objectUrl);
        await audio.play();
        return { ok: true, message: "Connected! Voicebox local AI engine verified and audio played." };
      }
      return { ok: true, message: `Connected to Voicebox server at ${baseUrl}!` };
    }

    const speechRes = await fetch(`${baseUrl}/v1/audio/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "Voicebox connection verified, Sir.", voice: config.profileId || "default" }),
    }).catch(() => null);

    if (speechRes && speechRes.ok) {
      const blob = await speechRes.blob();
      const objectUrl = URL.createObjectURL(blob);
      const audio = new Audio(objectUrl);
      await audio.play();
      return { ok: true, message: "Connected! Voicebox speech endpoint verified." };
    }

    return {
      ok: false,
      message: `Unable to connect to Voicebox at ${baseUrl}. Launch Voicebox (jamiepine/voicebox) to enable local AI voice.`,
    };
  } catch (err) {
    return { ok: false, message: `Voicebox connection error: ${String(err)}` };
  }
}

export const testElevenLabsVoice = testVoiceboxConnection;

/**
 * Dynamic speech synthesis: powered by local Voicebox AI engine (jamiepine/voicebox).
 */
export function speakText(
  text: string,
  onStart?: () => void,
  onEnd?: () => void,
  customVoiceboxConfig?: VoiceboxConfig,
): void {
  if (getVoiceMuted()) {
    onEnd?.();
    return;
  }

  const formattedText = formatReplyWithSir(text);

  const voiceboxCfg = customVoiceboxConfig || loadVoiceboxConfig();
  if (
    voiceboxCfg.baseUrl?.trim() &&
    voiceboxCfg.enabled !== false
  ) {
    void speakWithVoicebox(formattedText, voiceboxCfg, onStart, onEnd).then((success) => {
      if (!success) {
        onEnd?.();
      }
    });
    return;
  }

  onEnd?.();
}

export function stopSpeaking(): void {
  if (activeAudio) {
    try {
      activeAudio.pause();
      activeAudio.currentTime = 0;
    } catch {
      // Ignored
    }
  }
  isSpeakingVoice = false;
  lastPlaybackEndTime = Date.now();
}

/**
 * Plays a crystalline, subtle acoustic boot cue on startup using Web Audio API.
 * Uses gentle dual harmonic sine waves with smooth exponential decay.
 */
export function playStartupChime(): void {
  if (getVoiceMuted()) return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // Harmonic root (528Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(440, now);
    osc1.frequency.exponentialRampToValueAtTime(528, now + 0.12);
    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.linearRampToValueAtTime(0.05, now + 0.04);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.55);

    // Subtle ethereal overtone (1056Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, now + 0.05);
    osc2.frequency.exponentialRampToValueAtTime(1056, now + 0.16);
    gain2.gain.setValueAtTime(0.001, now + 0.05);
    gain2.gain.linearRampToValueAtTime(0.035, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.05);
    osc2.stop(now + 0.7);
  } catch {
    // Graceful silence if AudioContext requires user interaction
  }
}

/**
 * Synthesizes a directional spatial acoustic cue when switching monitors.
 * Produces a soft futuristic whoosh/harmonic sweep with stereo panning.
 */
export function playSpatialShiftSound(direction: "left" | "right" | "next" | string = "right"): void {
  if (getVoiceMuted()) return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const isLeft = direction === "left";

    // Panner for spatial sensation (if supported)
    let panner: StereoPannerNode | null = null;
    try {
      panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(isLeft ? 0.6 : -0.6, now);
      panner.pan.linearRampToValueAtTime(isLeft ? -0.7 : 0.7, now + 0.3);
    } catch {
      // StereoPanner fallback
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = "sine";
    const startFreq = isLeft ? 587.33 : 392.0; // D5 vs G4
    const endFreq = isLeft ? 392.0 : 587.33;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.28);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1200, now);
    filter.frequency.exponentialRampToValueAtTime(2400, now + 0.15);
    filter.frequency.exponentialRampToValueAtTime(600, now + 0.35);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.045, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

    osc.connect(filter);
    filter.connect(gain);
    if (panner) {
      gain.connect(panner);
      panner.connect(ctx.destination);
    } else {
      gain.connect(ctx.destination);
    }

    osc.start(now);
    osc.stop(now + 0.36);
  } catch {
    // Graceful fallback
  }
}

