# CarePulse — Intelligent API Monitoring & Alert System

> Care Guide technical assessment · Node.js REST API + SQLite + optional Gemini/OpenAI LLM + responsive frontend

CarePulse ingests API response metadata, detects failures/latency/data-quality issues using transparent deterministic rules, persists incidents in SQLite, and optionally asks an LLM API to generate operationally useful alert descriptions. **This is a demonstrable technical assessment prototype, not an audited production healthcare system.** All examples are synthetic. No patient records are sent to any AI provider.

## Quick start (Windows 10/11, macOS, Linux)

**Prerequisite:** Node.js **22.16.0 or newer** with the built-in `node:sqlite` module (tested using Node.js 22.16.0). Node.js 22 displays an experimental SQLite warning. No `npm install` or third-party dependency is required.

```powershell
# Windows PowerShell, inside the extracted project folder
node --version
Copy-Item .env.example .env
npm test
npm start
```

Open **http://127.0.0.1:3000** in your browser. In a second terminal, `npm run demo` submits the sample batch; `npm run recover` demonstrates automatic resolution. Click **Load sample data** to run the full pipeline. You can also go to **Send telemetry** to paste JSON or import `samples/api-responses.json`.

```bash
# macOS/Linux
cp .env.example .env
npm test
npm start
```

For automatic restart while editing: `npm run dev`. Stop the server with `Ctrl+C`.

### Enable real AI-generated alerts

Default: `AI_PROVIDER=none` — the project works without credentials, and the UI labels alerts as **rules-based explanations**. To demonstrate actual AI integration:

1. Create a Gemini API key at https://aistudio.google.com/apikey.
2. Edit `.env`: set `AI_PROVIDER=gemini` and `GEMINI_API_KEY=your_actual_key`.
3. Keep `GEMINI_MODEL=gemini-3.8-flash` or choose an available model shown in your Google AI account. Model availability and billing can vary.
4. Restart `npm start`, send **new anomaly data**, and view the alert's `message_source`. `llm_gemini` indicates a successful AI response; `rules_fallback` indicates a failed provider call.
5. Alternative: `AI_PROVIDER=openai`, `OPENAI_API_KEY=...`, and a compatible `OPENAI_MODEL`.

**Never commit `.env` or expose an API key in a screenshot, README, repository, or demo video.** The backend is the only component that calls the LLM provider. The browser never sees API secrets.

## Functional specification

- `POST /monitor`: accepts one observation or an array (up to 100 by default), validates all items before storing anything, runs detection, creates/updates active incidents, and resolves incidents following a healthy new observation.
- `GET /alerts`: returns active incidents by default; supports `?status=active|resolved|all&limit=100`.
- `POST /alerts/:id/resolve`: manually close a specified active incident; the next anomalous sample can open a new incident.
- `GET /api/summary`: dashboard counts, current API state, last seven distinct recorded calendar days.
- `GET /api/observations?limit=30`: observation history for diagnosis.
- `GET /health`: service status; no stored data.
- `/`: responsive dashboard with filters, anomaly details, chart, API table, JSON import and sample actions.

### Required input

```json
[
  {"api_name":"PatientDataAPI","response_time_ms":1200,"status_code":200,"records_returned":50},
  {"api_name":"AppointmentAPI","response_time_ms":5500,"status_code":500,"records_returned":0}
]
```

**Validation:** `api_name` 2–100 safe characters; response time between 0 and 3,600,000 milliseconds; integer HTTP code 100–599; record count nonnegative integer or `null`/absent (flagged as missing). A malformed batch returns HTTP 400 without partially saving it.

### Detection logic

| Rule | Condition | Alert code | Severity |
|---|---|---|---|
| Server error | HTTP 500–599 | `HTTP_5XX` | Critical |
| Client error | HTTP 400–499 | `HTTP_4XX` | High |
| Unexpected redirect | HTTP 300–399 | `HTTP_3XX` | Warning |
| High latency | `response_time_ms > SLOW_THRESHOLD_MS` | `SLOW_RESPONSE` | Warning |
| Missing record count | `records_returned == null` | `MISSING_RECORDS` | High |
| Zero records | `records_returned === 0` | `ZERO_RECORDS` | Warning |

The most severe triggered condition determines an incident's priority. Multiple anomalies in one observation are combined into one active incident per API. Repeated anomalies increment `occurrence_count`; a healthy observation automatically resolves the API's active incident. The database retains prior incidents for history.

**Important trade-off:** Zero records and redirects may be legitimate for some APIs. Production systems need endpoint-specific expectations and status policies; these simple rules intentionally follow the assessment's requested cases.

