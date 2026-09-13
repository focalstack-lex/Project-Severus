import { invoke } from "@tauri-apps/api/core";
import type { MemoryFilter, MemoryItem } from "../types";

/**
 * Fetch all structured user memories, optionally filtered by category, status, importance, or search.
 */
export async function getUserMemories(filter?: MemoryFilter): Promise<MemoryItem[]> {
  try {
    return await invoke<MemoryItem[]>("get_user_memories", { filter });
  } catch (err) {
    console.warn("Failed to load user memories from Tauri backend:", err);
    return [];
  }
}

/**
 * Fetch high-importance grounding memories (hard constraints, identity, active projects).
 */
export async function getGroundingMemories(): Promise<MemoryItem[]> {
  try {
    return await invoke<MemoryItem[]>("get_grounding_memories");
  } catch (err) {
    console.warn("Failed to load grounding memories:", err);
    return [];
  }
}

/**
 * Fetch a compact, formatted cognitive grounding summary string suitable for LLM system prompts.
 */
export async function getMemorySummary(): Promise<string> {
  try {
    return await invoke<string>("get_memory_summary");
  } catch (err) {
    console.warn("Failed to load memory summary:", err);
    return "";
  }
}

/**
 * Save or update a memory item in the structured USER store.
 */
export async function saveUserMemory(item: MemoryItem): Promise<void> {
  return await invoke<void>("save_user_memory", { item });
}

/**
 * Delete a memory item by ID.
 */
export async function deleteUserMemory(id: string): Promise<boolean> {
  return await invoke<boolean>("delete_user_memory", { id });
}
