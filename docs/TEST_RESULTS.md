# Test and verification record — 24 October 2026

Environment: Windows, Node.js **24.19.0**, npm, native `node:sqlite`, installed Google Chrome launched through Playwright. All test inputs and screenshots use synthetic API metadata.

| Check                   | Result                             | What it proves                                                                                                                           |
| ----------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`         | Pass — 23 JavaScript files         | Backend, browser, scripts and tests parse successfully                                                                                   |
| `npm test`              | Pass — 36 tests                    | Detection boundaries, batch validation, incident lifecycle, stale AI writes, settings, secrets, reports, authorization and SMTP behavior |
| `npm run test:browser`  | Final run recorded below           | Desktop/mobile forms, sample analysis, resolution, filters, reports, settings and failure feedback                                       |
| Automated accessibility | Six views at desktop/mobile widths | WCAG-tagged axe checks at the final resting state; not a complete manual accessibility audit                                             |
| Local Ollama call       | Pass — installed `llama3.2:3b`     | Real native `/api/chat` request returned `llm_ollama` text                                                                               |
| Real loopback SMTP      | Pass                               | Nodemailer serialized and delivered a message to a local test sink                                                                       |
| `npm run format:check`  | Final run recorded below           | Consistent source/document formatting                                                                                                    |

## Live integration evidence

The local Ollama adapter was called with synthetic `ConnectionTestAPI` metadata: HTTP 500, 5,500 ms and zero records. It returned source `llm_ollama` and this explanation:

> Alert: ConnectionTestAPI - Possible server-side issue. API returned 500 status code and 0 records, with response time exceeding threshold (5500 ms). Investigation step: Verify server logs for recent errors or issues.

The SMTP integration test creates a real loopback TCP server, accepts Nodemailer's SMTP dialogue and confirms recipient and service content. It does not send mail to an external address. Other email tests inject success/failure transports to verify persistence and deduplication.

Cloud adapter tests verify request shape, authorization headers, response parsing and fallback with test doubles. A separate HTTP test starts an isolated write-protected server to verify authorization and redacted settings responses.

## Limitations

- Live OpenAI and Gemini calls were not attempted with a personal key.
- External SMTP authentication, real inbox delivery and provider-specific account policies were not verified.
- Node.js 22 and Linux are configured in CI but were not executed locally in this Windows revision. Check the actual GitHub Actions result after publication.
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
