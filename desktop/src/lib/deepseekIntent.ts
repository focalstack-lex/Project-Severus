import type { AIConfig } from "./ai";
import { chatOnce } from "./ai";
import type { SystemIntent } from "./systemControl";

/**
 * LLM fallback for the system-command grammar: when the deterministic Rust
 * parser does not match a phrase, the configured model (e.g. DeepSeek) gets a
 * strict schema and may map the phrase to ONE of the allowlisted intents.
 * The model can never invent new actions — unmapped output is rejected here,
 * and execution still goes through the same Rust gate as grammar hits.
 */

const INTENT_PROMPT = `You translate a user's Windows-control request into exactly one system action.

Respond with ONLY a JSON object, no prose, no code fences:
{"action": "<name>", "arg": <string | number | {"target": string|null, "position": string} | {"query": string, "engine": string}>}

Allowed actions and their arg shapes:
- launch_app: app name (e.g. "chrome", "notepad", "explorer", "spotify", "cursor", "figma")
- open_known_folder: one of "shell:Personal", "shell:Downloads", "shell:Desktop", "shell:My Pictures", "shell:My Music", "shell:My Video", "@workspace", "@notes"
- open_path: a Windows file or folder path (e.g. "C:\\Users", "~/Documents")
- volume_set: integer 0-100
- volume_step: integer step (e.g. 10, -10, 20, -20)
- mute_toggle: no arg
- media_key: "play_pause" | "next" | "prev" | "stop"
- screenshot: no arg
- focus_app: app or window title to bring to front
- list_windows: no arg
- snap_window: {"target": "<app title substring or null for focused>", "position": "left"|"right"|"maximize"|"minimize"}
- minimize_all: no arg
- switch_desktop: "next" | "prev"
- close_window: app or window title to close
- web_search: {"query": "<search query>", "engine": "google"|"youtube"|"bing"|"duckduckgo"|"github"|"wikipedia"}
- lock_workstation: no arg

If the request is not a Windows control action, or maps to none of these, respond {"action": "none"}. The user may speak loosely — interpret "put the music thing on" as media play/pause, "wake the screen up" as focus the current window — but never choose an action outside the list.`;

export interface RawIntent {
  action?: string;
  arg?: unknown;
}

export function validIntent(raw: RawIntent): SystemIntent | null {
  const str = (value: unknown): string => (typeof value === "string" ? value : "");
  switch (raw.action) {
    case "launch_app":
    case "open_known_folder":
    case "open_path":
    case "focus_app":
    case "close_window":
    case "switch_desktop":
    case "media_key": {
      const arg = str(raw.arg);
      return arg ? ({ action: raw.action, arg } as SystemIntent) : null;
    }
    case "volume_set": {
      const n = Number(raw.arg);
      return Number.isFinite(n) ? { action: "volume_set", arg: Math.max(0, Math.min(100, Math.round(n))) } : null;
    }
    case "volume_step": {
      const n = Number(raw.arg);
      if (!Number.isFinite(n) || n === 0) return null;
      const clamped = Math.max(-100, Math.min(100, Math.round(n)));
      return { action: "volume_step", arg: clamped };
    }
    case "web_search": {
      if (typeof raw.arg !== "object" || raw.arg === null) return null;
      const arg = raw.arg as { query?: unknown; engine?: unknown };
      const query = str(arg.query).trim();
      if (!query) return null;
      const engineStr = str(arg.engine).trim().toLowerCase();
      const engine = ["google", "youtube", "bing", "duckduckgo", "github", "wikipedia"].includes(engineStr) ? engineStr : "google";
      return { action: "web_search", arg: { query, engine } };
    }
    case "snap_window": {
      if (typeof raw.arg !== "object" || raw.arg === null) return null;
      const arg = raw.arg as { target?: unknown; position?: unknown };
      const position = str(arg.position);
      if (!["left", "right", "maximize", "minimize"].includes(position)) return null;
      const target = typeof arg.target === "string" && arg.target.trim() ? arg.target.trim() : null;
      return { action: "snap_window", arg: { target, position } };
    }
    case "mute_toggle":
    case "clipboard_read":
    case "screenshot":
    case "list_windows":
    case "minimize_all":
    case "lock_workstation":
      return { action: raw.action } as SystemIntent;
    case "clipboard_write": {
      const arg = str(raw.arg);
      return arg ? ({ action: "clipboard_write", arg } as SystemIntent) : null;
    }
    default:
      return null;
  }
}

export async function mapTextToIntent(text: string, config: AIConfig): Promise<SystemIntent | null> {
  const reply = await chatOnce(config, INTENT_PROMPT, text);
  const match = reply.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as RawIntent;
    if (!parsed.action || parsed.action === "none") return null;
    return validIntent(parsed);
  } catch {
    return null;
  }
}
