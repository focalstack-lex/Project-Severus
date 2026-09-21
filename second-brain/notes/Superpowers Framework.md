# Superpowers Framework

The **Superpowers Framework** (by Jesse Vincent / `obra/superpowers`) is a structured software development methodology designed specifically for AI coding agents. It enforces rigorous engineering discipline through composable agent skills, test-driven development (TDD), subagent delegation, git worktree isolation, and verification gates.

#skills #superpowers #architecture #ai-engineering #tdd #severus

## Core Principles
1. **Spec First, Code Second**: Never write code without first clarifying intent and securing sign-off on a bite-sized specification (`brainstorming`).
2. **Implementation Planning**: Break complex requirements into explicit, manageable tasks with red/green TDD guidelines (`writing-plans`).
3. **Subagent-Driven Execution**: Dispatch fresh implementer subagents for individual tasks with specialized task reviewers to prevent context rot (`subagent-driven-development`, `executing-plans`, `dispatching-parallel-agents`).
4. **Git Worktree Isolation**: Isolate task feature work within temporary git worktrees (`using-git-worktrees`, `finishing-a-development-branch`).
5. **Verification Before Completion**: Require real terminal test/build output evidence before claiming a task is done (`verification-before-completion`).

## Integration with Severus
Severus integrates Superpowers into its core agent engine alongside the Ascended Agent Directives (Zero Hallucination, Defensive & Secure Programming, Anti-AI-Slop, and Security-First Deployment Gate).
