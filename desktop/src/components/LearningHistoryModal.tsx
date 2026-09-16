import { useEffect, useState } from "react";
import Icon from "./Icon";

export interface CandidateItem {
  id: string;
  category: string;
  pattern: string;
  recurrence: string; // e.g. "3/3" or "2/3"
  source: string; // e.g. "Antigravity IDE", "ZCode"
  status: "active" | "promoted";
  tier: "T1" | "T2" | "T3";
  targetPath: string;
  evidence?: string;
  date?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const SAMPLE_LEARNING_ITEMS: CandidateItem[] = [
  {
    id: "P-004",
    category: "Meta-Learning",
    pattern: "Self-Learning & Directive Assimilation Protocol",
    recurrence: "3/3",
    source: "Severus Core / Antigravity IDE",
    status: "promoted",
    tier: "T2",
    targetPath: "severus_self_learning_protocol.md",
    evidence: "Continuous observation across IDEs promoting candidates after 3+ recurrences.",
    date: "2026-09-17",
  },
  {
    id: "P-002",
    category: "Security",
    pattern: "Security-First Deployment Gate Pre-Release Gate",
    recurrence: "3/3",
    source: "Release Workflows",
    status: "promoted",
    tier: "T2",
    targetPath: ".agents/rules/security-deployment-gate.md",
    evidence: "Refuse deploy/release until secrets, npm audit, CORS, AuthZ pass clean.",
    date: "2026-09-17",
  },
  {
    id: "P-003",
    category: "Workflow",
    pattern: "Mandatory Universal Session Journaling",
    recurrence: "3/3",
    source: "All IDEs & Editors",
    status: "promoted",
    tier: "T2",
    targetPath: "journal/YYYY-MM-DD.md",
    evidence: "Log session events, verification results, and architectural decisions automatically.",
    date: "2026-09-17",
  },
  {
    id: "P-001",
    category: "Formatting",
    pattern: "Strict Zero-Emoji Directive in UI/UX and Code",
    recurrence: "3/3",
    source: "ZCode / Antigravity IDE",
    status: "promoted",
    tier: "T2",
    targetPath: "AGENTS.md",
    evidence: "Use clean SVG vector icons and tracked typography instead of emojis.",
    date: "2026-09-17",
  },
  {
    id: "P-005",
    category: "Architecture",
    pattern: "Central Hub Node Celestial Saturn Orbital Ring Styling",
    recurrence: "2/3",
    source: "Antigravity IDE",
    status: "active",
    tier: "T1",
    targetPath: "desktop/src/components/GraphView.tsx",
    evidence: "The Glorious Evolution central node styled with specular core & orbital wireframe rings.",
    date: "2026-09-17",
  },
  {
    id: "P-006",
    category: "UI/UX",
    pattern: "Minimalist Floating Glass Capsule Dock for Tags",
    recurrence: "2/3",
    source: "Antigravity IDE",
    status: "active",
    tier: "T1",
    targetPath: "desktop/src/styles.css",
    evidence: "Tag filter bar wraps into multi-line glass dock without horizontal cut-off.",
    date: "2026-09-17",
  },
];

export default function LearningHistoryModal({ isOpen, onClose }: Props) {
  const [filterTab, setFilterTab] = useState<"all" | "active" | "promoted">("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredItems = SAMPLE_LEARNING_ITEMS.filter((item) => {
    if (filterTab === "active" && item.status !== "active") return false;
    if (filterTab === "promoted" && item.status !== "promoted") return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        item.pattern.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.source.toLowerCase().includes(q) ||
        item.targetPath.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card learning-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-row">
            <span className="learning-title-icon">
              <Icon name="spark" size={16} />
            </span>
            <div>
              <h2>Severus Learning History & Directive Audit</h2>
              <p className="modal-subtitle">
                Observations, T1 candidate patterns, and promoted universal directives across all connected IDEs
              </p>
            </div>
          </div>
          <button type="button" className="close-btn" onClick={onClose} title="Close (Esc)">
            <Icon name="close" size={14} />
          </button>
        </div>

        <div className="learning-toolbar">
          <div className="learning-tabs">
            <button
              type="button"
              className={`learning-tab ${filterTab === "all" ? "active" : ""}`}
              onClick={() => setFilterTab("all")}
            >
              All Patterns ({SAMPLE_LEARNING_ITEMS.length})
            </button>
            <button
              type="button"
              className={`learning-tab ${filterTab === "active" ? "active" : ""}`}
              onClick={() => setFilterTab("active")}
            >
              Active Candidates T1 ({SAMPLE_LEARNING_ITEMS.filter((i) => i.status === "active").length})
            </button>
            <button
              type="button"
              className={`learning-tab ${filterTab === "promoted" ? "active" : ""}`}
              onClick={() => setFilterTab("promoted")}
            >
              Promoted Directives T2/T3 ({SAMPLE_LEARNING_ITEMS.filter((i) => i.status === "promoted").length})
            </button>
          </div>

          <div className="learning-search-box">
            <Icon name="search" size={12} />
            <input
              type="text"
              placeholder="Filter by pattern, IDE, or file..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="learning-list-container">
          {filteredItems.map((item) => (
            <div key={item.id} className={`learning-item-card ${item.status}`}>
              <div className="learning-item-header">
                <div className="learning-item-title-group">
                  <span className="learning-id">{item.id}</span>
                  <span className="learning-pattern-name">{item.pattern}</span>
                </div>
                <div className="learning-badges">
                  <span className={`badge-tier badge-${item.tier.toLowerCase()}`}>
                    {item.tier} {item.status === "promoted" ? "Directive" : `Candidate [${item.recurrence}]`}
                  </span>
                  <span className="badge-category">{item.category}</span>
                </div>
              </div>

              <div className="learning-item-body">
                {item.evidence && <div className="learning-evidence">{item.evidence}</div>}
                <div className="learning-meta-row">
                  <span className="learning-meta-item">
                    <Icon name="monitor" size={11} />
                    Source: {item.source}
                  </span>
                  <span className="learning-meta-item">
                    <Icon name="file" size={11} />
                    Target: {item.targetPath}
                  </span>
                  {item.date && (
                    <span className="learning-meta-item">
                      <Icon name="clock" size={11} />
                      {item.date}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}

          {filteredItems.length === 0 && (
            <div className="learning-empty-state">
              <span>No patterns match the selected filters.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
