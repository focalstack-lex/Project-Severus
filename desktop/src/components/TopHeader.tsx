import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
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
  listeningActive?: boolean;
  onToggleListening?: () => void;
  onToggleFloatingMode?: () => void;
  onEnterThinkingMode?: () => void;
  onHideToTray?: () => void;
  onMoveMonitor?: (target: "left" | "right" | "next" | "primary") => void;
  onOpenJournal?: () => void;
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
  listeningActive = true,
  onToggleListening,
  onToggleFloatingMode,
  onEnterThinkingMode,
  onHideToTray,
  onMoveMonitor,
  onOpenJournal,
}: Props) {
  const [systemPopoverOpen, setSystemPopoverOpen] = useState(false);

  const handleStartDrag = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("button, input, select, textarea, a, .system-popover, [data-no-drag]")) {
      return;
    }
    try {
      void getCurrentWindow().startDragging();
    } catch {
      // Not running in Tauri runtime
    }
  };

  const handleDoubleClickHeader = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("button, input, select, textarea, a, .system-popover, [data-no-drag]")) {
      return;
    }
    try {
      void getCurrentWindow().toggleMaximize();
    } catch {
      // Not running in Tauri runtime
    }
  };

  return (
    <header
      className="framer-top-nav-wrapper"
      data-tauri-drag-region
      onMouseDown={handleStartDrag}
      onDoubleClick={handleDoubleClickHeader}
    >
      <div
        className="framer-top-nav-capsule"
        data-tauri-drag-region
        onMouseDown={handleStartDrag}
      >
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

        <span className="nav-divider" />

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
        </nav>

        <span className="nav-divider" />

        {/* Center Search Trigger */}
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

        <span className="nav-divider" />

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

          {onOpenJournal && (
            <button
              type="button"
              className="nav-action-btn"
              onClick={onOpenJournal}
              title={`Capture Daily Journal (${MOD_KEY}+J)`}
            >
              <Icon name="pen" size={13} />
              <span>Journal</span>
            </button>
          )}

          <button
            type="button"
            className="nav-action-btn"
            onClick={onOpenGrounding}
            title={`Assemble agent grounding context (${MOD_KEY}+Shift+G)`}
          >
            <Icon name="layers" size={13} />
            <span>Grounding</span>
          </button>

          <span className="nav-divider" />

          {onToggleListening && (
            <button
              type="button"
              className={`nav-action-btn ${listeningActive ? "" : "paused"}`}
              onClick={onToggleListening}
              title={
                listeningActive
                  ? `Listening Active (Say "Stop listening" / ${MOD_KEY}+Shift+M)`
                  : `Listening Paused (Say "Start listening" / ${MOD_KEY}+Shift+M)`
              }
            >
              <Icon name="mic" size={13} />
              <span>{listeningActive ? "Listening" : "Muted"}</span>
            </button>
          )}

          {onEnterThinkingMode && (
            <button
              type="button"
              className="nav-action-btn"
              onClick={onEnterThinkingMode}
              title="Enter Thinking Mode (live hands-free voice chat with Severus)"
            >
              <Icon name="brain" size={13} />
              <span>Thinking</span>
            </button>
          )}

          <span className="nav-divider" />

          {onToggleFloatingMode && (
            <button
              type="button"
              className="nav-action-btn window-ctrl-btn"
              onClick={onToggleFloatingMode}
              title="Switch to Desktop Floating Companion Pill"
            >
              <Icon name="external" size={12} />
              <span>Float</span>
            </button>
          )}

          {onHideToTray && (
            <button
              type="button"
              className="nav-action-btn window-ctrl-btn"
              onClick={onHideToTray}
              title="Minimize to System Tray (actively listening in background)"
            >
              <Icon name="close" size={12} />
              <span>Tray</span>
            </button>
          )}

          <div className="popover-wrapper">
            <button
              type="button"
              className={`nav-action-btn status-btn ${systemPopoverOpen ? "active" : ""}`}
              onClick={() => setSystemPopoverOpen((prev) => !prev)}
              title="System status and voice settings"
            >
              <span
                className={`status-dot ${!listeningActive ? "paused" : voiceMuted ? "muted" : ""}`}
              />
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

                  {onToggleListening && (
                    <div className="popover-item" onClick={onToggleListening}>
                      <div className="popover-item-text">
                        <span className="item-label">
                          <Icon name="mic" size={13} />
                          Listening Mode
                        </span>
                        <span className="item-sub">Say “Stop listening” / “Start listening”</span>
                      </div>
                      <span className={`toggle-pill ${listeningActive ? "on" : "off"}`}>
                        {listeningActive ? "Active" : "Paused"}
                      </span>
                    </div>
                  )}

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

                  {onHideToTray && (
                    <div
                      className="popover-item"
                      onClick={() => {
                        setSystemPopoverOpen(false);
                        onHideToTray();
                      }}
                    >
                      <div className="popover-item-text">
                        <span className="item-label">
                          <Icon name="close" size={13} />
                          Exit to System Tray
                        </span>
                        <span className="item-sub">Stays actively listening in background</span>
                      </div>
                    </div>
                  )}

                  {onMoveMonitor && (
                    <div
                      className="popover-item"
                      onClick={() => {
                        setSystemPopoverOpen(false);
                        onMoveMonitor("next");
                      }}
                      title="Switch window to next connected display monitor"
                    >
                      <div className="popover-item-text">
                        <span className="item-label">
                          <Icon name="external" size={13} />
                          Switch Monitor
                        </span>
                        <span className="item-sub">Cycle to next display</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
