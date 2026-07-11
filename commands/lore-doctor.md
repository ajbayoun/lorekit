---
description: Check lore docs for staleness, unfilled placeholders, and unsynced tasks — then fix what's fixable
---

Run `npx -y lorekit doctor` in the repo root and act on the report:

- **Stale docs:** open each one, compare it against the current code, fix any
  drift, then bump its date with `npx -y lorekit touch <doc>`. If it was
  already accurate, just touch it. Never touch a doc you didn't re-check.
- **Read-map drift:** orphan docs get a row added to the AGENTS.md read map;
  dead rows get removed (or the missing doc restored with `lorekit add`).
- **`_FILL_ME_` placeholders:** fill the ones the code can answer; ask the
  user about the rest.
- **Unsynced tasks:** run `npx -y lorekit sync`.

Finish with a short summary: what you fixed, what needs the user.
