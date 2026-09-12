import { useEffect, useRef, useState } from "react";
import type { NoteContent } from "../types";
import MarkdownPreview from "./MarkdownPreview";

interface Props {
  note: NoteContent | null;
  onSave: (id: string, content: string) => Promise<void>;
  onOpenLink: (name: string) => void;
  onToggleTag: (tag: string) => void;
  onClose: () => void;
}

export default function NoteEditor({ note, onSave, onOpenLink, onToggleTag, onClose }: Props) {
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
        <div className="editor-empty">
          <div className="empty-icon">⬡</div>
          <div>CLICK A NODE IN THE 3D GRAPH TO OPEN</div>
          <span className="hint">PRESS CTRL+J TO QUICK-CAPTURE TO JOURNAL STREAM</span>
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
