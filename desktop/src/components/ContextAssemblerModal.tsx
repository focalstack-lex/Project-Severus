import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { NoteContent, NoteMeta } from "../types";
import Icon from "./Icon";
import { readNote, getMemorySummary, getUserMemories } from "../lib/tauri";

interface Props {
  open: boolean;
  notes: NoteMeta[];
  activeNote: NoteContent | null;
  onClose: () => void;
  onShowToast: (msg: string) => void;
}

type GroundingPreset = "architecture" | "debugging" | "tdd" | "bare";

const CORE_DIRECTIVES: Record<GroundingPreset, string> = {
  architecture: `# ROLE: Senior Lead Engineer & Systems Architect (Severus Protocol)
## CORE OPERATING RULES
1. Zero Hallucination Directive: Never guess file contents, command syntax, or APIs. Explore with commands first.
2. Defensive Architecture: Validate external inputs at every boundary. No silent exceptions or swallowed errors.
3. Junior Blind-Spot Protocol: Actively audit for missing input validation, unhandled edge cases, and performance bottlenecks.
4. Output Format: Cite file:line for every factual claim about code. Propose concrete diffs.`,

  debugging: `# ROLE: Forensic Debugging Lead (Severus Protocol)
## SYSTEMATIC DEBUGGING DIRECTIVES
1. Root-Cause Analysis: Identify the fundamental defect before proposing any fix. Never apply speculative patches.
2. Evidence-Based Verification: Inspect logs, reproduce failure with minimal test cases, and verify hypotheses.
3. Zero Silent Swallowing: Identify where errors are masked or unchecked.
4. Output Format: State Root Cause -> Direct Evidence (file:line) -> Minimal Safe Fix -> Verification Proof.`,

  tdd: `# ROLE: Senior TDD Engineer & Code Auditor (Severus Protocol)
## TEST-DRIVEN DEVELOPMENT PROTOCOL
1. Red Phase: Formulate a failing test specifying the required behavior before writing application code.
2. Green Phase: Implement the simplest defensive solution that satisfies the test.
3. Refactor Phase: Optimize code cleanliness, eliminate redundancy, and preserve documentation integrity.
4. Pre-Production Gate: No code ships without passing tests and zero lint regressions.`,

  bare: `# CONTEXT GROUNDING BUNDLE (Severus Knowledge Vault)
The following knowledge documents represent verified facts, system architecture, and domain conventions.`,
};

