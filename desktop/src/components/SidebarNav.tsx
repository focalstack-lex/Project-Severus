import { useState } from "react";
import type { GitStatusData } from "../types";

export type NavSection = "home" | "knowledge" | "work" | "ai" | "personal" | "system";
export type KnowledgeSubTab = "notes" | "graph" | "tags" | "collections";

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
      {/* Brand & Collapse Toggle */}
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <img src="/logo.png" alt="Severus" className="brand-icon" />
          {!collapsed && (
            <div className="brand-text">
              <span className="brand-title">Severus.ai</span>
              <span className="brand-subtitle">Knowledge Vault</span>
            </div>
          )}
        </div>
        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={onToggleCollapsed}
          title={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {collapsed ? "→" : "←"}
        </button>
      </div>

      {/* Quick Action Button */}
      {!collapsed && (
        <div className="sidebar-quick-actions">
          <button type="button" className="btn-primary-action" onClick={onOpenNewNote}>
            <span>+</span> New Note
          </button>
        </div>
      )}

      {/* Navigation Menu */}
      <nav className="sidebar-menu">
        {/* HOME SECTION */}
        <div className="menu-group">
          <button
            type="button"
            className={`menu-item ${activeSection === "home" ? "active" : ""}`}
            onClick={() => onSelectSection("home")}
            title={collapsed ? "Home Overview" : undefined}
          >
            <span className="menu-icon">⌂</span>
            {!collapsed && <span className="menu-label">Home</span>}
          </button>
          <button
            type="button"
            className="menu-item"
            onClick={onOpenQuickSwitcher}
            title={collapsed ? "Search (Ctrl+K)" : undefined}
          >
            <span className="menu-icon">🔍</span>
            {!collapsed && <span className="menu-label">Quick Switcher</span>}
          </button>
        </div>

        {/* KNOWLEDGE SECTION */}
        <div className="menu-group">
          <div className="menu-group-header">
            <button
              type="button"
              className={`menu-item ${activeSection === "knowledge" ? "active" : ""}`}
              onClick={() => {
                onSelectSection("knowledge");
                setKnowledgeExpanded((prev) => !prev);
              }}
              title={collapsed ? "Knowledge Vault" : undefined}
            >
              <span className="menu-icon">📚</span>
              {!collapsed && <span className="menu-label">Knowledge</span>}
              {!collapsed && (
                <span className="arrow-icon">{knowledgeExpanded ? "▾" : "▸"}</span>
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
                <span>Tags & Index</span>
              </button>
            </div>
          )}
        </div>

        {/* WORK SECTION */}
        <div className="menu-group">
          <button
            type="button"
            className={`menu-item ${activeSection === "work" ? "active" : ""}`}
            onClick={() => {
              onSelectSection("work");
              onOpenGrounding();
            }}
            title={collapsed ? "Work & Context Grounding" : undefined}
          >
            <span className="menu-icon">⚡</span>
            {!collapsed && <span className="menu-label">Work & Context</span>}
          </button>
        </div>

        {/* AI SECTION */}
        <div className="menu-group">
          <button
            type="button"
            className={`menu-item ${activeSection === "ai" ? "active" : ""}`}
            onClick={() => onSelectSection("ai")}
            title={collapsed ? "AI Copilot" : undefined}
          >
            <span className="menu-icon">✦</span>
            {!collapsed && <span className="menu-label">AI Copilot</span>}
          </button>
        </div>

        {/* PERSONAL SECTION */}
        <div className="menu-group">
          <button
            type="button"
            className={`menu-item ${activeSection === "personal" ? "active" : ""}`}
            onClick={() => {
              onSelectSection("personal");
              onOpenJournal();
            }}
            title={collapsed ? "Personal Journal" : undefined}
          >
            <span className="menu-icon">✎</span>
            {!collapsed && <span className="menu-label">Journal</span>}
          </button>
        </div>

        {/* SYSTEM SECTION */}
        <div className="menu-group">
          <button
            type="button"
            className={`menu-item ${activeSection === "system" ? "active" : ""}`}
            onClick={() => {
              onSelectSection("system");
              onOpenAISettings();
            }}
            title={collapsed ? "System Settings" : undefined}
          >
            <span className="menu-icon">⚙</span>
            {!collapsed && <span className="menu-label">Settings</span>}
          </button>
        </div>
      </nav>

      {/* Footer Info */}
      <div className="sidebar-footer">
        {!collapsed ? (
          <div className="git-indicator">
            <span className={`status-dot ${gitStatus?.is_clean ? "clean" : "dirty"}`} />
            <span className="git-branch">{gitStatus ? gitStatus.branch : "Git Ready"}</span>
          </div>
        ) : (
          <div
            className={`status-dot ${gitStatus?.is_clean ? "clean" : "dirty"}`}
            title={`Git: ${gitStatus?.branch ?? "Ready"}`}
          />
        )}
      </div>
    </aside>
  );
}
