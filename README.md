# lorekit

**Give your repo a memory.**

AI coding agents are brilliant for one session and amnesiac the next. They
re-explore your codebase, re-litigate settled decisions, retry approaches you
already abandoned, and quietly let the docs rot.

`lore` is one command that scaffolds the markdown docs agents actually need —
with **lifecycle rules** they follow, **staleness checks** you can run, and a
**todo → done workflow** built in. It works with any agent that reads
[`AGENTS.md`](https://agents.md) (Claude Code, Codex, Cursor, and friends).

```
npx lorekit init
```

## What you get

```
your-repo/
├── AGENTS.md            ← the router: read map + lifecycle rules for agents
├── CLAUDE.md            ← one-line pointer to AGENTS.md
└── lore/
    ├── project.md       ← mission, goals, non-goals
    ├── architecture.md  ← Mermaid diagram + boundaries agents must not cross
    ├── todo.md          ← what to work on ([ ] / [x])
    ├── done.md          ← verified, shipped work — append-only
    ├── decisions.md     ← why choices were made, so they aren't re-litigated
    ├── conventions.md   ← style, git, and hard rules
    └── user-actions.md  ← things only the human can do (keys, payments, DNS)
```

That's the **core** tier — deliberately small, because an agent facing 30
docs reads none of them well. When the project grows:

```
npx lorekit init --full     # all 32 docs
npx lorekit add security costs deployment    # or cherry-pick
```

The full tier adds: features, known-issues, **experiments** (dead ends — the
anti-rework file), glossary, file-map, testing, verify, setup, deployment
(Docker/K8s), environments, security, design, brand, personas, metrics,
costs, dependencies, data-model, api, integrations, release, compliance, a
session-log for agent-to-agent handoffs — and the pre-filled **guides**
(below).

## Fleet mode — hundreds of agents, one repo

Shared list files are merge-conflict factories: a hundred agents can't all
edit `todo.md`. Fleet mode replaces every shared list with **one file per
thing**:

```bash
npx lorekit fleet init      # tasks/, sessions/, and the protocol doc
```

- `lore/tasks/T-0042-fix-login.md` — one file per task, with status,
  priority, zone, and dependencies in frontmatter. Existing todo.md items
  migrate automatically (Now→high, Next→normal, Later→low).
- **The claim loop**: each agent runs
  `lore task next --claim --by agent-07`, commits the claim alone, and
  pushes. Git's push race is the lock — **first push wins**, the loser
  rebases and claims the next task. No server, no daemon, works across any
  number of worktrees or machines.
- `task next` is scheduler-smart: it skips tasks with unmet dependencies,
  picks by priority, and prefers **zones** (frontend/api/db/infra) where no
  other agent has an active claim — so parallel agents naturally spread out
  instead of colliding.
- `lore/sessions/<date>-<agent>.md` — per-agent handoff notes, zero append
  collisions.
- `lore/fleet.md` — the protocol every agent reads first: claiming, zones,
  stuck-claim recovery, merge etiquette.
- `lore doctor` polices the fleet: dead claims (claimed 24h+ ago), duplicate
  ids, unknown or **circular dependencies**, and zone pileups.

Everything speaks `--json`, so orchestrators can drive it programmatically.

## Making smaller models punch above their weight

Strong models infer a repo's unwritten rules; smaller ones can't — but they
follow explicit instructions extremely well. lorekit converts inference into
instructions:

- **Playbooks** — `lore playbook add "add an API endpoint"` captures a
  recipe: preconditions, a golden-example file to copy, exact numbered
  steps, a verify command, and a common-failures table. An expensive model
  writes it once; a cheap model executes it forever.
- **`lore digest`** — compiles the `summary:` line of every doc into a
  one-page brief (rules short-form + doc map + fleet board + human
  blockers). Small-context models start here instead of reading the tree.
- **Guides** (below) — taste, written down as checkable rules.

## Detailed guides: UI/UX and backend

Unlike project docs (facts about *your* repo, born empty), guides ship
**pre-filled with opinionated best practices** and are edited per project:

- `lore/guides/ui-ux.md` — spacing scale, type hierarchy, WCAG contrast
  numbers, the **five states rule** (loading/empty/error/partial/ideal),
  form validation timing, touch targets, motion durations, a ship-blocking
  accessibility checklist.
- `lore/guides/backend.md` — REST conventions and status codes, one error
  envelope, validate-at-the-boundary, N+1 and index discipline, additive
  migrations, idempotency keys, job retry rules, structured logging,
  security non-negotiables, p95 budgets.

```bash
npx lorekit add ui-ux backend    # or included in --full
```

Each ends with a "Project overrides" section — deviations are written down,
not vibed.

## The ideas that make it work

**AGENTS.md is a router, not a summary.** It holds a read map — "doing UI
work → read design.md + brand.md; debugging → known-issues.md" — so agents
load only what the task needs.

**Lifecycle rules, not vibes.** The master file tells agents exactly how to
maintain the system: finished todos move to done.md, decisions are
append-only and superseded rather than deleted, docs are updated in the same
commit as the code that changed them, and `_FILL_ME_` means *ask the human,
never guess*.

**Staleness is measurable — and git-aware.** Every doc carries a
`last-verified` date in its frontmatter. Agents bump it when they confirm a
doc still matches reality (`lore touch <doc>`), and `lore doctor` flags
anything unverified past the age limit. Crucially, a doc only counts as stale
if the repo has **commits newer than its verification date** — a dormant
project doesn't nag you.

**The doctor also catches structural drift:** docs sitting in `lore/` that the
AGENTS.md read map doesn't route to (agents would never find them), and read
map rows pointing at files that no longer exist.

## Commands

| Command | What it does |
| --- | --- |
| `lore init [--full] [--force] [--name X]` | Scaffold docs; detects your stack, auto-adds deployment.md if Docker is present |
| `lore doctor [--max-age <days>] [--json]` | Flag stale docs, unfilled `_FILL_ME_` placeholders, read-map drift, unsynced tasks. Non-zero exit; `--json` for machines |
| `lore sync` | Move `[x]` tasks from todo.md to done.md under today's date |
| `lore touch <doc...> \| all \| agents` | Bump `last-verified` after re-checking a doc against the code |
| `lore add <doc...> \| all` | Install more docs — and auto-insert their rows into the AGENTS.md read map |
| `lore fleet init` | Convert the repo for multi-agent work: tasks/, sessions/, protocol doc; migrates todo.md |
| `lore task add\|list\|next\|claim\|done\|reopen\|show` | The fleet task system — `next --claim --by <agent>` is the scheduler; `--json` everywhere |
| `lore playbook add\|list` | Capture step-by-step recipes that weaker models follow exactly |
| `lore digest` | One-page brief: rules + doc summaries + fleet board — for small contexts |
| `lore link [copilot gemini windsurf cline]` | Pointer files so other AI tools read AGENTS.md too |
| `lore ci` | GitHub Actions workflow that runs doctor on every PR |
| `lore list` | Installed vs available docs, with verification dates |

## Works with every agent tool

`AGENTS.md` is the [emerging cross-tool standard](https://agents.md) — Cursor,
Codex, and others read it natively, and `lore init` adds a `CLAUDE.md` pointer
for Claude Code. For the rest, `lore link` drops one-line pointer files:
`.github/copilot-instructions.md` (GitHub Copilot), `GEMINI.md` (Gemini CLI),
`.windsurfrules` (Windsurf), and `.clinerules` (Cline). One knowledge base,
every tool.

## Enforce it in CI

```bash
lore ci
```

adds a workflow that runs `lorekit doctor` on every PR — stale docs, unfilled
placeholders, and read-map drift fail the build. Documentation debt becomes as
visible as failing tests.

## Install

```bash
npx lorekit <command>        # no install
npm i -g lorekit             # or global: lore <command>
```

### As a Claude Code plugin

```
/plugin marketplace add adnanbayoun/lorekit
/plugin install lorekit@lorekit
```

Then use `/lore-init` (scaffolds **and interviews you** to fill the docs in),
`/lore-doctor` (finds drift and fixes it), and `/lore-sync`.

## After `init`

The templates contain `_FILL_ME_` placeholders. The fastest way to fill them —
tell your agent:

> Read AGENTS.md, explore the repo, pre-fill every lore placeholder you can
> verify from the code, then interview me for the rest.

Add `npx lorekit doctor` to CI if you want stale docs to fail the build.

## License

MIT © Adnan Bayoun
