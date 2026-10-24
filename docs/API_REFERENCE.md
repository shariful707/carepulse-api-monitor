# API Contract — CarePulse

Base address: `http://127.0.0.1:3000`

## POST /monitor

`Content-Type: application/json`. Accepts a JSON object or an array of 1–100 objects. The required keys are `api_name`, `response_time_ms`, and `status_code`; `records_returned` can be absent or null, resulting in a missing-record anomaly.

Request:

```json
{"api_name":"AppointmentAPI","response_time_ms":5500,"status_code":500,"records_returned":0}
```

Representative shape of response:

```json
{
  "batch_id":"<generated-uuid>",
  "received":1,
  "anomalous":1,
  "processed":[{
    "api_name":"AppointmentAPI",
    "observation_id":1,
    "anomalous":true,
    "severity":"critical",
    "issues":["HTTP_5XX","SLOW_RESPONSE","ZERO_RECORDS"],
    "alert_id":1,
    "status":"alert"
  }]
}
```

## GET /alerts

Supports `status=active|resolved|all` and `limit=1..500`. Response: `{ "alerts": [...], "status": "active", "count": 1 }`. Each alert includes issue descriptions, observation metrics, timestamps, severity, occurrence count and `message_source` such as `llm_gemini`, `llm_openai`, `rules_template`, or `rules_fallback`.

## POST /alerts/:id/resolve

Closes active incident. Responds `{ "result": "resolved" }`, `{ "result": "already_resolved" }`, or a 404 `{ "result": "not_found" }`.

## GET /api/summary

Returns `{ alerts: {...}, observations: {...}, health: [...], trend: [...] }` for the dashboard. `trend` groups observations by UTC calendar day and includes at most seven **recorded days**, not necessarily the latest seven continuous days.

## GET /api/observations

Returns the newest stored observations; query `limit` integer from 1 to 200.

## GET /health

Basic service status and configured AI provider; does not verify the upstream LLM provider.

## Common error responses

`400` input invalid; `401` invalid/missing write key if enabled; `404` unknown route/incident; `415` wrong body type; `500` unexpected server problem. All errors are JSON; avoid leaking stack traces to clients.
