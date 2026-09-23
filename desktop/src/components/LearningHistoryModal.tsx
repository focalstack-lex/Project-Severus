import { useEffect, useState } from "react";
import Icon from "./Icon";
import { listNotes } from "../lib/tauri";

export interface CandidateItem {
  id: string;
  category: string;
  pattern: string;
  recurrence: string; // e.g. "3/3", "2/3", or "T3 Node"
  source: string; // e.g. "Antigravity IDE", "Second Brain Graph"
  status: "active" | "promoted" | "node";
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
    id: "P-014",
    category: "Voice Engine",
    pattern: "Zero-Shot Neural Voice & Pitch Synthesis Directive",
    recurrence: "3/3",
    source: "Severus Core / Antigravity",
    status: "promoted",
    tier: "T2",
    targetPath: "tools/cosyvoice_severus_server.py",
    evidence: "Microsoft Neural Voice engine (edge-tts) integration with custom pitch matching for JARVIS, Alfred, and Severus voice clones.",
    date: "2026-09-23",
  },
  {
    id: "P-013",
    category: "Release Build",
    pattern: "Universal Automatic System Build & Installer Synchronization Directive",
    recurrence: "3/3",
    source: "Severus Protocol",
    status: "promoted",
    tier: "T2",
    targetPath: "AGENTS.md",
    evidence: "Mandatory automatic compilation of release binary and installer packages (MSI/NSIS) upon system updates without requiring user prompting.",
    date: "2026-09-23",
  },
  {
    id: "P-012",
    category: "Storage",
    pattern: "Single Canonical Binary Target via Windows Directory Junctions",
    recurrence: "3/3",
    source: "Phase 1 Hardening",
    status: "promoted",
    tier: "T2",
    targetPath: "tools/setup_junctions.ps1",
    evidence: "Directory Junctions link Program Files and AppData/Local to target/release binary.",
    date: "2026-09-17",
  },
  {
    id: "P-011",
    category: "Linter",
    pattern: "Directive Linter & Contradiction Gate",
    recurrence: "3/3",
    source: "Phase 1 Hardening",
    status: "promoted",
    tier: "T2",
    targetPath: "tools/lint_directives.py",
    evidence: "Automated verification gate detecting directive conflicts across project markdown files.",
    date: "2026-09-17",
  },
  {
    id: "P-010",
    category: "Checkpoint",
    pattern: "Pre-Build Checkpoint & Rollback Dispatcher",
    recurrence: "3/3",
    source: "Phase 1 Hardening",
    status: "promoted",
    tier: "T2",
    targetPath: "tools/severus.ps1",
    evidence: "Automated git tag checkpoints and one-step binary rollback dispatcher.",
    date: "2026-09-17",
  },
  {
    id: "P-009",
    category: "Verification",
    pattern: "Behavioural Verification Harness",
    recurrence: "3/3",
    source: "Phase 1 Hardening",
    status: "promoted",
    tier: "T2",
    targetPath: "tools/severus.ps1",
    evidence: "End-to-end telemetry and verification runner for system capabilities.",
    date: "2026-09-17",
  },
  {
    id: "N-001",
    category: "Graph Node",
    pattern: "Self-Learning Protocol (Second Brain Node)",
    recurrence: "T3 Node",
    source: "Second Brain Graph",
    status: "node",
    tier: "T3",
    targetPath: "second-brain/notes/Self-Learning Protocol.md",
    evidence: "Autonomous observation & candidate pattern extraction pipeline note linked to The Glorious Evolution.",
    date: "2026-09-17",
  },
  {
    id: "N-002",
    category: "Graph Node",
    pattern: "Security-First Deployment Gate (Second Brain Node)",
    recurrence: "T3 Node",
    source: "Second Brain Graph",
    status: "node",
    tier: "T3",
    targetPath: "second-brain/notes/Security-First Deployment Gate.md",
    evidence: "Pre-release security gate specification note linked to Glorious Evolution & Zero Hallucination.",
    date: "2026-09-17",
  },
  {
    id: "N-003",
    category: "Graph Node",
    pattern: "Severus Development Process (Second Brain Node)",
    recurrence: "T3 Node",
    source: "Second Brain Graph",
    status: "node",
    tier: "T3",
    targetPath: "second-brain/notes/Severus Development Process.md",
    evidence: "Universal multi-editor workflow directive note linked to Glorious Evolution & Session Journaling.",
    date: "2026-09-17",
  },
  {
    id: "N-004",
    category: "Graph Node",
    pattern: "Slash Command Secure (Second Brain Node)",
    recurrence: "T3 Node",
    source: "Second Brain Graph",
    status: "node",
    tier: "T3",
    targetPath: "second-brain/notes/Slash Command Secure.md",
    evidence: "Provisioned /secure slash command skill documentation node.",
    date: "2026-09-17",
  },
  {
    id: "N-007",
    category: "Academic",
    pattern: "DSP Discrete Transforms (Second Brain Node)",
    recurrence: "T3 Node",
    source: "Second Brain Graph",
    status: "node",
    tier: "T3",
    targetPath: "second-brain/notes/DSP Discrete Transforms.md",
    evidence: "Closed overdue 2026-09-14 DSP milestone: DFT/DCT/FFT mathematical foundations & spaced-repetition review cards.",
    date: "2026-09-17",
  },
  {
    id: "N-006",
    category: "Graph Node",
    pattern: "Error Prevention Protocol (Second Brain Node)",
    recurrence: "T3 Node",
    source: "Second Brain Graph",
    status: "node",
    tier: "T3",
    targetPath: "second-brain/notes/Error Prevention Protocol.md",
    evidence: "System-wide defect assimilation & empirical root cause prevention note linked to Glorious Evolution.",
    date: "2026-09-17",
  },
  {
    id: "P-008",
    category: "Remediation",
    pattern: "Universal Bug & Error Remediation Assimilation Protocol",
    recurrence: "3/3",
    source: "Workspace / User",
    status: "promoted",
    tier: "T2",
    targetPath: ".agents/rules/error_prevention_protocol.md",
    evidence: "Empirical root cause extraction, journal logging, and defensive pre-execution verification against defect recurrence.",
    date: "2026-09-17",
  },
  {
    id: "N-005",
    category: "Graph Node",
    pattern: "Impeccable Design Skills (Second Brain Node)",
    recurrence: "T3 Node",
    source: "Second Brain Graph",
    status: "node",
    tier: "T3",
    targetPath: "second-brain/notes/impeccable_design_skills.md",
    evidence: "Frontend UI/UX design intelligence & token architecture skill note.",
    date: "2026-09-17",
  },
  {
    id: "P-005",
    category: "Architecture",
    pattern: "Central Hub Node Celestial Saturn Orbital Ring Styling",
    recurrence: "3/3",
    source: "Antigravity IDE",
    status: "promoted",
    tier: "T2",
    targetPath: "desktop/src/components/GraphView.tsx",
    evidence: "The Glorious Evolution central node styled with specular core & orbital wireframe rings.",
    date: "2026-09-17",
  },
  {
    id: "P-006",
    category: "UI/UX",
    pattern: "Minimalist Floating Glass Capsule Dock for Tags",
    recurrence: "3/3",
    source: "Antigravity IDE",
    status: "promoted",
    tier: "T2",
    targetPath: "desktop/src/styles.css",
    evidence: "Tag filter bar wraps into multi-line glass dock without horizontal cut-off.",
    date: "2026-09-17",
  },
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
    id: "P-007",
    category: "Window Shell",
    pattern: "Borderless Dynamic Island Frameless Transparency Shell",
    recurrence: "1/3",
    source: "Tauri / Antigravity",
    status: "active",
    tier: "T1",
    targetPath: "desktop/src-tauri/tauri.conf.json",
    evidence: "Fixed rectangular DWM border by setting min dimensions 0 & shadow false.",
    date: "2026-09-17",
  },
];

