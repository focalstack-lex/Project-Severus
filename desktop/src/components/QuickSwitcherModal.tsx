import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { NoteMeta } from "../types";
import Icon from "./Icon";

interface Props {
  open: boolean;
  notes: NoteMeta[];
  onSelectNote: (id: string) => void;
  onNewNote: () => void;
  onOpenJournal: () => void;
  onOpenAISettings: () => void;
  onOpenCopilot: () => void;
  onOpenGrounding?: () => void;
  onOpenSystemConsole?: () => void;
  onOpenRunningMode?: () => void;
  onSyncStrava?: () => void;
  onOpenSchoolHub?: () => void;
  onToggleMic?: () => void;
  onToggleThinkingMode?: () => void;
  onRunCommand?: (text: string) => Promise<{ ok: boolean; message: string }>;
  onShowToast?: (msg: string) => void;
  onClose: () => void;
}

interface ActionItem {
  id: string;
  type: "action";
  title: string;
  sub: string;
  shortcut: string;
  execute: () => void;
}

interface NoteItem {
  id: string;
  type: "note";
  title: string;
  sub: string;
  note: NoteMeta;
}

type ListItem = ActionItem | NoteItem;

export default function QuickSwitcherModal({
  open,
  notes,
  onSelectNote,
  onNewNote,
  onOpenJournal,
  onOpenAISettings,
  onOpenCopilot,
  onOpenGrounding,
  onOpenSystemConsole,
  onOpenRunningMode,
  onSyncStrava,
  onOpenSchoolHub,
  onToggleMic,
  onToggleThinkingMode,
  onRunCommand,
  onShowToast,
  onClose,
}: Props) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const actions: ActionItem[] = useMemo(
    () => [
      {
        id: "action-thinking-mode",
        type: "action",
        title: "Open JARVIS Thinking Mode",
        sub: "Summon the centered 3D Holographic Particle Waveform Reactor HUD",
        shortcut: "Thinking",
        execute: () => onToggleThinkingMode?.(),
      },
      {
        id: "action-new-note",
        type: "action",
        title: "Create New Note",
        sub: "Initialize a blank markdown note in second-brain/notes/",
        shortcut: "Ctrl+Alt+N",
        execute: onNewNote,
      },
      {
        id: "action-journal",
        type: "action",
        title: "Quick Capture Journal Entry",
        sub: "Timestamp and append thought to today's log",
        shortcut: "Ctrl+J",
        execute: onOpenJournal,
      },
      {
        id: "action-running-mode",
        type: "action",
        title: "Launch Running Cockpit",
        sub: "Full-screen endurance telemetry, pace splits, Strava metrics & audio coaching",
        shortcut: "Running",
        execute: () => onOpenRunningMode?.(),
      },
      {
        id: "action-sync-strava",
        type: "action",
        title: "Sync Strava Athletic Telemetry",
        sub: "Refresh latest runs, weekly mileage, heart rate & elevation gain",
        shortcut: "Strava",
        execute: () => onSyncStrava?.(),
      },
      {
        id: "action-school-hub",
        type: "action",
        title: "Open Academic Hub & Inbox",
        sub: "Cor Jesu College BSCpE updates, assignments, classroom announcements & mail",
        shortcut: "School Hub",
        execute: () => onOpenSchoolHub?.(),
      },
      {
        id: "action-toggle-mic",
        type: "action",
        title: "Toggle Hands-Free Voice Listener",
        sub: "Turn live speech recognition on or off for voice commands",
        shortcut: "Ctrl+Shift+M",
        execute: () => onToggleMic?.(),
      },
      {
        id: "action-grounding",
        type: "action",
        title: "Assemble Agent Grounding Context",
        sub: "Compile architecture directives, notes & token counts for AI agents",
        shortcut: "Ctrl+Shift+G",
        execute: () => onOpenGrounding?.(),
      },
      {
        id: "action-copilot",
        type: "action",
        title: "Toggle Knowledge Copilot",
        sub: "Ask AI assistant about your active note or thoughts",
        shortcut: "Ctrl+Shift+A",
        execute: onOpenCopilot,
      },
      {
        id: "action-settings",
        type: "action",
        title: "Configure AI Brain & Model Provider",
        sub: "Ollama, LM Studio, OpenRouter, Gemini, or custom /v1 endpoint",
        shortcut: "Settings",
        execute: onOpenAISettings,
      },
      {
        id: "action-system-console",
        type: "action",
        title: "Open System Console",
        sub: "Windows apps, windows, volume, media, screenshots — Ctrl+Shift+K",
        shortcut: "Ctrl+Shift+K",
        execute: () => onOpenSystemConsole?.(),
      },
    ],
    [
      onNewNote,
      onOpenJournal,
      onOpenRunningMode,
      onSyncStrava,
      onOpenSchoolHub,
      onToggleMic,
      onToggleThinkingMode,
      onOpenGrounding,
      onOpenCopilot,
      onOpenAISettings,
      onOpenSystemConsole,
    ],
  );

  const filteredItems: ListItem[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // show all actions, then first 10 notes
      const noteItems: NoteItem[] = notes.slice(0, 10).map((n) => ({
        id: `note-${n.id}`,
        type: "note",
        title: n.title,
        sub: `${n.id}.md`,
        note: n,
      }));
      return [...actions, ...noteItems];
    }

    // Filter actions
    const matchedActions = actions.filter(
      (a) => a.title.toLowerCase().includes(q) || a.sub.toLowerCase().includes(q),
    );

    // Filter notes
    const matchedNotes: NoteItem[] = notes
      .filter((n) => n.title.toLowerCase().includes(q) || n.id.toLowerCase().includes(q))
      .map((n) => ({
        id: `note-${n.id}`,
        type: "note",
        title: n.title,
        sub: `${n.id}.md`,
        note: n,
      }));

    const dynamicCmdItems: ActionItem[] = [];
    const isExplicitCmd = q.startsWith(">");
    const cmdText = isExplicitCmd ? q.slice(1).trim() : q;
    if (
      onRunCommand &&
      cmdText.length > 0 &&
      (isExplicitCmd ||
        (matchedActions.length === 0 && matchedNotes.length === 0) ||
        /^(open|launch|start|run|snap|focus|switch to|close|screenshot|volume|mute|search|google|youtube)\b/.test(cmdText))
    ) {
      dynamicCmdItems.push({
        id: "action-run-dynamic-cmd",
        type: "action",
        title: `Execute Command: "${cmdText}"`,
        sub: "Run action through Windows System Control engine",
        shortcut: "↵ Run",
        execute: async () => {
          const outcome = await onRunCommand(cmdText);
          if (outcome && onShowToast) {
            onShowToast(outcome.message);
          }
        },
      });
    }

    if (isExplicitCmd) {
      return [...dynamicCmdItems, ...matchedActions, ...matchedNotes];
    }
    return [...matchedActions, ...matchedNotes, ...dynamicCmdItems];
  }, [query, actions, notes, onRunCommand, onShowToast]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredItems.length]);

  const handleSelect = (item: ListItem) => {
    if (item.type === "action") {
      item.execute();
      onClose();
    } else {
      onSelectNote(item.note.id);
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredItems.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev <= 0 ? Math.max(0, filteredItems.length - 1) : prev - 1,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selected = filteredItems[selectedIndex];
      if (selected) handleSelect(selected);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="switcher-overlay"
          className="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          onClick={onClose}
        >
          <motion.div
            key="switcher-modal"
            className="switcher-modal"
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="switcher-input-wrap">
              <span className="switcher-icon">
                <Icon name="search" size={15} />
              </span>
              <input
                ref={inputRef}
                className="switcher-input"
                value={query}
                placeholder="Jump to a note or command…"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <kbd className="switcher-kbd">ESC</kbd>
            </div>

            <div className="switcher-list" ref={listRef}>
              {filteredItems.length === 0 ? (
                <div className="switcher-empty">No matching notes or actions found.</div>
              ) : (
                filteredItems.map((item, idx) => {
                  const isSelected = idx === selectedIndex;
                  return (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.14, delay: Math.min(idx * 0.015, 0.12) }}
                      className={`switcher-item ${item.type} ${isSelected ? "selected" : ""}`}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                    >
                      <div className="switcher-item-left">
                        <span className="switcher-item-badge">
                          {item.type === "action" ? "ACTION" : "NOTE"}
                        </span>
                        <div className="switcher-item-info">
                          <div className="switcher-item-title">{item.title}</div>
                          <div className="switcher-item-sub">{item.sub}</div>
                        </div>
                      </div>
                      {item.type === "action" && (
                        <kbd className="switcher-item-shortcut">{item.shortcut}</kbd>
                      )}
                      {item.type === "note" && (
                        <span className="switcher-enter-hint">Jump →</span>
                      )}
                    </motion.div>
                  );
                })
              )}
            </div>

            <div className="switcher-footer">
              <div className="switcher-footer-hint">
                <span><strong>↑↓</strong> Navigate</span>
                <span><strong>↵</strong> Select</span>
                <span><strong>ESC</strong> Close</span>
              </div>
              <span className="switcher-count">{notes.length} total notes in Second Brain</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
