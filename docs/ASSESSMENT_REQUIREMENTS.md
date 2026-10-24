# Assessment coverage

Source reviewed: the supplied six-page **Technical Interview Task — Intelligent API Monitoring & Alert System**. The original recruitment PDF stays local and is excluded from publication; this matrix describes the implementation without reproducing the brief.

| Requirement                       | Implementation                                                                  | Evidence                                          |
| --------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------- |
| Accept JSON files or POST inputs  | Simple form, JSON import, `POST /monitor`                                       | Browser form/import tests; batch validation tests |
| Evaluate response time and status | Configurable threshold and HTTP rules                                           | `src/detection.js`; boundary tests                |
| Detect missing or zero records    | Missing/null and zero are separate rules                                        | Detection and validation tests                    |
| Generate readable LLM alerts      | OpenAI, native local Ollama, retained Gemini adapter                            | Adapter tests; live Ollama verification           |
| Persist anomalies in a database   | SQLite observations, incident history, delivery history                         | Integration tests                                 |
| Fetch active anomalies            | `GET /alerts`, active by default                                                | HTTP and incident lifecycle tests                 |
| Clean, user-friendly frontend     | Responsive workspace, named tabs, ordinary input form, clear states             | Desktop/mobile browser and accessibility checks   |
| Optional email anomaly reports    | Local previews, SMTP, new-incident batch digest, manual active-incident summary | Email tests and real loopback SMTP transport test |
| Process multiple APIs efficiently | Atomic batches, four bounded AI workers, batch time budget, grouped email       | Batch/integration tests                           |
| Error handling and logs           | Validation errors, AI fallback, persisted mail errors, structured JSON logs     | Failure-path tests                                |
| Source and setup documentation    | README, API reference, architecture, CI workflow                                | Repository files                                  |
| AI prompt disclosure              | Markdown source and generated `AI_Prompts.docx`                                 | `npm run docs:prompts`                            |
| 5–10 minute explanation video     | Walkthrough script included                                                     | Candidate still records and shares the video      |

The brief allows submitted telemetry; automatic polling of arbitrary external URLs is outside this implementation. Rules run automatically when checks arrive. AI only writes explanations and does not decide whether an incident exists.

Before submission, record the video, review the disclosure document, publish the repository, and share the requested links in the original recruitment email thread. Those deliverables cannot be replaced by passing automated tests.
