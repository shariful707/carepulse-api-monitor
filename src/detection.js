// Deterministic rules are the single source of truth for incident creation.
export function detectAnomalies(observation, thresholdMs = 2000) {
  const issues = [];
  const {status_code, response_time_ms, records_returned} = observation;
  if (status_code >= 500) {
    issues.push({ code: 'HTTP_5XX', level: 'critical', description: `Server returned HTTP ${status_code}` });
  } else if (status_code >= 400) {
    issues.push({ code: 'HTTP_4XX', level: 'high', description: `Request returned HTTP ${status_code}` });
  } else if (status_code >= 300) {
    issues.push({ code: 'HTTP_3XX', level: 'warning', description: `Unexpected redirect HTTP ${status_code}` });
  }
  if (response_time_ms > thresholdMs) {
    issues.push({ code: 'SLOW_RESPONSE', level: 'warning', description: `Response took ${response_time_ms} ms (threshold ${thresholdMs} ms)` });
  }
  if (records_returned === null) {
    issues.push({ code: 'MISSING_RECORDS', level: 'high', description: 'Record count is missing' });
  } else if (records_returned === 0) {
    issues.push({ code: 'ZERO_RECORDS', level: 'warning', description: 'API returned zero records' });
  }
  const order = ['warning', 'high', 'critical'];
  const severity = issues.reduce((result, issue) => order.indexOf(issue.level) > order.indexOf(result) ? issue.level : result, 'warning');
  return { anomalous: issues.length > 0, issues, severity };
}
export function fallbackMessage(observation, issues) {
  const reasons = issues.map(issue => issue.description.replace(/^[a-z]/, x=>x.toLowerCase()));
  const diagnosis = observation.status_code >= 500 ? 'Possible upstream outage; check service logs and retry.'
    : issues.some(x => x.code === 'MISSING_RECORDS' || x.code === 'ZERO_RECORDS') ? 'Check upstream data availability and response mappings.'
    : 'Review latency, connectivity and recent deployments.';
  return `${observation.api_name}: ${reasons.join('; ')}. ${diagnosis}`;
}