export default function ContextAssemblerModal({
  open,
  notes,
  activeNote,
  onClose,
  onShowToast,
}: Props) {
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [preset, setPreset] = useState<GroundingPreset>("architecture");
  const [includeDirectives, setIncludeDirectives] = useState(true);
  const [includeActiveNote, setIncludeActiveNote] = useState(true);
  const [taskInstruction, setTaskInstruction] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [loadedNoteContents, setLoadedNoteContents] = useState<Record<string, string>>({});
  const [includeUserMemory, setIncludeUserMemory] = useState(true);
  const [memorySummary, setMemorySummary] = useState("");
  const [memoryCount, setMemoryCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Initialize selected notes when opening
  useEffect(() => {
    if (open) {
      if (activeNote) {
        setSelectedNoteIds(new Set([activeNote.id]));
      } else if (notes.length > 0) {
        // Pre-select first 2 notes
        setSelectedNoteIds(new Set(notes.slice(0, 2).map((n) => n.id)));
      }
      setCopied(false);
      window.setTimeout(() => searchInputRef.current?.focus(), 40);
      void getMemorySummary().then(setMemorySummary);
      void getUserMemories().then((items) => setMemoryCount(items.length));
    }
  }, [open, activeNote, notes]);

  // Load content of selected notes on demand
  useEffect(() => {
    if (!open) return;
    const idsToFetch = Array.from(selectedNoteIds).filter((id) => !loadedNoteContents[id]);
    if (idsToFetch.length === 0) return;

    let cancelled = false;
    setLoadingNotes(true);
    Promise.all(
      idsToFetch.map(async (id) => {
        try {
          const res = await readNote(id);
          return { id, content: res.content };
        } catch {
          return { id, content: `<!-- Note ${id} could not be read -->` };
        }
      })
    ).then((items) => {
      if (cancelled) return;
      setLoadedNoteContents((prev) => {
        const next = { ...prev };
        for (const item of items) next[item.id] = item.content;
        return next;
      });
      setLoadingNotes(false);
    });

    return () => {
      cancelled = true;
    };
  }, [open, selectedNoteIds, loadedNoteContents]);

  const toggleNote = (id: string) => {
    setSelectedNoteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedNoteIds(new Set(notes.map((n) => n.id)));
  };

  const clearAll = () => {
    setSelectedNoteIds(new Set());
  };

  // Compile prompt
  const compiledPrompt = useMemo(() => {
    const parts: string[] = [];

    if (includeDirectives) {
      parts.push(CORE_DIRECTIVES[preset]);
    }

    if (taskInstruction.trim()) {
      parts.push(`## SPECIFIC TASK OBJECTIVE\n${taskInstruction.trim()}`);
    }

    const knowledgeSections: string[] = [];

    if (includeActiveNote && activeNote && !selectedNoteIds.has(activeNote.id)) {
      knowledgeSections.push(
        `### Note: ${activeNote.title} (Active Editor Note)\n${activeNote.content}`
      );
    }

    for (const id of selectedNoteIds) {
      const content = loadedNoteContents[id] ?? "(Loading content...)";
      const noteMeta = notes.find((n) => n.id === id);
      const title = noteMeta ? noteMeta.title : id;
      knowledgeSections.push(`### Note: ${title} (${id}.md)\n${content}`);
    }

    if (includeUserMemory && memorySummary) {
      parts.push(`## USER COGNITIVE MEMORY & CONSTRAINTS\n${memorySummary}`);
    }

    if (knowledgeSections.length > 0) {
      parts.push(`## GROUNDING CONTEXT FROM SECOND BRAIN\n${knowledgeSections.join("\n\n---\n\n")}`);
    }

    return parts.join("\n\n---\n\n");
  }, [
    preset,
    includeDirectives,
    includeUserMemory,
    memorySummary,
    includeActiveNote,
    activeNote,
    taskInstruction,
    selectedNoteIds,
    loadedNoteContents,
    notes,
  ]);

  // Token & Word Estimation
  const stats = useMemo(() => {
    const chars = compiledPrompt.length;
    const words = compiledPrompt.trim() ? compiledPrompt.trim().split(/\s+/).length : 0;
    const estTokens = Math.round(chars / 3.8);
    return { chars, words, estTokens };
  }, [compiledPrompt]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(compiledPrompt);
      setCopied(true);
      onShowToast(`Copied ~${stats.estTokens.toLocaleString()} tokens to clipboard!`);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      onShowToast("Failed to copy prompt to clipboard");
    }
  };

  const filteredNotes = useMemo(() => {
    const q = searchFilter.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.id.toLowerCase().includes(q) ||
        n.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [notes, searchFilter]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="overlay grounding-overlay"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
        >
          <motion.div
            className="grounding-modal"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void handleCopy();
              }
            }}
          >
        {/* Modal Header */}
        <div className="grounding-header">
          <div className="grounding-title-wrap">
            <span className="grounding-section-num">05 / GROUNDING ENGINE</span>
            <div className="grounding-title">Agent Prompt Assembler</div>
          </div>
          <div className="grounding-header-badges">
            <span className="token-badge" title="Estimated model context token consumption">
              ~{stats.estTokens.toLocaleString()} tokens
            </span>
            <span className="word-badge">{stats.words} words</span>
            <button className="close-btn" onClick={onClose} title="Close (Esc)" aria-label="Close (Esc)">
              <Icon name="close" size={13} />
            </button>
          </div>
        </div>

        <div className="grounding-body">
          {/* Left Column: Preset & Note Selector */}
          <div className="grounding-controls">
            {/* Presets */}
            <div className="grounding-section">
              <label className="grounding-label">ENGINEERING PRESET</label>
              <div className="preset-pill-grid">
                {(
                  [
                    ["architecture", "ARCHITECTURE"],
                    ["debugging", "DEBUG PROTOCOL"],
                    ["tdd", "TDD & AUDIT"],
                    ["bare", "RAW NOTES"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={`preset-pill ${preset === key ? "active" : ""}`}
                    onClick={() => setPreset(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Task Prompt Customizer */}
            <div className="grounding-section">
              <label className="grounding-label">OPTIONAL TASK INSTRUCTION</label>
              <textarea
                className="task-input"
                rows={2}
                placeholder="e.g. Audit authentication flow for timing vulnerabilities..."
                value={taskInstruction}
                onChange={(e) => setTaskInstruction(e.target.value)}
              />
            </div>

            {/* Toggles */}
            <div className="grounding-section grounding-toggles">
              <label className="toggle-check">
                <input
                  type="checkbox"
                  checked={includeDirectives}
                  onChange={(e) => setIncludeDirectives(e.target.checked)}
                />
                <span>Include Operating Directives</span>
              </label>
              <label className="toggle-check" title="Ground with Lex's structured user memory, hard constraints, and active projects">
                <input
                  type="checkbox"
                  checked={includeUserMemory}
                  onChange={(e) => setIncludeUserMemory(e.target.checked)}
                />
                <span>Include User Memory ({memoryCount > 0 ? `${memoryCount} memories` : "Active Profile"})</span>
              </label>
              {activeNote && (
                <label className="toggle-check">
                  <input
                    type="checkbox"
                    checked={includeActiveNote}
                    onChange={(e) => setIncludeActiveNote(e.target.checked)}
                  />
                  <span>Include Active Editor Note ({activeNote.title})</span>
                </label>
              )}
            </div>

            {/* Notes Multi-Selector */}
            <div className="grounding-section notes-selector-section">
              <div className="notes-selector-header">
                <label className="grounding-label">
                  SELECT VAULT NOTES ({selectedNoteIds.size}/{notes.length})
                </label>
                <div className="notes-selector-actions">
                  <button type="button" onClick={selectAll}>
                    ALL
                  </button>
                  <button type="button" onClick={clearAll}>
                    NONE
                  </button>
                </div>
              </div>

              <input
                ref={searchInputRef}
                type="text"
                className="filter-notes-input"
                placeholder="Filter notes by title or #tag…"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
              />

              <div className="notes-checklist">
                {filteredNotes.map((n) => {
                  const isChecked = selectedNoteIds.has(n.id);
                  return (
                    <label key={n.id} className={`note-check-item ${isChecked ? "checked" : ""}`}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleNote(n.id)}
                      />
                      <span className="note-check-title">{n.title}</span>
                      {n.tags.length > 0 && (
                        <span className="note-check-tag">#{n.tags[0]}</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column: Live Compiled Prompt Preview */}
          <div className="grounding-preview">
            <div className="preview-header">
              <span className="preview-label">LIVE PROMPT PREVIEW</span>
              {loadingNotes && <span className="preview-loading">FETCHING NOTES…</span>}
            </div>
            <textarea
              className="compiled-textarea"
              readOnly
              value={compiledPrompt}
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="modal-footer grounding-footer">
          <span className="modal-hint">
            Ready to paste into Antigravity, Claude Code, Cursor, or Aider. Press <kbd>Ctrl+Enter</kbd> to copy.
          </span>
          <div className="footer-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              CLOSE
            </button>
            <button
              type="button"
              className={`btn-primary copy-btn ${copied ? "copied" : ""}`}
              onClick={() => void handleCopy()}
            >
              {copied ? (
                <>
                  <Icon name="check" size={12} /> Copied to clipboard
                </>
              ) : (
                "Copy Grounding Prompt (Ctrl+Enter)"
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
      )}
    </AnimatePresence>
  );
}
