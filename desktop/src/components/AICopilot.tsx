import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { type AIConfig, type ChatMessage, sendAIChat } from "../lib/ai";
import { getWorkspaceContext } from "../lib/tauri";
import type { NoteContent, WorkspaceContext, ChatSession } from "../types";
import MarkdownPreview from "./MarkdownPreview";

interface Props {
  open: boolean;
  config: AIConfig;
  activeNote: NoteContent | null;
  onOpenSettings: () => void;
  onClose: () => void;
  onSaveAsNote?: (title: string, content: string) => Promise<void>;
  onShowToast?: (msg: string) => void;
  onOpenNote?: (id: string) => void;
}

const SESSIONS_STORAGE_KEY = "severus_copilot_sessions";
const ACTIVE_SESSION_ID_KEY = "severus_copilot_active_session_id";

function createNewSession(title = "New Conversation"): ChatSession {
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
  };
}

function loadInitialSessions(): { sessions: ChatSession[]; activeId: string } {
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ChatSession[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        const savedActiveId = localStorage.getItem(ACTIVE_SESSION_ID_KEY);
        const exists = parsed.some((s) => s.id === savedActiveId);
        return {
          sessions: parsed,
          activeId: exists && savedActiveId ? savedActiveId : parsed[0].id,
        };
      }
    }
  } catch {
    // fallback
  }
  const defaultSess = createNewSession();
  return { sessions: [defaultSess], activeId: defaultSess.id };
}

