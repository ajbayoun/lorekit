---
doc: agents
title: Agent operating manual
last-verified: {{DATE}}
lore-version: {{TOOL_VERSION}}
---

# {{PROJECT_NAME}} — Agent Operating Manual

You are an AI agent working in **{{PROJECT_NAME}}**. Stack: {{STACK}}.

This file is a **router, not a summary**. Do not read every doc in `lore/` —
read this file, then open only the docs matched to your current task in the
read map below.

## Read map

{{MANIFEST_TABLE}}

## Lifecycle rules

These rules are not optional. They are how this repo keeps its memory.

1. **Todo → done.** Work only on tasks in `lore/todo.md`. When a task is finished
   *and verified*, mark it `- [x]` and run `lore sync` (or move it to
   `lore/done.md` under today's date yourself). Never delete a task — finished
   tasks move to done, abandoned ones go to `lore/experiments.md` with the reason.
2. **Decisions are append-only.** When you and the user settle a meaningful choice
   (library, architecture, naming, product direction), append it to
   `lore/decisions.md` with the date and the *why*. Never delete or edit past
   decisions — add a new entry that supersedes the old one and link back to it.
   Before proposing a change, check this file: do not re-litigate settled decisions.
3. **Update in the same commit.** If your change makes a lore doc wrong
   (architecture, data model, conventions, file map…), fix that doc in the same
   commit as the code change. A stale doc is worse than no doc.
4. **Bump `last-verified`.** Whenever you read a lore doc and confirm it still
   matches reality, update its `last-verified` frontmatter date — `lore touch
   <doc>` does it for you. `lore doctor` flags docs nobody has verified since
   the repo last changed. Never bump a date you didn't actually verify.
5. **Never invent placeholder content.** `_FILL_ME_` means the human hasn't
   answered yet. Ask them — do not guess and fill it in silently.
6. **Human tasks go to `lore/user-actions.md`.** Anything only the user can do
   (create accounts, pay for services, set DNS, provide API keys, approve designs)
   gets added there the moment you discover it, and you remind the user of open
   items at the end of the session.
7. **README.md is for humans.** Keep it short: what the project is, how to
   install, how to run. It must never contradict `lore/` — when they disagree,
   fix both. Do not dump agent-facing detail into the README; that lives here.
8. **Verify before you claim done.** Minimum bar: the project builds, the tests
   pass, and you exercised the changed behavior end-to-end at least once. If
   `lore/verify.md` exists, its checklist overrides this default.
9. **End-of-session handoff.** If `lore/session-log.md` exists, append a short
   entry before you finish: what you did, what is mid-flight, what the next
   session should pick up.

## Health check

Run `npx lorekit doctor` (or `lore doctor` if installed) to find stale docs,
unfilled placeholders, read-map drift, and unsynced tasks. Fix what it
reports. Use `--json` when you want to parse the result.
