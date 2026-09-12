import type { GitStatusData } from "../types";

interface Props {
  notesDrawerOpen: boolean;
  onToggleNotesDrawer: () => void;
  onOpenQuickSwitcher: () => void;
  onOpenJournal: () => void;
  onOpenGrounding: () => void;
  workbenchOpen: boolean;
  activeTab: "note" | "copilot";
  onSelectTab: (tab: "note" | "copilot") => void;
  onToggleWorkbench: () => void;
  onOpenAISettings: () => void;
  zenMode: boolean;
  onToggleZenMode: () => void;
  gitStatus: GitStatusData | null;
}

export default function ActivityRail({
  notesDrawerOpen,
  onToggleNotesDrawer,
  onOpenQuickSwitcher,
  onOpenJournal,
  onOpenGrounding,
  workbenchOpen,
  activeTab,
  onSelectTab,
  onToggleWorkbench,
  onOpenAISettings,
  zenMode,
  onToggleZenMode,
  gitStatus,
}: Props) {
  const gitTooltip = gitStatus
    ? `GIT: ${gitStatus.branch} ${
        gitStatus.is_clean
          ? "(clean)"
          : `(${gitStatus.modified_count} mod, ${gitStatus.untracked_count} new)`
      }`
    : "GIT: checking status…";

  return (
    <nav className="activity-rail" aria-label="Activity Rail">
      <div className="rail-top">
        <button
          className="rail-item logo-btn"
          title="Severus System Hub"
          onClick={() => {
            if (notesDrawerOpen) onToggleNotesDrawer();
          }}
        >
          <img src="/logo.png" alt="Severus Logo" className="rail-logo-img" />
        </button>

        <div className="rail-divider" />

        {/* Quick Search */}
        <button
          className="rail-item"
          title="Quick Switcher (Ctrl+K)"
          onClick={onOpenQuickSwitcher}
        >
          <span className="rail-icon">⌘</span>
          <span className="rail-tooltip">SEARCH [CTRL+K]</span>
        </button>

        {/* Grounding Engine / Context Assembler */}
        <button
          className="rail-item"
          title="Agent Grounding Assembler (Ctrl+Shift+G)"
          onClick={onOpenGrounding}
        >
          <span className="rail-icon">⚡</span>
          <span className="rail-tooltip">GROUNDING [CTRL+SHIFT+G]</span>
        </button>

        {/* Notes Explorer Drawer */}
        <button
          className={`rail-item ${notesDrawerOpen ? "active" : ""}`}
          title="Notes Explorer"
          onClick={onToggleNotesDrawer}
        >
          <span className="rail-icon">☰</span>
          <span className="rail-tooltip">NOTES EXPLORER</span>
        </button>

        {/* Quick Journal */}
        <button
          className="rail-item"
          title="Quick Journal (Ctrl+J)"
          onClick={onOpenJournal}
        >
          <span className="rail-icon">✎</span>
          <span className="rail-tooltip">QUICK JOURNAL [CTRL+J]</span>
        </button>

        {/* Note Workspace Tab */}
        <button
          className={`rail-item ${workbenchOpen && activeTab === "note" ? "active" : ""}`}
          title="Note Workspace"
          onClick={() => {
            if (!workbenchOpen) {
              onToggleWorkbench();
              onSelectTab("note");
            } else if (activeTab === "note") {
              onToggleWorkbench();
            } else {
              onSelectTab("note");
            }
          }}
        >
          <span className="rail-icon">⬡</span>
          <span className="rail-tooltip">NOTE WORKSPACE</span>
        </button>

        {/* AI Copilot Tab */}
        <button
          className={`rail-item ${workbenchOpen && activeTab === "copilot" ? "active" : ""}`}
          title="Knowledge Copilot (Ctrl+Shift+A)"
          onClick={() => {
            if (!workbenchOpen) {
              onToggleWorkbench();
              onSelectTab("copilot");
            } else if (activeTab === "copilot") {
              onToggleWorkbench();
            } else {
              onSelectTab("copilot");
            }
          }}
        >
          <span className="rail-icon">✦</span>
          <span className="rail-tooltip">AI COPILOT</span>
        </button>
      </div>

      <div className="rail-bottom">
        {/* Git Telemetry */}
        <div className="rail-item git-pill-item" title={gitTooltip}>
          <span className="rail-icon git-icon">±</span>
          <span className={`git-status-dot ${gitStatus?.is_clean ? "clean" : "dirty"}`} />
          <span className="rail-tooltip">{gitTooltip.toUpperCase()}</span>
        </div>

        {/* Zen Mode */}
        <button
          className={`rail-item ${zenMode ? "active" : ""}`}
          title={zenMode ? "Exit Zen Fullscreen" : "Enter Zen Fullscreen Graph"}
          onClick={onToggleZenMode}
        >
          <span className="rail-icon">{zenMode ? "✕" : "⛶"}</span>
          <span className="rail-tooltip">ZEN MODE</span>
        </button>

        {/* AI Provider Settings */}
        <button
          className="rail-item"
          title="AI Brain & Model Provider Settings"
          onClick={onOpenAISettings}
        >
          <span className="rail-icon">⚙</span>
          <span className="rail-tooltip">SETTINGS</span>
        </button>
      </div>
    </nav>
  );
}
