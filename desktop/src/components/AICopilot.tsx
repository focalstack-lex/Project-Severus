import { useState, useRef, useEffect, useCallback } from "react";
import { type AIConfig, type ChatMessage, sendAIChat } from "../lib/ai";
import { getWorkspaceContext } from "../lib/tauri";
import type { NoteContent, WorkspaceContext } from "../types";
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workspaceContext, setWorkspaceContext] = useState<WorkspaceContext | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const handleSaveMessageAsNote = async (content: string) => {
    if (!onSaveAsNote) return;
    const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);
    let title = "AI Synthesis";
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
    // If asking about the current note, include excerpt or context if available
    if (activeNote && (text.includes("active note") || text.includes("this note") || customPrompt)) {
      enrichedContent = `Context (Active Note "${activeNote.title}"):\n${activeNote.content}\n\nTask: ${text}`;
    }

    const newMsgs: ChatMessage[] = [
      ...messages,
      { role: "user", content: text },
    ];
    setMessages(newMsgs);
    if (!customPrompt) setInput("");
    setLoading(true);
    setError(null);

    try {
      // Send payload with the enriched context for the latest message and live workspace telemetry
      const apiMsgs: ChatMessage[] = [
        ...messages,
        { role: "user", content: enrichedContent },
      ];
      const dynamicContext = buildDynamicContext(workspaceContext, activeNote);
      const reply = await sendAIChat(config, apiMsgs, dynamicContext);
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate response");
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
  };

  return (
    <aside className="copilot-pane">
      <div className="copilot-header">
        <div className="copilot-title-wrap">
          <span className="copilot-section-num">04 / KNOWLEDGE COPILOT</span>
          <div className="copilot-model-pill" onClick={onOpenSettings} title="Click to change model or provider">
            <span className="live-dot" />
            <span>{config.model}</span>
            <span className="dim">({config.providerName})</span>
          </div>
        </div>
        <div className="copilot-actions">
          <button onClick={clearChat} title="Clear conversation history">
            CLEAR
          </button>
          <button onClick={onOpenSettings} title="Configure AI Provider">
            ⚙ PROVIDER
          </button>
          <button className="close-btn" onClick={onClose} title="Close Copilot">
            ✕
          </button>
        </div>
      </div>

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
          SEND →
        </button>
      </div>
    </aside>
  );
}
