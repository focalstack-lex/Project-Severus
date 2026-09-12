import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { GitStatusData, GraphData, NoteContent, NoteMeta } from "../types";

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

export function openInEditor(id: string): Promise<void> {
  return invoke<void>("open_in_editor", { id });
}

export function getGitStatus(): Promise<GitStatusData> {
  return invoke<GitStatusData>("get_git_status");
}

/** Resolves with an unlisten function once the event subscription is registered. */
export function onNotesChanged(handler: () => void): Promise<() => void> {
  return listen("notes-changed", () => handler());
}
