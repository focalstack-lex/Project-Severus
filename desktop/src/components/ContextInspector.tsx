import { motion, AnimatePresence } from "framer-motion";
import type { AIConfig } from "../lib/ai";
import type { GraphData, GraphNode, NoteContent, NoteMeta } from "../types";
import Icon from "./Icon";
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

        <button type="button" className="inspector-close-btn" onClick={onClose} title="Close inspector" aria-label="Close inspector">
          <Icon name="close" size={13} />
        </button>
      </div>

      {/* Inspector Body Content */}
      <div className="inspector-body">
        <AnimatePresence mode="wait">
          {/* MODE 1: NOTE INSPECTOR */}
          {activeTab === "note" && (
            <motion.div
              key="note-tab"
              className="inspector-panel note-mode"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            >
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
                  <span className="empty-icon">
                    <Icon name="file" size={26} />
                  </span>
                  <h4>No Note Selected</h4>
                  <p>Select a note from the graph map or the notes list to inspect and edit it.</p>
                  <div className="empty-actions">
                    <button type="button" className="btn-secondary" onClick={onNewNote}>
                      <Icon name="plus" size={12} /> Create New Note
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* MODE 2: GRAPH NODE INSPECTOR */}
          {activeTab === "node" && selectedNode && (
            <motion.div
              key="node-tab"
              className="inspector-panel node-mode"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            >
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
                    <span className="meta-val">
                      {selectedNode.ageDays === 0 ? "today" : `${selectedNode.ageDays}d`}
                    </span>
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
                      <Icon name="book" size={14} /> Open Full Note
                    </button>
                    <button
                      type="button"
                      className="context-btn"
                      onClick={() => onOpenInEditor?.(selectedNode.id)}
                    >
                      <Icon name="external" size={14} /> Launch in VS Code
                    </button>
                    <button
                      type="button"
                      className="context-btn"
                      onClick={() => {
                        onSelectTab("copilot");
                        onAskCopilotQuery?.(`Explain the concept of [[${selectedNode.title}]] and how it connects to other notes.`);
                      }}
                    >
                      <Icon name="spark" size={14} /> Ask Copilot about this concept
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* MODE 3: COPILOT & WORKSPACE */}
          {activeTab === "copilot" && (
            <motion.div
              key="copilot-tab"
              className="inspector-panel copilot-mode"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            >
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </aside>
  );
}
