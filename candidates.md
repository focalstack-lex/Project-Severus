# Severus Pattern Candidates Buffer (T1 Store)

This file holds observed pattern candidates extracted during development sessions across all connected IDEs and workspaces (Google Antigravity IDE, ZCode, VS Code, Severus Core).
Patterns require **3+ recurrences** across multiple sessions before promotion to T2 Universal Directives or T3 Second Brain Nodes.

## Candidate Tracking Table

| ID | Category | Candidate Pattern | Recurrence | Source Origin | Status | Target Path |
|---|---|---|---|---|---|---|
| P-001 | Formatting | Strict Zero-Emoji Directive in UI/UX and Code | 3/3 | Antigravity IDE / ZCode | Promoted (T2) | `AGENTS.md` |
| P-002 | Security | Security-First Deployment Gate Pre-Release Gate | 3/3 | Release Workflows | Promoted (T2/T3) | `.agents/rules/security-deployment-gate.md` |
| P-003 | Workflow | Mandatory Universal Session Journaling | 3/3 | All Editors / IDEs | Promoted (T2/T3) | `journal/YYYY-MM-DD.md` |
| P-004 | Meta-Learning | Self-Learning & Directive Assimilation Protocol | 3/3 | Severus Protocol | Promoted (T2/T3) | `severus_self_learning_protocol.md` |
| P-005 | Architecture | Central Hub Node Celestial Orbital Ring Styling | 3/3 | Antigravity IDE | Promoted (T2/T3) | `GraphView.tsx` |
| P-006 | UI/UX | Minimalist Floating Glass Capsule Dock for Tags | 3/3 | Antigravity IDE | Promoted (T2/T3) | `styles.css` |
| P-007 | Window Shell | Borderless Dynamic Island Frameless Transparency Shell | 1/3 | Tauri / Antigravity | Active (T1) | `tauri.conf.json` |
| P-008 | Remediation | Universal Bug & Error Remediation Assimilation Protocol | 3/3 | Workspace / User | Promoted (T2/T3) | `.agents/rules/error_prevention_protocol.md` |
| P-009 | Verification | Behavioural Verification Harness (`severus verify`) | 3/3 | Phase 1 Hardening | Promoted (T2) | `tools/severus.ps1` |
| P-010 | Checkpoint | Pre-Build Checkpoint & Rollback (`severus rollback`) | 3/3 | Phase 1 Hardening | Promoted (T2) | `tools/severus.ps1` |
| P-011 | Linter | Directive Linter & Contradiction Gate (`severus lint:directives`) | 3/3 | Phase 1 Hardening | Promoted (T2) | `tools/lint_directives.py` |
| P-012 | Storage | Single Canonical Binary Target via Windows Directory Junctions | 3/3 | Phase 1 Hardening | Promoted (T2) | `tools/setup_junctions.ps1` |

---

## Active Candidates (Details)

### [P-007] Borderless Dynamic Island Frameless Transparency Shell
- **Pattern**: Floating capsule HUD must set `minWidth: 0`, `minHeight: 0`, and `shadow: false` in `tauri.conf.json` to avoid DWM rectangular bounding boxes around curved UI shells.
- **Source Context**: `desktop/src-tauri/tauri.conf.json`
- **Evidence**: Fixed rectangular white background artifact in floating island capsule mode.
- **Recurrence Count**: 1 / 3
- **First Observed**: 2026-09-17 06:24

---

## Promotion History

| Date | ID | Pattern / Directive | Tier | Source Origin | Target File | Action |
|---|---|---|---|---|---|---|
| 2026-09-17 | P-012 | Canonical Binary Target via Windows Directory Junctions | T2 | System Architecture | `tools/setup_junctions.ps1` | Promoted to System Target Collapser Rule |
| 2026-09-17 | P-011 | Directive Linter & Contradiction Detection | T2 | System Architecture | `tools/lint_directives.py` | Promoted to Directive Integrity Gate |
| 2026-09-17 | P-010 | Pre-Build Checkpoint & Rollback Dispatcher | T2 | System Architecture | `tools/severus.ps1` | Promoted to Pre-Release Checkpoint Directive |
| 2026-09-17 | P-009 | Behavioural Verification Harness (`severus verify`) | T2 | System Architecture | `tools/severus.ps1` | Promoted to Mandatory Verification Gate |
| 2026-09-17 | P-008 | Universal Bug & Error Remediation Assimilation Protocol | T2 / T3 | Workspace Core | `.agents/rules/error_prevention_protocol.md` | Promoted to Universal Directive & Second Brain Node |
| 2026-09-17 | P-006 | Minimalist Floating Glass Capsule Dock for Tags | T2 / T3 | Antigravity IDE | `styles.css` | Promoted to Design System Rule & Second Brain Node |
| 2026-09-17 | P-005 | Central Hub Node Celestial Saturn Orbital Ring Styling | T2 / T3 | Antigravity IDE | `GraphView.tsx` | Promoted to Visual Architecture Pattern & Second Brain Node |
| 2026-09-17 | P-004 | Self-Learning & Directive Assimilation Protocol | T2 / T3 | Antigravity IDE | `severus_self_learning_protocol.md` | Promoted to Universal Rule & Second Brain Node |
| 2026-09-17 | P-002 | Security-First Deployment Gate | T2 / T3 | Severus Core | `security-deployment-gate.md` | Promoted to Security Gate Rule & Second Brain Node |
| 2026-09-17 | P-003 | Universal Severus Development Process Directive | T2 / T3 | All IDEs | `severus_development_workflow.md` | Promoted to Universal Directive & Second Brain Node |
| 2026-09-17 | P-001 | Strict Zero-Emoji Directive | T2 | ZCode / AGY | `AGENTS.md` | Promoted to Global Core Directive |
