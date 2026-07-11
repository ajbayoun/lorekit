---
doc: project
title: Project charter
summary: Mission, goals, and non-goals — why this project exists
last-verified: 2026-07-11
read-when: starting any session; answering "why does this exist" or scope questions
update-when: the mission, goals, or scope change — with the user's explicit agreement
---

# Project charter

## Mission
Give any repo a memory: one command scaffolds the markdown docs AI agents
read, follow, and keep up to date — so agents stop re-exploring,
re-deciding, and re-breaking things between sessions.

## Vision
The default coordination layer for agent-driven development: solo agents get
routed knowledge with lifecycle rules; fleets of agents get a file-based
task system with git as the lock; weaker models perform like stronger ones
because the repo's judgment is written down in playbooks and guides.

## Goals (current)
1. Publish to GitHub (`ajbayoun/lorekit`) and npm (`lorekit`).
2. Keep the CLI zero-dependency and instant via `npx`.
3. Dogfood: this repo's own lore stays clean under `lore doctor` in CI.

## Non-goals
Things this project deliberately does NOT do. Agents: do not build these,
even if they seem useful.

- No AI/LLM calls inside the CLI — intelligence lives in the agent; the CLI
  is deterministic plumbing.
- No config files (`.lorerc` etc.) — convention over configuration.
- No runtime npm dependencies, ever.
- No server, daemon, or database for fleet mode — git is the coordination
  substrate.

## Success looks like
Someone runs `npx lorekit init`, their agent reads AGENTS.md, and a week
later `lore doctor` still passes because the agent maintained the docs
without being asked.
