# Design: /antislop Universal Anti-AI-Slop Directive

Date: 2026-09-18
Status: Implemented
Owner: Lex Matondo
Provenance: brainstormed in a ZCode session against Kate's Gadget Online Store workspace;
detection tells sourced from Lex's supplied research batches (AI-writing marker groups,
visual/textual/structural slop cue lists, and two video walkthrough notes; original video
timestamp references 0:08-1:05, 4:01-4:42, 6:55-7:03, 8:44-12:35 noted here as provenance
only, they are not part of the runtime skill).

## Problem

AI-assisted development converges on recognizable generic output: template layouts,
purple gradient soup, interchangeable copy, fake proof, ad clutter, and shallow
structure. Severus hard-constraints already say "strictly reject generic AI-slop
aesthetics" but no tooling operationalizes that rejection as an auditable command.

## Goal

A universal `/antislop` command that works in Antigravity and every other IDE on the
machine, audits the full system or web app currently being developed, and finds AI slop
using the design and impeccable skills as its basis.

## Decisions (user-confirmed during brainstorm)

1. Scope: design slop AND code slop (full-system audit).
2. Action: report first, then propose fixes; fixing is a separate explicit step.
3. Evidence: static code sweep PLUS live browser audit when the app can run.
4. Implementation: one global skill + directive text in both AGENTS.md files. No
   per-IDE native command registrations, no detector scripts.

## Architecture

| Artifact | Role |
|---|---|
| `C:\Users\User\.agents\skills\antislop\SKILL.md` | Single source of truth for the audit. The cross-IDE skills root makes it discoverable wherever skills load natively. |
| `C:\Users\User\Documents\Severus\AGENTS.md` | Severus-core directive binding the `/antislop` name to the skill in the home workspace. |
| `C:\Users\User\.zcode\AGENTS.md` | User-default instruction binding, so every ZCode session on the machine honors `/antislop`. |
| `reports/antislop/YYYY-MM-DD-HHMM.md` (per project) | Persisted reports enabling `/antislop rescan` diffing. |

Agents in IDEs without native skill discovery still resolve `/antislop` because the
directive text in both AGENTS.md files tells them where the canonical skill lives.

## The Six Audit Lenses

1. Visual and typography slop: default dark themes, purple/indigo gradients,
   single-accent monotony, glow orbs and misplaced gradient overlays, card layouts,
   excessive rounding, 1px grey borders, oversized all-caps eyebrows, default or
   trend-chasing fonts (Inter, Geist, Syne) unless pinned by the project's own design
   doc, generic AI imagery, motion slop (fade-in-up everything, purposeless parallax,
   scroll-jacking), contrast failures, emoji-as-icons.
2. Structural and UX slop: card-everything, border overuse, inset tabs as primary
   navigation, top-level clutter, UI distraction, redundant subheadings, lazy selected
   states, random status pills, weak information density (pricing sections, hover
   states), uniform templated shell.
3. AI-writing markers (four markers, measured): AI phrase and filler density; specificity
   and proof (generic examples, missing experience, no real names/dates/verifiable local
   numbers); voice and rhythm (no point of view, homogeneous cadence, predictable
   structure); the explicit interchangeability test ("could be pasted onto a business in
   a different industry without changing a word").
4. Code slop: comment noise, dead code, over-abstraction, unjustified dependencies,
   default-unstyled library output, hex colors where tokens exist, design-pass skipping.
5. AI search visibility (live): probe Google AI Mode or equivalent for brand findability
   and citability; crawlability, entity presence, structured data. N/A when not deployed,
   stated not silent.
6. Ad clutter and shallow depth: ad-to-content ratio, auto-refreshing banners, autoplay
   video, no unique photography, no human editing signals, fake proof on screen.

## Severity Tiers

- P0 slop that lies: fake stats, fake testimonials, invented proof.
- P1 identity erasure: template shell, interchangeable copy, AI-search-invisible public site.
- P2 cliches: banned phrases, filler, gradient/glow soup, default fonts, motion slop.
- P3 code debt: comment noise, dead code, over-abstraction, unjustified dependencies.

Per-lens 0-10 scores plus a weighted overall score support numeric re-audit comparison.

## Fix Doctrine (applied only on request)

Ten strategies govern every proposed or applied fix: limit card usage, hide complex
functionality, fewer borders, reduce distraction, correct nav patterns, skip redundant
subheadings, design before implementing, iterate across models and borrow the best,
customize library output, ground work in design fundamentals. Fixes run in one batched
round plus at most one verification pass.

## Guardrails

- The project's own documented identity is the baseline; a pinned choice is craft, not
  slop ("the brief wins", from impeccable).
- Bounded passes: one code sweep, one batched visual round, one report.
- Fail loud on skipped lenses and on a missing skill file; never improvise.
- House rules respected in all artifacts: zero emojis, zero em-dashes, no navigation
  or route modifications.
- Journal every audit and fix run; durable new slop patterns feed back into the skill.

## Verification

- Skill file well-formed and present at the canonical path.
- Directive sections present in both AGENTS.md files.
- Discoverability confirmed in the authoring session; other IDEs pick it up via the
  AGENTS.md directive text on their next session.
