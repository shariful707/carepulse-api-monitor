# Architecture and design decisions

## Boundaries

The browser presents evidence and submits checks. The Node HTTP server validates requests, stores observations and manages incident lifecycles. AI assists with wording and cannot change detection, issue codes or priority. Email reports are another consumer of persisted incident facts.

## Ingestion lifecycle

1. `validateBatch` normalizes a single object or nonempty array and validates every item before any write.
2. `detectAnomalies` evaluates HTTP status, latency and record count independently.
3. A `BEGIN IMMEDIATE` transaction stores each observation, updates or creates one active incident per API, and resolves incidents after healthy observations. Any SQL failure rolls back the whole batch.
4. After commit, up to four workers generate explanations. A shared `AI_TIMEOUT_MS` budget limits total AI enrichment time. Jobs that exceed the budget retain a labeled fallback.
5. A conditional update requires matching incident ID, version and active status. An old AI response cannot overwrite a later observation or revive a closed incident.
6. Newly opened incidents still active at report time are grouped into one email digest per batch. Repeated anomalies on an already-open incident do not generate a new automatic report. A recovered-and-reopened service creates a new incident and can notify again.
7. Email outcomes are stored separately. A failed SMTP call does not roll back observations or incidents. Operators can create a fresh current summary after correcting email settings.
8. The browser polls every eight seconds while visible and idle. A failed refresh shows an explicit stale-data notice.

## Persistence

| Table              | Purpose                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| `observations`     | Immutable aggregate checks, batch identity, detection outcome and ingestion time                               |
| `alerts`           | Incident state, priority, issues, text provenance, occurrence count, optimistic version and latest observation |
| `email_deliveries` | Recipient, plain-text report, creation time, acceptance/failure state and optional digest identity             |

A partial unique index enforces one active incident per API. A service/id index supports latest-observation lookup. WAL allows readers alongside a writer; foreign keys enforce incident-to-observation references. Schema creation is additive and compatible with the original prototype database.

`data/settings.json` contains saved AI/email settings and plaintext credentials. Writes use a temporary file and atomic rename; public settings omit secrets. File mode `0600` is requested where supported; Windows deployments must protect the directory with ACLs. Environment settings seed the initial values, then saved editable values take precedence. Infrastructure settings and the write key are not editable through the browser. Each batch receives a settings snapshot.

## Integrations

- **OpenAI:** Chat Completions with system/user messages and a configurable model.
- **Ollama:** native `/api/chat`, configurable local origin and installed model, non-streaming JSON. Model loading can be slow, so the default AI budget is 60 seconds.
- **Gemini:** retained adapter for existing users.
- **Fallback:** factual deterministic text with `rules_template` or `rules_fallback` provenance.
- **Email:** Nodemailer SMTP, encryption required by default, or local preview. Plain-text content prevents email HTML injection. A `sent` result means SMTP acceptance, not a read receipt or guaranteed inbox delivery.

No provider response body, SMTP exception details or saved password is returned as a public settings value. Aggregate response metrics are the only accepted application input.

## Interface decisions

A warm neutral palette and restrained forest accent prioritize operational content. Named top navigation remains visible on mobile. The default ingestion path is a regular form; JSON import is available as an expandable advanced option. Status uses words as well as color. Keyboard focus, error notices, empty states, connection feedback, browser history and reduced motion are supported. SVG charts use safe presentation attributes rather than inline CSS, respecting the server CSP.

## Trade-offs and production work

- Native HTTP and plain browser JavaScript keep routing and data flow inspectable. Nodemailer is the only runtime dependency; development dependencies support formatting and browser verification.
- SQLite is suitable for this single-process local workflow. Multiple instances need PostgreSQL or another shared store and coordinated background workers.
- AI and email are synchronous post-commit steps. If the process crashes after SQL commit, enrichment or notification can remain incomplete. A production outbox and queue should provide durable retries and idempotency.
- Ingestion retries can create new observations. Callers should not assume request-level exactly-once processing.
- New-incident email avoids repeated notifications, but severity escalation and automatic recovery do not send separate emails in this version.
- Thresholds are global and zero-record assumptions are intentionally simple. Production systems need per-service baselines, allowed status policies and expected data contracts.
- The optional API key protects writes only. Read endpoints and local settings metadata are unauthenticated. Add real authentication, roles, TLS, rate limits, audit trails and secret management before public deployment.
- A scheduler or collector must submit observations for continuous monitoring. Arbitrary remote URL polling is intentionally absent.
