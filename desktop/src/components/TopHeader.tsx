import { useState } from "react";
import Icon from "./Icon";
import type { AIConfig } from "../lib/ai";
import type { GitStatusData } from "../types";

export type NavSection = "home" | "knowledge" | "ai";
export type KnowledgeSubTab = "notes" | "graph" | "tags";

const IS_MAC =
  typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform);
const MOD_KEY = IS_MAC ? "⌘" : "Ctrl";

interface Props {
  activeSection?: NavSection;
  onSelectSection?: (section: NavSection) => void;
  knowledgeSubTab?: KnowledgeSubTab;
  onSelectKnowledgeSubTab?: (subTab: KnowledgeSubTab) => void;
  onToggleNotesDrawer?: () => void;
  onOpenQuickSearch: () => void;
  onToggleCopilot: () => void;
  onOpenGrounding: () => void;
  onOpenNewNote: () => void;
  onOpenAISettings: () => void;
  aiConfig: AIConfig;
  voiceMuted: boolean;
  onToggleVoiceMuted: () => void;
  clapEnabled: boolean;
  onToggleClapEnabled: () => void;
  voiceCmdEnabled: boolean;
  onToggleVoiceCmdEnabled: () => void;
  gitStatus: GitStatusData | null;
  copilotActive: boolean;
}

/**
 * Floating capsule top-nav: brand, primary views, quick actions, and a
 * system popover. Solid obsidian surface, drawn icons, honest shortcuts.
 */
