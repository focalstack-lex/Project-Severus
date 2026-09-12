import { useEffect, useRef, useState } from "react";
import type { NoteContent, NoteMeta } from "../types";
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
  onClose,
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
          <span className="editor-section-num">02 / ACTIVE NOTE</span>
          <div className="editor-title">{note ? `${note.title}.md` : "NO NOTE SELECTED"}</div>
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
                  VS CODE ↗
                </button>
              )}
              <button onClick={() => setPreview(!preview)} title="Toggle markdown preview">
                {preview ? "EDIT" : "PREVIEW"}
              </button>
              {dirty && (
                <button onClick={reloadFromDisk} title="Discard local edits and reload from disk">
                  REVERT
                </button>
              )}
              <button
                className="accent"
                disabled={saving || !dirty}
                onClick={() => void save()}
                title="Save (Ctrl+S)"
              >
                {saving ? "SAVING…" : "SAVE"}
              </button>
            </>
          )}
          <button className="close-btn" onClick={onClose} title="Close workspace note panel">
            ✕
          </button>
        </div>
      </div>
      {banner && <div className="editor-banner">{banner}</div>}
      {error && <div className="editor-banner error">{error}</div>}
      {!note ? (
        <div className="vault-dashboard">
          <div className="vault-dash-hero">
            <div className="vault-dash-icon">⬡</div>
            <div className="vault-dash-header">
              <span className="vault-dash-sub">02 // KNOWLEDGE ENGINE</span>
              <h2 className="vault-dash-title">VAULT COMMAND CENTER</h2>
              <p className="vault-dash-desc">
                Select any node from the 3D topology graph, or access quick actions and indexed notes below.
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
                <span>+</span> NEW NOTE
              </button>
            )}
            {onOpenGrounding && (
              <button
                type="button"
                className="vault-action-btn"
                onClick={onOpenGrounding}
                title="Assemble grounding context (Ctrl+Shift+G)"
              >
                <span>⚡</span> GROUNDING
              </button>
            )}
            {onOpenJournal && (
              <button
                type="button"
                className="vault-action-btn"
                onClick={onOpenJournal}
                title="Capture quick journal entry (Ctrl+J)"
              >
                <span>✎</span> JOURNAL
              </button>
            )}
          </div>

          {notesList && notesList.length > 0 && (
            <div className="vault-recent-section">
              <div className="vault-section-title">
                <span>INDEXED NOTES</span>
                <span className="vault-count-pill">{notesList.length} NOTES</span>
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
                          #{t}
                        </span>
                      ))}
                    </div>
                    <span className="vault-note-jump">OPEN ↗</span>
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
