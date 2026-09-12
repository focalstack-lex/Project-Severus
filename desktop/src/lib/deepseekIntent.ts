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
{"action": "<name>", "arg": <string | number | {"target": string|null, "position": string}>}

Allowed actions and their arg shapes:
- launch_app: app name (e.g. "chrome", "notepad", "explorer")
- open_known_folder: one of "shell:Personal", "shell:Downloads", "shell:Desktop", "shell:My Pictures", "shell:My Music", "shell:My Video", "@workspace", "@notes"
- open_path: a Windows file or folder path
- volume_set: integer 0-100
- volume_step: integer 10 or -10
- mute_toggle: no arg
- media_key: "play_pause" | "next" | "prev" | "stop"
- screenshot: no arg
- focus_app: app or window title to bring to front
- list_windows: no arg
- snap_window: {"target": "<app title substring or null for focused>", "position": "left"|"right"|"maximize"|"minimize"}
- minimize_all: no arg
- switch_desktop: "next" | "prev"
- close_window: app or window title to close

If the request is not a Windows control action, or maps to none of these, respond {"action": "none"}. The user may speak loosely — interpret "put the music thing on" as media play/pause, "wake the screen up" as focus the current window — but never choose an action outside the list.`;

interface RawIntent {
  action?: string;
  arg?: unknown;
}

function validIntent(raw: RawIntent): SystemIntent | null {
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
      return Number.isFinite(n) ? { action: "volume_set", arg: Math.round(n) } : null;
    }
    case "volume_step": {
      const n = Number(raw.arg);
      return n === 10 || n === -10 ? { action: "volume_step", arg: n } : null;
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
