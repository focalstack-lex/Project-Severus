import { useState, useMemo } from "react";
import Icon from "./Icon";
import type { NoteMeta } from "../types";

interface Props {
  open: boolean;
  notes: NoteMeta[];
  selectedId: string | null;
  onSelectNote: (id: string) => void;
  onNewNote: () => void;
  onClose: () => void;
}

export default function NotesDrawer({
  open,
  notes,
  selectedId,
  onSelectNote,
  onNewNote,
  onClose,
}: Props) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(
      (n) => n.title.toLowerCase().includes(q) || n.id.toLowerCase().includes(q),
    );
  }, [notes, search]);

  if (!open) return null;

  return (
    <aside className="notes-drawer">
      <div className="notes-drawer-header">
        <div className="notes-drawer-title-wrap">
          <div className="notes-drawer-title">
            Notes Explorer <span className="notes-count">({notes.length})</span>
          </div>
        </div>
        <button className="close-btn" onClick={onClose} title="Close drawer" aria-label="Close drawer">
          <Icon name="close" size={13} />
        </button>
      </div>

      <div className="notes-drawer-search-wrap">
        <input
          className="notes-drawer-search"
          type="text"
          value={search}
          placeholder="Filter notes…"
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="notes-new-btn" onClick={onNewNote} title="Create new note">
          + New
        </button>
      </div>

      <div className="notes-drawer-list">
        {filtered.length === 0 ? (
          <div className="notes-drawer-empty">No notes match “{search}”.</div>
        ) : (
          filtered.map((note) => {
            const isSelected = selectedId === note.id;
            return (
              <div
                key={note.id}
                className={`notes-drawer-item ${isSelected ? "active" : ""}`}
                onClick={() => onSelectNote(note.id)}
              >
                <div className="notes-item-title">{note.title}</div>
                <div className="notes-item-meta">{note.id}.md</div>
              </div>
            );
          })
        )}
      </div>

      <div className="notes-drawer-footer">
        <span>
          Press <strong>Ctrl+K</strong> to search anywhere
        </span>
      </div>
    </aside>
  );
}
