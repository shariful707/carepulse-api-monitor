// Validate settings and server-side secret storage independently of the HTTP layer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config } from '../src/config.js';
import { createSettingsStore, publicSettings, validateSettings } from '../src/settings.js';

test('public settings expose readiness flags without secret values', () => {
  const view = publicSettings({
    ...config,
    openaiKey: 'private-key',
    smtpPassword: 'mail-password',
    apiKey: 'write-secret',
  });
  assert.equal(view.openaiKeySet, true);
  assert.equal(view.writeKeyRequired, true);
  assert.doesNotMatch(JSON.stringify(view), /private-key|mail-password|write-secret/);
});
test('blank passwords preserve credentials while provider selection changes', () => {
  const cfg = validateSettings(
    { provider: 'ollama', openaiKey: '' },
    { ...config, openaiKey: 'keep-me' }
  );
  assert.equal(cfg.openaiKey, 'keep-me');
  assert.equal(cfg.provider, 'ollama');
});
test('invalid providers, header injection, unsafe URLs and incomplete SMTP are rejected', () => {
  for (const input of [
    { provider: 'unknown' },
    { emailTo: 'a@example.com\r\nBcc:x@example.com' },
    { ollamaBaseUrl: 'file:///tmp/server' },
    { ollamaBaseUrl: 'http://user:pass@localhost:11434' },
    { ollamaBaseUrl: 'http://localhost:11434/api/chat' },
    { smtpPort: 0 },
    { smtpSecure: 'true' },
    { emailMode: 'smtp' },
    { apiKey: 'not-editable' },
  ])
    assert.throws(() => validateSettings(input, config));
});
test('atomic saved settings survive a new store instance and remain redacted', () => {
  const directory = mkdtempSync(join(tmpdir(), 'carepulse-settings-'));
  const path = join(directory, 'settings.json');
  try {
    const store = createSettingsStore({ ...config, settingsPath: path });
    const view = store.save({ provider: 'openai', openaiKey: 'server-only' });
    assert.equal(view.openaiKey, undefined);
    assert.equal(
      createSettingsStore({ ...config, settingsPath: path }).get().openaiKey,
      'server-only'
    );
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).provider, 'openai');
  } finally {
    rmSync(path, { force: true });
    rmdirSync(directory);
  } // Remove only this test's known file and now-empty directory.
});
