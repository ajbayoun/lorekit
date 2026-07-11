---
description: Check lore docs for staleness, unfilled placeholders, and unsynced tasks — then fix what's fixable
---

Run `npx -y lorekit doctor` in the repo root and act on the report:

- **Stale docs:** open each one, compare it against the current code, fix any
  drift, and bump its `last-verified` date to today. If it was already
  accurate, just bump the date.
- **`_FILL_ME_` placeholders:** fill the ones the code can answer; ask the
  user about the rest.
- **Unsynced tasks:** run `npx -y lorekit sync`.

Finish with a short summary: what you fixed, what needs the user.
