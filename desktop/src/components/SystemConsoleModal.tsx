import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { listSystemWindows, type WindowInfo } from "../lib/systemControl";

export interface CommandOutcome {
  ok: boolean;
  message: string;
}

interface HistoryEntry {
  id: number;
  text: string;
  ok: boolean | null; // null = still running (LLM fallback)
  message: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onRunCommand: (text: string) => Promise<CommandOutcome>;
}

const CHEAT_SHEET: Array<{ category: string; icon: Parameters<typeof Icon>[0]["name"]; phrases: Array<[string, string]> }> = [
  {
    category: "Apps & Folders",
    icon: "layers",
    phrases: [
      ["open system", "open / restore Severus workstation"],
      ["open chrome", "launch an app by name"],
      ["open documents", "known folders & the Severus workspace"],
      ["open C:\\projects\\demo", "open any path"],
    ],
  },
  {
    category: "Windows",
    icon: "monitor",
    phrases: [
      ["switch to chrome", "bring a window to the front"],
      ["snap chrome left", "snap left / right / maximize / minimize"],
      ["snap left", "snap the focused window"],
      ["minimize all", "clear the desktop"],
      ["close chrome", "destructive — asks for your password"],
      ["next desktop", "previous / next virtual desktop"],
      ["list windows", "see everything that is open"],
    ],
  },
  {
    category: "Media & Volume",
    icon: "volume",
    phrases: [
      ["volume up", "also: volume down, quieter, louder"],
      ["volume to 40", "set an exact level"],
      ["mute", "toggle mute"],
      ["play", "pause / resume, next track, previous track"],
    ],
  },
  {
    category: "Capture & System",
    icon: "camera",
    phrases: [
      ["screenshot", "saves a PNG to Pictures\\Severus"],
      ["clipboard hello world", "copy text to the clipboard"],
      ["read clipboard", "show clipboard contents"],
      ["lock the pc", "destructive — asks for your password"],
    ],
  },
  {
    category: "Voice & Listening",
    icon: "mic",
    phrases: [
      ["stop listening", "pause microphone / ignore background voices & videos"],
      ["start listening", "resume microphone / wake up listening mode"],
      ["mute mic", "pause listening mode (Ctrl+Shift+M)"],
      ["unmute mic", "resume listening mode"],
    ],
  },
];

/**
 * Command Console (Ctrl+Shift+K): typed front door for the system-control
 * grammar. Voice, this console, and the LLM fallback all resolve through the
 * same Rust command.
 */
export default function SystemConsoleModal({ open, onClose, onRunCommand }: Props) {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [windows, setWindows] = useState<WindowInfo[] | null>(null);
  const [windowsError, setWindowsError] = useState<string | null>(null);
  const historyId = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      window.setTimeout(() => inputRef.current?.focus(), 40);
      setWindows(null);
      setWindowsError(null);
      listSystemWindows()
        .then(setWindows)
        .catch((err) => setWindowsError(String(err)));
    }
  }, [open]);

  useEffect(() => {
    historyRef.current?.scrollTo({ top: 0 });
  }, [history]);

  if (!open) return null;

  const run = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const id = ++historyId.current;
    setHistory((prev) => [{ id, text: trimmed, ok: null, message: "Running…" }, ...prev].slice(0, 12));
    setInput("");
    try {
      const outcome = await onRunCommand(trimmed);
      setHistory((prev) =>
        prev.map((entry) =>
          entry.id === id ? { ...entry, ok: outcome.ok, message: outcome.message } : entry,
        ),
      );
    } catch (err) {
      setHistory((prev) =>
        prev.map((entry) =>
          entry.id === id ? { ...entry, ok: false, message: String(err) } : entry,
        ),
      );
    }
  };

  return (
    <div className="overlay console-overlay" onClick={onClose}>
      <div className="console-modal" onClick={(e) => e.stopPropagation()}>
        <div className="console-header">
          <div className="console-title">
            <Icon name="keyboard" size={15} />
            System Console
          </div>
          <div className="console-header-right">
            <kbd>Ctrl+Shift+K</kbd>
            <button className="close-btn" onClick={onClose} title="Close (Esc)" aria-label="Close (Esc)">
              <Icon name="close" size={13} />
            </button>
          </div>
        </div>

        <div className="console-input-wrap">
          <span className="console-input-icon">
            <Icon name="send" size={13} />
          </span>
          <input
            ref={inputRef}
            className="console-input"
            value={input}
            placeholder="Type a command — “open chrome”, “volume down”, “snap left”…"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void run(input);
              if (e.key === "Escape") onClose();
            }}
          />
        </div>

        {history.length > 0 && (
          <div className="console-history" ref={historyRef}>
            {history.map((entry) => (
              <div key={entry.id} className={`console-history-item ${entry.ok === false ? "error" : ""}`}>
                <span className="console-history-icon">
                  <Icon name={entry.ok === false ? "alert" : entry.ok === null ? "clock" : "check"} size={12} />
                </span>
                <span className="console-history-text">
                  <strong>{entry.text}</strong>
                  <span>{entry.message}</span>
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="console-body">
          <div className="console-cheats">
            {CHEAT_SHEET.map((section) => (
              <div key={section.category} className="console-section">
                <div className="console-section-title">
                  <Icon name={section.icon} size={12} />
                  {section.category}
                </div>
                <div className="console-phrases">
                  {section.phrases.map(([phrase, hint]) => (
                    <button
                      key={phrase}
                      type="button"
                      className="console-phrase"
                      onClick={() => void run(phrase)}
                      title={`Run “${phrase}”`}
                    >
                      <span className="console-phrase-text">{phrase}</span>
                      <span className="console-phrase-hint">{hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="console-windows">
            <div className="console-section-title">
              <Icon name="list" size={12} />
              Open windows
            </div>
            {windowsError && <div className="console-windows-error">{windowsError}</div>}
            {!windowsError && windows === null && <div className="console-windows-loading">Loading…</div>}
            {windows !== null && windows.length === 0 && (
              <div className="console-windows-loading">No open windows found.</div>
            )}
            {windows !== null && windows.length > 0 && (
              <div className="console-window-list">
                {windows.map((win) => (
                  <button
                    key={win.hwnd}
                    type="button"
                    className="console-window-row"
                    onClick={() => void run(`focus ${win.exe.replace(/\.(exe|EXE)$/, "")}`)}
                    title={`Bring “${win.title}” to the front`}
                  >
                    <span className="console-window-exe">{win.exe}</span>
                    <span className="console-window-title">{win.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="console-footer">
          <span>
            Destructive actions (lock, close window) ask for your control password. Unknown phrases are
            mapped by your configured model.
          </span>
        </div>
      </div>
    </div>
  );
}