export default function TopHeader({
  activeSection = "knowledge",
  onSelectSection,
  knowledgeSubTab = "graph",
  onSelectKnowledgeSubTab,
  onToggleNotesDrawer,
  onOpenQuickSearch,
  onToggleCopilot,
  onOpenGrounding,
  onOpenNewNote,
  onOpenAISettings,
  aiConfig,
  voiceMuted,
  onToggleVoiceMuted,
  clapEnabled,
  onToggleClapEnabled,
  voiceCmdEnabled,
  onToggleVoiceCmdEnabled,
  gitStatus,
  copilotActive,
}: Props) {
  const [systemPopoverOpen, setSystemPopoverOpen] = useState(false);

  return (
    <header className="framer-top-nav-wrapper">
      <div className="framer-top-nav-capsule">
        {/* Brand */}
        <button
          type="button"
          className="nav-brand-item"
          onClick={() => onSelectSection?.("home")}
          title="Severus.ai Home"
        >
          <img src="/logo.png" alt="Severus" className="nav-brand-logo" />
          <span className="nav-brand-name">Severus</span>
        </button>

        {/* Primary views */}
        <nav className="nav-links-cluster">
          <button
            type="button"
            className={`nav-pill-item ${activeSection === "home" ? "active" : ""}`}
            onClick={() => onSelectSection?.("home")}
          >
            <span className="nav-pill-icon">
              <Icon name="home" size={14} />
            </span>
            <span>Home</span>
          </button>

          <button
            type="button"
            className={`nav-pill-item ${activeSection === "knowledge" && knowledgeSubTab === "graph" ? "active" : ""}`}
            onClick={() => {
              onSelectSection?.("knowledge");
              onSelectKnowledgeSubTab?.("graph");
            }}
          >
            <span className="nav-pill-icon">
              <Icon name="graph" size={14} />
            </span>
            <span>Graph</span>
          </button>

          <button
            type="button"
            className={`nav-pill-item ${activeSection === "knowledge" && knowledgeSubTab === "notes" ? "active" : ""}`}
            onClick={() => {
              onSelectSection?.("knowledge");
              onSelectKnowledgeSubTab?.("notes");
              onToggleNotesDrawer?.();
            }}
          >
            <span className="nav-pill-icon">
              <Icon name="book" size={14} />
            </span>
            <span>Notes</span>
          </button>

          <button
            type="button"
            className={`nav-pill-item ${copilotActive ? "active" : ""}`}
            onClick={onToggleCopilot}
          >
            <span className="nav-pill-icon">
              <Icon name="spark" size={14} />
            </span>
            <span>Copilot</span>
          </button>

          <button
            type="button"
            className="nav-pill-item search-trigger"
            onClick={onOpenQuickSearch}
            title={`Search notes and commands (${MOD_KEY}+K)`}
          >
            <span className="nav-pill-icon">
              <Icon name="search" size={14} />
            </span>
            <span className="search-text">Search</span>
            <kbd className="nav-kbd">{MOD_KEY}K</kbd>
          </button>
        </nav>

        {/* Quick actions & system popover */}
        <div className="nav-actions-cluster">
          <button
            type="button"
            className="nav-action-btn accent"
            onClick={onOpenNewNote}
            title={`Create New Note (${MOD_KEY}+Alt+N)`}
          >
            <Icon name="plus" size={13} />
            <span>Note</span>
          </button>

          <button
            type="button"
            className="nav-action-btn"
            onClick={onOpenGrounding}
            title={`Assemble agent grounding context (${MOD_KEY}+Shift+G)`}
          >
            <Icon name="layers" size={13} />
            <span>Grounding</span>
          </button>

          <div className="popover-wrapper">
            <button
              type="button"
              className={`nav-action-btn status-btn ${systemPopoverOpen ? "active" : ""}`}
              onClick={() => setSystemPopoverOpen((prev) => !prev)}
              title="System status and voice settings"
            >
              <span className={`status-dot ${voiceMuted ? "muted" : ""}`} />
              <span>Status</span>
            </button>

            {systemPopoverOpen && (
              <div className="system-popover">
                <div className="popover-header">
                  <span className="popover-title">System</span>
                  <button
                    type="button"
                    className="popover-close"
                    onClick={() => setSystemPopoverOpen(false)}
                    aria-label="Close system popover"
                  >
                    <Icon name="close" size={13} />
                  </button>
                </div>

                <div className="popover-body">
                  <div
                    className="popover-item"
                    onClick={() => {
                      setSystemPopoverOpen(false);
                      onOpenAISettings();
                    }}
                  >
                    <div className="popover-item-text">
                      <span className="item-label">
                        <Icon name="spark" size={13} />
                        AI Model
                      </span>
                      <span className="item-value">
                        {aiConfig.model} · {aiConfig.providerName}
                      </span>
                    </div>
                    <span className="item-arrow">
                      <Icon name="chevron-right" size={13} />
                    </span>
                  </div>

                  <div className="popover-item" onClick={onToggleVoiceMuted}>
                    <div className="popover-item-text">
                      <span className="item-label">
                        <Icon name="waveform" size={13} />
                        Voice Audio
                      </span>
                      <span className="item-sub">Spoken response sound effects</span>
                    </div>
                    <span className={`toggle-pill ${voiceMuted ? "off" : "on"}`}>
                      {voiceMuted ? "Muted" : "On"}
                    </span>
                  </div>

                  <div className="popover-item" onClick={onToggleClapEnabled}>
                    <div className="popover-item-text">
                      <span className="item-label">
                        <Icon name="waveform" size={13} />
                        Double-Clap Wake
                      </span>
                      <span className="item-sub">Clap twice to restore & greet</span>
                    </div>
                    <span className={`toggle-pill ${clapEnabled ? "on" : "off"}`}>
                      {clapEnabled ? "On" : "Off"}
                    </span>
                  </div>

                  <div className="popover-item" onClick={onToggleVoiceCmdEnabled}>
                    <div className="popover-item-text">
                      <span className="item-label">
                        <Icon name="mic" size={13} />
                        Voice Commands
                      </span>
                      <span className="item-sub">Say “Open Copilot”, “Search”, etc.</span>
                    </div>
                    <span className={`toggle-pill ${voiceCmdEnabled ? "on" : "off"}`}>
                      {voiceCmdEnabled ? "On" : "Off"}
                    </span>
                  </div>

                  <div className="popover-item readonly">
                    <div className="popover-item-text">
                      <span className="item-label">
                        <Icon name="git-branch" size={13} />
                        Git Workspace
                      </span>
                      <span className="item-sub">
                        {gitStatus
                          ? `${gitStatus.branch} · ${gitStatus.is_clean ? "clean" : `${gitStatus.modified_count} modified`}`
                          : "status unavailable"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
