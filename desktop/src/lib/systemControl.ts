import { invoke } from "@tauri-apps/api/core";

/**
 * Typed bridge to the Windows system-control backend. Every action — voice,
 * console, or LLM fallback — resolves and executes through the Rust grammar,
 * which enforces the password gate server-side.
 */

export interface Resolution {
  intent: SystemIntent;
  requires_password: boolean;
  description: string;
}

export type SystemIntent =
  | { action: "launch_app"; arg: string }
  | { action: "open_known_folder"; arg: string }
  | { action: "open_path"; arg: string }
  | { action: "volume_set"; arg: number }
  | { action: "volume_step"; arg: number }
  | { action: "mute_toggle" }
  | { action: "media_key"; arg: string }
  | { action: "clipboard_write"; arg: string }
  | { action: "clipboard_read" }
  | { action: "screenshot" }
  | { action: "focus_app"; arg: string }
  | { action: "list_windows" }
  | { action: "snap_window"; arg: { target: string | null; position: string } }
  | { action: "minimize_all" }
  | { action: "switch_desktop"; arg: string }
  | { action: "web_search"; arg: { query: string; engine: string } }
  | { action: "lock_workstation" }
  | { action: "close_window"; arg: string };

export interface WindowInfo {
  hwnd: number;
  title: string;
  exe: string;
}

export function resolveSystemCommand(text: string): Promise<Resolution | null> {
  return invoke<Resolution | null>("system_resolve_command", { text });
}

export function executeSystemIntent(intent: SystemIntent, confirmed: boolean): Promise<string> {
  return invoke<string>("system_execute", { intent, confirmed });
}

export function listSystemWindows(): Promise<WindowInfo[]> {
  return invoke<WindowInfo[]>("system_list_windows");
}

// --- Control password (accidental-execution gate) ---
// Stored as a SHA-256 hash; the authoritative gate is the `confirmed` flag
// re-checked inside the Rust executor. This is not a hardened security
// boundary against someone with keyboard access to the machine.

const PW_HASH_KEY = "severus_control_pw_hash";

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hasControlPassword(): boolean {
  return Boolean(localStorage.getItem(PW_HASH_KEY));
}

export async function setControlPassword(password: string): Promise<void> {
  const hash = await sha256Hex(password);
  localStorage.setItem(PW_HASH_KEY, hash);
}

export async function verifyControlPassword(password: string): Promise<boolean> {
  const stored = localStorage.getItem(PW_HASH_KEY);
  if (!stored) return false;
  return (await sha256Hex(password)) === stored;
}
