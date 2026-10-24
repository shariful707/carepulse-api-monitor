# 7–8 Minute Assessment Walkthrough — Video Storyboard

Timing is approximate; speak naturally, demonstrate the actual browser, and do not falsely claim that live Gemini was verified if you have only used fallback mode.

**0:00–0:35 — Introduction.** “Hello, this is CarePulse, my solution for Care Guide's Intelligent API Monitoring and Alert System assessment. The system ingests API response telemetry, detects failures and data issues, records incidents in SQLite, and creates human-readable alerts with a configurable LLM API.”

**0:35–1:25 — Architecture.** Open the `README.md` diagram or `docs/ARCHITECTURE.md`. Show browser -> native Node HTTP backend -> validation -> deterministic rules -> SQLite -> optional LLM. Explain why the LLM is not responsible for detecting anomalies.

**1:25–2:30 — Code structure.** Open `src/validation.js`, `src/detection.js`, `src/monitor.js`, `src/db.js` and `src/llm.js`. Explain batch validation, severity, incident lifecycle, transactional writes, short LLM timeout and honest fallback provenance.

**2:30–4:10 — Frontend demonstration.** Open dashboard. Click Load sample data. Show active alerts, severity, API status, explanation and the AI/template source tag. Open Send telemetry and insert a custom JSON sample. Show a rejected malformed input and that it does not partially insert data.

**4:10–5:10 — Incident resolution.** Submit `samples/recovered-api.json`; demonstrate that healthy readings automatically resolve existing incidents. Open the Resolved filter to show historical records. Explain occurrence-count deduplication.

**5:10–6:05 — AI integration.** Open `src/llm.js` and `.env.example`. Describe the Gemini REST API request, telemetry-only payload, system prompt and seven-second timeout. If a real API key is configured and verified, submit a new anomaly to show `llm_gemini`. Otherwise say clearly: “Today I am demonstrating deterministic fallback; the cloud LLM adapter is implemented but not live-verified in this recording.”

**6:05–6:50 — Testing.** Run `npm test`. Identify tests for HTTP 500, latency threshold, missing records, batch atomicity, recovery and reopening.

**6:50–7:35 — Trade-offs and future work.** “For a lightweight assessment, I used dependency-free Node.js, SQLite and a vanilla JavaScript dashboard. In production I would add collectors, a message queue, PostgreSQL, authentication, per-endpoint baselines, retries, metrics and stronger privacy controls.”

**7:35–8:00 — Summary.** “The prototype demonstrates the full ingestion-to-alert lifecycle, clear system boundaries, resilient AI enrichment and explainable monitoring. Thank you for reviewing my assessment.”

## Recording preparation

Set the browser zoom so text is readable; keep terminal and dashboard windows clean; do not display `.env` API keys. Ensure recorded system time and actual output are correct. Use clear voice and keep the video within the required 5–10 minutes. Save the file as `CarePulse_Assessment_Demo.mp4` and upload to a shareable Drive folder.
