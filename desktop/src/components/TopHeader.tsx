import { useState } from "react";
import type { AIConfig } from "../lib/ai";
import type { GitStatusData } from "../types";

interface Props {
  breadcrumb: string[];
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

export default function TopHeader({
  breadcrumb,
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
    <header className="top-header">
      {/* Left Breadcrumb Location */}
      <div className="header-left">
        <div className="location-breadcrumb">
          {breadcrumb.map((crumb, idx) => (
            <span key={crumb} className="crumb-wrap">
              {idx > 0 && <span className="crumb-separator">/</span>}
              <span className={`crumb-text ${idx === breadcrumb.length - 1 ? "current" : ""}`}>
                {crumb}
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* Center Global Search Trigger */}
      <div className="header-center">
        <button
          type="button"
          className="global-search-btn"
          onClick={onOpenQuickSearch}
          title="Search notes, commands, or tags (Ctrl+K)"
        >
          <span className="search-icon">🔍</span>
          <span className="search-placeholder">Search notes, commands, tags...</span>
          <kbd className="search-shortcut">⌘K</kbd>
        </button>
      </div>

      {/* Right Controls */}
      <div className="header-right">
        <button
          type="button"
          className="header-btn"
          onClick={onOpenGrounding}
          title="Open Grounding Assembler (Ctrl+J)"
        >
          ⚡ Grounding
        </button>

        <button
          type="button"
          className="header-btn"
          onClick={onOpenNewNote}
          title="Create New Note (Ctrl+Alt+N)"
        >
          + Note
        </button>

        <button
          type="button"
          className={`header-btn ${copilotActive ? "active" : ""}`}
          onClick={onToggleCopilot}
          title="Toggle AI Copilot Drawer (Ctrl+Shift+A)"
        >
          ✦ Copilot
        </button>

        {/* System Settings & Telemetry Popover Menu */}
        <div className="popover-wrapper">
          <button
            type="button"
            className="header-btn icon-btn"
            onClick={() => setSystemPopoverOpen((prev) => !prev)}
            title="System & Voice Settings"
          >
            ⚙ Status
          </button>

          {systemPopoverOpen && (
            <div className="system-popover">
              <div className="popover-header">
                <span className="popover-title">System & Audio Controls</span>
                <button
                  type="button"
                  className="popover-close"
                  onClick={() => setSystemPopoverOpen(false)}
                >
                  ✕
                </button>
              </div>

              <div className="popover-body">
                {/* AI Model Item */}
                <div className="popover-item" onClick={onOpenAISettings}>
                  <div className="popover-item-text">
                    <span className="item-label">AI Model Provider</span>
                    <span className="item-value">{aiConfig.model}</span>
                  </div>
                  <span className="item-arrow">→</span>
                </div>

                {/* Voice Output Toggle */}
                <div className="popover-item" onClick={onToggleVoiceMuted}>
                  <div className="popover-item-text">
                    <span className="item-label">Voice Audio Output</span>
                    <span className="item-sub">Audio response sound effects</span>
                  </div>
                  <span className={`toggle-pill ${voiceMuted ? "off" : "on"}`}>
                    {voiceMuted ? "MUTED" : "ACTIVE"}
                  </span>
                </div>

                {/* Double-Clap Detector Toggle */}
                <div className="popover-item" onClick={onToggleClapEnabled}>
                  <div className="popover-item-text">
                    <span className="item-label">Double-Clap Wake Gesture</span>
                    <span className="item-sub">Clap twice to unminimize & greet</span>
                  </div>
                  <span className={`toggle-pill ${!clapEnabled ? "off" : "on"}`}>
                    {clapEnabled ? "ACTIVE" : "OFF"}
                  </span>
                </div>

                {/* Voice Commands Toggle */}
                <div className="popover-item" onClick={onToggleVoiceCmdEnabled}>
                  <div className="popover-item-text">
                    <span className="item-label">Hands-Free Voice Commands</span>
                    <span className="item-sub">Say "Open Copilot", "Search", etc.</span>
                  </div>
                  <span className={`toggle-pill ${!voiceCmdEnabled ? "off" : "on"}`}>
                    {voiceCmdEnabled ? "ACTIVE" : "OFF"}
                  </span>
                </div>

                {/* Git Status */}
                <div className="popover-item readonly">
                  <div className="popover-item-text">
                    <span className="item-label">Git Workspace</span>
                    <span className="item-sub">
                      Branch: {gitStatus ? gitStatus.branch : "main"} (
                      {gitStatus?.is_clean ? "clean" : `${gitStatus?.modified_count} modified`})
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
