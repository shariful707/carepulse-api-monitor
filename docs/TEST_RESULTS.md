# Test and Verification Record — 21 October 2026

Environment: containerized Linux, Node.js v22.16.0, npm 10.9.2, native Node `node:sqlite` (experimental warning emitted), no third-party npm dependencies. Test data is completely synthetic.

- `npm test`: **PASS — 21 tests, 0 failures**. These cover six detector tests, eight validation tests, four mocked Gemini/OpenAI/fallback adapter tests, and three SQLite integration tests. The mocked calls test request serialization, not provider connectivity.
- `npm run check`: **PASS** — Node syntax checks for backend and browser JS.
- Real HTTP `GET /health`: **PASS**, returned status `ok`.
- Real HTTP `POST /monitor` with 8 sample API observations: **PASS**, returned `received:8`, `anomalous:5`.
- Real HTTP `GET /alerts`: **PASS**, returned five active alerts; `AppointmentAPI` was critical with issue codes HTTP_5XX/SLOW_RESPONSE/ZERO_RECORDS and source `rules_template`.
- HTTP HEAD `/` after patch: HTTP response 200 with HTML content type (verified via curl).
- Browser-based automated Chromium/Playwright smoke: **NOT VERIFIED**, because this sandbox's Chromium returned `ERR_BLOCKED_BY_ADMINISTRATOR` when trying to navigate to the local server. UI code has been statically checked but must be run and visually checked on a personal computer. Do not claim a passing browser smoke test.
- External Gemini/OpenAI API: **NOT VERIFIED**, since no candidate-owned credentials are present in this environment. Provider adapters implemented; their success must be demonstrated with a valid key/account separately.
- External hosting, email sending, load tests, real patient data: **NOT ATTEMPTED**; outside prototype scope.

## Rerun on candidate Windows computer

1. Use Node 22.16+; copy `.env.example` to `.env`.
2. `npm test`, `npm run check`, and `npm start`.
3. Open `http://127.0.0.1:3000` in Chrome or Edge; confirm dashboard layout (desktop and mobile width).
4. Press **Load sample data**. Confirm exactly 5 alert observations in a fresh database.
5. Open Alert Center and confirm evidence, issue codes, severity and source labels.
6. Paste `samples/recovered-api.json` in Send Telemetry and submit. Confirm previously active alerts move to Resolved.
7. If the valid provider credentials exist, test an actual AI generated message and verify source label.
