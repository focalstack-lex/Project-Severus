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

export async function playVoice(soundName: string): Promise<void> {
  if (getVoiceMuted()) return;

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
      lastPlaybackEndTime = Date.now();
      if (speakingTimeout !== null) clearTimeout(speakingTimeout);
      speakingTimeout = window.setTimeout(() => {
        isSpeakingVoice = false;
        lastPlaybackEndTime = Date.now();
      }, 1200);
    };

    audio.onended = resetSpeaking;
    audio.onpause = resetSpeaking;
    audio.onerror = resetSpeaking;

    await audio.play();
  } catch (err) {
    isSpeakingVoice = false;
    lastPlaybackEndTime = Date.now();
    console.warn(`[VoiceManager] Failed playing voice '${soundName}':`, err);
  }
}

export async function playTimeGreeting(): Promise<void> {
  const hour = new Date().getHours();
  let file = "Good morning, Sir!.mp3";
  if (hour >= 12 && hour < 18) {
    file = "Good afternoon, Sir!.mp3";
  } else if (hour >= 18 || hour < 5) {
    file = "Good evening, Sir!.mp3";
  }
  await playVoice(file);
}
