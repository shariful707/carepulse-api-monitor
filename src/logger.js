export function log(level, message, fields = {}) {
  const safe = Object.fromEntries(Object.entries(fields).filter(([key]) => !/key|token|password|secret|patient/i.test(key)));
  const item = { time: new Date().toISOString(), level, message, ...safe };
  const line = JSON.stringify(item);
  if (level === 'error') console.error(line);
  else console.log(line);
}
