---
doc: decisions
title: Decision log
summary: Settled choices and their reasoning — do not re-litigate
last-verified: 2026-07-11
read-when: before proposing an approach, library, or architecture change
update-when: a meaningful choice is settled with the user — append-only, supersede don't delete
---

# Decision log

Append-only. Each entry: date, decision, why, and what was rejected.
To reverse a decision, add a NEW entry that supersedes the old one and links
to it. Agents: check here before proposing — settled decisions are not
re-litigated without new information.

---

## 2026-07-11 — Zero dependencies, single-file CLI
**Decision:** `bin/lore.js` is one plain-JS file with no npm dependencies.
**Why:** `npx lorekit` must be instant and un-breakable; every dependency is
a supply-chain and install-time risk for a tool people run in fresh repos.
**Rejected:** commander/yargs (arg parsing is 30 lines), TypeScript build
step (nothing to type-check that tests don't catch).

## 2026-07-11 — Read map generated from template frontmatter
**Decision:** Each template carries `read-when`/`update-when`/`summary` in
its own frontmatter; AGENTS.md's table and `lore digest` are compiled from
it. `manifest.json` holds only file path + tier.
**Why:** One source of truth — a doc and its routing can't drift apart.
**Rejected:** Hardcoding the table in the CLI (drifts), duplicating metadata
in manifest.json (two sources of truth).

## 2026-07-11 — Name: lorekit, binary `lore`
**Decision:** npm package `lorekit` (confirmed free 2026-07-11), CLI command
`lore`.
**Why:** "Lore" = the accumulated knowledge of a project; short command.
**Rejected:** `lore` as package name (taken on npm), `agentdocs` (generic).

## 2026-07-11 — Renamed to loresmith (supersedes "Name: lorekit")
**Decision:** npm package and GitHub repo are `loresmith`; CLI command stays
`lore`.
**Why:** npm rejected `lorekit` at publish time — typosquat rule against the
existing `lore-kit` package (E403 "name too similar"). `loresmith` and
`lore-smith` are both unclaimed, so no similarity rule can fire.
**Rejected:** `lorebook`/`gitlore`/`lorekeeper`/`codelore` (taken, or blocked
by the same similarity rule), scoped `@ajbayoun/lorekit` (worse npx
ergonomics, weaker brand).

## 2026-07-11 — Tiers: core is small on purpose
**Decision:** Default init installs 8 docs; `--full` installs all 32;
guides are a separate tier (`lore add ui-ux backend`).
**Why:** An agent facing 30 docs reads none of them well; adoption starts
small and grows.
**Rejected:** One-size scaffold of everything.

## 2026-07-11 — Fleet coordination via git, one file per item
**Decision:** Fleet mode uses task files in `lore/tasks/`, per-agent session
files, and claims committed to a coordination branch — first push wins.
**Why:** Shared list files merge-conflict under parallel writers; git's push
race is a real compare-and-swap that works across worktrees and machines
with no server.
**Rejected:** A lock server or daemon (violates non-goals), SQLite state
(not diffable/reviewable), claims via lockfiles outside git (not visible to
remote agents).

## 2026-07-11 — Guides ship pre-filled; project docs ship empty
**Decision:** `guides/` templates contain opinionated best practices ready
to use ("Project overrides" section for deviations); all other docs are
placeholders the human/agent fills.
**Why:** Facts about a repo can't be guessed, but taste is transferable —
and written-down taste is what lifts weaker models most.
**Rejected:** Empty guide skeletons (no value), forcing guides into core
(bloat for non-UI/API projects).
