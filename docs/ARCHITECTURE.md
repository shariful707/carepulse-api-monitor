# Engineering Architecture and Design Rationale

## 1. Responsibility boundaries

The browser interface only presents evidence and asks the backend to ingest samples. The backend accepts telemetry and persists incidents. An AI provider assists with alert *wording*; it cannot overrule deterministic detection or adjust severity.

## 2. Data flow

1. Browser uploads JSON or a monitoring client posts to `/monitor`.
2. `validateBatch` accepts one object or a nonempty array. It rejects the entire batch on any invalid element.
3. `detectAnomalies` evaluates status, latency, missing/zero records independently, combining observed issues.
4. A SQLite transaction writes all observations and incident state. The active-incident unique index enforces one active incident per API.
5. For anomalies, `generateAlert` calls the configured LLM using **only** telemetry and issue codes. It runs after commit, in batches of up to four concurrent requests, with a seven-second provider timeout.
6. The backend updates the message only if the alert is still active and its version matches. This stops stale AI completions from overwriting newer incidents.
7. The browser periodically calls `/api/summary` and `/alerts` to update cards, trend bars, severity distribution and history.

## 3. Why a transaction?

A batch must not partially succeed if any item is invalid or database writing fails. The database's `BEGIN IMMEDIATE` and `COMMIT` make the observation writes and incident state updates an atomic unit; `ROLLBACK` returns to the previous consistent state after an error. The LLM call stays outside the transaction to avoid holding database locks during external network latency.

## 4. Core database model

`observations(id, batch_id, api_name, response_time_ms, status_code, records_returned, anomalous, checked_at)` records every check. `alerts(id, api_name, severity, issues_json, message, message_source, status, first_seen_at, last_seen_at, resolved_at, occurrence_count, version, latest_observation_id)` records incident lifecycles.

Index `idx_one_active_alert_per_api` is a *partial unique index* on `api_name WHERE status='active'`. It encodes a fundamental business invariant into the database. Once an API's active incident is resolved, a new incident for the same API may be inserted, preserving prior history. Indexes on status/date support dashboard queries.

## 5. Failure strategy

- Invalid input -> HTTP 400; no partial writes.
- Unsupported content type -> HTTP 415.
- Missing write API key (if configured) -> HTTP 401.
- Missing route/alert -> HTTP 404.
- LLM timeout, quota or provider failure -> persist and display a clearly labeled rules-based explanation.
- Outdated LLM response -> skipped by optimistic `version` check.
- Data privacy -> no raw patient payloads; the accepted schema contains only API-level response metrics.

## 6. Scalability discussion

This is suitable as a single-process local demonstration, not enterprise monitoring. A real system would separate ingestion, persistence and enrichment workers with a queue; introduce an idempotency key for exact retries; move SQL to managed PostgreSQL; build an API inventory with per-endpoint expected response counts and SLAs; collect real telemetry using scheduled monitors or distributed agents; implement authentication/RBAC, audit trails and rate limiting; run observability dashboards/metrics; add LLM retry budget and output grounding checks; and use secret management plus TLS.

## 7. Design trade-offs

- **Native Node HTTP vs Express:** The brief recommends but does not require Express. Native HTTP removes install steps and lets interviewers see routing fundamentals. Express would simplify middleware and routing in a larger app.
- **SQLite vs PostgreSQL:** Zero infrastructure for reviewers, ACID transactions and SQL queries. PostgreSQL is a better fit for concurrent multi-instance deployments.
- **Plain JavaScript frontend vs React:** No build chain or dependency installation for assessment reviewers. React would be preferable for a larger, stateful multi-screen product.
- **Polling vs WebSockets:** Simpler robust refresh every 8 seconds; streaming would lower update latency at greater complexity.
- **Template fallback vs fabricated AI:** Explicit provenance keeps the demonstration honest and the detection service available without LLM credentials.
- **One active incident per API:** Controls alert fatigue and combines multiple issues. A large production system may group by `(api, endpoint, incident type)` instead.
