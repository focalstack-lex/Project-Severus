import { useEffect, useRef, useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (text: string) => Promise<void>;
}

export default function JournalCapture({ open, onClose, onSubmit }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setText("");
      setBusy(false);
      setError(null);
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(text);
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="capture" onClick={(event) => event.stopPropagation()}>
        <div className="capture-header">
          <div className="capture-title">
            03 / QUICK CAPTURE // <strong>JOURNAL STREAM</strong>
          </div>
          <span className="badge-pill">ESC TO DISMISS</span>
        </div>
        <input
          ref={inputRef}
          value={text}
          disabled={busy}
          placeholder="Log an action, insight, or status... Press [Enter] to commit"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
            if (event.key === "Enter") void submit();
          }}
        />
        <div className="capture-hint">
          <span>APPENDS TO JOURNAL/YYYY-MM-DD.MD</span>
          <span>PRESS ENTER ↵</span>
        </div>
        {error && <div className="editor-banner error">{error}</div>}
      </div>
    </div>
  );
}
