import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Node 22+ loads .env without third-party packages.
if (existsSync('.env') && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile('.env');
}
const positiveInteger = (key, fallback, max) => {
  // Reject invalid operational limits before the server starts.
  const value = Number(process.env[key] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new Error(`${key} must be between 1 and ${max}`);
  }
  return value;
};
export const config = Object.freeze({
  // Immutable environment defaults seed the editable server settings.
  host: process.env.HOST || '127.0.0.1', // Bind locally unless deployment explicitly opts into a public interface.
  port: positiveInteger('PORT', 3000, 65535), // Listen on the configured HTTP port.
  dbPath:
    process.env.DB_PATH === ':memory:'
      ? ':memory:'
      : resolve(process.env.DB_PATH || './data/monitor.sqlite'), // In-memory mode isolates automated tests.
  slowThresholdMs: positiveInteger('SLOW_THRESHOLD_MS', 2000, 3_600_000), // A response strictly above this limit is slow.
  maxBatchSize: positiveInteger('MAX_BATCH_SIZE', 100, 1000), // Bound memory and network work per request.
  provider: (process.env.AI_PROVIDER || 'none').toLowerCase(), // Rule explanations work without an LLM account.
  geminiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  openaiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434', // Local Ollama server; no cloud key needed.
  ollamaModel: process.env.OLLAMA_MODEL || 'llama3.2:3b', // Must match a model installed with ollama pull.
  aiTimeoutMs: positiveInteger('AI_TIMEOUT_MS', 60000, 180000), // Allows local models time to load.
  settingsPath: resolve(process.env.SETTINGS_PATH || './data/settings.json'), // Server-only saved settings.
  emailMode: process.env.EMAIL_MODE || 'preview', // Preview stores a report without contacting an email server.
  emailTo: process.env.EMAIL_TO || '', // A fixed recipient avoids arbitrary report destinations.
  emailFrom: process.env.EMAIL_FROM || 'carepulse@localhost', // SMTP requires a sender accepted by your provider.
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: positiveInteger('SMTP_PORT', 587, 65535),
  smtpSecure: process.env.SMTP_SECURE === 'true', // Port 465 uses immediate TLS; 587 upgrades with STARTTLS.
  smtpUser: process.env.SMTP_USER || '',
  smtpPassword: process.env.SMTP_PASSWORD || '',
  smtpRequireTLS: process.env.SMTP_REQUIRE_TLS !== 'false', // Disable only for a local test SMTP server.
  apiKey: process.env.MONITOR_API_KEY || '', // Optional write protection; deliberately not editable from the dashboard.
});
