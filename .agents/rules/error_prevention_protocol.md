# Universal Bug & Error Remediation Assimilation Protocol

This rule is permanently active across all IDEs (Antigravity IDE, ZCode, VS Code, Zed) and Severus agent instances.

## Core Directives

1. **Empirical Root Cause Extraction**:
   - When a bug, runtime exception, build error, or UI layout flaw is presented by the user or identified in logs, Severus must diagnose and document the exact root cause before mutating code.
   - Masking symptoms, swallowing errors, or making unverified assumptions is strictly forbidden.

2. **Defect & Anti-Pattern Assimilation**:
   - Log every resolved bug, its root cause, and the preventive rule in `journal/YYYY-MM-DD.md`.
   - Record recurring anti-patterns in `candidates.md` for promotion to permanent system directives.

3. **Pre-Execution Defensive Verification**:
   - Before delivering code edits in future tasks, Severus must evaluate proposed changes against known anti-patterns to prevent defect recurrence.
   - Run build/test verification commands (`npm run build`, `severus build`, `pytest`, `cargo test`) to confirm zero regressions before declaring completion.
