import { motion, AnimatePresence } from "framer-motion";
import type { AIConfig } from "../lib/ai";
import type { GraphData, GraphNode, NoteContent, NoteMeta } from "../types";
import { openExternalUrl } from "../lib/tauri";
import type { EmailUpdate, ClassroomSnapshot } from "../lib/gmail";
import Icon from "./Icon";
import NoteEditor from "./NoteEditor";
import AICopilot from "./AICopilot";

export type InspectorTab = "note" | "node" | "copilot" | "inbox";

interface Props {
  open: boolean;
  onClose: () => void;
  activeTab: InspectorTab;
  onSelectTab: (tab: InspectorTab) => void;
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
  // Inbox (Gmail school updates)
  inboxEmails?: EmailUpdate[] | null;
  inboxLastSync?: number | null;
  inboxConnected?: boolean;
  classroom?: ClassroomSnapshot | null;
  gmailDomain?: string;
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
  inboxEmails = null,
  inboxLastSync = null,
  inboxConnected = false,
  classroom = null,
  gmailDomain = "",
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
          <button
            type="button"
            className={`inspector-tab ${activeTab === "inbox" ? "active" : ""}`}
            onClick={() => onSelectTab("inbox")}
          >
            School Hub
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

          {/* MODE 4: INBOX — Gmail school updates (headers only) */}
          {activeTab === "inbox" && (
            <motion.div
              key="inbox-tab"
              className="inspector-panel inbox-mode"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="inbox-header">
                <span className="inbox-title">
                  <Icon name="school" size={14} />
                  School Hub
                </span>
                {inboxLastSync && (
                  <span className="inbox-sync">synced {new Date(inboxLastSync).toLocaleTimeString()}</span>
                )}
              </div>

              {!inboxConnected ? (
                <div className="inspector-empty">
                  <span className="empty-icon">
                    <Icon name="school" size={26} />
                  </span>
                  <h4>School Accounts Not Connected</h4>
                  <p>Connect your school Gmail in Settings to surface mail and Classroom here.</p>
                  <div className="empty-actions">
                    <button type="button" className="btn-secondary" onClick={onOpenAISettings}>
                      <Icon name="gear" size={12} /> Open Settings
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* MAIL */}
                  <div className="hub-section-title">
                    Mail · {inboxEmails?.length ?? 0} unread
                    {gmailDomain ? ` · @${gmailDomain}` : " · domain not set"}
                  </div>
                  {(inboxEmails?.length ?? 0) === 0 ? (
                    <div className="hub-empty">Inbox shows no unread mail from your school domain.</div>
                  ) : (
                    <div className="inbox-list">
                      {(inboxEmails ?? []).map((email) => (
                        <button
                          key={email.id}
                          type="button"
                          className="inbox-row"
                          onClick={() => openExternalUrl(`https://mail.google.com/mail/u/0/#inbox/${email.id}`)}
                          title="Open this message in Gmail"
                        >
                          <span className="inbox-row-icon">
                            <Icon name="mail" size={12} />
                          </span>
                          <span className="inbox-row-text">
                            <span className="inbox-row-from">{email.from}</span>
                            <span className="inbox-row-subject">{email.subject || "(no subject)"}</span>
                          </span>
                          <span className="inbox-row-external">
                            <Icon name="external" size={11} />
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* CLASSROOM */}
                  <div className="hub-section-title hub-section-gap">Classroom</div>
                  {classroom?.error ? (
                    <div className="hub-empty hub-error">
                      {classroom.error.includes("403")
                        ? "Classroom access not granted — disconnect and reconnect to grant the new scopes."
                        : classroom.error}
                    </div>
                  ) : classroom === null ? (
                    <div className="hub-empty">Waiting for the first Classroom sync…</div>
                  ) : (
                    <div className="inbox-list">
                      {classroom.missing.length > 0 && (
                        <>
                          <div className="hub-subtitle hub-missing-text">Missing · {classroom.missing.length}</div>
                          {classroom.missing.map((item) => (
                            <div key={`m-${item.courseWorkId}`} className="hub-row hub-row-missing">
                              <span className="hub-row-course">{item.course}</span>
                              <span className="hub-row-title">{item.title}</span>
                              <span className="hub-row-due">was due {item.due}</span>
                            </div>
                          ))}
                        </>
                      )}
                      <div className="hub-subtitle">Due soon · {classroom.dueSoon.length}</div>
                      {classroom.dueSoon.length === 0 && <div className="hub-empty">Nothing due right now.</div>}
                      {classroom.dueSoon.slice(0, 8).map((item) => (
                        <div key={`d-${item.courseWorkId}`} className="hub-row">
                          <span className="hub-row-course">{item.course}</span>
                          <span className="hub-row-title">{item.title}</span>
                          <span className="hub-row-due">{item.due}</span>
                        </div>
                      ))}
                      {classroom.announcements.length > 0 && (
                        <>
                          <div className="hub-subtitle">Announcements</div>
                          {classroom.announcements.map((announcement) => (
                            <div key={`${announcement.courseId}-${announcement.postedAt}-${announcement.text.slice(0, 8)}`} className="hub-row">
                              <span className="hub-row-course">{announcement.course}</span>
                              <span className="hub-row-title">{announcement.text}</span>
                            </div>
                          ))}
                        </>
                      )}
                      <p className="inbox-note">Read-only · opens in Google Classroom on click</p>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </aside>
  );
}
