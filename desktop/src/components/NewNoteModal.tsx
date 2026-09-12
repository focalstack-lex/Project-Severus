import { useEffect, useRef, useState, useMemo } from "react";

interface Props {
  open: boolean;
  existingNotes: { id: string }[];
  onClose: () => void;
  onCreate: (name: string, template?: string) => Promise<void>;
}

const TEMPLATES = [
  { id: "default", label: "Blank Note", tag: "#note" },
  { id: "research", label: "Research Insight", tag: "#research #knowledge" },
  { id: "architecture", label: "System Architecture", tag: "#architecture #design" },
  { id: "skills", label: "Agent Skill Spec", tag: "#skills #protocol" },
];

export default function NewNoteModal({
  open,
  existingNotes,
  onClose,
  onCreate,
}: Props) {
  const [name, setName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("default");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Clean and sanitize the filename
  const cleanId = useMemo(() => {
    return name
      .trim()
      .replace(/\.md$/i, "")
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, "_");
  }, [name]);

  const collision = useMemo(() => {
    if (!cleanId) return false;
    return existingNotes.some(
      (n) => n.id.toLowerCase() === cleanId.toLowerCase(),
    );
  }, [cleanId, existingNotes]);

  useEffect(() => {
    if (open) {
      setName("");
      setSelectedTemplate("default");
      setError(null);
      setSubmitting(false);
      window.setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!cleanId) {
      setError("Please enter a note title or slug.");
      return;
    }
    if (collision) {
      setError(`A note named "${cleanId}.md" already exists.`);
      return;
    }

    setSubmitting(true);
    setError(null);

    const tmpl = TEMPLATES.find((t) => t.id === selectedTemplate);
    const initialContent = `# ${cleanId.replace(/_/g, " ")}\n\n${tmpl?.tag ?? "#note"}\n\n`;

    try {
      await onCreate(cleanId, initialContent);
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="modal-container new-note-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title">
            <span className="modal-num">01 //</span>
            <strong>CREATE NEW NOTE</strong>
          </div>
          <button className="modal-close" onClick={onClose} title="Cancel (Esc)">
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="input-group">
            <label className="input-label" htmlFor="new-note-title">
              NOTE TITLE OR SLUG
            </label>
            <input
              id="new-note-title"
              ref={inputRef}
              className="modal-input"
              value={name}
              placeholder="e.g. quantum_state_telemetry or Agent Grounding"
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") onClose();
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSubmit();
                }
              }}
              disabled={submitting}
            />
          </div>

          {/* Real-time Path Resolution Preview */}
          <div className="path-preview">
            <span className="path-label">RESOLVED TARGET:</span>
            <code className="path-code">
              second-brain/notes/{cleanId ? `${cleanId}.md` : "[title].md"}
            </code>
          </div>

          {/* Template / Category Archetype */}
          <div className="template-picker">
            <label className="input-label">NOTE ARCHETYPE</label>
            <div className="template-chips">
              {TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.id}
                  type="button"
                  className={`template-chip ${selectedTemplate === tmpl.id ? "active" : ""}`}
                  onClick={() => setSelectedTemplate(tmpl.id)}
                >
                  <span className="tmpl-label">{tmpl.label}</span>
                  <span className="tmpl-tag">{tmpl.tag}</span>
                </button>
              ))}
            </div>
          </div>

          {collision && (
            <div className="modal-warning">
              ⚠️ Note already exists. Choosing this will open the existing note.
            </div>
          )}

          {error && <div className="modal-error">{error}</div>}
        </div>

        <div className="modal-footer">
          <div className="modal-footer-hint">
            <kbd>ESC</kbd> Cancel &nbsp;·&nbsp; <kbd>ENTER ↵</kbd> Create Note
          </div>
          <div className="modal-footer-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={submitting}
            >
              CANCEL
            </button>
            <button
              type="button"
              className="accent"
              onClick={() => void handleSubmit()}
              disabled={submitting || !cleanId || collision}
            >
              {submitting ? "INITIALIZING…" : "CREATE NOTE ↵"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
