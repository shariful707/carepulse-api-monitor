import { readFile } from 'node:fs/promises';
import { config } from '../src/config.js'; // Load .env so protected local demos use the configured access key.
const mode = process.argv[2] || 'sample'; // Choose the anomaly scenario or the healthy recovery scenario.
const path = mode === 'recover' ? './samples/recovered-api.json' : './samples/api-responses.json'; // Reuse reviewable synthetic fixtures.
const url = process.env.BASE_URL || 'http://127.0.0.1:3000'; // Allow a different local server address without changing code.
try {
  const payload = await readFile(path, 'utf8');
  const result = await fetch(`${url}/monitor`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { 'x-api-key': config.apiKey } : {}), // Authenticate writes only when protection is enabled.
    },
    body: payload,
    signal: AbortSignal.timeout(180000), // Allow the server's AI budget and SMTP step to finish.
  });
  console.log(JSON.stringify(await result.json(), null, 2));
  if (!result.ok) process.exitCode = 1;
} catch (error) {
  console.error('Demo request failed:', error.message);
  console.error('Is the server running? Start it with npm start in another terminal.');
  process.exitCode = 1;
}
