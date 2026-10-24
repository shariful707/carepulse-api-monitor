export class ValidationError extends Error {
  // Identify expected client mistakes so HTTP routes return 400 instead of 500.
  constructor(message, details = []) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
    this.details = details;
  }
}
export function validateObservation(input, index = 0) {
  // Normalize one observation and report the exact invalid batch item.
  const location = `item[${index}]`;
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError(`${location} must be a JSON object`);
  }
  const { api_name, response_time_ms, status_code, records_returned } = input;
  if (
    typeof api_name !== 'string' ||
    api_name.trim().length < 2 ||
    api_name.length > 100 ||
    !/^[\w .-]+$/.test(api_name)
  ) {
    throw new ValidationError(
      `${location}.api_name must be 2-100 letters, numbers, spaces, dots, underscores or hyphens`
    );
  }
  if (
    typeof response_time_ms !== 'number' ||
    !Number.isFinite(response_time_ms) ||
    response_time_ms < 0 ||
    response_time_ms > 3_600_000
  ) {
    throw new ValidationError(
      `${location}.response_time_ms must be a finite number between 0 and 3600000`
    );
  }
  if (!Number.isInteger(status_code) || status_code < 100 || status_code > 599) {
    throw new ValidationError(`${location}.status_code must be an integer between 100 and 599`);
  }
  // Missing or null counts are retained so anomaly detection can flag them.
  if (
    records_returned !== undefined &&
    records_returned !== null &&
    (!Number.isSafeInteger(records_returned) || records_returned < 0)
  ) {
    throw new ValidationError(`${location}.records_returned must be a nonnegative integer or null`);
  }
  return {
    api_name: api_name.trim(),
    response_time_ms,
    status_code,
    records_returned: records_returned ?? null,
  };
}
export function validateBatch(data, maxBatchSize = 100) {
  // Validate every item before the monitoring transaction starts.
  const input = Array.isArray(data) ? data : [data];
  if (!input.length) throw new ValidationError('Provide at least one API response');
  if (input.length > maxBatchSize)
    throw new ValidationError(`Batch limit is ${maxBatchSize} records`);
  return input.map(validateObservation);
}
