import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function createDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id TEXT NOT NULL,
      api_name TEXT NOT NULL,
      response_time_ms REAL NOT NULL,
      status_code INTEGER NOT NULL,
      records_returned INTEGER,
      anomalous INTEGER NOT NULL,
      checked_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      api_name TEXT NOT NULL,
      severity TEXT NOT NULL,
      issues_json TEXT NOT NULL,
      message TEXT NOT NULL,
      message_source TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','resolved')),
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      resolved_at TEXT,
      occurrence_count INTEGER NOT NULL DEFAULT 1,
      version INTEGER NOT NULL DEFAULT 1,
      latest_observation_id INTEGER NOT NULL REFERENCES observations(id)
    );
    CREATE INDEX IF NOT EXISTS idx_observations_time ON observations(checked_at DESC);
    CREATE INDEX IF NOT EXISTS idx_alert_status_time ON alerts(status,last_seen_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_alert_per_api ON alerts(api_name) WHERE status = 'active';
    CREATE INDEX IF NOT EXISTS idx_observations_api_id ON observations(api_name,id DESC);
    CREATE TABLE IF NOT EXISTS email_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dedupe_key TEXT UNIQUE,
      recipient TEXT NOT NULL,
      sender TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','preview','sent','failed')),
      error TEXT,
      created_at TEXT NOT NULL,
      sent_at TEXT
    );
  `);
  return db;
}
export function allAlerts(db, status = 'active', limit = 100) {
  const sql = `SELECT a.*, o.response_time_ms, o.status_code, o.records_returned
    FROM alerts a JOIN observations o ON o.id = a.latest_observation_id
    ${status === 'all' ? '' : 'WHERE a.status = ?'}
    ORDER BY CASE WHEN a.status = 'active' THEN 0 ELSE 1 END,
      CASE a.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,
      a.last_seen_at DESC, a.id DESC LIMIT ?`;
  const rows = status === 'all' ? db.prepare(sql).all(limit) : db.prepare(sql).all(status, limit);
  return rows.map(row => ({...row, issues: JSON.parse(row.issues_json), issues_json: undefined}));
}
export function summary(db) {
  const alerts = db.prepare(`SELECT
    count(*) as total,
    sum(CASE WHEN status='active' THEN 1 ELSE 0 END) as active,
    sum(CASE WHEN status='resolved' THEN 1 ELSE 0 END) as resolved,
    sum(CASE WHEN status='active' AND severity='critical' THEN 1 ELSE 0 END) as critical,
    sum(CASE WHEN status='active' AND severity='high' THEN 1 ELSE 0 END) as high,
    sum(CASE WHEN status='active' AND severity='warning' THEN 1 ELSE 0 END) as warning FROM alerts`).get();
  const observations = db.prepare(`SELECT COUNT(*) AS total,
    SUM(CASE WHEN anomalous=0 THEN 1 ELSE 0 END) AS healthy,
    ROUND(AVG(response_time_ms),1) AS avg_response_ms,
    COUNT(DISTINCT api_name) AS apis
    FROM observations`).get();
  const health = db.prepare(`SELECT o.api_name, o.status_code, o.response_time_ms, o.records_returned,
    o.checked_at, o.anomalous FROM observations o WHERE o.id = (
      SELECT i.id FROM observations i WHERE i.api_name=o.api_name ORDER BY i.id DESC LIMIT 1
    ) ORDER BY o.api_name ASC`).all();
  const trend = db.prepare(`SELECT substr(checked_at,1,10) AS day, count(*) AS total,
    sum(anomalous) AS anomalous FROM observations GROUP BY day ORDER BY day DESC LIMIT 7`).all().reverse();
  return { alerts, observations, health, trend };
}
