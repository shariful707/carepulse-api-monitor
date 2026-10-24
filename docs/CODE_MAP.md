# Source code map

The application separates HTTP transport, input validation, detection, persistence and external integrations. Purpose comments describe important operations alongside the implementation.

| Module                 | Responsibility                                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/config.js`        | Load environment values, validate numeric limits and establish local defaults.                             |
| `src/validation.js`    | Normalize and validate every observation before a batch can write to the database.                         |
| `src/detection.js`     | Evaluate independent monitoring rules, combine priority and generate factual fallback text.                |
| `src/db.js`            | Create tables and indexes, enforce active-incident uniqueness and query reporting data.                    |
| `src/monitor.js`       | Coordinate transactional ingestion, incident updates, recovery, bounded AI enrichment and grouped reports. |
| `src/llm.js`           | Call OpenAI, Ollama or Gemini with aggregate telemetry; apply timeout and fallback handling.               |
| `src/settings.js`      | Validate editable configuration, persist server-side settings atomically and redact saved credentials.     |
| `src/email.js`         | Build plain-text reports, preview or deliver through SMTP and persist delivery outcomes.                   |
| `src/server.js`        | Route requests, bound request bodies, enforce write protection and serve approved static assets.           |
| `src/logger.js`        | Emit structured events while filtering sensitive field names.                                              |
| `web/index.html`       | Define semantic views, navigation and labeled forms.                                                       |
| `web/styles.css`       | Define visual tokens, responsive layouts, keyboard focus and reduced-motion behavior.                      |
| `web/app.js`           | Coordinate browser actions, API requests, polling, rendering and user feedback.                            |
| `scripts/check.js`     | Parse-check application, browser and test JavaScript without executing it.                                 |
| `scripts/send_demo.js` | Submit synthetic anomaly or recovery fixtures to a running server.                                         |
| `tests/`               | Verify rules, persistence, integrations, authorization, SMTP and browser workflows.                        |

See [architecture](ARCHITECTURE.md) for data flow and design decisions, [API reference](API_REFERENCE.md) for request contracts, and [test results](TEST_RESULTS.md) for verification evidence.
