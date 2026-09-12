import { useState, useRef, useEffect } from "react";
import { type AIConfig, type ChatMessage, sendAIChat } from "../lib/ai";
import type { NoteContent } from "../types";

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
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  if (!open) return null;

  const handleSaveMessageAsNote = async (content: string) => {
    if (!onSaveAsNote) return;
    const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);
    let title = "AI Synthesis";
    for (const line of lines) {
      if (line.startsWith("# ")) {
        title = line.replace(/^#+\s*/, "").replace(/[\\/:*?"<>|]/g, "").slice(0, 40).trim();
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
      // Send payload with the enriched context for the latest message
      const apiMsgs: ChatMessage[] = [
        ...messages,
        { role: "user", content: enrichedContent },
      ];
      const reply = await sendAIChat(config, apiMsgs);
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
            <div className="copilot-msg-body">{m.content}</div>
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
