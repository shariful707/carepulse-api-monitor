// Exercise optional write authorization against an actual isolated HTTP server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('HTTP write routes enforce the access key and redact saved credentials', async () => {
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const directory = mkdtempSync(join(tmpdir(), 'carepulse-http-')),
    settingsPath = join(directory, 'settings.json');
  const child = spawn(process.execPath, ['src/server.js'], {
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      DB_PATH: ':memory:',
      SETTINGS_PATH: settingsPath,
      MONITOR_API_KEY: 'test-write-key',
      AI_PROVIDER: 'none',
      EMAIL_MODE: 'off',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('HTTP test server did not start')), 10000);
      child.stdout.on('data', (chunk) => {
        if (chunk.toString().includes('Server listening')) {
          clearTimeout(timeout);
          resolve();
        }
      });
      child.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once('exit', (code) => {
        clearTimeout(timeout);
        reject(new Error(`HTTP test server exited: ${code}`));
      });
    });
    const request = (path, body, key) =>
      fetch(`http://127.0.0.1:${port}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(key ? { 'x-api-key': key } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    for (const path of [
      '/monitor',
      '/api/settings',
      '/api/email/report',
      '/api/integrations/test-ai',
      '/alerts/1/resolve',
    ]) {
      const response = await request(path, {}, undefined);
      assert.equal(response.status, 401, path);
      await response.text();
    }
    const saved = await request(
      '/api/settings',
      { openaiKey: 'server-test-secret' },
      'test-write-key'
    );
    assert.equal(saved.status, 200);
    assert.doesNotMatch(await saved.text(), /server-test-secret/);
    const publicResponse = await fetch(`http://127.0.0.1:${port}/api/settings`);
    const settings = await publicResponse.json();
    assert.equal(settings.openaiKeySet, true);
    assert.equal(settings.writeKeyRequired, true);
    assert.equal(settings.openaiKey, undefined);
    const ingest = await request(
      '/monitor',
      { api_name: 'TestAPI', response_time_ms: 100, status_code: 200, records_returned: 4 },
      'test-write-key'
    );
    assert.equal(ingest.status, 200);
    assert.equal((await ingest.json()).anomalous, 0);
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await once(child, 'exit');
    } // Stop only this test's own process.
    rmSync(settingsPath, { force: true });
    rmdirSync(directory);
  }
});
