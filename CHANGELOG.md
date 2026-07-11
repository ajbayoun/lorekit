# Changelog

## 0.3.0 — 2026-07-11

### Added
- **Fleet mode** — coordinate many agents on one repo. `lore fleet init`
  creates `lore/tasks/` (one file per task — no merge-conflict-prone shared
  lists), `lore/sessions/` (per-agent handoff files), and `lore/fleet.md`
  (the claim protocol: first push wins, zones, merge etiquette). Existing
  todo.md checkboxes migrate to task files with section-based priorities.
- **Task system**: `lore task add|list|next|claim|done|reopen|show`, with
  `--json` everywhere. `task next` picks by dependency-eligibility, priority,
  and prefers zones without active claims; `--claim --by <agent>` claims
  atomically via git's push race.
- **Fleet checks in doctor**: stale claims (presumed-dead agents), duplicate
  task ids, unknown dependencies, dependency cycles, zone pileups, and
  done-status tasks not yet synced.
- **Playbooks** — `lore playbook add <operation>` captures a step-by-step
  recipe (golden example, exact steps, verify command, common failures) that
  weaker models follow exactly instead of inferring. Routed via a read-map
  directory row.
- **`lore digest`** — a one-page brief (rules short-form, doc summaries, the
  fleet board, human blockers) compiled from `summary:` frontmatter — for
  small-context or fast models.
- **Detailed guides**, pre-filled and ready to use: `lore/guides/ui-ux.md`
  (layout, type, color, five-states rule, forms, interaction, a11y) and
  `lore/guides/backend.md` (API design, validation, database discipline,
  idempotency, jobs, observability, security). `lore add ui-ux backend` or
  included in `--full`.
- `summary:` frontmatter on every template (powers the digest).
- `lore sync` also moves done-status task files to `tasks/done/`.

## 0.2.0 — 2026-07-11

### Added
- **Git-aware staleness**: `doctor` only flags a doc as stale if the repo has
  commits newer than its `last-verified` date; stale messages include the
  number of commits since verification. Falls back to pure age outside git.
- `lore touch <doc...> | all | agents` — bump `last-verified` after
  re-checking a doc against the code.
- `lore link [copilot gemini windsurf cline]` — pointer files so other AI
  tools read AGENTS.md.
- `lore ci` — GitHub Actions workflow that runs `doctor` on PRs (full-history
  checkout so the staleness check works).
- `lore doctor --json` — machine-readable report with `ok`, `stats`, and
  typed `issues`.
- Read-map drift detection in `doctor`: orphan docs not routed by AGENTS.md,
  and read-map rows pointing at missing files.
- `lore add` now auto-inserts read-map rows into AGENTS.md.

### Changed
- ANSI colors are disabled when output is piped or `NO_COLOR` is set.
- `npm test` gate on publish (`prepublishOnly`).

## 0.1.0 — 2026-07-11

Initial release: `lore init/doctor/sync/add/list`, 30 doc templates,
AGENTS.md router generated from template frontmatter, Claude Code plugin
(`/lore-init`, `/lore-doctor`, `/lore-sync`), smoke tests.
