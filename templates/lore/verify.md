---
doc: verify
title: Verification checklist
last-verified: {{DATE}}
read-when: before marking any todo task [x] or telling the user something works
update-when: the definition of "verified" changes for this project
---

# Verification checklist

A task is DONE only when every line below passes. "It should work" is not
verified; observed behavior is. If a step can't be run, say so explicitly
instead of skipping it silently.

- [ ] Project builds with no new warnings: `_FILL_ME_`
- [ ] Tests pass: `_FILL_ME_`
- [ ] The changed behavior was exercised end-to-end at least once (run the
      actual app/flow, not just the tests)
- [ ] No lore doc was made stale by this change (architecture, data model,
      conventions, file map…)
- [ ] todo.md updated; anything human-blocking added to user-actions.md
