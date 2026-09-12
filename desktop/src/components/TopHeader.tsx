import { useState } from "react";
import type { AIConfig } from "../lib/ai";
import type { GitStatusData } from "../types";

export type NavSection = "home" | "knowledge" | "work" | "ai" | "personal" | "system";
export type KnowledgeSubTab = "notes" | "graph" | "tags" | "collections";

interface Props {
  breadcrumb: string[];
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
 * Framer-inspired floating capsule Top-Nav
 * Modeled on https://framer.com/m/Top-Nav-npC8Y8.js
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
        {/* Brand Identity */}
        <div
          className="nav-brand-item"
          onClick={() => onSelectSection?.("home")}
          title="Severus.ai Home"
        >
          <img src="/logo.png" alt="Severus" className="nav-brand-logo" />
          <span className="nav-brand-name">Severus</span>
        </div>

        {/* Primary Navigation Tabs */}
        <nav className="nav-links-cluster">
          <button
            type="button"
            className={`nav-pill-item ${activeSection === "home" ? "active" : ""}`}
            onClick={() => onSelectSection?.("home")}
          >
            <span className="nav-pill-icon">⌂</span>
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
            <span className="nav-pill-icon">🕸️</span>
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
            <span className="nav-pill-icon">📚</span>
            <span>Notes</span>
          </button>

          <button
            type="button"
            className={`nav-pill-item ${copilotActive ? "active" : ""}`}
            onClick={onToggleCopilot}
          >
            <span className="nav-pill-icon">✦</span>
            <span>Copilot</span>
          </button>

          <button
            type="button"
            className="nav-pill-item search-trigger"
            onClick={onOpenQuickSearch}
            title="Search notes, commands, or tags (Ctrl+K)"
          >
            <span className="nav-pill-icon">🔍</span>
            <span className="search-text">Search</span>
            <kbd className="nav-kbd">⌘K</kbd>
          </button>
        </nav>

        {/* Action Controls & Popover Trigger */}
        <div className="nav-actions-cluster">
          <button
            type="button"
            className="nav-action-btn accent"
            onClick={onOpenNewNote}
            title="Create New Note (Ctrl+Alt+N)"
          >
            <span>+</span> Note
          </button>

          <button
            type="button"
            className="nav-action-btn"
            onClick={onOpenGrounding}
            title="Open Context Grounding (Ctrl+J)"
          >
            <span>⚡</span> Grounding
          </button>

          {/* System Telemetry & Audio Settings Popover */}
          <div className="popover-wrapper">
            <button
              type="button"
              className={`nav-action-btn status-btn ${systemPopoverOpen ? "active" : ""}`}
              onClick={() => setSystemPopoverOpen((prev) => !prev)}
              title="System Status & Voice Settings"
            >
              <span className={`status-dot ${voiceMuted ? "muted" : "clean"}`} />
              <span>Status</span>
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
                      {voiceMuted ? "Muted" : "Active"}
                    </span>
                  </div>

                  {/* Double-Clap Detector Toggle */}
                  <div className="popover-item" onClick={onToggleClapEnabled}>
                    <div className="popover-item-text">
                      <span className="item-label">Double-Clap Wake Gesture</span>
                      <span className="item-sub">Clap twice to unminimize & greet</span>
                    </div>
                    <span className={`toggle-pill ${!clapEnabled ? "off" : "on"}`}>
                      {clapEnabled ? "Active" : "Off"}
                    </span>
                  </div>

                  {/* Voice Commands Toggle */}
                  <div className="popover-item" onClick={onToggleVoiceCmdEnabled}>
                    <div className="popover-item-text">
                      <span className="item-label">Hands-Free Voice Commands</span>
                      <span className="item-sub">Say "Open Copilot", "Search", etc.</span>
                    </div>
                    <span className={`toggle-pill ${!voiceCmdEnabled ? "off" : "on"}`}>
                      {voiceCmdEnabled ? "Active" : "Off"}
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
      </div>
    </header>
  );
}
