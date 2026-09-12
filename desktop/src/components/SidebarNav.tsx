import { useState } from "react";
import Icon from "./Icon";
import type { GitStatusData } from "../types";

export type NavSection = "home" | "knowledge" | "ai";
export type KnowledgeSubTab = "notes" | "graph" | "tags";

interface Props {
  activeSection: NavSection;
  knowledgeSubTab: KnowledgeSubTab;
  onSelectSection: (section: NavSection) => void;
  onSelectKnowledgeSubTab: (subTab: KnowledgeSubTab) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  notesDrawerOpen: boolean;
  onToggleNotesDrawer: () => void;
  onOpenQuickSwitcher: () => void;
  onOpenJournal: () => void;
  onOpenGrounding: () => void;
  onOpenNewNote: () => void;
  onOpenAISettings: () => void;
  gitStatus: GitStatusData | null;
}

/**
 * Left sidebar. Sections map to real views (Home, Knowledge, Copilot);
 * tools that only open dialogs (Grounding, Journal, Settings) are honest
 * actions and never fake a navigation state.
 */
export default function SidebarNav({
  activeSection,
  knowledgeSubTab,
  onSelectSection,
  onSelectKnowledgeSubTab,
  collapsed,
  onToggleCollapsed,
  notesDrawerOpen,
  onToggleNotesDrawer,
  onOpenQuickSwitcher,
  onOpenJournal,
  onOpenGrounding,
  onOpenNewNote,
  onOpenAISettings,
  gitStatus,
}: Props) {
  const [knowledgeExpanded, setKnowledgeExpanded] = useState(true);

  return (
    <aside className={`sidebar-nav ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <img src="/logo.png" alt="Severus" className="brand-icon" />
          {!collapsed && (
            <div className="brand-text">
              <span className="brand-title">Severus.ai</span>
              <span className="brand-subtitle">Second Brain</span>
            </div>
          )}
        </div>
        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={onToggleCollapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <Icon name="chevron-right" size={13} style={{ transform: collapsed ? "none" : "rotate(180deg)" }} />
        </button>
      </div>

      {!collapsed && (
        <div className="sidebar-quick-actions">
          <button type="button" className="btn-primary-action" onClick={onOpenNewNote}>
            <Icon name="plus" size={13} />
            New Note
          </button>
        </div>
      )}

      <nav className="sidebar-menu">
        <div className="menu-group">
          {!collapsed && <div className="menu-group-label">Workspace</div>}
          <button
            type="button"
            className={`menu-item ${activeSection === "home" ? "active" : ""}`}
            onClick={() => onSelectSection("home")}
            title={collapsed ? "Home overview" : undefined}
          >
            <span className="menu-icon">
              <Icon name="home" size={15} />
            </span>
            {!collapsed && <span className="menu-label">Home</span>}
          </button>
          <button
            type="button"
            className="menu-item"
            onClick={onOpenQuickSwitcher}
            title={collapsed ? "Quick Switcher (Ctrl+K)" : "Quick Switcher (Ctrl+K)"}
          >
            <span className="menu-icon">
              <Icon name="search" size={15} />
            </span>
            {!collapsed && <span className="menu-label">Quick Switcher</span>}
          </button>
        </div>

        <div className="menu-group">
          <div className="menu-group-header">
            <button
              type="button"
              className={`menu-item ${activeSection === "knowledge" ? "active" : ""}`}
              onClick={() => {
                onSelectSection("knowledge");
                if (!collapsed) setKnowledgeExpanded((prev) => !prev);
              }}
              title={collapsed ? "Knowledge vault" : undefined}
            >
              <span className="menu-icon">
                <Icon name="book" size={15} />
              </span>
              {!collapsed && <span className="menu-label">Knowledge</span>}
              {!collapsed && (
                <span className="arrow-icon" style={{ transform: knowledgeExpanded ? "none" : "rotate(-90deg)" }}>
                  <Icon name="chevron-down" size={12} />
                </span>
              )}
            </button>
          </div>

          {!collapsed && knowledgeExpanded && activeSection === "knowledge" && (
            <div className="menu-subitems">
              <button
                type="button"
                className={`sub-item ${knowledgeSubTab === "graph" ? "active" : ""}`}
                onClick={() => onSelectKnowledgeSubTab("graph")}
              >
                <span>Graph Map</span>
              </button>
              <button
                type="button"
                className={`sub-item ${knowledgeSubTab === "notes" ? "active" : ""}`}
                onClick={() => {
                  onSelectKnowledgeSubTab("notes");
                  if (!notesDrawerOpen) onToggleNotesDrawer();
                }}
              >
                <span>Notes List</span>
              </button>
              <button
                type="button"
                className={`sub-item ${knowledgeSubTab === "tags" ? "active" : ""}`}
                onClick={() => onSelectKnowledgeSubTab("tags")}
              >
                <span>Tags &amp; Index</span>
              </button>
            </div>
          )}
        </div>

        <div className="menu-group">
          <button
            type="button"
            className={`menu-item ${activeSection === "ai" ? "active" : ""}`}
            onClick={() => onSelectSection("ai")}
            title={collapsed ? "AI Copilot" : undefined}
          >
            <span className="menu-icon">
              <Icon name="spark" size={15} />
            </span>
            {!collapsed && <span className="menu-label">AI Copilot</span>}
          </button>
        </div>

        <div className="menu-group">
          {!collapsed && <div className="menu-group-label">Tools</div>}
          <button
            type="button"
            className="menu-item"
            onClick={onOpenGrounding}
            title={collapsed ? "Grounding assembler (Ctrl+Shift+G)" : "Grounding assembler (Ctrl+Shift+G)"}
          >
            <span className="menu-icon">
              <Icon name="layers" size={15} />
            </span>
            {!collapsed && <span className="menu-label">Grounding</span>}
          </button>
          <button
            type="button"
            className="menu-item"
            onClick={onOpenJournal}
            title={collapsed ? "Quick journal capture (Ctrl+J)" : "Quick journal capture (Ctrl+J)"}
          >
            <span className="menu-icon">
              <Icon name="pen" size={15} />
            </span>
            {!collapsed && <span className="menu-label">Journal</span>}
          </button>
        </div>

        <div className="menu-group">
          <button
            type="button"
            className="menu-item"
            onClick={onOpenAISettings}
            title={collapsed ? "AI settings" : "AI settings"}
          >
            <span className="menu-icon">
              <Icon name="gear" size={15} />
            </span>
            {!collapsed && <span className="menu-label">AI Settings</span>}
          </button>
        </div>
      </nav>

      <div className="sidebar-footer">
        {collapsed ? (
          <span
            className={`status-dot ${gitStatus && !gitStatus.is_clean ? "dirty" : ""}`}
            title={`Git: ${gitStatus?.branch ?? "unavailable"}`}
          />
        ) : (
          <div className="git-indicator" title={gitStatus ? `${gitStatus.branch} · ${gitStatus.is_clean ? "clean" : "has changes"}` : "Git unavailable"}>
            <Icon name="git-branch" size={12} />
            <span className="git-branch">{gitStatus ? gitStatus.branch : "git…"}</span>
            <span className={`status-dot ${gitStatus && !gitStatus.is_clean ? "dirty" : ""}`} />
          </div>
        )}
      </div>
    </aside>
  );
}
