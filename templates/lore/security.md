---
doc: security
title: Security considerations
summary: Sensitive data, auth model, and standing security rules
last-verified: {{DATE}}
read-when: touching auth, user input, secrets, uploads, or network boundaries
update-when: a threat, control, or sensitive-data flow changes
---

# Security considerations

## Sensitive data in this system
| Data | Where it lives | Protection |
| --- | --- | --- |
| _FILL_ME_ | _FILL_ME_ | _FILL_ME_ |

## Auth model
_FILL_ME_ (who can do what, and how identity is established)

## Standing rules
- All user input is validated at _FILL_ME_ (the trust boundary)
- Secrets: see environments.md — never in code, logs, or lore docs
- _FILL_ME_ (rate limits, CORS, upload restrictions…)

## Accepted risks
Risks reviewed with the user and consciously accepted, with the date.
Agents: don't silently "fix" these, and don't add new ones without asking.

- _FILL_ME_ (or "none yet")
