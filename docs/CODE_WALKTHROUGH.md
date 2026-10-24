# Code walkthrough

The code includes purpose comments alongside important operations and at module/function boundaries. Formatting expands dense original statements so the flow is easier to study. Comments explain intent; they do not change execution.

| File                | What to understand                                                                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/config.js`     | Load `.env`, validate numeric limits and establish safe local defaults. Environment values seed editable integration settings.                                  |
| `src/validation.js` | Reject invalid observations before SQL, and preserve missing record counts as null so detection can flag them.                                                  |
| `src/detection.js`  | Apply independent rules, combine all issues, choose the highest priority, and build a factual fallback.                                                         |
| `src/db.js`         | Create additive tables and indexes, join incidents to metrics and separate history from latest health. SQL comments describe stored fields and constraints.     |
| `src/monitor.js`    | Validate, transact, deduplicate, recover, then enrich outside the transaction. Version checks prevent stale asynchronous writes. Group new incidents for email. |
| `src/llm.js`        | Serialize only safe telemetry, invoke each provider, enforce a timeout and preserve truthful message provenance.                                                |
| `src/settings.js`   | Validate editable fields, preserve blank secrets, atomically persist local settings and return a redacted public view.                                          |
| `src/email.js`      | Build a plain-text report, claim a digest identity, preview or send, and persist the outcome without losing incidents.                                          |
| `src/server.js`     | Route HTTP requests, bound input, reject cross-origin writes, enforce the optional key and serve only approved static file types.                               |
| `src/logger.js`     | Emit structured events and omit sensitive field names. Call sites also avoid unsafe provider and SMTP body text.                                                |
| `web/index.html`    | Semantic landmarks, labeled forms, progressive disclosure and named views.                                                                                      |
| `web/styles.css`    | Color/spacing tokens, flat panels, responsive navigation and reduced-motion behavior.                                                                           |
| `web/app.js`        | Render escaped evidence, coordinate actions and refreshes, hydrate settings without exposing saved keys, and show failures clearly.                             |
| `scripts/`          | Send synthetic samples, parse-check all JavaScript and generate the required Word disclosure using Python's standard library.                                   |
| `tests/`            | Test rules, persistence, provider serialization, secrets, reports, real loopback SMTP and browser workflows.                                                    |

A useful study sequence is validation → detection → database → monitoring → provider/email adapters → HTTP → browser. Run `npm test` while reading the lifecycle tests, then use the sample and recovery controls to see the same behavior in the interface.
