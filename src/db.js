import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function createDatabase(path) {
  // Create the data directory and migrate the additive local schema.
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path); // Synchronous SQL makes the transaction boundary explicit in this single-process app.
  db.exec(`
    PRAGMA journal_mode = WAL; -- Permit reads while a writer appends a transaction.
    PRAGMA busy_timeout = 5000; -- Wait briefly for another writer instead of failing immediately.
    PRAGMA foreign_keys = ON; -- Require incident references to point to a real observation.
    CREATE TABLE IF NOT EXISTS observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, -- Stable ordering for received observations.
      batch_id TEXT NOT NULL, -- Group all checks from one ingestion request.
      api_name TEXT NOT NULL, -- Identify the service whose response was observed.
      response_time_ms REAL NOT NULL, -- Store latency without rounding away fractional milliseconds.
      status_code INTEGER NOT NULL, -- Preserve the observed HTTP result.
      records_returned INTEGER, -- NULL explicitly represents a missing count.
      anomalous INTEGER NOT NULL, -- Cache the deterministic detection outcome.
      checked_at TEXT NOT NULL -- UTC timestamp generated at ingestion.
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, -- Preserve a stable incident identity after resolution.
      api_name TEXT NOT NULL, -- Group repeated failures of the same service.
      severity TEXT NOT NULL, -- Highest priority among the latest observation's matching rules.
      issues_json TEXT NOT NULL, -- Preserve all detected issue codes and evidence.
      message TEXT NOT NULL, -- Human-readable explanation from AI or built-in rules.
      message_source TEXT NOT NULL, -- Keep the explanation's provider or fallback provenance.
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','resolved')), -- Explicit incident lifecycle.
      first_seen_at TEXT NOT NULL, -- Time this incident originally opened.
      last_seen_at TEXT NOT NULL, -- Most recent anomalous observation for the incident.
      resolved_at TEXT, -- Resolution time remains NULL while active.
      occurrence_count INTEGER NOT NULL DEFAULT 1, -- Count repeats without creating duplicate open incidents.
      version INTEGER NOT NULL DEFAULT 1, -- Reject stale asynchronous AI completions.
      latest_observation_id INTEGER NOT NULL REFERENCES observations(id) -- Link the explanation to its measured evidence.
    );
    CREATE INDEX IF NOT EXISTS idx_observations_time ON observations(checked_at DESC);
    CREATE INDEX IF NOT EXISTS idx_alert_status_time ON alerts(status,last_seen_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_alert_per_api ON alerts(api_name) WHERE status = 'active';
    CREATE INDEX IF NOT EXISTS idx_observations_api_id ON observations(api_name,id DESC);
    CREATE TABLE IF NOT EXISTS email_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT, -- Address the saved report in the preview endpoint.
      dedupe_key TEXT UNIQUE, -- Atomically claim an automatic digest; manual reports may use NULL.
      recipient TEXT NOT NULL, -- Record the destination used at creation time.
      sender TEXT NOT NULL, -- Preserve the configured sending address.
      subject TEXT NOT NULL, -- Store a readable incident-count summary.
      body TEXT NOT NULL, -- Keep plain-text content for later inspection.
      status TEXT NOT NULL CHECK(status IN ('pending','preview','sent','failed')), -- Distinguish creation from actual SMTP acceptance.
      error TEXT, -- Store safe actionable failure text, never SMTP credentials.
      created_at TEXT NOT NULL, -- UTC report creation time.
      sent_at TEXT -- Filled only when the SMTP server accepts delivery.
    );
  `);
  return db;
}
export function allAlerts(db, status = 'active', limit = 100) {
  // Join each incident to its latest observation for display and reports.
  const sql = `SELECT a.*, o.response_time_ms, o.status_code, o.records_returned
    FROM alerts a JOIN observations o ON o.id = a.latest_observation_id
    ${status === 'all' ? '' : 'WHERE a.status = ?'}
    ORDER BY CASE WHEN a.status = 'active' THEN 0 ELSE 1 END,
      CASE a.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,
      a.last_seen_at DESC, a.id DESC LIMIT ?`;
  const rows = status === 'all' ? db.prepare(sql).all(limit) : db.prepare(sql).all(status, limit);
  return rows.map((row) => ({
    ...row,
    issues: JSON.parse(row.issues_json),
    issues_json: undefined,
  }));
}
export function summary(db) {
  // Aggregate incident history, current service health and recorded-day activity separately.
  const alerts = db
    .prepare(
      `SELECT
    count(*) as total,
    sum(CASE WHEN status='active' THEN 1 ELSE 0 END) as active,
    sum(CASE WHEN status='resolved' THEN 1 ELSE 0 END) as resolved,
    sum(CASE WHEN status='active' AND severity='critical' THEN 1 ELSE 0 END) as critical,
    sum(CASE WHEN status='active' AND severity='high' THEN 1 ELSE 0 END) as high,
    sum(CASE WHEN status='active' AND severity='warning' THEN 1 ELSE 0 END) as warning FROM alerts`
    )
    .get();
  const observations = db
    .prepare(
      `SELECT COUNT(*) AS total,
    SUM(CASE WHEN anomalous=0 THEN 1 ELSE 0 END) AS healthy,
    ROUND(AVG(response_time_ms),1) AS avg_response_ms,
    COUNT(DISTINCT api_name) AS apis
    FROM observations`
    )
    .get();
  const health = db
    .prepare(
      `SELECT o.api_name, o.status_code, o.response_time_ms, o.records_returned,
    o.checked_at, o.anomalous FROM observations o WHERE o.id = (
      SELECT i.id FROM observations i WHERE i.api_name=o.api_name ORDER BY i.id DESC LIMIT 1
    ) ORDER BY o.api_name ASC`
    )
    .all();
  const trend = db
    .prepare(
      `SELECT substr(checked_at,1,10) AS day, count(*) AS total,
    sum(anomalous) AS anomalous FROM observations GROUP BY day ORDER BY day DESC LIMIT 7`
    )
    .all()
    .reverse();
  return { alerts, observations, health, trend };
}
