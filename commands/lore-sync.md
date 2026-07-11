---
description: Move completed tasks from lore/todo.md to lore/done.md and reconcile against recent work
---

1. Check `lore/todo.md` against what was actually completed and verified in
   this session (and recent git history). Mark genuinely finished tasks `[x]`
   — finished means verified per AGENTS.md rule 8, not just "code written".
2. Run `npx -y lorekit sync` to move them to `lore/done.md`.
3. If `lore/session-log.md` exists, append a handoff entry for this session.
4. Report anything in todo.md that looks done but couldn't be verified.
