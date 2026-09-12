import type { AIConfig } from "../lib/ai";
import type { GraphData, GraphNode, NoteContent, NoteMeta } from "../types";
import NoteEditor from "./NoteEditor";
import AICopilot from "./AICopilot";

interface Props {
  open: boolean;
  onClose: () => void;
  activeTab: "note" | "node" | "copilot";
  onSelectTab: (tab: "note" | "node" | "copilot") => void;
  // Note Inspector
  note: NoteContent | null;
  notesList: NoteMeta[];
  onSaveNote: (id: string, content: string) => Promise<void>;
  onOpenLink: (name: string) => void;
  onToggleTag: (tag: string) => void;
  onOpenInEditor?: (id: string) => Promise<void>;
  onNewNote?: () => void;
  onOpenJournal?: () => void;
  onOpenGrounding?: () => void;
  onOpenNote: (id: string) => void;
  // Graph Node Inspector
  selectedNode: GraphNode | null;
  graphData: GraphData;
  // Copilot Inspector
  aiConfig: AIConfig;
  onOpenAISettings: () => void;
  onSaveAsNote?: (title: string, content: string) => Promise<void>;
  onShowToast?: (msg: string) => void;
  onAskCopilotQuery?: (prompt: string) => void;
}

export default function ContextInspector({
  open,
  onClose,
  activeTab,
  onSelectTab,
  note,
  notesList,
  onSaveNote,
  onOpenLink,
  onToggleTag,
  onOpenInEditor,
  onNewNote,
  onOpenJournal,
  onOpenGrounding,
  onOpenNote,
  selectedNode,
  graphData,
  aiConfig,
  onOpenAISettings,
  onSaveAsNote,
  onShowToast,
  onAskCopilotQuery,
}: Props) {
  if (!open) return null;

  // Calculate connected links for selected node
  const connectedLinks = selectedNode
    ? graphData.links.filter(
        (l) =>
          (typeof l.source === "string" ? l.source : (l.source as unknown as { id: string }).id) === selectedNode.id ||
          (typeof l.target === "string" ? l.target : (l.target as unknown as { id: string }).id) === selectedNode.id,
      )
    : [];

  return (
    <aside className="context-inspector">
      {/* Inspector Header Tabs */}
      <div className="inspector-header">
        <div className="inspector-tabs">
          <button
            type="button"
            className={`inspector-tab ${activeTab === "note" ? "active" : ""}`}
            onClick={() => onSelectTab("note")}
          >
            Note Inspector
          </button>
          {selectedNode && (
            <button
              type="button"
              className={`inspector-tab ${activeTab === "node" ? "active" : ""}`}
              onClick={() => onSelectTab("node")}
            >
              Node Inspector
            </button>
          )}
          <button
            type="button"
            className={`inspector-tab ${activeTab === "copilot" ? "active" : ""}`}
            onClick={() => onSelectTab("copilot")}
          >
            Copilot
          </button>
        </div>

        <button type="button" className="inspector-close-btn" onClick={onClose} title="Close Inspector">
          ✕
        </button>
      </div>

      {/* Inspector Body Content */}
      <div className="inspector-body">
        {/* MODE 1: NOTE INSPECTOR */}
        {activeTab === "note" && (
          <div className="inspector-panel note-mode">
            {note ? (
              <NoteEditor
                note={note}
                notesList={notesList}
                onSelectNote={onOpenNote}
                onNewNote={onNewNote}
                onOpenJournal={onOpenJournal}
                onOpenGrounding={onOpenGrounding}
                onSave={onSaveNote}
                onOpenLink={onOpenLink}
                onToggleTag={onToggleTag}
                onClose={onClose}
                onOpenInEditor={onOpenInEditor}
              />
            ) : (
              <div className="inspector-empty">
                <span className="empty-icon">📄</span>
                <h4>No Note Selected</h4>
                <p>Select a note from the list or graph map to inspect and edit details.</p>
                <div className="empty-actions">
                  <button type="button" className="btn-secondary" onClick={onNewNote}>
                    + Create New Note
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* MODE 2: GRAPH NODE INSPECTOR */}
        {activeTab === "node" && selectedNode && (
          <div className="inspector-panel node-mode">
            <div className="node-card">
              <div className="node-card-header">
                <span className="node-badge">GRAPH NODE</span>
                <h3 className="node-title">{selectedNode.title}</h3>
              </div>

              <div className="node-meta-grid">
                <div className="meta-item">
                  <span className="meta-label">Importance (PageRank)</span>
                  <span className="meta-val">{selectedNode.importance.toFixed(3)}</span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Connected Links</span>
                  <span className="meta-val">{connectedLinks.length}</span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Freshness</span>
                  <span className="meta-val">{selectedNode.ageDays} days ago</span>
                </div>
              </div>

              {/* Node Tags */}
              {selectedNode.tags.length > 0 && (
                <div className="node-section">
                  <span className="section-label">Tags</span>
                  <div className="node-tags">
                    {selectedNode.tags.map((tag) => (
                      <span
                        key={tag}
                        className="node-tag-chip"
                        onClick={() => onToggleTag(tag)}
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Excerpt */}
              {selectedNode.excerpt && (
                <div className="node-section">
                  <span className="section-label">Excerpt</span>
                  <p className="node-excerpt">{selectedNode.excerpt}</p>
                </div>
              )}

              {/* Contextual Actions */}
              <div className="node-section">
                <span className="section-label">Contextual Actions</span>
                <div className="action-buttons-list">
                  <button
                    type="button"
                    className="context-btn"
                    onClick={() => onOpenNote(selectedNode.id)}
                  >
                    📖 Open Full Note
                  </button>
                  <button
                    type="button"
                    className="context-btn"
                    onClick={() => onOpenInEditor?.(selectedNode.id)}
                  >
                    ↗ Launch in VS Code
                  </button>
                  <button
                    type="button"
                    className="context-btn"
                    onClick={() => {
                      onSelectTab("copilot");
                      onAskCopilotQuery?.(`Explain the concept of [[${selectedNode.title}]] and how it connects to other notes.`);
                    }}
                  >
                    ✦ Ask Copilot about this concept
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODE 3: COPILOT & WORKSPACE */}
        {activeTab === "copilot" && (
          <div className="inspector-panel copilot-mode">
            <AICopilot
              open={true}
              config={aiConfig}
              activeNote={note}
              onOpenSettings={onOpenAISettings}
              onClose={onClose}
              onSaveAsNote={onSaveAsNote}
              onShowToast={onShowToast}
              onOpenNote={onOpenNote}
            />
          </div>
        )}
      </div>
    </aside>
  );
}
