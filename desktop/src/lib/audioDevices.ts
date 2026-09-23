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
 * Build capture constraints for a target device.
 *
 * `raw` keeps browser DSP off, which transient analysis (clap detection) needs:
 * echo cancellation, noise suppression and automatic gain control all erase the
 * impulse peaks the detector looks for.
 */
function buildAudioConstraints(targetId: string, raw: boolean): MediaTrackConstraints {
  const processing: MediaTrackConstraints = raw
    ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    : { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  return targetId ? { ...processing, deviceId: { ideal: targetId } } : processing;
}

/**
 * Single acquisition policy for every microphone consumer: prefer the requested
 * device and fall back to the system default when it is stale or unavailable, so
 * a changed device id cannot disable voice input entirely.
 */
async function acquireMicrophone(targetId: string, raw: boolean): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: buildAudioConstraints(targetId, raw) });
  } catch (err) {
    console.warn(
      "[audioDevices] Constrained acquisition failed, falling back to the system default microphone:",
      err,
    );
    return await navigator.mediaDevices.getUserMedia({ audio: buildAudioConstraints("", raw) });
  }
}

/**
 * Acquire a MediaStream specifically from the selected microphone deviceId.
 */
export async function getMicrophoneStream(deviceId?: string): Promise<MediaStream> {
  const targetId = deviceId !== undefined ? deviceId : getSelectedMicrophoneId();
  return acquireMicrophone(targetId, false);
}

/**
 * Acquire a DSP-free capture stream for transient/impulse analysis.
 */
export async function getRawMicrophoneStream(deviceId?: string): Promise<MediaStream> {
  const targetId = deviceId !== undefined ? deviceId : getSelectedMicrophoneId();
  return acquireMicrophone(targetId, true);
}
