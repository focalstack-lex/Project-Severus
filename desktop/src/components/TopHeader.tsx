import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Icon from "./Icon";
import type { AIConfig } from "../lib/ai";
import type { GitStatusData } from "../types";
import { toggleMaximize } from "../lib/tauri";
import { loadCachedStravaStats, type StravaAthleteStats } from "../lib/strava";

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
  onToggleMaximize?: () => void;
  isMaximized?: boolean;
  onEnterThinkingMode?: () => void;
  onOpenRunningMode?: () => void;
  mailConnected?: boolean;
  mailUnread?: number | null;
  hubSummary?: string | null;
  onOpenInbox?: () => void;
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
  onToggleMaximize,
  isMaximized,
  onEnterThinkingMode,
  onOpenRunningMode,
  mailConnected = false,
  mailUnread = null,
  hubSummary = null,
  onOpenInbox,
  onHideToTray,
  onMoveMonitor,
  onOpenJournal,
}: Props) {
  const [systemPopoverOpen, setSystemPopoverOpen] = useState(false);
  const [stravaStats, setStravaStats] = useState<StravaAthleteStats | null>(loadCachedStravaStats);

  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const custom = e as CustomEvent<StravaAthleteStats>;
      if (custom.detail) setStravaStats(custom.detail);
    };
    window.addEventListener("severus:strava-stats-updated", handleUpdate);
    return () => window.removeEventListener("severus:strava-stats-updated", handleUpdate);
  }, []);

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
    if (onToggleMaximize) {
      onToggleMaximize();
    } else {
      void toggleMaximize();
    }
  };

  return (
    <header
      className="framer-top-nav-wrapper"
      data-tauri-drag-region
      onMouseDown={handleStartDrag}
      onDoubleClick={handleDoubleClickHeader}
    >
      {/* ISLAND 1: Primary Workspace, Views & Capture */}
      <div
        className="framer-top-island framer-island-primary"
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

        {/* Segmented Primary views */}
        <nav className="nav-segmented-deck" aria-label="Workspace views">
          <button
            type="button"
            className={`nav-segmented-item ${activeSection === "home" ? "active" : ""}`}
            onClick={() => onSelectSection?.("home")}
          >
            <Icon name="home" size={13} />
            <span>Home</span>
          </button>

          <button
            type="button"
            className={`nav-segmented-item ${activeSection === "knowledge" && knowledgeSubTab === "graph" ? "active" : ""}`}
            onClick={() => {
              onSelectSection?.("knowledge");
              onSelectKnowledgeSubTab?.("graph");
            }}
          >
            <Icon name="graph" size={13} />
            <span>Graph</span>
          </button>

          <button
            type="button"
            className={`nav-segmented-item ${activeSection === "knowledge" && knowledgeSubTab === "notes" ? "active" : ""}`}
            onClick={() => {
              onSelectSection?.("knowledge");
              onSelectKnowledgeSubTab?.("notes");
              onToggleNotesDrawer?.();
            }}
          >
            <Icon name="book" size={13} />
            <span>Notes</span>
          </button>

          <button
            type="button"
            className={`nav-segmented-item ${copilotActive ? "active" : ""}`}
            onClick={onToggleCopilot}
          >
            <Icon name="spark" size={13} />
            <span>Copilot</span>
          </button>
        </nav>

        <span className="nav-divider" />

        {/* Omnibar Search Trigger */}
        <button
          type="button"
          className="nav-omnibar-trigger"
          onClick={onOpenQuickSearch}
          title={`Search notes and commands (${MOD_KEY}+K)`}
        >
          <Icon name="search" size={13} />
          <span className="search-text">Search vault…</span>
          <kbd className="nav-kbd">{MOD_KEY}K</kbd>
        </button>

        <span className="nav-divider" />

        {/* Quick Actions / Capture */}
        <div className="nav-capture-cluster">
          <button
            type="button"
            className="nav-action-btn accent"
            onClick={onOpenNewNote}
            title={`Create New Note (${MOD_KEY}+Alt+N)`}
          >
            <Icon name="plus" size={12} />
            <span>Note</span>
          </button>

          {onOpenJournal && (
            <button
              type="button"
              className="nav-icon-action-btn"
              onClick={onOpenJournal}
              title={`Capture Daily Journal (${MOD_KEY}+J)`}
            >
              <Icon name="pen" size={13} />
            </button>
          )}

          <button
            type="button"
            className="nav-icon-action-btn"
            onClick={onOpenGrounding}
            title={`Assemble agent grounding context (${MOD_KEY}+Shift+G)`}
          >
            <Icon name="layers" size={13} />
          </button>
        </div>
      </div>

      {/* ISLAND 2: Intelligence Pod, System Status & Window Controls */}
      <div
        className="framer-top-island framer-island-system"
        data-tauri-drag-region
        onMouseDown={handleStartDrag}
      >
        {/* Assistant Acoustic & Thinking Pod */}
        <div className="assistant-pod">
          {onToggleListening && (
            <button
              type="button"
              className={`assistant-listening-btn ${listeningActive ? "active" : "paused"}`}
              onClick={onToggleListening}
              title={
                listeningActive
                  ? `Listening Active (Say "Stop listening" / ${MOD_KEY}+Shift+M)`
                  : `Listening Paused (Say "Start listening" / ${MOD_KEY}+Shift+M)`
              }
            >
              <Icon name={listeningActive ? "mic" : "mic-off"} size={12} />
              <span className="listening-label">{listeningActive ? "Listening" : "Muted"}</span>
            </button>
          )}

          {onEnterThinkingMode && (
            <button
              type="button"
              className="assistant-thinking-btn"
              onClick={onEnterThinkingMode}
              title="Enter Thinking Mode (live hands-free voice chat with Severus)"
            >
              <Icon name="brain" size={13} />
              <span>Thinking</span>
            </button>
          )}

          {onOpenRunningMode && (
            <button
              type="button"
              className="assistant-running-btn"
              onClick={onOpenRunningMode}
              title="Open Running Mode (Athletic Telemetry & Training Cockpit)"
            >
              <Icon name="activity" size={13} />
              <span>Running</span>
            </button>
          )}

          {onOpenInbox && mailConnected && (
            <button
              type="button"
              className="assistant-mail-btn"
              onClick={onOpenInbox}
              title="School Hub — mail and Classroom updates"
            >
              <Icon name="school" size={13} />
              <span>Hub</span>
              {typeof mailUnread === "number" && mailUnread > 0 && (
                <span className="mail-badge">{mailUnread > 9 ? "9+" : mailUnread}</span>
              )}
            </button>
          )}
        </div>

        <span className="nav-divider" />

        {/* System Status & Popover */}
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
            <Icon name="chevron-down" size={10} />
          </button>

          <AnimatePresence>
            {systemPopoverOpen && (
              <motion.div
                className="system-popover"
                initial={{ opacity: 0, scale: 0.96, y: -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -6 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              >
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

                  <div
                    className="popover-item"
                    onClick={() => {
                      setSystemPopoverOpen(false);
                      onOpenAISettings();
                    }}
                  >
                    <div className="popover-item-text">
                      <span className="item-label">
                        <Icon name="activity" size={13} />
                        Strava Running Telemetry
                      </span>
                      <span className="item-value">
                        {stravaStats
                          ? `${stravaStats.weeklyMileageKm.toFixed(1)} km this week (${stravaStats.weeklyRunCount} runs)`
                          : "Connect Strava Telemetry"}
                      </span>
                    </div>
                    <span className="item-arrow">
                      <Icon name="chevron-right" size={13} />
                    </span>
                  </div>

                  <div
                    className="popover-item"
                    onClick={() => {
                      setSystemPopoverOpen(false);
                      onOpenInbox?.();
                    }}
                  >
                    <div className="popover-item-text">
                      <span className="item-label">
                        <Icon name="school" size={13} />
                        School Hub
                      </span>
                      <span className="item-value">
                        {mailConnected
                          ? hubSummary ?? (typeof mailUnread === "number" && mailUnread > 0 ? `${mailUnread} unread from school` : "All caught up, Sir")
                          : "Connect Gmail in Settings"}
                      </span>
                    </div>
                    <span className="item-arrow">
                      <Icon name="chevron-right" size={13} />
                    </span>
                  </div>

                  <div className="popover-item" onClick={onToggleVoiceMuted}>
                    <div className="popover-item-text">
                      <span className="item-label">
                        <Icon name="activity" size={13} />
                        Neural Voice
                      </span>
                      <span className="item-sub">ElevenLabs TTS</span>
                    </div>
                    <span className={`toggle-pill ${voiceMuted ? "off" : "on"}`}>
                      {voiceMuted ? "Muted" : "Active"}
                    </span>
                  </div>

                  <div className="popover-item" onClick={onToggleClapEnabled}>
                    <div className="popover-item-text">
                      <span className="item-label">
                        <Icon name="waveform" size={13} />
                        Clap Detection
                      </span>
                      <span className="item-sub">Double-clap to restore</span>
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
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <span className="nav-divider" />

        {/* Window Controls: Icon Flank */}
        <div className="nav-window-controls">
          {onToggleFloatingMode && (
            <button
              type="button"
              className="nav-icon-window-btn"
              onClick={onToggleFloatingMode}
              title="Minimize to Dynamic Island Pill"
            >
              <Icon name="minimize" size={12} />
            </button>
          )}

          {onToggleMaximize && (
            <button
              type="button"
              className="nav-icon-window-btn"
              onClick={onToggleMaximize}
              title={isMaximized ? "Restore window size" : "Maximize to full screen"}
            >
              <Icon name={isMaximized ? "minimize" : "maximize"} size={12} />
            </button>
          )}

          {onHideToTray && (
            <button
              type="button"
              className="nav-icon-window-btn close-tray-btn"
              onClick={onHideToTray}
              title="Minimize to System Tray (actively listening in background)"
            >
              <Icon name="close" size={12} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
