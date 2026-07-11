---
doc: playbook
title: {{TITLE}}
summary: _FILL_ME_ (one line: what this recipe produces)
last-verified: {{DATE}}
read-when: about to {{TITLE_LOWER}}
update-when: the steps change — re-walk the whole recipe before editing it
---

# Playbook: {{TITLE}}

Follow these steps **exactly and in order**. Do not improvise around a
failing step — fix the step or stop and report. If you deviate and it
works, update this playbook in the same commit.

## Preconditions

- _FILL_ME_ (what must be true before starting — branch state, services up)

## Golden example

The reference implementation of this pattern. When unsure, copy it:

- `_FILL_ME_` (path to the best existing example of the result)

## Steps

1. _FILL_ME_ (exact action, exact path: "create `src/routes/<name>.ts` from
   the golden example")
2. _FILL_ME_
3. _FILL_ME_

## Verify

- [ ] _FILL_ME_ (exact command and expected output)
- [ ] The end-to-end behavior was exercised once, not just compiled

## Common failures

| Symptom | Cause | Fix |
| --- | --- | --- |
| _FILL_ME_ | _FILL_ME_ | _FILL_ME_ |
