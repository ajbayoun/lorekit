---
doc: data-model
title: Data model
summary: Entities, schema, and migration rules
last-verified: {{DATE}}
read-when: touching the schema, queries, or anything that persists data
update-when: the schema changes — same commit as the migration
---

# Data model

## Storage
_FILL_ME_ (database/engine, where migrations live, how to run them)

## Entities

```mermaid
erDiagram
    _FILL_ME_ ||--o{ _FILL_ME_ : has
```

| Entity | Purpose | Key fields |
| --- | --- | --- |
| _FILL_ME_ | _FILL_ME_ | _FILL_ME_ |

## Rules
- Migrations: _FILL_ME_ (e.g. "always additive; never edit an applied migration")
- _FILL_ME_ (soft-delete vs hard-delete, timestamps convention, id scheme)
