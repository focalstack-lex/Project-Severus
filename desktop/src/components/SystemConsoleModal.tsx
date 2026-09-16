import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
    <AnimatePresence>
      {open && (
        <motion.div
          key="console-overlay"
          className="overlay console-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          onClick={onClose}
        >
          <motion.div
            key="console-modal"
            className="console-modal"
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
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

            <form
              className="console-input-row"
              onSubmit={(e) => {
                e.preventDefault();
                void run(input);
              }}
            >
              <input
                ref={inputRef}
                type="text"
                className="console-input"
                value={input}
                placeholder="Type a system command (e.g. 'snap chrome left', 'volume 50', 'mute', 'list windows')…"
                onChange={(e) => setInput(e.target.value)}
              />
              <button type="submit" className="accent">
                Run
              </button>
            </form>

            <div className="console-body">
              {/* Left: command history log */}
              <div className="console-history" ref={historyRef}>
                <div className="history-head">
                  <span>Recent Commands</span>
                  {history.length > 0 && (
                    <button type="button" className="text-btn" onClick={() => setHistory([])}>
                      Clear
                    </button>
                  )}
                </div>
                {history.length === 0 ? (
                  <div className="history-empty">
                    No commands run yet. Type a command above or pick a cheat-sheet phrase on the right.
                  </div>
                ) : (
                  history.map((entry) => (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                      className={`history-item ${
                        entry.ok === null ? "running" : entry.ok ? "success" : "error"
                      }`}
                    >
                      <div className="history-command">
                        <span className="history-status-dot" />
                        <code>{entry.text}</code>
                      </div>
                      <div className="history-message">{entry.message}</div>
                    </motion.div>
                  ))
                )}
              </div>

              {/* Right: cheat sheet / window list */}
              <div className="console-cheat-sheet">
                <div className="cheat-head">Examples &amp; Open Windows</div>

                {CHEAT_SHEET.map((sec) => (
                  <div key={sec.category} className="cheat-section">
                    <div className="cheat-sec-title">
                      <Icon name={sec.icon} size={12} />
                      {sec.category}
                    </div>
                    <div className="cheat-phrases">
                      {sec.phrases.map(([phrase, note]) => (
                        <button
                          key={phrase}
                          type="button"
                          className="cheat-pill"
                          onClick={() => {
                            setInput(phrase);
                            inputRef.current?.focus();
                          }}
                          title={note}
                        >
                          <code>{phrase}</code>
                          <span className="cheat-note">{note}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}

                {windows && windows.length > 0 && (
                  <div className="cheat-section">
                    <div className="cheat-sec-title">
                      <Icon name="monitor" size={12} />
                      Open Windows ({windows.length})
                    </div>
                    <div className="windows-list">
                      {windows.slice(0, 10).map((w) => (
                        <div
                          key={w.hwnd}
                          className="window-item"
                          onClick={() => {
                            setInput(`switch to ${w.exe.replace(/\.(exe|EXE)$/, "")}`);
                            inputRef.current?.focus();
                          }}
                          title={`Click to target "${w.title}"`}
                        >
                          <span className="window-proc">{w.exe}</span>
                          <span className="window-title">{w.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {windowsError && (
                  <div className="windows-error">Could not enumerate windows: {windowsError}</div>
                )}
              </div>
            </div>

            <div className="console-footer">
              <span>
                Destructive actions (lock, close window) ask for your control password. Unknown phrases are
                mapped by your configured model.
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
