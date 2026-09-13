import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

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
    <AnimatePresence>
      {open && (
        <motion.div
          key="journal-overlay"
          className="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          onClick={onClose}
        >
          <motion.div
            key="journal-card"
            className="capture"
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="capture-header">
              <div className="capture-title">
                Quick Capture — <strong>Journal Stream</strong>
              </div>
              <span className="badge-pill">Esc to dismiss</span>
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
              <span>Appends to journal/YYYY-MM-DD.md</span>
              <span>Press Enter ↵</span>
            </div>
            {error && <div className="editor-banner error">{error}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
