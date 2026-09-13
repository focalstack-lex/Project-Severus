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

async function playElevenLabsPhrase(
  phrase: string,
  config: ElevenLabsConfig,
): Promise<boolean> {
  const cleanKey = config.apiKey?.trim().replace(/^["']|["']$/g, "");
  const voiceId = config.voiceId?.trim().replace(/^["']|["']$/g, "");
  if (!cleanKey || !voiceId) return false;

  const cacheKey = `${voiceId}_${phrase}`;
  let audioUrl = elevenAudioCache.get(cacheKey);

  if (!audioUrl) {
    try {
      const modelId = config.modelId || "eleven_flash_v2_5";
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
        method: "POST",
        headers: {
          "xi-api-key": cleanKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: phrase,
          model_id: modelId,
          voice_settings: {
            stability: 0.52,
            similarity_boost: 0.85,
            style: 0.0,
            use_speaker_boost: true,
          },
        }),
      });

      if (!res.ok) {
        console.warn(`[VoiceManager] ElevenLabs TTS returned ${res.status} for '${phrase}', using local voice fallback.`);
        return false;
      }

      const blob = await res.blob();
      audioUrl = URL.createObjectURL(blob);
      elevenAudioCache.set(cacheKey, audioUrl);
    } catch (err) {
      console.warn(`[VoiceManager] ElevenLabs network error for '${phrase}', using local voice fallback:`, err);
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
    console.warn(`[VoiceManager] Failed playing ElevenLabs audio for '${phrase}':`, err);
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

  // 1. If ElevenLabs is configured and enabled, speak dynamically via ElevenLabs Neural Voice
  const elevenConfig = loadElevenLabsConfig();
  if (
    elevenConfig.enabled !== false &&
    elevenConfig.apiKey?.trim() &&
    elevenConfig.voiceId?.trim()
  ) {
    const success = await playElevenLabsPhrase(phrase, elevenConfig);
    if (success) return;
  }

  // 2. Fall back to local hardcoded MP3 if available (pre-recorded authentic audio only)
  await playLocalVoiceFallback(soundName);
}

export async function playTimeGreeting(): Promise<void> {
  if (getVoiceMuted()) return;
  const greetingData = getTimeGreetingData();

  // 1. If ElevenLabs is configured and enabled, speak tailored time greeting
  const elevenConfig = loadElevenLabsConfig();
  if (
    elevenConfig.enabled !== false &&
    elevenConfig.apiKey?.trim() &&
    elevenConfig.voiceId?.trim()
  ) {
    recordSpokenPhrase(greetingData.extendedScript);
    const success = await playElevenLabsPhrase(greetingData.extendedScript, elevenConfig);
    if (success) return;
  }

  // 2. Fall back to local hardcoded MP3 if ElevenLabs is unconfigured or offline
  await playLocalVoiceFallback(greetingData.soundFile);
}

export interface ElevenLabsConfig {
  apiKey?: string;
  voiceId?: string;
  modelId?: string;
  enabled?: boolean;
}

export interface VoicePreset {
  id: string;
  name: string;
  category: "premade" | "cloned" | "library" | "custom";
  accent?: string;
  description: string;
}

export const FREE_PREMADE_VOICES: VoicePreset[] = [
  {
    id: "JBFqnCBsd6RMkjVDRZzb",
    name: "George",
    category: "premade",
    accent: "British Male",
    description: "Warm, captivating British storyteller. Deep raspy tone closest to Severus (Free Tier API allowed).",
  },
  {
    id: "onwK4e9ZLuTAKqWW03F9",
    name: "Daniel",
    category: "premade",
    accent: "Deep British Male",
    description: "Deep, authoritative and articulate British broadcaster (Free Tier API allowed).",
  },
  {
    id: "nPczCjzI2devNBz1zQrb",
    name: "Brian",
    category: "premade",
    accent: "Deep Male Narrator",
    description: "Resonant, deep male narration voice (Free Tier API allowed).",
  },
  {
    id: "IKne3meq5aSn9XLyUdCD",
    name: "Charlie",
    category: "premade",
    accent: "Deep Male",
    description: "Deep, confident male cadence (Free Tier API allowed).",
  },
  {
    id: "CwhRBWXzGAHq8TQ4Fs17",
    name: "Roger",
    category: "premade",
    accent: "Classy Male",
    description: "Laid-back, classy resonant male (Free Tier API allowed).",
  },
  {
    id: "N2lVS1w4EtoT3dr4eOWO",
    name: "Callum",
    category: "premade",
    accent: "Husky Male",
    description: "Intense, husky male tone (Free Tier API allowed).",
  },
];

const ELEVENLABS_STORAGE_KEY = "severus_elevenlabs_config";

export function loadElevenLabsConfig(): ElevenLabsConfig {
  try {
    const raw = localStorage.getItem(ELEVENLABS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const metaEnv = (import.meta as any).env || {};
    return {
      apiKey: parsed.apiKey || metaEnv.VITE_ELEVENLABS_API_KEY || "",
      voiceId: parsed.voiceId || metaEnv.VITE_ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb",
      modelId: parsed.modelId || metaEnv.VITE_ELEVENLABS_MODEL_ID || "eleven_flash_v2_5",
      enabled: parsed.enabled !== false,
    };
  } catch {
    const metaEnv = (import.meta as any).env || {};
    return {
      apiKey: metaEnv.VITE_ELEVENLABS_API_KEY || "",
      voiceId: metaEnv.VITE_ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb",
      modelId: metaEnv.VITE_ELEVENLABS_MODEL_ID || "eleven_flash_v2_5",
      enabled: true,
    };
  }
}

export function saveElevenLabsConfig(cfg: ElevenLabsConfig): void {
  try {
    localStorage.setItem(ELEVENLABS_STORAGE_KEY, JSON.stringify(cfg));
  } catch (err) {
    console.error("Failed saving ElevenLabs config:", err);
  }
}

export async function fetchElevenLabsVoices(
  apiKey: string,
): Promise<VoicePreset[]> {
  const cleanKey = apiKey.trim().replace(/^["']|["']$/g, "");
  if (!cleanKey) return FREE_PREMADE_VOICES;

  try {
    const res = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: {
        "xi-api-key": cleanKey,
      },
    });
    if (!res.ok) return FREE_PREMADE_VOICES;
    const data = await res.json();
    if (Array.isArray(data.voices)) {
      return data.voices.map((v: any) => ({
        id: v.voice_id,
        name: v.name,
        category: (v.category as any) || "premade",
        accent: v.labels?.accent || v.labels?.gender || "",
        description: v.labels?.description || v.labels?.use_case || v.category || "",
      }));
    }
    return FREE_PREMADE_VOICES;
  } catch {
    return FREE_PREMADE_VOICES;
  }
}

export async function speakWithElevenLabs(
  text: string,
  config: ElevenLabsConfig,
  onStart?: () => void,
  onEnd?: () => void,
): Promise<boolean> {
  const cleanKey = config.apiKey?.trim().replace(/^["']|["']$/g, "");
  const voiceId = config.voiceId?.trim().replace(/^["']|["']$/g, "");
  if (!cleanKey || !voiceId || config.enabled === false) {
    return false;
  }

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

    const modelId = config.modelId || "eleven_flash_v2_5";
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
      method: "POST",
      headers: {
        "xi-api-key": cleanKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: clean,
        model_id: modelId,
        voice_settings: {
          stability: 0.52,
          similarity_boost: 0.85,
          style: 0.0,
          use_speaker_boost: true,
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      let detail = errText;
      try {
        const json = JSON.parse(errText);
        detail = json.detail?.message || json.detail?.status || json.message || errText;
      } catch {
        // Ignored
      }
      console.warn(`[ElevenLabs] TTS returned HTTP ${res.status}: ${detail}`);
      if (typeof window !== "undefined") {
        let msg = `ElevenLabs HTTP ${res.status}`;
        if (res.status === 401) msg = "ElevenLabs: Invalid API Key (401)";
        else if (res.status === 402)
          msg =
            "ElevenLabs Free Tier (402): Library & cloned voices require paid plan. Switch to a Premade voice (e.g. George) in Voice Settings.";
        else if (res.status === 403) msg = "ElevenLabs: Key Permission Denied (403) — set Text to Speech to Access";
        else if (res.status === 404) msg = `ElevenLabs: Voice ID '${voiceId}' not found (404)`;
        else if (res.status === 429) msg = "ElevenLabs: Quota / Rate limit reached (429)";
        window.dispatchEvent(new CustomEvent("severus-toast", { detail: `${msg} — using local voice fallback.` }));
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
    console.warn("[ElevenLabs] Failed streaming audio:", err);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("severus-toast", {
          detail: `ElevenLabs connection error (${String(err)}) — using local voice.`,
        }),
      );
    }
    return false;
  }
}

export async function testElevenLabsVoice(
  config: ElevenLabsConfig,
): Promise<{ ok: boolean; message: string }> {
  const cleanKey = config.apiKey?.trim().replace(/^["']|["']$/g, "");
  const voiceId = config.voiceId?.trim().replace(/^["']|["']$/g, "");
  if (!cleanKey) {
    return { ok: false, message: "Please enter your ElevenLabs API Key." };
  }
  if (!voiceId) {
    return { ok: false, message: "Please enter your ElevenLabs Voice ID." };
  }

  try {
    const modelId = config.modelId || "eleven_flash_v2_5";
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
      method: "POST",
      headers: {
        "xi-api-key": cleanKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: "A remarkable development, Sir. ElevenLabs neural voice synthesis is operational.",
        model_id: modelId,
        voice_settings: {
          stability: 0.52,
          similarity_boost: 0.85,
          style: 0.0,
          use_speaker_boost: true,
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      let detail = errText;
      try {
        const json = JSON.parse(errText);
        detail = json.detail?.message || json.detail?.status || json.message || errText;
      } catch {
        // Ignored
      }
      if (res.status === 401) {
        return { ok: false, message: "Invalid ElevenLabs API Key (401 Unauthorized)." };
      }
      if (res.status === 402) {
        return {
          ok: false,
          message:
            "HTTP 402: ElevenLabs Free Tier accounts cannot use Community Library voices or custom clones via the API. Select a Free Premade Voice below (e.g., George: JBFqnCBsd6RMkjVDRZzb) or upgrade to ElevenLabs Starter.",
        };
      }
      if (res.status === 403) {
        return {
          ok: false,
          message: "Permission Denied (403): In ElevenLabs, set 'Text to Speech' to 'Access' or toggle off 'Restrict Key'.",
        };
      }
      if (res.status === 404) {
        return { ok: false, message: `Voice ID '${voiceId}' not found (404). Check that the Voice ID was copied correctly.` };
      }
      return { ok: false, message: `ElevenLabs returned HTTP ${res.status}: ${detail}` };
    }

    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const audio = new Audio(objectUrl);
    await audio.play();
    return { ok: true, message: "Connected! ElevenLabs voice verified and audio played." };
  } catch (err) {
    return { ok: false, message: `Connection error: ${String(err)}` };
  }
}

/**
 * Dynamic speech synthesis: powered exclusively by ElevenLabs Neural Voice API.
 * Web Speech API synthesis has been completely removed system-wide.
 */
export function speakText(
  text: string,
  onStart?: () => void,
  onEnd?: () => void,
  customElevenLabsConfig?: ElevenLabsConfig,
): void {
  if (getVoiceMuted()) {
    onEnd?.();
    return;
  }

  const formattedText = formatReplyWithSir(text);

  // ElevenLabs Neural Voice API only
  const elevenConfig = customElevenLabsConfig || loadElevenLabsConfig();
  if (
    elevenConfig.apiKey?.trim() &&
    elevenConfig.voiceId?.trim() &&
    elevenConfig.enabled !== false
  ) {
    void speakWithElevenLabs(formattedText, elevenConfig, onStart, onEnd).then((success) => {
      if (!success) {
        onEnd?.();
      }
    });
    return;
  }

  // If ElevenLabs is unconfigured or disabled, do not speak (no robotic web voice fallback)
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

