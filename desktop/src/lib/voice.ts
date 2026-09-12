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

    const audio = new Audio(dataUrl);
    activeAudio = audio;
    await audio.play();
  } catch (err) {
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
