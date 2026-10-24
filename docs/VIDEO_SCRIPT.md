# Assessment walkthrough — 8–9 minutes

Show actual results and explain them in your own words. Keep secrets out of the recording.

| Time      | Demonstration and explanation                                                                                                                                                                                                                        |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:40 | Introduce CarePulse and the monitoring problem. Explain that observations are submitted metadata, not automatic remote URL polling.                                                                                                                  |
| 0:40–1:35 | Show the README architecture: browser → validation → deterministic rules → SQLite → optional AI → email. Explain why AI does not control detection.                                                                                                  |
| 1:35–2:30 | Open validation, detection and monitoring modules. Explain atomic batches, the highest severity, one active incident per API and occurrence counts.                                                                                                  |
| 2:30–3:45 | Select **Try sample data**. Show the five anomalous sample services, their evidence, source labels, priority list and service health. Add a healthy check through the ordinary form.                                                                 |
| 3:45–4:30 | Show JSON import and an invalid JSON error. Submit the recovery sample and show resolved history. Explain that manual resolution preserves the latest service metrics.                                                                               |
| 4:30–5:45 | Open Settings. Select Ollama or OpenAI and test the saved connection. Explain the native Ollama chat endpoint, backend-only secrets, bounded enrichment and fallback. Demonstrate an actual AI incident only with a provider that you have verified. |
| 5:45–6:35 | Show Email reports. Explain preview versus SMTP. View a report, create an active-incident summary and describe the recorded delivery status. Never claim a preview was emailed or SMTP acceptance proved inbox delivery.                             |
| 6:35–7:30 | Run unit tests and show browser/accessibility results. Explain the real loopback SMTP test and stale AI response test.                                                                                                                               |
| 7:30–8:30 | Discuss trade-offs: SQLite, a single process, synchronous post-commit enrichment, absent durable retries, local-only access and global thresholds. Describe production improvements.                                                                 |
| 8:30–9:00 | Point to setup instructions, the requirements matrix and AI disclosure. Confirm which integrations were verified in your recording.                                                                                                                  |

Do not open `.env` or saved `data/settings.json` while recording. Use synthetic service names and metrics. Submit a video within the required 5–10 minute range with working viewer permissions.
