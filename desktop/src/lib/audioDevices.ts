/**
 * audioDevices.ts — Audio Input Device Management for Severus.
 * Handles microphone enumeration, selection persistence, and stream acquisition.
 */

export interface AudioDevice {
  deviceId: string;
  label: string;
  isDefault: boolean;
}

const STORAGE_KEY_MIC_ID = "severus_selected_mic_id";
const STORAGE_KEY_MIC_LABEL = "severus_selected_mic_label";

const micChangeListeners = new Set<(deviceId: string) => void>();

/**
 * Get the currently selected microphone deviceId from localStorage.
 * Returns empty string if system default is preferred.
 */
export function getSelectedMicrophoneId(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_MIC_ID) || "";
  } catch {
    return "";
  }
}

/**
 * Get the currently selected microphone friendly label from localStorage.
 */
export function getSelectedMicrophoneLabel(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_MIC_LABEL) || "System Default Microphone";
  } catch {
    return "System Default Microphone";
  }
}

/**
 * Set the preferred microphone deviceId and label, notifying all listeners.
 */
export function setSelectedMicrophone(deviceId: string, label: string): void {
  try {
    if (!deviceId) {
      localStorage.removeItem(STORAGE_KEY_MIC_ID);
      localStorage.setItem(STORAGE_KEY_MIC_LABEL, "System Default Microphone");
    } else {
      localStorage.setItem(STORAGE_KEY_MIC_ID, deviceId);
      localStorage.setItem(STORAGE_KEY_MIC_LABEL, label);
    }
  } catch {
    // ignore storage quota
  }

  micChangeListeners.forEach((listener) => {
    try {
      listener(deviceId);
    } catch (err) {
      console.warn("[audioDevices] Error in listener callback:", err);
    }
  });
}

/**
 * Subscribe to microphone selection changes.
 */
export function onMicrophoneChanged(callback: (deviceId: string) => void): () => void {
  micChangeListeners.add(callback);
  return () => {
    micChangeListeners.delete(callback);
  };
}

/**
 * Enumerate all available audio input devices (microphones).
 * Requests temporary permission if labels are not yet exposed.
 */
export async function getMicrophoneDevices(): Promise<AudioDevice[]> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices) {
    return [];
  }

  // Probe mediaDevices to unlock device labels if currently anonymized
  try {
    const devicesInitial = await navigator.mediaDevices.enumerateDevices();
    const hasLabels = devicesInitial.some((d) => d.kind === "audioinput" && d.label.length > 0);
    if (!hasLabels) {
      const probeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      probeStream.getTracks().forEach((track) => track.stop());
    }
  } catch {
    // Ignore probe errors (user may have denied or system busy)
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter((d) => d.kind === "audioinput");

    return audioInputs.map((d, index) => {
      const isDefault = d.deviceId === "default" || d.deviceId === "";
      let label = d.label;
      if (!label) {
        label = isDefault ? "Default Microphone" : `Microphone ${index + 1}`;
      }
      return {
        deviceId: d.deviceId,
        label,
        isDefault,
      };
    });
  } catch (err) {
    console.warn("[audioDevices] Could not enumerate audio devices:", err);
    return [];
  }
}

/**
 * Acquire a MediaStream specifically from the selected microphone deviceId.
 */
export async function getMicrophoneStream(deviceId?: string): Promise<MediaStream> {
  const targetId = deviceId !== undefined ? deviceId : getSelectedMicrophoneId();
  const constraints: MediaStreamConstraints = {
    audio: targetId
      ? {
          deviceId: { exact: targetId },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        }
      : {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
  };

  return await navigator.mediaDevices.getUserMedia(constraints);
}