## API examples

PowerShell:

```powershell
$body = Get-Content .\samples\api-responses.json -Raw
Invoke-RestMethod -Uri 'http://127.0.0.1:3000/monitor' -Method Post -ContentType 'application/json' -Body $body
Invoke-RestMethod -Uri 'http://127.0.0.1:3000/alerts?status=active'
```

macOS/Linux:

```bash
curl -X POST http://127.0.0.1:3000/monitor \
  -H 'Content-Type: application/json' --data-binary @samples/api-responses.json
curl 'http://127.0.0.1:3000/alerts?status=active'
```

Send the recovery sample to demonstrate incident resolution:

```powershell
$recovered = Get-Content .\samples\recovered-api.json -Raw
Invoke-RestMethod 'http://127.0.0.1:3000/monitor' -Method Post -ContentType 'application/json' -Body $recovered
```

## Architecture

```text
Browser dashboard (HTML/CSS/JS, no CDN)
         | REST/JSON via fetch()
Node.js HTTP server   ── GET /alerts, /api/summary, /health
         |
 POST /monitor -> validation -> pure anomaly detection
         |                         |
         +---------------> SQLite observations + active incidents
                                      |
                          Optional Gemini/OpenAI HTTP API
                                      |
                         Alert text + explicit provenance
```

Source modules:

- `src/server.js` — HTTP routing, request/response, static assets, security headers.
- `src/config.js` — environment-driven settings.
- `src/validation.js` — shape/range/type checks (HTTP 400).
- `src/detection.js` — deterministic anomaly rules and fallback messages.
- `src/db.js` — SQLite schema, indexes, reporting queries.
- `src/monitor.js` — batch orchestration, database transaction, deduplication, recovery and bounded AI concurrency.
- `src/llm.js` — Google Gemini / OpenAI JSON-over-HTTPS integration, provider timeout, fallback and model prompt.
- `src/logger.js` — structured JSON log messages with basic secret-field redaction.
- `web/` — complete accessible-ish, responsive monitoring interface.
- `tests/` — Node.js built-in unit and integration test runner.
- `docs/` — architecture, interview preparation, demo outline, and AI disclosure.

## Testing

Run `npm test` to execute deterministic tests; they do not call external AI services. Tests include healthy data, HTTP failures, 2-second latency boundary, zero/missing data, batch validation/atomicity, incident deduplication, recovery/reopening, and manual resolution. `npm run check` validates JS parsing.

**Verified in the development environment on 21 Oct 2026:** unit/integration suite 21/21 passed; live `POST /monitor` processed 8 synthetic observations and detected 5 anomalous observations, and `GET /alerts` returned 5 active incidents. The frontend JavaScript passed syntax checks, but browser automation was blocked by a sandbox browser policy; see `docs/TEST_RESULTS.md` and run a visual check on your own computer.

**Not verified with a real provider key:** Gemini/OpenAI production response, provider usage charges, external hosting, and operational load tests. AI fallback is implemented but a successful cloud call must be tested with your own key before interview claims of live cloud integration.

## Privacy, reliability and production gaps

- Only aggregate telemetry metadata goes to the AI API, no health record content; this is important in a medical-services environment.
- Default server binds to `127.0.0.1` only. Set `MONITOR_API_KEY` for an optional write API key. It is **not** a comprehensive authentication/authorization system; do not expose the prototype directly on the public internet or claim HIPAA compliance.
- SQLite WAL provides simple local persistence; a multi-instance deployment should migrate to PostgreSQL and use a queue for LLM enrichment.
- Alerts are generated from *submitted observations*, not automatic polling of external hosts. Real automatic polling requires an external scheduler/collector and secure credentials; the assessment allows JSON or POST input.
- LLM call timeout is seven seconds; failure falls back to accurate template-based text. AI doesn't control detection or alert severity.
- No email integration: the assessment labels anomaly email reports optional.
- Dashboard auto-refreshes every eight seconds via polling (not WebSockets).

## Submission

Upload this source to your own GitHub repository. Record a **5–10 minute** walkthrough explaining architecture, detection, AI, database, and UI. Put the video in a shareable cloud folder. If AI was used for development, include `AI_Prompts.docx` as explicitly required. Use Reply All to the original recruitment email, keeping apply@careguidebd.com among the recipients. See `docs/SUBMISSION_CHECKLIST.md`.

## Authorship and learning

This prototype was produced with AI coding assistance based on the candidate's supplied technical assessment. Candidates must review, run, understand, and accurately disclose any assistance. Do not claim production deployment, clinical validation, real API integrations, or successful live LLM generation unless separately verified.
