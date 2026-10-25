# Test and verification record — 25 October 2026

Environment: Windows, Node.js **24.19.0**, npm, native `node:sqlite`, installed Google Chrome launched through Playwright. All test inputs and screenshots use synthetic API metadata.

| Check                   | Result                             | What it proves                                                                                                                           |
| ----------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`         | Pass — 23 JavaScript files         | Backend, browser, scripts and tests parse successfully                                                                                   |
| `npm test`              | Pass — 37 tests                    | Detection boundaries, batch validation, incident lifecycle, stale AI writes, settings, secrets, reports, authorization and SMTP behavior |
| Browser suite           | Pass — 12 tests                    | Desktop/mobile forms, sample analysis, resolution, filters, reports, settings, failure feedback and latest-service-health behavior       |
| Automated accessibility | Six views at desktop/mobile widths | WCAG-tagged axe checks at the final resting state; not a complete manual accessibility audit                                             |
| Local Ollama call       | Pass — installed `llama3.2:3b`     | Live connection test and persisted `DemoAIAPI` incident returned `llm_ollama` text during the UI walkthrough rehearsal                   |
| Real loopback SMTP      | Pass                               | Nodemailer serialized and delivered a message to a local test sink                                                                       |
| Published-source format | Pass                               | Application source and published documentation pass Prettier; unrelated local preparation files are outside this check                   |

## Live integration evidence

The 25 October UI revision passed all 37 backend tests and the 23-file syntax check. All 12 browser scenarios passed with a clean runner exit in 34.8 seconds using installed Chrome and a separately started in-memory server. A temporary local Playwright config selected that server; the test cases and desktop/mobile projects were unchanged. The standard server-managed run also completed its 12 test cases successfully but waited during Windows process teardown in the restricted execution environment and was interrupted. The separate-server run verified successful suite completion without changing the checked-in test configuration.

Visual review covered 1440, 768, 390 and 320-pixel widths. The tablet review caught navigation overflow, which was corrected by switching to a three-column navigation grid below 900 pixels. The service-health regression verifies the calculated percentage, its progress control, the Services shortcut and browser Back, the unchanged health after manual resolution, and the improvement after a healthy observation. See the [design notes](DESIGN_NOTES.md).

The complete video sequence was rehearsed against a separate empty in-memory database: eight sample checks, manual resolution without a false health improvement, ordinary form input, malformed JSON, POST recovery, nine healthy services, a live Ollama connection test, a persisted `DemoAIAPI` incident with `llm_ollama` provenance, and a saved report preview. No external email was sent. A full-folder formatting check also sees an unrelated ignored local preparation document with existing formatting differences; the application and published documents pass the scoped check.

Earlier verification on 24 October: the local Ollama adapter was called with synthetic `ConnectionTestAPI` metadata: HTTP 500, 5,500 ms and zero records. It returned source `llm_ollama` and this explanation:

> Alert: ConnectionTestAPI - Possible server-side issue. API returned 500 status code and 0 records, with response time exceeding threshold (5500 ms). Investigation step: Verify server logs for recent errors or issues.

The SMTP integration test creates a real loopback TCP server, accepts Nodemailer's SMTP dialogue and confirms recipient and service content. It does not send mail to an external address. Other email tests inject success/failure transports to verify persistence and deduplication.

Cloud adapter tests verify request shape, authorization headers, response parsing and fallback with test doubles. A separate HTTP test starts an isolated write-protected server to verify authorization and redacted settings responses.

## Limitations

- Live OpenAI and Gemini calls were not attempted with a personal key.
- External SMTP authentication, real inbox delivery and provider-specific account policies were not verified.
- The earlier implementation commit `a30261e` passed the Linux GitHub Actions matrix on Node.js 22 and 24: [earlier CI run](https://github.com/shariful707/carepulse-api-monitor/actions/runs/40074795727). That run does not verify the 25 October UI revision. Current-revision CI status must be checked after publication. Local verification used Windows and Node.js 24.19.0.
- No load test, crash-recovery queue, production deployment or real patient data was used.
- Automated accessibility scans do not replace manual keyboard, screen-reader and usability testing.

The original 21 October verification record described a different environment and a blocked browser attempt. This record supersedes it for the current revision.

## Reproduce

```sh
npm ci
npm run check
npm test
npx playwright install chromium
npm run test:browser
npm run format:check
```

For installed Chrome on Windows, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` as shown in the README. The browser server uses an in-memory database and ignored test settings; it does not change the normal workspace database.
