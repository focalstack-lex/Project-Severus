# Design: /copyright Universal Legal, IP, Accessibility & E-Commerce Compliance Directive

Date: 2026-09-18
Status: Implemented
Owner: Lex Matondo
Provenance: Universal compliance playbook addressing e-commerce legal risks, IP protection, ADA Title III compliance, data privacy, FTC fair trade guidelines, consumer protection, and anti-spam laws.

## Problem

E-commerce websites and digital storefronts face substantial legal, regulatory, and financial risks if they deploy without rigorous verification of intellectual property, ADA accessibility standards, privacy policies, transparent pricing, and consumer safety disclosures.

## Goal

A universal `/copyright` command that functions seamlessly across Antigravity IDE, ZCode, Cursor, VS Code, Zed, Cline, and terminal environments. It systematically audits the active project across 7 legal and compliance lenses, reports evidence-backed findings, and provides targeted remediation on request.

## Architecture

| Artifact | Role |
|---|---|
| `C:\Users\User\.gemini\config\skills\copyright\SKILL.md` | Primary skill source for Antigravity IDE and Google Antigravity ecosystem. |
| `C:\Users\User\.agents\skills\copyright\SKILL.md` | Primary skill source for generic cross-IDE agents (Cursor, Zed, VS Code, Cline). |
| `C:\Users\User\.agents\commands\copyright.md` | Client-level slash command entry for ZCode and command palettes. |
| `C:\Users\User\Documents\Severus\AGENTS.md` | Severus-core canonical directive binding `/copyright`. |
| `C:\Users\User\.gemini\config\AGENTS.md` & `GEMINI.md` | Global Antigravity instructions and setup recommendations. |
| `C:\Users\User\.zcode\AGENTS.md` | ZCode global session instructions. |
| `reports/copyright/YYYY-MM-DD-HHMM.md` (per project) | Persisted compliance audit reports. |

## The Seven Compliance Lenses

1. **Intellectual Property (IP) & Trademark Infringement**:
   - Licensing verification of images, fonts, and media assets.
   - Prevention of false official affiliation claims or trademark violations.
   - Protection against counterfeit goods liability.
2. **Website Accessibility (ADA Title III & WCAG 2.1 AA)**:
   - Comprehensive image alternative text (`alt` tags).
   - ARIA attributes, semantic hierarchy, and screen-reader compatibility.
   - Minimum 4.5:1 text color contrast ratios.
   - Full keyboard navigation without keyboard traps.
3. **Data Privacy, Cybersecurity & Cookie Compliance**:
   - Presence of accessible Privacy Policy and Terms of Service routes.
   - Customer PII protection, TLS enforcement, and secure payment handling.
   - Cookie consent and analytics tracking disclosures (GDPR / CCPA).
4. **E-Commerce & Consumer Protection Laws**:
   - Truth in advertising: accurate specs and device condition grading.
   - Deceptive pricing prevention: accurate original SRPs, no hidden fees at checkout.
   - Authentic customer reviews without fabricated ratings.
   - Transparent billing with zero forced subscription traps.
5. **Product Liability & Safety Advisories**:
   - Required hardware and battery safety warnings.
   - Clear warranty, return, and replacement claim terms.
6. **Communications & Anti-Spam (CAN-SPAM / TCPA)**:
   - Explicit opt-in consent checkboxes for SMS and marketing emails.
   - Clear and accessible unsubscribe mechanisms.
7. **Tax & Financial Transparency**:
   - Accurate tax, shipping, and total cost breakdowns before final purchase.
   - Accurate accepted payment method disclosures.

## Severity Tiers

- **P0 Critical Legal Exposure**: Direct trademark infringement, false affiliation claims, exposed customer PII, deceptive hidden checkout fees.
- **P1 Statutory & Regulatory Risk**: Missing mandatory Privacy Policy/Terms, severe ADA screen-reader failures, missing opt-in consent.
- **P2 Compliance Gaps**: Missing image alt tags, low contrast text, vague warranty or return disclosures.
- **P3 Polish & Best Practices**: Formatting inconsistencies in policy footers, minor aria attribute omissions on decorative icons.

## Fix Doctrine

1. Audit and report first; never mutate legal copy or components without explicit user authorization.
2. Ground all fixes in documented compliance standards (WCAG 2.1 AA, FTC Guidelines, GDPR/CCPA).
3. Preserve house directives: zero emojis, zero em-dashes, and clean punctuation across all policy documents and UI elements.
