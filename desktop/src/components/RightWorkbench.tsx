import type { AIConfig } from "../lib/ai";
import type { NoteContent, NoteMeta } from "../types";
import NoteEditor from "./NoteEditor";
import AICopilot from "./AICopilot";

interface Props {
  open: boolean;
  activeTab: "note" | "copilot";
  onSelectTab: (tab: "note" | "copilot") => void;
  onClose: () => void;
  // NoteEditor props
  note: NoteContent | null;
  notesList?: NoteMeta[];
  onSaveNote: (id: string, content: string) => Promise<void>;
  onOpenLink: (name: string) => void;
  onToggleTag: (tag: string) => void;
  onOpenInEditor?: (id: string) => Promise<void>;
  onNewNote?: () => void;
  onOpenJournal?: () => void;
  onOpenGrounding?: () => void;
  // AICopilot props
  aiConfig: AIConfig;
  onOpenAISettings: () => void;
  onSaveAsNote?: (title: string, content: string) => Promise<void>;
  onShowToast?: (msg: string) => void;
  onOpenNote?: (id: string) => void;
}

export default function RightWorkbench({
  open,
  activeTab,
  onSelectTab,
  onClose,
  note,
  notesList,
  onSaveNote,
  onOpenLink,
  onToggleTag,
  onOpenInEditor,
  onNewNote,
  onOpenJournal,
  onOpenGrounding,
  aiConfig,
  onOpenAISettings,
  onSaveAsNote,
  onShowToast,
  onOpenNote,
}: Props) {
  if (!open) return null;

  return (
    <aside className="right-workbench">
      {/* Workbench Global Tab Bar */}
      <div className="workbench-tabs">
        <div className="workbench-tabs-left">
          <button
            type="button"
            className={`workbench-tab ${activeTab === "note" ? "active" : ""}`}
            onClick={() => onSelectTab("note")}
          >
            <span className="tab-num">02</span>
            <span>NOTE WORKSPACE</span>
            {note && <span className="tab-file-pill">{note.id}.md</span>}
          </button>
          <button
            type="button"
            className={`workbench-tab ${activeTab === "copilot" ? "active" : ""}`}
            onClick={() => onSelectTab("copilot")}
          >
            <span className="tab-num">04</span>
            <span>AI COPILOT</span>
            <span className="live-dot" />
          </button>
        </div>

        <button className="workbench-close-btn" onClick={onClose} title="Collapse inspector (Esc / Hide)">
          ✕
        </button>
      </div>

      {/* Body Content */}
      <div className="workbench-body">
        {activeTab === "note" ? (
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
        )}
      </div>
    </aside>
  );
}
