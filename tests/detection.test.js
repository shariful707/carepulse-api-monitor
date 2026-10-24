import test from 'node:test';
import assert from 'node:assert/strict';
import { detectAnomalies, fallbackMessage } from '../src/detection.js';
const input = (fields = {}) => ({
  api_name: 'DemoAPI',
  status_code: 200,
  response_time_ms: 250,
  records_returned: 1,
  ...fields,
});
test('healthy response produces zero anomalies', () => {
  const d = detectAnomalies(input());
  assert.equal(d.anomalous, false);
  assert.equal(d.issues.length, 0);
});
test('critical HTTP 500 and zero count are both detected', () => {
  const d = detectAnomalies(input({ status_code: 500, records_returned: 0 }));
  assert.equal(d.severity, 'critical');
  assert.deepEqual(
    d.issues.map((i) => i.code),
    ['HTTP_5XX', 'ZERO_RECORDS']
  );
});
test('strictly greater than latency threshold is slow', () => {
  assert.equal(detectAnomalies(input({ response_time_ms: 2000 })).anomalous, false);
  assert.equal(detectAnomalies(input({ response_time_ms: 2001 })).issues[0].code, 'SLOW_RESPONSE');
});
test('missing data is flagged independently of status', () => {
  const d = detectAnomalies(input({ records_returned: null }));
  assert.deepEqual(
    d.issues.map((i) => i.code),
    ['MISSING_RECORDS']
  );
  assert.equal(d.severity, 'high');
});
test('HTTP 404 produces high severity', () =>
  assert.equal(detectAnomalies(input({ status_code: 404 })).severity, 'high'));
test('fallback alert explains observed signal only', () => {
  const obs = input({ status_code: 500 });
  const message = fallbackMessage(obs, detectAnomalies(obs).issues);
  assert.match(message, /DemoAPI/);
  assert.match(message, /HTTP 500/);
});
