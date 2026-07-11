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
npx lorekit init --full     # all 30 docs
npx lorekit add security costs deployment    # or cherry-pick
```

The full tier adds: features, known-issues, **experiments** (dead ends — the
anti-rework file), glossary, file-map, testing, verify, setup, deployment
(Docker/K8s), environments, security, design, brand, personas, metrics,
costs, dependencies, data-model, api, integrations, release, compliance, and
a session-log for agent-to-agent handoffs.

## The ideas that make it work

**AGENTS.md is a router, not a summary.** It holds a read map — "doing UI
work → read design.md + brand.md; debugging → known-issues.md" — so agents
load only what the task needs.

**Lifecycle rules, not vibes.** The master file tells agents exactly how to
maintain the system: finished todos move to done.md, decisions are
append-only and superseded rather than deleted, docs are updated in the same
commit as the code that changed them, and `_FILL_ME_` means *ask the human,
never guess*.

**Staleness is measurable.** Every doc carries a `last-verified` date in its
frontmatter. Agents bump it when they confirm a doc still matches reality,
and `lore doctor` flags anything nobody has verified in 30 days.

## Commands

| Command | What it does |
| --- | --- |
| `lore init [--full] [--force] [--name X]` | Scaffold docs; detects your stack, auto-adds deployment.md if Docker is present |
| `lore doctor [--max-age <days>]` | Flag stale docs, unfilled `_FILL_ME_` placeholders, unsynced tasks (non-zero exit — CI-friendly) |
| `lore sync` | Move `[x]` tasks from todo.md to done.md under today's date |
| `lore add <doc...> \| all` | Install more docs later |
| `lore list` | Installed vs available docs, with verification dates |

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
