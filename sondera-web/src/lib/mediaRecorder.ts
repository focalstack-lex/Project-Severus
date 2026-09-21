export interface QuickSnapInput {
  title: string;
  latitude: number;
  longitude: number;
  photoBlobSize: number;
  audioDurationSec: number;
}

export interface QuickSnapPayload extends QuickSnapInput {
  id: string;
  capturedAt: string;
}

export function getSupportedAudioMimeType(): string {
  if (typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined') {
    const types = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/aac'];
    for (const type of types) {
      if (window.MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
  }
  return 'audio/mp4';
}

export function createQuickSnapPayload(input: QuickSnapInput): QuickSnapPayload {
  return {
    ...input,
    id: `snap-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    capturedAt: new Date().toISOString(),
  };
}
