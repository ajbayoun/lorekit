---
doc: conventions
title: Conventions
summary: Code style, git rules, and hard constraints
last-verified: 2026-07-11
read-when: before writing or reviewing any code, commit, or branch
update-when: a convention is adopted or changed (record it in decisions.md too)
---

# Conventions

## Code style
- Plain JavaScript (no TypeScript, no build step), `'use strict'`, Node ≥ 16.
- Single quotes, semicolons, 2-space indent — match `bin/lore.js` as it is.
- Command functions are named `cmd<Name>` and dispatched from the single
  `switch` at the bottom of `bin/lore.js`.
- Helpers stay pure where possible; all filesystem writes go through
  `writeDoc` or are immediately adjacent to their read.

## Git
- Branch: `main` only for now; feature branches when the repo goes public.
- Commit messages: imperative mood, body explains the why. No AI/bot
  attribution trailers of any kind.
- Every version bump updates CHANGELOG.md in the same commit.

## Tests
- Framework: none — `test/smoke.js` is a dependency-free end-to-end suite
  run with `npm test`.
- Every new command or flag gets at least one smoke check. A bug fix gets a
  check that would have caught it.
- `npm test` must pass before any commit; `prepublishOnly` enforces it on
  publish.

## Hard rules
Things that are never OK in this repo, even if they'd work:

- No npm dependencies (see decisions.md) — not even devDependencies unless
  truly unavoidable.
- No breaking changes to generated file formats (task frontmatter, read-map
  table shape) without a migration path and a decisions.md entry.
- Never overwrite a user's existing CLAUDE.md, even with `--force`.
- Version sync: `package.json` and `.claude-plugin/plugin.json` versions
  move together.
