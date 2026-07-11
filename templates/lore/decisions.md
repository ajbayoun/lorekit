---
doc: decisions
title: Decision log
summary: Settled choices and their reasoning — do not re-litigate
last-verified: {{DATE}}
read-when: before proposing an approach, library, or architecture change
update-when: a meaningful choice is settled with the user — append-only, supersede don't delete
---

# Decision log

Append-only. Each entry: date, decision, why, and what was rejected.
To reverse a decision, add a NEW entry that supersedes the old one and links
to it. Agents: check here before proposing — settled decisions are not
re-litigated without new information.

---

## {{DATE}} — Adopted lore for agent-facing docs
**Decision:** Project knowledge for AI agents lives in AGENTS.md + `lore/`,
maintained under the lifecycle rules in AGENTS.md.
**Why:** Agents lose context between sessions; without written memory they
re-explore, re-decide, and re-break things.
**Rejected:** Keeping everything in one giant README (unreadable, always stale).
