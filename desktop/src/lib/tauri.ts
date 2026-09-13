import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { GitStatusData, GraphData, NoteContent, NoteMeta, WorkspaceContext } from "../types";

export function getGraphData(): Promise<GraphData> {
  return invoke<GraphData>("get_graph_data");
}

export function listNotes(): Promise<NoteMeta[]> {
  return invoke<NoteMeta[]>("list_notes");
}

export function readNote(id: string): Promise<NoteContent> {
  return invoke<NoteContent>("read_note", { id });
}

export function saveNote(id: string, content: string): Promise<void> {
  return invoke<void>("save_note", { id, content });
}

export function appendJournal(text: string): Promise<string> {
  return invoke<string>("append_journal", { text });
}

export function readTodayJournal(): Promise<string> {
  return invoke<string>("read_today_journal");
}

export function openInEditor(id: string): Promise<void> {
  return invoke<void>("open_in_editor", { id });
}

export function getGitStatus(): Promise<GitStatusData> {
  return invoke<GitStatusData>("get_git_status");
}

export function getWorkspaceContext(): Promise<WorkspaceContext> {
  return invoke<WorkspaceContext>("get_workspace_context");
}

export function getVoiceAudio(name: string): Promise<string> {
  return invoke<string>("get_voice_audio", { name });
}

export function restoreWindow(): Promise<void> {
  return invoke<void>("restore_window");
}

export function hideToTray(): Promise<void> {
  return invoke<void>("hide_to_tray");
}

export function setFloatingMode(floating: boolean): Promise<void> {
  return invoke<void>("set_floating_mode", { floating });
}

export function moveToMonitor(target: "left" | "right" | "next" | "primary" | string): Promise<string> {
  return invoke<string>("move_to_monitor", { target });
}

export function openSoundSettings(): Promise<void> {
  return invoke<void>("open_sound_settings");
}

export function toggleMaximize(): Promise<boolean> {
  return invoke<boolean>("toggle_maximize");
}

export function maximizeWindow(): Promise<void> {
  return invoke<void>("maximize_window");
}

export function toggleFullscreen(): Promise<boolean> {
  return invoke<boolean>("toggle_fullscreen");
}

export function setFloatingDimensions(width: number, height: number): Promise<void> {
  return invoke<void>("set_floating_dimensions", { width, height });
}

/** Resolves with an unlisten function once the event subscription is registered. */
export function onNotesChanged(handler: () => void): Promise<() => void> {
  return listen("notes-changed", () => handler());
}

export async function openExternalUrl(url: string): Promise<void> {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } catch (err) {
    console.warn("Failed to open via tauri opener, fallback to window.open:", err);
    window.open(url, "_blank");
  }
}

export * from "./memory";
export * from "./audioDevices";

