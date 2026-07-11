---
doc: fleet
title: Fleet protocol
summary: Multi-agent coordination — claiming tasks, zones, branches, merge etiquette
last-verified: {{DATE}}
read-when: ALWAYS, before touching anything, when multiple agents work this repo
update-when: the coordination rules change (orchestrator/human decision, not per-agent)
---

# Fleet protocol

This repo is worked by **multiple agents in parallel**. These rules exist so
a hundred agents don't step on each other. They are not optional; an agent
that skips the claim step will collide with another agent and waste both
runs.

## Your identity

You need a stable agent id for this session: use `$LORE_AGENT` if set,
otherwise pick `agent-<your-branch-or-worktree-name>`. Use the same id for
claims, branches, commits, and session files.

## The claim loop

1. **Sync first:** `git pull --rebase` on the coordination branch (main
   unless stated otherwise below).
2. **Claim:** `lore task next --claim --by <your-id>` — picks the
   highest-priority open task whose dependencies are done and marks it
   claimed. (Or `lore task claim T-0042 --by <your-id>` for a specific one.)
3. **Commit the claim immediately**, alone:
   `git commit -am "fleet: claim T-0042 (<your-id>)"` and push. The push is
   the real lock — git accepts exactly one first-parent per head, so
   **first push wins**.
4. **If the push is rejected:** pull --rebase. If "your" task is now claimed
   by someone else, you lost the race — that's normal. Go to step 2 and
   claim the next one. Never un-claim someone else's task.
5. **Work on a branch:** `fleet/T-0042-<your-id>`. Touch only files the task
   needs. If you must edit outside your task's zone, stop and add a new
   task instead.
6. **Finish:** run the verify checklist, then `lore task done T-0042`,
   commit, push, open the PR/merge per conventions.md.
7. **Hand off:** write `lore/sessions/<date>-<your-id>.md` — 3 lines: did,
   mid-flight, next.

## Zones

Tasks carry a `zone` (e.g. `frontend`, `api`, `db`, `infra`). Soft rule:
**don't claim into a zone that already has another agent's active claim**
if any other eligible task exists — parallel edits in one zone are where
merge conflicts come from. `lore task list --status claimed` shows who is
where.

## Writing rules under parallelism

- **Never edit a task file someone else has claimed.** Comment via a new
  task or the PR instead.
- **One file per thing:** new sessions are new files in `lore/sessions/`,
  new tasks are new files via `lore task add`. Do not append to shared
  list files — that's the pre-fleet pattern and it merge-conflicts.
- **Decisions are not made solo in a fleet.** If your task needs an
  architecture/library decision, mark the task `blocked`, describe the
  choice in the task file, and surface it to the orchestrator/human via
  user-actions.md.
- **Task creation belongs to the orchestrator** (or human) on the
  coordination branch. Agents may add follow-up tasks they discover, but
  expect id races; `lore doctor` flags duplicate ids — the later claimer
  renumbers theirs.

## Stuck-claim rule

A claim older than 24h with no pushed commits on its branch is presumed
dead (`lore doctor` flags these). The orchestrator — not a peer agent —
reopens it: set `status: open`, clear `claimed-by`, commit.

## Merge etiquette

- Small PRs, one task each. A PR touching files outside its task's scope
  gets rejected.
- Rebase on main before requesting merge; you resolve your own conflicts.
- Never force-push the coordination branch. Never rewrite another agent's
  commits.

## Coordination branch

Claims and task-state changes are committed to: **main**
(change this line if the fleet uses a dedicated coordination branch).
