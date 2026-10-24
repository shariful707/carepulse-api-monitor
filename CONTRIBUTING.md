# Contributing

Use Node.js 22.16+ and install the locked dependencies with `npm ci`. Keep this project in native Node.js and plain browser JavaScript unless a change has a clear reason to introduce infrastructure.

Before proposing a change:

```sh
npm run format
npm run check
npm test
npx playwright install chromium
npm run test:browser
```

Tests must use synthetic metrics, mocked providers or loopback services. Never require personal API keys or a real email recipient in CI. Add tests when changing incident lifecycles, validation, provider adapters, settings or notification behavior.

Keep detection deterministic. AI-generated text must retain accurate provenance and fall back safely. Keep network calls outside database transactions and use incident versions when applying asynchronous updates.

Explain a change with the problem it solves, resulting behavior, validation and remaining limitations. Do not commit `.env`, the local `data/` folder, SMTP credentials, provider keys or local preparation documents.