function titleCase(str: string): string {
  const minorWords = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "nor", "of", "on", "or", "so", "the", "to", "up", "yet", "with"]);
  return str
    .split(/\s+/)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && minorWords.has(lower)) {
        return lower;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

export function generateSessionTitle(firstPrompt: string, activeNoteTitle?: string): string {
  const p = firstPrompt.trim();

  if (p.includes("workspace and coding IDE environments") || p.includes("WORKSPACES & TASKS")) {
    return "Workspace & Tasks Telemetry";
  }
  if (p.includes("Summarize the core concepts") || p.includes("SUMMARIZE NOTE")) {
    return activeNoteTitle ? `Summary: ${activeNoteTitle}` : "Note Summary";
  }
  if (p.includes("suggest 3 relevant [[wiki-links]]") || p.includes("SUGGEST LINKS")) {
    return activeNoteTitle ? `Links & Tags: ${activeNoteTitle}` : "Suggested Links";
  }

  // Extract from task wrappers if present
  const taskMatch = p.match(/Task:\s*([^\n]+)/i);
  let cleaned = (taskMatch && taskMatch[1] ? taskMatch[1] : p).trim();

  // Strip conversational noise
  cleaned = cleaned
    .replace(/^(can you (please )?|please |could you |how (do|can) (i|we) |what (is|are) |tell me about |explain (to me )?)/i, "")
    .replace(/[?!.]+$/, "")
    .trim();

  if (!cleaned) return "New Conversation";

  let titled = titleCase(cleaned);
  if (titled.length > 34) {
    const cut = titled.slice(0, 34);
    const lastSpace = cut.lastIndexOf(" ");
    titled = (lastSpace > 18 ? cut.slice(0, lastSpace) : cut).trim() + "…";
  }
  return titled;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  const d = new Date(timestamp);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function buildDynamicContext(ctx: WorkspaceContext | null, activeNote: NoteContent | null): string {
  const parts: string[] = [
    "=== LIVE SYSTEM & WORKSPACE TELEMETRY ===",
    `• Active Workspace: ${ctx?.workspace_name ?? "Project Severus"} (${ctx?.workspace_path ?? "c:\\Users\\User\\Documents\\Severus"})`,
    `• Connected Coding IDEs: ${ctx?.ide_environments?.join(", ") || "Google Antigravity IDE, ZCode"}`,
    `• Git Status / Branch: ${ctx?.git_branch ?? "main"}`,
  ];

  if (activeNote) {
    parts.push(
      `• Active Note in Workspace Editor: "${activeNote.title}.md"\n--- Content of Active Note ---\n${activeNote.content}\n-----------------------------`
    );
  } else {
    parts.push(`• Active Note in Workspace Editor: None currently open`);
  }

  if (ctx?.vault_notes && ctx.vault_notes.length > 0) {
    parts.push(`• Indexed Second Brain Notes: ${ctx.vault_notes.join(", ")}`);
  }

  if (ctx?.today_journal) {
    parts.push(
      `• Today's Action Log & Current Tasks (${new Date().toISOString().slice(0, 10)}):\n${ctx.today_journal}`
    );
  }

  parts.push("=========================================");
  parts.push(
    `=== CRITICAL RESPONSE ORGANIZATION & FORMATTING DIRECTIVE ===
You are an executive engineering assistant and cognitive mentor in Lex Matondo's Second Brain.
Every response MUST be cleanly organized, scannable, and structured according to these rules:
1. EXECUTIVE HIERARCHY: Structure replies with clear, logical Markdown headings (e.g. ### 1. Status Overview, ### 2. Active Tasks & Workspaces, ### 3. Next Actions). Never output an unstructured wall of text.
2. USE MARKDOWN TABLES: Whenever listing tasks, comparing items, presenting telemetry, or showing multi-attribute information, ALWAYS format them as a GitHub-flavored Markdown table with columns (e.g. | # | Feature / Task | Target / IDE | Status |).
3. BULLETS & EMPHASIS: Use concise bullet points with **bold** lead-ins for key insights and telemetry details.
4. CODE & PATH BLOCKS: Always format file names, directory paths, CLI commands, or code snippets in inline code (\`path/file.ts\`) or fenced code blocks with language identifiers (\`\`\`bash, \`\`\`tsx).
5. KNOWLEDGE GRAPH INTEGRATION: When referencing concepts that should exist or link in the Second Brain, use [[wiki-link]] syntax (e.g., [[Ascension_Guide]], [[system-architecture]]) and inline #tags (e.g. #severus #workflow).
6. LIVE TELEMETRY FIDELITY: When answering queries about open workspaces, connected coding IDEs, git status, or today's tasks, report directly and accurately from the live telemetry above (Project Severus, Google Antigravity IDE, ZCode, etc.).`
  );

  return parts.join("\n\n");
}

export default function AICopilot({
  open,
  config,
  activeNote,
  onOpenSettings,
  onClose,
  onSaveAsNote,
  onShowToast,
  onOpenNote,
}: Props) {
  const [sessionData] = useState(() => loadInitialSessions());
  const [sessions, setSessions] = useState<ChatSession[]>(sessionData.sessions);
  const [activeSessionId, setActiveSessionId] = useState<string>(sessionData.activeId);
  const [showHistory, setShowHistory] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitleText, setEditingTitleText] = useState("");

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workspaceContext, setWorkspaceContext] = useState<WorkspaceContext | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeSession = useMemo(() => {
    return sessions.find((s) => s.id === activeSessionId) ?? sessions[0] ?? createNewSession();
  }, [sessions, activeSessionId]);

  const messages = activeSession.messages;

  // Persist sessions to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
      localStorage.setItem(ACTIVE_SESSION_ID_KEY, activeSessionId);
    } catch {
      // ignore
    }
  }, [sessions, activeSessionId]);

  const refreshContext = useCallback(async () => {
    try {
      const data = await getWorkspaceContext();
      setWorkspaceContext(data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (open) void refreshContext();
  }, [open, refreshContext]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  if (!open) return null;

  const handleNewChat = () => {
    if (activeSession.messages.length === 0 && activeSession.title === "New Conversation") {
      setShowHistory(false);
      return;
    }
    const fresh = createNewSession();
    setSessions((prev) => [fresh, ...prev]);
    setActiveSessionId(fresh.id);
    setShowHistory(false);
    setError(null);
    onShowToast?.("Started new conversation thread");
  };

  const handleDeleteSession = (id: string) => {
    setSessions((prev) => {
      const filtered = prev.filter((s) => s.id !== id);
      if (filtered.length === 0) {
        const fresh = createNewSession();
        setActiveSessionId(fresh.id);
        return [fresh];
      }
      if (activeSessionId === id) {
        setActiveSessionId(filtered[0].id);
      }
      return filtered;
    });
    onShowToast?.("Conversation deleted");
  };

  const handleClearCurrentSession = () => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSession.id
          ? { ...s, title: "New Conversation", messages: [], updatedAt: Date.now() }
          : s
      )
    );
    setError(null);
    onShowToast?.("Conversation cleared");
  };

  const handleStartRename = () => {
    setEditingTitleText(activeSession.title);
    setIsEditingTitle(true);
  };

  const handleSaveCustomTitle = () => {
    const clean = editingTitleText.trim();
    if (clean) {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSession.id ? { ...s, title: clean, updatedAt: Date.now() } : s
        )
      );
    }
    setIsEditingTitle(false);
  };

  const handleSaveMessageAsNote = async (content: string) => {
    if (!onSaveAsNote) return;
    const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);
    let title = activeSession.title !== "New Conversation" ? activeSession.title : "AI Synthesis";
    for (const line of lines) {
      const match = line.match(/^#+\s+(.+)$/);
      if (match && match[1]) {
        title = match[1].replace(/[\\/:*?"<>|]/g, "").slice(0, 40).trim();
        break;
      }
    }
    if (title === "AI Synthesis" && lines[0]) {
      title = lines[0].replace(/^[#\-*0-9.]+\s*/, "").replace(/[\\/:*?"<>|]/g, "").slice(0, 40).trim();
    }
    if (!title) title = `AI Note ${new Date().toISOString().slice(0, 10)}`;

    let formattedContent = content;
    if (!formattedContent.startsWith("# ")) {
      formattedContent = `# ${title}\n\n${formattedContent}\n\n#ai-synthesis #severus`;
    } else if (!formattedContent.includes("#")) {
      formattedContent = `${formattedContent}\n\n#ai-synthesis #severus`;
    }

    try {
      await onSaveAsNote(title, formattedContent);
      onShowToast?.(`Synthesized note "${title}.md" into Second Brain!`);
      onOpenNote?.(title);
    } catch (err) {
      setError(`Failed to save note: ${String(err)}`);
    }
  };

  const handleSend = async (customPrompt?: string) => {
    const text = (customPrompt ?? input).trim();
    if (!text || loading) return;

    let enrichedContent = text;
    if (activeNote && (text.includes("active note") || text.includes("this note") || customPrompt)) {
      enrichedContent = `Context (Active Note "${activeNote.title}"):\n${activeNote.content}\n\nTask: ${text}`;
    }

    const isFirstMessage = activeSession.messages.length === 0 || activeSession.title === "New Conversation";
    const sessionTitle = isFirstMessage
      ? generateSessionTitle(text, activeNote?.title)
      : activeSession.title;

    const userMessage: ChatMessage = { role: "user", content: text };
    const updatedMessages: ChatMessage[] = [...activeSession.messages, userMessage];

    // Optimistically update session with user message and generated title
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSession.id
          ? {
              ...s,
              title: sessionTitle,
              updatedAt: Date.now(),
              messages: updatedMessages,
            }
          : s
      )
    );

    if (!customPrompt) setInput("");
    setLoading(true);
    setError(null);

    try {
      const apiMsgs: ChatMessage[] = [
        ...activeSession.messages,
        { role: "user", content: enrichedContent },
      ];
      const dynamicContext = buildDynamicContext(workspaceContext, activeNote);
      const reply = await sendAIChat(config, apiMsgs, dynamicContext);

      const assistantMessage: ChatMessage = { role: "assistant", content: reply };
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSession.id
            ? {
                ...s,
                updatedAt: Date.now(),
                messages: [...s.messages, assistantMessage],
              }
            : s
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate response");
    } finally {
      setLoading(false);
    }
  };

  return (
    <aside className="copilot-pane">
      <div className="copilot-header">
        <div className="copilot-title-wrap">
          <span className="copilot-section-num">AI Copilot</span>
          <div className="copilot-model-pill" onClick={onOpenSettings} title="Click to change model or provider">
            <span className="live-dot" />
            <span>{config.model}</span>
            <span className="dim">({config.providerName})</span>
          </div>
        </div>
        <div className="copilot-actions">
          <button onClick={handleClearCurrentSession} title="Clear current conversation messages">
            Clear
          </button>
          <button onClick={onOpenSettings} title="Configure AI Provider">
            ⚙ Settings
          </button>
          <button className="close-btn" onClick={onClose} title="Close Copilot">
            ✕
          </button>
        </div>
      </div>

      {/* Session Bar with generated title and history toggle */}
      <div className="copilot-session-bar">
        <div
          className={`copilot-session-selector ${showHistory ? "open" : ""}`}
          onClick={() => setShowHistory((prev) => !prev)}
          title="Click to view conversation history"
        >
          <span className="session-icon">💬</span>
          {isEditingTitle ? (
            <input
              type="text"
              className="session-title-input"
              value={editingTitleText}
              autoFocus
              onChange={(e) => setEditingTitleText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveCustomTitle();
                if (e.key === "Escape") setIsEditingTitle(false);
              }}
              onBlur={handleSaveCustomTitle}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              className="session-title"
              onDoubleClick={(e) => {
                e.stopPropagation();
                handleStartRename();
              }}
              title="Double-click to rename conversation"
            >
              {activeSession.title}
            </span>
          )}
          <span className="session-count">({activeSession.messages.length})</span>
          <span className="session-arrow">{showHistory ? "▲" : "▼"}</span>
        </div>

        <div className="copilot-session-tools">
          <button
            type="button"
            className="session-tool-btn"
            onClick={handleStartRename}
            title="Rename active chat"
          >
            ✎
          </button>
          <button
            type="button"
            className="session-tool-btn new-chat"
            onClick={handleNewChat}
            title="Start new conversation"
          >
            + New
          </button>
          <button
            type="button"
            className={`session-tool-btn history-toggle ${showHistory ? "active" : ""}`}
            onClick={() => setShowHistory((prev) => !prev)}
            title="Toggle conversation histories"
          >
            🕒 History ({sessions.length})
          </button>
        </div>
      </div>

      {/* History Drawer Dropdown */}
      {showHistory && (
        <div className="copilot-history-drawer">
          <div className="history-drawer-header">
            <span className="history-drawer-title">CONVERSATION HISTORIES</span>
            <button
              type="button"
              className="history-new-btn"
              onClick={handleNewChat}
            >
              + NEW CHAT
            </button>
          </div>
          <div className="history-list">
            {sessions.map((s) => {
              const isActive = s.id === activeSession.id;
              const timeStr = formatRelativeTime(s.updatedAt);
              return (
                <div
                  key={s.id}
                  className={`history-item ${isActive ? "active" : ""}`}
                  onClick={() => {
                    setActiveSessionId(s.id);
                    setShowHistory(false);
                  }}
                >
                  <div className="history-item-left">
                    <span className="history-item-dot">{isActive ? "●" : "○"}</span>
                    <div className="history-item-info">
                      <span className="history-item-title" title={s.title}>{s.title}</span>
                      <span className="history-item-meta">
                        {timeStr} · {s.messages.length} msg{s.messages.length === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="history-delete-btn"
                    title="Delete conversation"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteSession(s.id);
                    }}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Prompts Bar */}
      <div className="copilot-quick-prompts">
        <button
          type="button"
          disabled={loading}
          onClick={() =>
            handleSend(
              "What workspace and coding IDE environments are we currently working in, and what tasks are active today?"
            )
          }
          title="Query active workspace, connected coding IDEs, and today's tasks"
        >
          ✦ WORKSPACES &amp; TASKS
        </button>
        <button
          type="button"
          disabled={!activeNote || loading}
          onClick={() => handleSend(`Summarize the core concepts of this note in 3 concise bullet points.`)}
        >
          ✦ SUMMARIZE NOTE
        </button>
        <button
          type="button"
          disabled={!activeNote || loading}
          onClick={() =>
            handleSend(
              `Based on this note, suggest 3 relevant [[wiki-links]] and 2 #tags to connect it to other knowledge hubs.`
            )
          }
        >
          ✦ SUGGEST LINKS
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div className="copilot-messages">
        {messages.length === 0 && (
          <div className="copilot-empty">
            <div className="empty-icon">⌘</div>
            <div>KNOWLEDGE COPILOT ACTIVE</div>
            <span className="hint">
              Ask questions about your notes, brainstorm connections, or configure your local Ollama / custom provider.
            </span>
          </div>
        )}

        {messages.map((m, idx) => (
          <div key={idx} className={`copilot-msg ${m.role}`}>
            <div className="copilot-msg-role">
              {m.role === "user" ? "YOU" : "SEVERUS AI"}
            </div>
            <div className="copilot-msg-body">
              {m.role === "assistant" ? (
                <MarkdownPreview
                  content={m.content}
                  className="copilot-md-preview"
                  onOpenLink={(name) => onOpenNote?.(name)}
                  onToggleTag={() => {}}
                />
              ) : (
                m.content
              )}
            </div>
            {m.role === "assistant" && (
              <div className="copilot-msg-footer">
                <button
                  type="button"
                  className="msg-synth-btn"
                  onClick={() => void handleSaveMessageAsNote(m.content)}
                  title="Synthesize this response directly into a new Second Brain note"
                >
                  ✦ SYNTHESIZE TO NOTE
                </button>
                <button
                  type="button"
                  className="msg-copy-btn"
                  onClick={() => {
                    void navigator.clipboard.writeText(m.content);
                    onShowToast?.("Response copied to clipboard");
                  }}
                  title="Copy response markdown"
                >
                  COPY
                </button>
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="copilot-msg assistant loading">
            <div className="copilot-msg-role">SEVERUS AI</div>
            <div className="copilot-msg-body">Synthesizing thought…</div>
          </div>
        )}

        {error && (
          <div className="copilot-error-banner">
            <strong>Error:</strong> {error}
            <button onClick={onOpenSettings} className="error-link">
              Check Provider Settings →
            </button>
          </div>
        )}

        <div ref={scrollRef} />
      </div>

      {/* Input Form */}
      <div className="copilot-input-area">
        <textarea
          className="copilot-input"
          value={input}
          placeholder={`Ask ${config.model}... (Enter to send, Shift+Enter for newline)`}
          rows={2}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
        />
        <button
          type="button"
          className="accent copilot-send-btn"
          disabled={loading || !input.trim()}
          onClick={() => void handleSend()}
        >
          Send →
        </button>
      </div>
    </aside>
  );
}
