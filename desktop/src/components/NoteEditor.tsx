import { useEffect, useRef, useState } from "react";
import type { NoteContent, NoteMeta } from "../types";
import Icon from "./Icon";
import MarkdownPreview from "./MarkdownPreview";

interface Props {
  note: NoteContent | null;
  notesList?: NoteMeta[];
  onSelectNote?: (id: string) => void;
  onNewNote?: () => void;
  onOpenJournal?: () => void;
  onOpenGrounding?: () => void;
  onSave: (id: string, content: string) => Promise<void>;
  onOpenLink: (name: string) => void;
  onToggleTag: (tag: string) => void;
  onClose: () => void;
  onOpenInEditor?: (id: string) => Promise<void>;
}

export default function NoteEditor({
  note,
  notesList,
  onSelectNote,
  onNewNote,
  onOpenJournal,
  onOpenGrounding,
  onSave,
  onOpenLink,
  onToggleTag,
  onOpenInEditor,
}: Props) {
  const [draft, setDraft] = useState("");
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const loadedIdRef = useRef<string | null>(null);
  const loadedContentRef = useRef<string>("");

  useEffect(() => {
    if (!note) return;
    if (loadedIdRef.current !== note.id) {
      // switched notes — always show the on-disk content
      loadedIdRef.current = note.id;
      loadedContentRef.current = note.content;
      setDraft(note.content);
      setError(null);
      setBanner(null);
      setPreview(false);
    } else if (draftRef.current === loadedContentRef.current && note.content !== loadedContentRef.current) {
      // clean editor — follow external changes (watcher)
      loadedContentRef.current = note.content;
      setDraft(note.content);
      setBanner("This note changed on disk and was reloaded.");
    }
  }, [note]);

  const dirty = draft !== loadedContentRef.current;

  const save = async () => {
    if (!note || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(note.id, draft);
      loadedContentRef.current = draft;
      setBanner(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const reloadFromDisk = () => {
    if (!note) return;
    loadedContentRef.current = note.content;
    setDraft(note.content);
    setBanner(null);
  };

  return (
    <aside className="editor-pane">
      <div className="editor-header">
        <div className="editor-title-wrap">
          <span className="editor-section-num">Active Note</span>
          <div className="editor-title">{note ? note.title : "No note selected"}</div>
        </div>
        <div className="editor-actions">
          {note && (
            <>
              {onOpenInEditor && (
                <button
                  type="button"
                  onClick={() => void onOpenInEditor(note.id)}
                  title="Open this note in VS Code / IDE"
                >
                  <Icon name="external" size={12} /> VS Code
                </button>
              )}
              <button onClick={() => setPreview(!preview)} title="Toggle markdown preview">
                {preview ? (
                  <>
                    <Icon name="pen" size={12} /> Edit
                  </>
                ) : (
                  <>
                    <Icon name="eye" size={12} /> Preview
                  </>
                )}
              </button>
              {dirty && (
                <button onClick={reloadFromDisk} title="Discard local edits and reload from disk">
                  <Icon name="history-undo" size={12} /> Revert
                </button>
              )}
              <button
                className="accent"
                disabled={saving || !dirty}
                onClick={() => void save()}
                title="Save (Ctrl+S)"
              >
                <Icon name="save" size={12} /> {saving ? "Saving…" : "Save"}
              </button>
            </>
          )}
        </div>
      </div>
      {banner && <div className="editor-banner">{banner}</div>}
      {error && <div className="editor-banner error">{error}</div>}
      {!note ? (
        <div className="vault-dashboard">
          <div className="vault-dash-hero">
            <span className="vault-dash-icon">
              <Icon name="hexagon" size={26} />
            </span>
            <div className="vault-dash-header">
              <span className="vault-dash-sub">Second Brain</span>
              <h2 className="vault-dash-title">Knowledge Vault</h2>
              <p className="vault-dash-desc">
                Select any concept from the graph map, or use the quick actions and indexed
                notes below.
              </p>
            </div>
          </div>

          <div className="vault-dash-actions">
            {onNewNote && (
              <button
                type="button"
                className="vault-action-btn accent"
                onClick={onNewNote}
                title="Create a new note in second-brain"
              >
                <Icon name="plus" size={12} /> New Note
              </button>
            )}
            {onOpenGrounding && (
              <button
                type="button"
                className="vault-action-btn"
                onClick={onOpenGrounding}
                title="Assemble grounding context (Ctrl+Shift+G)"
              >
                <Icon name="layers" size={12} /> Grounding
              </button>
            )}
            {onOpenJournal && (
              <button
                type="button"
                className="vault-action-btn"
                onClick={onOpenJournal}
                title="Capture quick journal entry (Ctrl+J)"
              >
                <Icon name="pen" size={12} /> Journal
              </button>
            )}
          </div>

          {notesList && notesList.length > 0 && (
            <div className="vault-recent-section">
              <div className="vault-section-title">
                <span>Indexed Notes</span>
                <span className="vault-count-pill">{notesList.length} notes</span>
              </div>
              <div className="vault-notes-grid">
                {notesList.map((n) => (
                  <div
                    key={n.id}
                    className="vault-note-card"
                    onClick={() => onSelectNote?.(n.id)}
                  >
                    <div className="vault-note-card-title">{n.title}</div>
                    <div className="vault-note-card-tags">
                      {n.tags.map((t) => (
                        <span key={t} className="vault-mini-tag">
                          #{t.toLowerCase()}
                        </span>
                      ))}
                    </div>
                    <span className="vault-note-jump">
                      <Icon name="external" size={12} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="vault-shortcuts-card">
            <div className="vault-shortcut-item">
              <kbd>Ctrl+K</kbd> <span>Search & Commands</span>
            </div>
            <div className="vault-shortcut-item">
              <kbd>Ctrl+Shift+G</kbd> <span>Grounding Context</span>
            </div>
            <div className="vault-shortcut-item">
              <kbd>Ctrl+J</kbd> <span>Journal Stream</span>
            </div>
          </div>
        </div>
      ) : preview ? (
        <MarkdownPreview content={draft} onOpenLink={onOpenLink} onToggleTag={onToggleTag} />
      ) : (
        <textarea
          className="editor-text"
          value={draft}
          spellCheck={false}
          placeholder="Write markdown here — #tags and [[wiki-links]] included."
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
              event.preventDefault();
              void save();
            }
          }}
        />
      )}
    </aside>
  );
}
