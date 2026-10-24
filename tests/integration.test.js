import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase, allAlerts, summary } from '../src/db.js';
import { processBatch, resolveAlert } from '../src/monitor.js';
const cfg = { maxBatchSize: 100, slowThresholdMs: 2000, provider: 'none' };
const report = (status_code = 500, records_returned = 0) => ({
  api_name: 'AppointmentAPI',
  response_time_ms: 200,
  status_code,
  records_returned,
});
test('create, deduplicate, recover and reopen incidents', async () => {
  const db = createDatabase(':memory:');
  try {
    const first = await processBatch(db, [report()], cfg);
    assert.equal(first.anomalous, 1);
    assert.equal(allAlerts(db).length, 1);
    assert.equal(allAlerts(db)[0].severity, 'critical');
    await processBatch(db, [report()], cfg);
    assert.equal(allAlerts(db).length, 1);
    assert.equal(allAlerts(db)[0].occurrence_count, 2);
    await processBatch(db, [report(200, 9)], cfg);
    assert.equal(allAlerts(db).length, 0);
    assert.equal(allAlerts(db, 'resolved').length, 1);
    await processBatch(db, [report()], cfg);
    assert.equal(allAlerts(db).length, 1);
    assert.equal(summary(db).alerts.total, 2);
  } finally {
    db.close();
  }
});
test('bad input does not partially write a batch', async () => {
  const db = createDatabase(':memory:');
  try {
    await assert.rejects(processBatch(db, [report(), { ...report(), status_code: 990 }], cfg));
    assert.equal(summary(db).observations.total, 0);
  } finally {
    db.close();
  }
});
test('manual resolve closes an incident', async () => {
  const db = createDatabase(':memory:');
  try {
    await processBatch(db, report(), cfg);
    assert.equal(resolveAlert(db, allAlerts(db)[0].id), 'resolved');
    assert.equal(resolveAlert(db, 1), 'already_resolved');
    assert.equal(allAlerts(db).length, 0);
  } finally {
    db.close();
  }
});

test('a slow AI response cannot overwrite a newer observation', async () => {
  const db = createDatabase(':memory:');
  const saved = globalThis.fetch;
  let release;
  const pendingResponse = new Promise((resolve) => {
    release = resolve;
  });
  globalThis.fetch = async () => {
    await pendingResponse;
    return {
      ok: true,
      text: async () =>
        JSON.stringify({
          choices: [
            {
              message: { content: 'This old explanation must not replace the newer observation.' },
            },
          ],
        }),
    };
  };
  try {
    const first = processBatch(db, report(), {
      ...cfg,
      provider: 'openai',
      openaiKey: 'test',
      openaiModel: 'test',
    });
    await processBatch(db, { ...report(), response_time_ms: 9000 }, cfg);
    release();
    await first;
    const incident = allAlerts(db)[0];
    assert.equal(incident.response_time_ms, 9000);
    assert.equal(incident.message_source, 'rules_template');
    assert.doesNotMatch(incident.message, /old explanation/);
    assert.equal(incident.occurrence_count, 2);
  } finally {
    release();
    globalThis.fetch = saved;
    db.close();
  }
});
