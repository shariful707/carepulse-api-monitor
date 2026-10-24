# API reference

Base URL: `http://127.0.0.1:3000`. JSON responses use `Cache-Control: no-store`. Every POST route requires `x-api-key` when `MONITOR_API_KEY` is configured. Browser writes must be same-origin. Read routes are not authenticated; keep the default local binding.

## Monitoring and incidents

### `POST /monitor`

Send `Content-Type: application/json` with one object or up to `MAX_BATCH_SIZE` objects, default 100. The body must not exceed 1 MiB. Invalid batches return 400 before any write.

```json
{
  "api_name": "AppointmentAPI",
  "response_time_ms": 5500,
  "status_code": 500,
  "records_returned": 0
}
```

Fields: service name is 2–100 letters, digits, spaces, dots, underscores or hyphens; response time is a finite number from 0 to 3,600,000; HTTP status is an integer from 100 to 599; record count is a nonnegative safe integer or missing/null. Missing counts are retained as null to generate a missing-data incident. Other payload fields are ignored and never sent to AI.

Example response on a fresh database in preview mode:

```json
{
  "batch_id": "generated-uuid",
  "received": 1,
  "anomalous": 1,
  "processed": [
    {
      "api_name": "AppointmentAPI",
      "observation_id": 1,
      "anomalous": true,
      "severity": "critical",
      "issues": ["HTTP_5XX", "SLOW_RESPONSE", "ZERO_RECORDS"],
      "alert_id": 1,
      "status": "alert"
    }
  ],
  "email": [{ "id": 1, "status": "preview" }]
}
```

The SQL transaction commits before optional AI/email work. A caller disconnect does not undo stored telemetry. A retried POST is not guaranteed idempotent. Four AI workers share the configured batch time budget; monitoring remains available with labeled fallback text.

### `GET /alerts?status=active&limit=100`

`status`: `active`, `resolved`, or `all`. `limit`: integer 1–500. Returns `{alerts, status, count}` ordered by active state, priority and recent activity. Each alert includes metrics, issue descriptions, timestamps, occurrence count, status, severity and `message_source`:

| Source                                   | Meaning                                                               |
| ---------------------------------------- | --------------------------------------------------------------------- |
| `llm_openai`, `llm_ollama`, `llm_gemini` | Provider generated the stored explanation                             |
| `rules_template`                         | Built-in explanation; no provider call succeeded or was requested yet |
| `rules_fallback`                         | AI failed, timed out or exhausted the batch budget                    |

### `POST /alerts/:id/resolve`

Returns `{result:"resolved"}` or `{result:"already_resolved"}`. Missing incident: 404 with `{result:"not_found"}`. Manual resolution does not alter the latest service observation.

### `GET /api/summary`

Returns `{alerts, observations, health, trend}`. `health` uses the newest observation per service. `trend` contains at most seven **recorded UTC days**, which may be nonconsecutive. Observation totals and average latency cover the full stored history.

### `GET /api/observations?limit=30`

Returns `{observations:[...]}` newest first; limit 1–200.

### `GET /health`

Returns service identity, `status:"ok"`, current provider and UTC timestamp. This checks the app, not upstream provider readiness.

## Settings and AI

### `GET /api/settings`

Returns editable AI/email fields, thresholds, batch limit and readiness flags: `openaiKeySet`, `geminiKeySet`, `smtpPasswordSet`, `writeKeyRequired`. Saved credentials and the write key are omitted.

### `POST /api/settings`

Accepts a partial update. Unknown fields are rejected. Supported fields:

- `provider`: `none`, `openai`, `ollama`, `gemini`.
- `openaiModel`, `openaiKey`, `geminiModel`, `geminiKey`.
- `ollamaBaseUrl`: HTTP(S) origin without credentials, path, query or fragment; `ollamaModel`.
- `emailMode`: `off`, `preview`, `smtp`; single-address `emailTo`, `emailFrom`.
- `smtpHost`, `smtpPort`, `smtpSecure`, `smtpRequireTLS`, `smtpUser`, `smtpPassword`.

Empty secret strings preserve existing credentials. There is no browser endpoint to reveal saved secrets or change the write key. Returns the same redacted shape as GET. Settings are written atomically to the configured server-side settings file and affect future batches.

### `POST /api/integrations/test-ai`

Calls the saved provider with synthetic failure metrics without storing an observation or incident. Cloud calls may incur usage charges. Returns `{message,source}` on real provider success, 400 for rules-only mode, or 502 on provider failure. A fallback is never labeled as successful connectivity.

## Email

### `GET /api/email/deliveries`

Returns `{deliveries:[...]}`, newest 30 first, including recipient, subject, timestamps, status and a safe error message. Status: `preview`, `sent`, `failed`, or briefly `pending` during delivery.

### `POST /api/email/report`

Creates a report of all currently active incidents to the configured recipient. Returns `{id,status}` or `{status:"empty"}` / `{status:"disabled"}`. Delivery failure returns HTTP 200 with `{id,status:"failed",error}` because the report itself was created and recorded. Inspect `status` to determine delivery outcome. Each manual request creates a new report.

### `GET /api/email/deliveries/:id/preview`

Returns `{subject,body}` with plain-text report content or 404. Previewing an existing report never sends email.

## Error contract

Most errors: `{error:"Human-readable explanation",details:[]}`. Status codes: 400 validation, 401 missing/invalid write key, 403 cross-origin write or forbidden static path, 404 missing resource, 415 wrong monitoring body type, 500 unexpected server error, 502 failed AI connectivity test. Stack traces, saved passwords and provider response bodies are not returned.
