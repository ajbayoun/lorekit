# Changelog

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
