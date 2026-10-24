# CarePulse — Complete Interview Learning Guide

**Purpose:** Learn the concepts, understand the project's actual files and explain your decisions with confidence. The order moves from beginner concepts to architecture and senior-level trade-offs. Read with a terminal and the project folder open. Try each exercise rather than memorizing answers.

## Learning map

1. The problem and the exact assessment
2. What an API is; HTTP and JSON
3. Node.js and backend event loop
4. Request handlers and REST routing
5. Data validation and batch processing
6. What anomaly detection means
7. Threshold selection and severity
8. SQL, SQLite, tables and indexes
9. ACID transactions and data consistency
10. Incident lifecycle, deduplication and recovery
11. LLM fundamentals, prompting and grounding
12. Actual Gemini/OpenAI HTTP integration
13. Async I/O, concurrency, stale responses and timeouts
14. Frontend components, `fetch`, DOM and polling
15. Logging, observability and troubleshooting
16. Testing: unit, integration and browser
17. Security and patient-data privacy
18. Scaling from prototype to production
19. Code-by-code walkthrough
20. Oral interview questions, model answers and exercises

---

## Context: Why Care Guide would care about this system

Care Guide describes itself as a Bangladesh-based provider of healthcare and back-office support, digital technology, AI automation and web/DevOps services (see [Care Guide official site](https://careguidebd.com/)). Cottage Home Care describes in-home care offerings such as companion, personal, specialized and pediatric care (see [Cottage Home Care official site](https://cottagehomecare.com/)). Because operational staff depend on integrated information systems, failures in appointments, patient lookup or reporting could delay workflows. The monitoring prototype illustrates a technical tool that makes upstream data problems visible to support teams. Do not confuse this simulated project with a real deployed Care Guide or Cottage integration.

**Employer-oriented interview answer:** “I chose transparent monitoring rules and a privacy-minimizing alert pipeline because operational reliability matters in healthcare-adjacent service delivery. A support team needs a clear signal and next action, not an opaque model guess.”

## Lesson 1 — What is the problem?

Imagine a hospital uses four external services: a patient demographics service, an appointment booking service, a laboratory report service and a billing service. The external systems may fail even when your own app is correctly coded. We want to *observe* their behavior rather than wait for staff to complain. API monitoring checks response codes, response time and record counts. Anomaly detection decides whether the behavior is outside expectations. Alerting presents the finding to a human operator. The user-facing objective is to reduce the time between a fault occurring and someone understanding it.

The PDF explicitly asks for JSON input, Node.js, data checks, anomaly detection, an AI model API, database persistence, GET `/alerts`, UI, logging, batch handling, README and 5–10-minute walkthrough. It calls email reports optional. The prototype accepts **submitted** readings; it does not automatically poll external URLs. This is permitted by the assessment. Avoid claiming otherwise.

**One-sentence interview explanation:** “CarePulse converts API response metadata into validated observations, deterministic incident decisions, persistent alert state and operator-friendly explanations.”

## Lesson 2 — APIs, HTTP and JSON, explained simply

An API is an agreed way for programs to exchange information. A REST API usually uses HTTP verbs and URLs. A client sends a **request**; a server sends a **response**. The request can include a URL, method, headers and a body. The response includes an HTTP status, headers and content.

Example: `POST /monitor` with `Content-Type: application/json` and body `{ "api_name":"AppointmentAPI", "response_time_ms":5500, "status_code":500, "records_returned":0 }`. The monitoring backend parses this JSON into a JavaScript object and checks its values.

- `GET`: retrieve a resource, ideally with no side effect. Here, `GET /alerts` reads alerts.
- `POST`: submit data or execute a state-changing operation. Here, `POST /monitor` stores observations.
- HTTP 200: successful request; 201: resource created; 400: invalid input; 401: unauthenticated; 404: route/resource not found; 415: unsupported media type; 429: too many requests; 500: server failure; 503: service unavailable.
- JSON is text representing objects `{}`, arrays `[]`, strings, numbers, booleans and `null`. JSON keys and string values require double quotation marks.

**Two different status codes:** A monitoring *input* may report `status_code:500` from an upstream API, but the CarePulse `/monitor` ingestion request can still respond HTTP 200 because ingestion worked. Explain this distinction carefully.

**Exercise:** Why should malformed input return HTTP 400, not 500? Answer: the client sent invalid data; the monitoring server did not necessarily malfunction.

## Lesson 3 — Node.js and JavaScript execution

Node.js is a JavaScript runtime outside the browser. It executes server code, accesses local files/databases, opens HTTP sockets and uses event-driven nonblocking I/O. The **event loop** schedules callbacks when network/file operations complete. Network calls can be awaited rather than blocking the entire server's thread. SQL operations performed by synchronous SQLite APIs, however, do run on the main thread; high-throughput production versions should separate them or use worker infrastructure.

`const`, `let`, functions and objects in the project are ordinary JavaScript. `import`/`export` use ES modules because `package.json` sets `"type":"module"`. An `async` function always returns a Promise. `await` waits for a Promise's settlement within that function. A `try/catch` handles thrown exceptions and Promise rejections.

Important Node built-ins: `node:http` (HTTP server), `node:sqlite` (SQL persistence), `node:crypto` (UUID batch ID), `node:fs` (files) and `node:test` (tests). Node.js 22's `node:sqlite` currently prints an experimental warning; reviewers should have Node 22.16+ as stated in the README. Express is a popular framework built on Node's HTTP APIs; the assignment *recommends* it but does not mandate it. Native HTTP was selected here to eliminate external dependencies and make fundamentals visible.

**Exercise:** Name one reason to use Express in a bigger project: route parameters, middleware, authentication hooks and standardized error handling become more convenient.

## Lesson 4 — Requests, response and routing

Open `src/server.js`. `createServer(async (req,res)=>{...})` handles each request. The handler identifies the HTTP verb (`req.method`) and path (`new URL(...).pathname`), then dispatches to a route. `reply` serializes an object using `JSON.stringify` and sets `Content-Type: application/json`. Incoming JSON is read as body chunks before `JSON.parse`.

HTTP is stateless: individual requests do not automatically share memory. SQLite stores state for later retrieval. Every route should have predictable success and error responses. We return 400 on invalid payloads rather than allow the database or LLM to crash unexpectedly. `GET /health` tests that the server responds but does not prove upstream provider availability.

**Exercise:** What would happen if a user posts plain text to `/monitor`? The route requires JSON content-type and returns 415.

## Lesson 5 — Validation and batch processing

Validation protects business logic, the database and security boundaries. `src/validation.js` requires API names 2–100 safe characters, response time finite and nonnegative, valid HTTP code and a nonnegative integer record count when present. Missing counts are converted into `null` so they become a **data-quality alert**, not an immediate validation failure.

The API accepts one object or a batch array. `validateBatch` checks the entire array *before writing*: if item 3 is invalid, no observations from items 1 and 2 are inserted. The default cap of 100 elements prevents uncontrolled work and expensive LLM calls. Batches reduce per-request overhead but raise questions about partial success and ordering. This project chooses **all-or-nothing** semantics, stated openly in the documentation.

**Discussion prompt:** Would you accept partially valid records in production? It depends on the ingestion contract. A streaming monitoring collector may accept valid entries and quarantine bad ones. Here, atomic validation provides simpler and predictable assessment behavior.

## Lesson 6 — The actual anomaly rules

An anomaly is a measurement or event that violates an expected condition. This project's detector is **rule-based**, not a trained machine-learning model. Every received observation passes through `detectAnomalies` in `src/detection.js`.

| Input example | Trigger | Severity |
|---|---|---|
| HTTP 503 | `HTTP_5XX` | Critical |
| HTTP 404 | `HTTP_4XX` | High |
| 2,001 ms when threshold=2,000 | `SLOW_RESPONSE` | Warning |
| `records_returned: null` | `MISSING_RECORDS` | High |
| `records_returned: 0` | `ZERO_RECORDS` | Warning |
| HTTP 200, 120 ms, 50 records | No anomaly | Healthy |

An input may violate *multiple* rules: `500`, `5500ms`, `0 records` produces `HTTP_5XX`, `SLOW_RESPONSE`, `ZERO_RECORDS`, while its **overall incident** is Critical. The priority order is warning < high < critical.

**A subtlety:** Zero records can be normal for an empty search result. HTTP 304 may be normal in caching. Global thresholds create false positives. For an assessment we show straightforward specified cases; real endpoint-specific rules would avoid alerting on expected behavior.

## Lesson 7 — Thresholds, false positives and alert fatigue

A threshold is the boundary at which a rule fires. We chose a default slow-response boundary of 2,000 ms; the task did **not** prescribe a numerical boundary. It is an engineering assumption configurable using `SLOW_THRESHOLD_MS`. At exactly 2,000 ms, this implementation does **not** flag slowness; at 2,001 ms it does.

**False positive:** an alert fires but the API is behaving acceptably (e.g., zero records in a legitimate empty query). **False negative:** a harmful problem goes unnoticed (e.g., a very low but nonzero result count). Sensitivity increases with aggressive thresholds but may overload operators. In a production baseline, track endpoint latency distribution (p50/p95/p99), expected count bands, incident rate and severity. Use sustained-breach windows, hysteresis and grouping so minor spikes do not spam engineers.

For a set of latencies, the 95th percentile (p95) means approximately 95% of observed requests are at or below that latency. Example ordered values `[100, 120, 130, 140, 250, 300, 500, 800, 1500, 6000]`: the far tail is much slower than the median; an average alone hides this shape. Percentile calculations depend on the chosen sample interpolation convention.

## Lesson 8 — Database basics and SQLite

A **database** persists structured information beyond a program restart. In relational SQL databases, a table contains rows (records) and columns (attributes), and primary keys uniquely identify rows.

CarePulse stores two kinds of state:

- `observations`: every incoming API reading. This is the time-stamped audit evidence.
- `alerts`: incident summaries. Fields include severity, active/resolved status, first/last seen timestamps, occurrence count and source of alert text.

Key SQL statements:

```sql
SELECT * FROM alerts WHERE status='active' ORDER BY last_seen_at DESC;
SELECT api_name, COUNT(*) FROM observations GROUP BY api_name;
UPDATE alerts SET status='resolved', resolved_at='...' WHERE id=1;
```

Prepared statements use placeholders such as `WHERE id=?`, keeping values separate from SQL syntax and reducing SQL injection risk. SQLite is a lightweight file-based SQL database. It supports transactions, indexes and local persistence without a separate database server. PostgreSQL is a frequent replacement when many service instances and users write concurrently.

**Exercise:** Why have observations *and* alerts rather than only alerts? We need raw facts for diagnosis and time-series history, as well as a clean operator-oriented incident lifecycle.

## Lesson 9 — Transactions and ACID

ACID stands for **Atomicity, Consistency, Isolation, Durability**. Atomicity means either all changes in a transaction succeed, or none are applied. Consistency means database constraints remain satisfied. Isolation means concurrent operations do not create invalid intermediate states. Durability means committed data survives process termination subject to the database/storage guarantees.

`src/monitor.js` does `BEGIN IMMEDIATE`, inserts observations/updates alerts, then `COMMIT`; on error it does `ROLLBACK`. **Never keep a SQL transaction open while awaiting an external AI service**, because provider calls can take seconds and hold locks. CarePulse performs AI enrichment after committing the incident, so failures cannot erase detection evidence.

**Interview answer:** “I use a transaction for the short, deterministic write portion; AI enrichment is an eventually consistent update, guarded by an incident version.”

## Lesson 10 — Incident lifecycle and deduplication

A recurring fault should not generate hundreds of separate tickets. CarePulse groups active incidents per API. A partial unique index ensures only one active alert per API. If the same API is anomalous again, `occurrence_count` increases, the most recent metrics and message refresh, and first_seen remains unchanged. When a new *healthy* reading arrives, the active incident becomes `resolved`. Later anomalies open a **new incident**, preserving the original as history.

State diagram:

```text
No active incident --anomaly--> ACTIVE --healthy observation--> RESOLVED
                                       |                            |
                                  repeated anomaly            later anomaly
                                  updates count               creates NEW ACTIVE incident
```

Manual resolve is supported with `POST /alerts/:id/resolve`. It means an operator has closed the incident; if another anomalous reading arrives, a new incident appears. The database's partial unique index protects the active-state invariant even if application code has a bug.

## Lesson 11 — What an LLM is and why we use it

A Large Language Model (LLM) predicts/generates language based on learned parameters. For this assignment, it is useful for writing concise explanations that combine multiple signals and suggest a reasonable next investigation step. It is **not** given enough information to prove root cause, predict patient harm or diagnose any condition. The detector already knows *what* triggered; the model can improve communication.

A **prompt** is instructions and data sent to a model. CarePulse uses a fixed system prompt to request short, cautious operational alerts. It supplies a small JSON summary of the observation and triggered issue descriptions. It asks the model not to invent metrics, diagnoses or patient details. Different model calls can produce different wording, even at low temperature. Output should be grounded against source telemetry.

**Hallucination:** plausible but unsupported model statement. Example bad message: “AppointmentAPI is offline because its server disk is full.” We do not have disk evidence. Better: “AppointmentAPI returned HTTP 500 and zero records; possible upstream outage. Review upstream service logs.” Notice “possible”.

**Prompt injection:** malicious text included in untrusted data tries to override instructions. API names are restricted to safe characters, data is supplied as serialized telemetry, and the fixed prompt states input is data, not instructions. Production systems should additionally validate generated content and treat it as untrusted presentation.

## Lesson 12 — Real Gemini/OpenAI request mechanics

`src/llm.js` uses `fetch()` from the backend. With `AI_PROVIDER=gemini`, it sends JSON to Google's documented `models/{model}:generateContent` HTTP endpoint. Request headers include `Content-Type: application/json` and `x-goog-api-key`. The body contains `systemInstruction`, `contents`, and a generation configuration. In successful responses, model text is read from `candidates[0].content.parts`.

With `AI_PROVIDER=openai`, it uses the Chat Completions-compatible endpoint `POST /v1/chat/completions`, sends `Authorization: Bearer <key>`, a `model`, and `messages` with system and user instructions. The response is typically read from `choices[0].message.content`. Always verify your configured model is available to your account; provider offerings change.

**Never put provider API keys in browser JavaScript.** Use `.env` on the server and add `.env` to `.gitignore`. The demo uses `AI_PROVIDER=none` if no cloud key is configured. In that mode, the system uses an explicit **rules_template** label; if a configured provider fails, the fallback is labeled **rules_fallback**; only successful provider calls are labeled **llm_gemini** / **llm_openai**.

**Exercise:** How can a dashboard prove that AI was actually used rather than just say “AI alert”? Inspect the `message_source` field and demonstrate a successful provider request with a valid key.

## Lesson 13 — Concurrency, Promise, timeout and stale results

A Promise represents a future completion. `await fetch(...)` yields control while network activity proceeds. Batch enrichment uses up to four concurrent provider requests through `parallelLimit`. Why limit? To avoid saturating a provider, overwhelming quotas or creating a sudden cost spike. It is a concurrency cap, not a request-per-minute rate limiter.

`AbortSignal.timeout(7000)` cancels a provider call after seven seconds. The service falls back to deterministic wording on network problems or rejected provider calls. The incident is already in SQLite, so operations remain visible.

**Race condition:** response A and response B for the same API may overlap; an older AI result can finish after a newer observation. CarePulse stores `version` on the alert and only writes AI text with `WHERE id=? AND version=? AND status='active'`. This is optimistic concurrency control: a stale model response does not overwrite a newer state.

**Advanced nuance:** The code's per-record SQLite work is synchronous in one Node process, so it is not horizontally scalable as written. With multiple instances or high-frequency telemetry, use a centralized SQL database, message queue and worker concurrency.

## Lesson 14 — Frontend fundamentals

`web/index.html` defines the page structure. `web/styles.css` handles colors, cards, table layouts and mobile breakpoints. `web/app.js` handles state, HTTP fetching and DOM rendering.

`fetch('/api/summary')` retrieves JSON. `JSON.parse` converts text into objects when needed. `document.getElementById` locates UI elements. `textContent` safely sets plain text. Where the UI builds HTML strings for tables, it calls `escapeHTML` on user/model-derived text to reduce HTML injection/XSS risk.

The dashboard has overview cards, historical chart, alert filters, monitored APIs and JSON ingestion UI. It periodically refreshes every 8 seconds. **Polling** is repeated HTTP GET calls. **WebSockets** are persistent connections that can push events as they happen; this assessment does not need them. The dashboard has no fake health readings before a user submits inputs.

**Exercise:** Why label the chart “recorded days”? It groups days on which telemetry was actually received, not a continuous seven-day calendar even when there are gaps.

## Lesson 15 — Logging and observability

`src/logger.js` prints structured JSON lines with timestamp, severity, message and safe metadata. Logs help answer: what failed, when, which route, and for how long? Example log includes `time`, `level`, `message`, request path and `duration_ms`. Secrets should never appear in logs. The project applies a simple field-name-based filter; production redaction requires more comprehensive structured handling.

**Monitoring vs logging vs tracing:** Monitoring measures service behavior and creates signals; logs contain event descriptions; tracing follows a request across multiple components. A mature service uses all three. Common operational metrics: API error rate, p95 latency, anomaly detection volume, active incident count, age until recovery and LLM fallback rate.

**Exercise:** What would you check if no alerts appear? Verify JSON validation, the response values/threshold, `/monitor` response, SQLite file location, `/alerts` filter, and browser network/console logs.

## Lesson 16 — Testing strategies

**Unit test:** isolated function. In `tests/detection.test.js`, pass an HTTP 500 input and assert it creates a critical `HTTP_5XX` issue.

**Validation test:** incorrect status or malformed API name returns a ValidationError; `tests/validation.test.js` confirms boundary cases.

**Integration test:** multiple real modules interact with an in-memory SQLite database. `tests/integration.test.js` checks create/deduplicate/recover/reopen logic and ensures a malformed batch leaves no partial observations.

**End-to-end test:** starts the HTTP server, sends real requests and tests the browser. We ran a live HTTP smoke check in this environment. An attempted browser-based Playwright check in this sandbox was blocked by a restrictive browser policy and is **not a verified passing browser test**. Run the frontend manually on your Windows machine and capture screenshots yourself.

Testing the **real Gemini provider** requires an API key, availability and potentially billing. Never claim the provider call passed until `message_source` reports a successful LLM response.

## Lesson 17 — Security and healthcare privacy

Healthcare systems deserve special care. Data minimization means sending the smallest amount of data needed. We ask for API name, response time, status code and record count, not patient names, diagnosis, prescriptions, addresses or record contents. The LLM receives only aggregate metadata and triggered issue descriptions. Never send real patient information to a third-party LLM provider without an appropriate legal, contractual and security basis.

Security controls in this prototype: local-only binding by default, optional write API key, bounded batch/body sizes, validation, prepared SQL statements, simple secret-aware logging, security response headers and escaping model text in the UI. **These are not enough to claim HIPAA compliance, production readiness or complete privacy protection.** Production requirements include TLS, login/RBAC, audited access, encryption/key management, vendor/data agreements, audit trails, retention policies, rate limiting and deployment hardening.

**Interview caution:** API monitoring payloads may accidentally contain protected personal information in general; a real collector should proactively strip bodies and sensitive headers, not merely trust clients not to send them.

## Lesson 18 — How would you scale it?

In a larger organization, collector agents poll real APIs or consume gateway metrics. Telemetry flows into a queue or event stream such as RabbitMQ/Kafka. Backend workers validate, enrich metadata and store metrics/alerts in a centralized database. An anomaly engine uses per-API SLA thresholds, rolling-window baselines, incident grouping and suppression. Separate LLM workers process new actionable incidents asynchronously. The UI uses server-sent events or WebSockets for near-real-time updates. Pager/email channels send actionable notifications after deduplication/escalation.

Mention **idempotency keys**: if an HTTP client retries a POST after a network timeout, the same observation could be written twice. This prototype generates a new batch ID on every request, so it does **not** eliminate repeated submissions. A production client-provided event ID with a unique database constraint would fix this. Also acknowledge backpressure, retries with exponential backoff, rate limiting, queues, health checks, dashboards, and incident on-call ownership.

## Lesson 19 — Code walkthrough, file by file

Start at `src/server.js` for entry point, HTTP routes and body parsing. Follow `POST /monitor` to `src/monitor.js`: call `validateBatch`, compute detection for every observation, persist observation/incident records in a transaction, then optionally enrich with an LLM. Follow rules in `src/detection.js`; observe how severity is chosen. Read `src/db.js` for CREATE TABLE, indexes, `allAlerts` and summary queries. Open `src/llm.js` to inspect the exact prompt, provider payload and fallback. End at `web/app.js` for rendering and actions.

**If asked why not Python/Flask:** “The assessment specifies Node.js. I followed that requirement, implemented Node's native HTTP server with clear modules, and kept SQL and AI behind separate interfaces. A production team could also implement Express middleware without changing the underlying monitoring and detection modules.”

**If asked why not machine learning anomaly detection:** “The prompt specifically lists threshold and failure conditions. Transparent deterministic rules work better for those known policies, require no labeled training data, and are auditable. ML could be a later enhancement for seasonal patterns and learned baselines.”

## Lesson 20 — Interview questions and model answers

**Q1. Describe the project in 30 seconds.** It ingests API telemetry, validates it, checks deterministic anomaly rules, stores observations and incident history in SQLite, optionally enriches alerts via an LLM API and exposes them on a dashboard and REST endpoint.

**Q2. What is a REST API?** A resource-oriented HTTP interface where clients interact through standardized methods such as GET and POST, URLs, status codes and formats such as JSON.

**Q3. Why POST for /monitor?** The client submits new telemetry and changes server state. GET should not create observations.

**Q4. Why can upstream status_code=500 coexist with /monitor HTTP 200?** The former is the reported state of an external API; the latter means CarePulse accepted and processed the telemetry successfully.

**Q5. What does asynchronous mean?** Work can be started without blocking while an I/O operation is pending; `await` makes code readable while waiting for Promise settlement.

**Q6. Why Node.js?** It matches the assessment, works well with JSON and HTTP I/O, supports modular architecture and has a straightforward event-driven execution model.

**Q7. Why did you not use Express?** The instructions recommend, but do not require Express. Using native Node eliminates dependency installation and exposes routing fundamentals. Express would simplify middleware in a larger codebase.

**Q8. What makes a response anomalous?** Configured slow latency, HTTP errors or inconsistent record count. The issues are determined by auditable rules, not by model guesses.

**Q9. What is the default slow threshold?** 2,000 ms by engineering choice; it is configurable and triggers only above that value.

**Q10. What if an API returns 200 and 0 records?** CarePulse raises a zero-record warning per the assessment, but in production some endpoints legitimately return empty sets, so per-endpoint expectations are needed.

**Q11. Why use the highest-severity rule?** An observation can have multiple problems; one incident should emphasize the most urgent issue rather than generate redundant tickets.

**Q12. What does deduplication accomplish?** It updates one active incident per API with new occurrences instead of creating separate alerts for every failed observation.

**Q13. How does automatic resolution happen?** When a later healthy observation for the same API is processed, its active incident's status changes to resolved.

**Q14. What is a database index?** A data structure that speeds specific lookups and can enforce uniqueness; CarePulse has a partial unique index for one active alert per API.

**Q15. What is a SQL transaction?** A grouping of database changes committed together or rolled back together, protecting data consistency.

**Q16. Why not call LLM inside the transaction?** Network calls are slow/unreliable; holding locks that long hurts reliability. We first save the incident, then enrich the message asynchronously.

**Q17. How do you handle AI outages?** A seven-second timeout and deterministic fallback message; `message_source` clearly shows whether a provider generated the text.

**Q18. How do you prevent stale AI results?** The alert stores a version counter; a model response may update only the same active alert version that initiated the request.

**Q19. Why is AI useful if rules already detect anomalies?** It translates multiple technical signals into a concise operator-friendly explanation and suggests what to investigate, while deterministic rules remain authoritative.

**Q20. What is prompt injection?** Attempts within untrusted input to redirect the model from its intended instructions. We constrain names and tell the model to treat serialized telemetry as data.

**Q21. What is a hallucination?** A confident-sounding unsupported claim from a generative model; we request cautious wording and avoid declaring unobserved root causes.

**Q22. Where is your AI key stored?** In server-side environment variables, never frontend code or Git. `.env` is gitignored.

**Q23. How do you ensure confidentiality?** Only send API-level metrics to the model; do not send patient IDs, names, medical history or raw responses.

**Q24. Can you claim HIPAA compliance?** No. This is a local technical assessment with data-minimization design; production compliance needs legal, administrative, contract and technical controls.

**Q25. What does `npm test` test?** Pure anomaly logic and validation, plus actual SQLite incident lifecycle and batch atomicity without relying on a cloud AI key.

**Q26. What limitations would you fix first?** Real collectors/scheduler, endpoint-specific expectations, auth and secure deployment, idempotency keys, reliable queue/worker, PostgreSQL migration, and real LLM evaluation.

**Q27. What is an API rate limit?** A bound on how many calls may be made in an interval. Bounded concurrency is not the same as a per-minute rate limit.

**Q28. Why is polling every 8 seconds acceptable?** Simple and reliable at demo scale, with slight delay in UI updates. Push channels are better for large systems needing lower latency.

**Q29. How would you detect if an entire API stops responding?** A real collector would use a timeout and represent it as an explicit failure observation; the current system only processes provided readings, so a totally absent stream requires freshness monitoring not yet implemented.

**Q30. How would you demonstrate the complete workflow?** `npm start` -> dashboard -> load sample -> view 5 active incidents -> review source labels -> submit recovery JSON -> show resolved history -> `npm test` -> explain architecture and production improvements.

**Q31. What would you do if the LLM suggests a wrong cause?** Avoid acting automatically on it, show only observed metrics as facts, mark possible causes as hypotheses, add post-generation validation or human review for critical actions, and preserve raw evidence.

**Q32. What's the difference between HTTP status and health?** HTTP response code is one signal. A 200 with missing data or extreme latency may still indicate degraded service.

**Q33. Why separate the detector from the AI prompt?** It makes anomaly decisions explainable and unit-testable; it also reduces model dependency, latency, cost and drift.

**Q34. How can you improve incident grouping?** Use `(api, endpoint, anomaly category)` grouping, suppression windows and correlation IDs, rather than a single active issue for the entire API.

**Q35. What does `record_returned` mean?** The count of records reported by an upstream API response. Here the field name is `records_returned` (plural). It is an *input*, not independently computed by the monitor.

---

## Hands-on practice set with expected reasoning

**Practice A — Health check:** Submit `PatientDataAPI` with status=200, time=100ms, count=40. Expected: no active alert, observation still stored, healthy counter increases.

**Practice B — Server failure:** Submit `AppointmentAPI` with status=500, time=5,500ms, count=0. Expected: one critical active incident combining three issue codes; generated explanation describes evidence but not a certain cause.

**Practice C — Repeat the same failure:** Submit Practice B again. Expected: same active alert ID and increased occurrence count, not another active alert.

**Practice D — Recovery:** Submit same API with status=200, time=120ms, count=60. Expected: previous incident is resolved; the Resolved tab still displays history.

**Practice E — Invalid batch:** Submit `[validObject, {"api_name":"Bad","response_time_ms":-1,"status_code":800}]`. Expected: HTTP 400; no item from this batch saved.

**Practice F — AI integration:** With `AI_PROVIDER=gemini` and valid key, submit a fresh anomaly and check `message_source` is `llm_gemini`. If it is `rules_fallback`, inspect server logs, key, quota, selected model and provider response; never label it verified AI generation.

**Practice G — Explain code at a whiteboard:** Draw five boxes: Input -> Validation -> Detection -> Database -> AI enrichment and Alerts UI. Mark that the AI branch happens after commit, and that severity comes from deterministic rules.

**Practice H — Interview simulation:** Close this guide and explain the purpose of `src/validation.js`, `src/detection.js`, `src/db.js` and `src/llm.js` without looking. Then answer Q4, Q10, Q16, Q18 and Q24 out loud.

## Five-day learning sequence

- **Day 1: Core web basics.** Understand Lesson 1–5 and manually POST data.
- **Day 2: Algorithms and storage.** Understand Lesson 6–10, SQL and incident lifecycle; run tests.
- **Day 3: AI and concurrency.** Understand Lesson 11–13; verify real LLM only with your own key.
- **Day 4: UI, security, tests.** Understand Lesson 14–17; rehearse a failure-and-recovery demo.
- **Day 5: Architecture interview.** Study Lesson 18–20, record the video, and rehearse answering without reading a script.

## Final self-test (do not read the answers first)

1. Why should detection be deterministic instead of solely LLM-based?
2. What happens when a 500 response also takes 4,000ms and returns zero rows?
3. Why can an HTTP POST be successful when the reported external API failed?
4. How does your SQL design stop duplicate *active* incidents?
5. Why are external model calls outside SQL transactions?
6. What proves an alert was generated using the cloud LLM rather than a template?
7. What does a version check prevent?
8. How do you handle invalid input without partially saving a batch?
9. What is the limitation of responding only to manually submitted telemetry?
10. Why shouldn't production healthcare data be sent casually to an LLM provider?

**Answer key:** (1) auditability/reliability; (2) one critical incident with HTTP_5XX, SLOW_RESPONSE, ZERO_RECORDS; (3) ingestion success vs upstream failure; (4) partial unique index on active api_name; (5) avoid holding locks during slow networking; (6) verified `message_source=llm_gemini` or `llm_openai`; (7) late AI overwrite; (8) prevalidate all and use transaction; (9) cannot notice missing telemetry without collector/freshness tracking; (10) patient privacy, contractual and regulatory obligations.
