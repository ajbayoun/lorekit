---
doc: backend
title: Backend guide
summary: Universal server-side rules — API design, validation, data, jobs, observability, security
last-verified: {{DATE}}
read-when: building or changing ANY server-side code — endpoints, database, jobs, integrations
update-when: the project adopts a rule that differs from these defaults (edit in place, note it in decisions.md)
---

# Backend guide

Universal rules, pre-filled with strong defaults. Follow them mechanically
unless this project's `api.md`/`data-model.md`/`conventions.md` overrides a
rule. When in doubt: boring and explicit beats clever and implicit.

## API design

- Resources are **plural nouns**, actions are HTTP verbs: `GET /invoices`,
  `POST /invoices`, `GET /invoices/:id`, `PATCH /invoices/:id`,
  `DELETE /invoices/:id`. A verb in a path (`/invoices/:id/send`) is allowed
  only for real operations that aren't CRUD.
- Status codes — use them correctly and consistently:
  - `200` read/update OK, `201` created, `204` deleted/no body
  - `400` malformed request, `401` not authenticated, `403` authenticated
    but not allowed, `404` doesn't exist (also for "exists but you may not
    know that"), `409` conflict/duplicate, `422` valid shape but failed
    business validation, `429` rate limited
  - `500` only for genuine bugs — never for expected failures
- **One error envelope everywhere**, machine-readable code + human message:
  ```json
  { "error": { "code": "invoice_not_found", "message": "Invoice inv_123 does not exist.", "field": null } }
  ```
  Never leak stack traces, SQL, or internal paths in responses.
- Every list endpoint is **paginated from day one** (adding it later breaks
  clients). Prefer cursor pagination (`?cursor=...&limit=50`, return
  `next_cursor`); offset pagination drifts under concurrent writes.
- Timestamps: **ISO 8601 in UTC** (`2026-07-11T14:30:00Z`), fields named
  `created_at` / `updated_at`. Money: integer minor units (cents) + a
  currency code — never floats.
- Version from the start (`/v1/...` or a header). Additive changes are free;
  removing/renaming a field is a breaking change and needs a decisions.md
  entry.

## Validation & trust boundaries

- Validate at **the boundary** (request parsing), not deep in business
  logic: types, ranges, lengths, enum membership, and reject unknown fields.
  Past the boundary, data is trusted and typed.
- Everything from outside is hostile until proven otherwise: request bodies,
  query params, headers, webhook payloads, file uploads, and values from
  third-party APIs.
- Server-side validation is the real one; client-side is UX sugar. Never
  trust `disabled` buttons or frontend checks.
- Authorization on **every** endpoint, checked against the resource, not
  just the route: "can THIS user act on THIS invoice" (IDOR is the classic
  miss). Deny by default.
- Uploads: allowlist content types, cap size, store outside the web root or
  in object storage, never execute or serve with user-controlled paths.

## Database discipline

- **Every query runs through parameterization** — string-built SQL is a
  ship-blocker, no exceptions.
- Wrap multi-write operations in a **transaction**: money movements,
  create-parent-and-children, anything where a half-done state is corrupt.
- Kill N+1s: if you loop and query inside the loop, batch it (JOIN, `IN`,
  or your ORM's eager loading). Check generated SQL for any list endpoint.
- Index what you filter/sort/join on; every foreign key gets an index.
  A query without an index on its WHERE column is a time bomb, not a bug
  you'll see in dev.
- Migrations are **forward-only and additive** where possible: add column →
  backfill → switch reads → drop later, as separate deploys. Never edit an
  applied migration; never mix schema changes with data backfills in one
  step.
- Soft-delete only when the product needs undo/audit; otherwise hard-delete
  and keep an audit log. Decide once, write it in data-model.md.
- Constraints live in the database (NOT NULL, UNIQUE, FK), not only in app
  code — the DB is the last line of defense and the only one that holds
  under concurrent writers.

## Idempotency & concurrency

- Any endpoint that creates or charges accepts an **idempotency key**;
  retrying the same key returns the original result, not a duplicate.
- Webhook handlers and job processors WILL receive duplicates — dedupe by
  event id before acting.
- Guard racy updates: optimistic locking (version column) or
  `SELECT ... FOR UPDATE`. Read-modify-write without a guard is a data-loss
  bug under load.
- Timeouts on every outbound call (connect + total). Retry only idempotent
  operations, with exponential backoff + jitter, capped attempts.

## Background jobs

- Anything slower than ~1s of real work, or touching a flaky third party,
  moves out of the request path into a job.
- Every job handler is **idempotent** — it will run twice eventually.
- Retries with backoff, a max-attempt cap, and a **dead-letter queue** you
  actually look at (alert when it grows).
- Jobs carry ids, not payloads: pass `invoice_id`, reload state inside the
  job (the world changed since it was enqueued).

## Observability

- **Structured logs** (JSON or key=value), one event per line, with:
  timestamp, level, message, request id, user/account id where relevant.
- A **request id** is generated at the edge and flows through every log
  line, job, and outbound call of that request.
- Log every request (method, path, status, duration) and every failure with
  context. Log nothing secret: no passwords, tokens, cookies, full card
  numbers, or raw personal data — redact at the logger.
- Levels mean something: `error` = a human should eventually look,
  `warn` = degraded but handled, `info` = notable state change,
  `debug` = development only.
- Health endpoint (`/healthz`) that checks real dependencies (DB ping), for
  deploys and orchestrators.

## Security non-negotiables

- Secrets in env vars or a secret manager — never in code, config files in
  git, or logs. Rotate anything that ever leaked, immediately.
- Hash passwords with bcrypt/argon2 (never MD5/SHA alone, never reversible).
  Compare tokens with constant-time comparison.
- Rate-limit auth endpoints and anything expensive; lock out after repeated
  failures with backoff, not permanently.
- CORS: explicit origin allowlist. `*` with credentials is a vulnerability.
- Dependencies: pin versions, patch known CVEs promptly; new deps need an
  entry in dependencies.md.
- Principle of least privilege everywhere: DB users, API keys, IAM roles —
  scoped to what the service actually does.

## Performance defaults

- Response-time budget: p95 under **300ms** for interactive endpoints; if an
  operation can't fit, make it async (job + status endpoint or webhook).
- Cache reads that are expensive and tolerate staleness — with an explicit
  TTL and an invalidation story written down. A cache without an
  invalidation plan is a bug factory.
- Measure before optimizing: add the index, check the query plan, profile
  the hot path. No speculative micro-optimization.

## Before shipping any backend change

- [ ] New/changed endpoints documented in api.md; breaking changes have a
      decisions.md entry.
- [ ] Validation at the boundary; authz checked against the resource.
- [ ] List endpoints paginated; queries checked for N+1 and missing indexes.
- [ ] Errors use the standard envelope; nothing internal leaks.
- [ ] Logs added for the failure paths, with request ids and no secrets.
- [ ] Migration is additive and reversible; ran against a realistic dataset.

## Project overrides

Rules above that this project deliberately breaks, and why:

- (none yet)