export function isCandidateEligibleForPromotion(item: CandidateItem): boolean {
  if (item.tier === "T3" || item.status === "node" || item.status === "promoted") return false;
  return item.recurrence === "3/3";
}

export function filterLearningItems(
  items: CandidateItem[],
  filterTab: "all" | "t1" | "t2" | "t3" | "node" | "active" | "promoted",
  searchQuery = ""
): CandidateItem[] {
  return items.filter((item) => {
    if (filterTab === "t1" && item.tier !== "T1") return false;
    if (filterTab === "t2" && item.tier !== "T2") return false;
    if (filterTab === "t3" && item.tier !== "T3") return false;
    if (filterTab === "node" && item.status !== "node") return false;
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
}

export default function LearningHistoryModal({ isOpen, onClose }: Props) {
  const [filterTab, setFilterTab] = useState<"all" | "t1" | "t2" | "t3" | "node">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [items, setItems] = useState<CandidateItem[]>(SAMPLE_LEARNING_ITEMS);

  useEffect(() => {
    if (!isOpen) return;
    listNotes()
      .then((notes) => {
        if (!notes || !Array.isArray(notes)) return;
        const todayStr = new Date().toISOString().split("T")[0];
        const dynamicNodes: CandidateItem[] = notes.map((n, idx) => ({
          id: `N-${String(idx + 1).padStart(3, "0")}`,
          category: "Graph Node",
          pattern: `${n.title} (Second Brain Node)`,
          recurrence: "T3 Node",
          source: "Second Brain Graph",
          status: "node",
          tier: "T3",
          targetPath: `second-brain/notes/${n.id}.md`,
          evidence: `Indexed Second Brain node tagged with ${n.tags?.slice(0, 3).join(", ") || "knowledge"}.`,
          date: todayStr,
        }));

        setItems((prev) => {
          const nonNodes = prev.filter((i) => i.status !== "node");
          const existingTargets = new Set(nonNodes.map((i) => i.targetPath));
          const newNodes = dynamicNodes.filter((dn) => !existingTargets.has(dn.targetPath));
          return [...nonNodes, ...newNodes];
        });
      })
      .catch((err) => console.warn("[LearningHistory] Dynamic note fetch notice:", err));
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredItems = filterLearningItems(items, filterTab, searchQuery);

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
                Observations, T1 candidate patterns, promoted directives, and newly indexed Second Brain nodes
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
              All ({items.length})
            </button>
            <button
              type="button"
              className={`learning-tab ${filterTab === "t1" ? "active" : ""}`}
              onClick={() => setFilterTab("t1")}
            >
              T1 Buffer ({items.filter((i) => i.tier === "T1").length})
            </button>
            <button
              type="button"
              className={`learning-tab ${filterTab === "t2" ? "active" : ""}`}
              onClick={() => setFilterTab("t2")}
            >
              T2 Directives ({items.filter((i) => i.tier === "T2").length})
            </button>
            <button
              type="button"
              className={`learning-tab ${filterTab === "t3" ? "active" : ""}`}
              onClick={() => setFilterTab("t3")}
            >
              T3 Pillar Notes ({items.filter((i) => i.tier === "T3").length})
            </button>
            <button
              type="button"
              className={`learning-tab ${filterTab === "node" ? "active" : ""}`}
              onClick={() => setFilterTab("node")}
            >
              Recent Nodes ({items.filter((i) => i.status === "node").length})
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
                    {item.tier}{" "}
                    {item.status === "node"
                      ? "Graph Node"
                      : item.status === "promoted"
                        ? "Directive"
                        : `Candidate [${item.recurrence}]`}
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
