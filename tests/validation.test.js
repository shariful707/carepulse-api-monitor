import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBatch, ValidationError } from '../src/validation.js';
const obs = {
  api_name: 'PatientDataAPI',
  response_time_ms: 120,
  status_code: 200,
  records_returned: 24,
};
test('accepts single observation', () => assert.equal(validateBatch(obs).length, 1));
test('accepts a batch', () => assert.equal(validateBatch([obs, obs]).length, 2));
test('missing records count becomes null to allow alert', () =>
  assert.equal(validateBatch({ ...obs, records_returned: undefined })[0].records_returned, null));
test('rejects invalid HTTP status', () =>
  assert.throws(() => validateBatch({ ...obs, status_code: 999 }), ValidationError));
test('rejects negative time', () =>
  assert.throws(() => validateBatch({ ...obs, response_time_ms: -1 }), ValidationError));
test('rejects empty batch', () => assert.throws(() => validateBatch([]), ValidationError));
test('enforces configurable max size', () =>
  assert.throws(() => validateBatch([obs, obs], 1), ValidationError));
test('rejects malformed API identifier for safe display', () =>
  assert.throws(
    () => validateBatch({ ...obs, api_name: '<script>alert(1)</script>' }),
    ValidationError
  ));
