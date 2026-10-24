import { randomUUID } from 'node:crypto';
import { detectAnomalies, fallbackMessage } from './detection.js';
import { validateBatch } from './validation.js';
import { generateAlert } from './llm.js';
import { log } from './logger.js';
import { allAlerts } from './db.js';
import { deliverReport } from './email.js';

async function parallelLimit(tasks, maxActive = 4) {
  // Cap concurrent provider calls so a batch cannot fan out unbounded requests.
  let cursor = 0;
  const worker = async () => {
    while (cursor < tasks.length) {
      const task = tasks[cursor++];
      await task();
    }
  };
  await Promise.all(Array.from({ length: Math.min(tasks.length, maxActive) }, worker));
}

export async function processBatch(db, rawInput, config) {
  // Validate the *entire* batch before writing: invalid data cannot partially persist.
  const observations = validateBatch(rawInput, config.maxBatchSize);
  const batchId = randomUUID();
  const clock = () => new Date().toISOString();
  const processed = [];
  const enrichLatest = new Map(); // Only enrich the last observation of an incident within this batch.
  const opened = new Set(); // Repeated anomalies update an incident without sending repeated automatic emails.
  const insertObservation = db.prepare(`INSERT INTO observations
    (batch_id,api_name,response_time_ms,status_code,records_returned,anomalous,checked_at)
    VALUES (?,?,?,?,?,?,?)`);
  const activeAlert = db.prepare(
    `SELECT id,occurrence_count,version FROM alerts WHERE api_name=? AND status='active'`
  );
  const newAlert = db.prepare(`INSERT INTO alerts
    (api_name,severity,issues_json,message,message_source,first_seen_at,last_seen_at,latest_observation_id)
    VALUES (?,?,?,?,?,?,?,?)`);
  const updateAlert =
    db.prepare(`UPDATE alerts SET severity=?,issues_json=?,message=?,message_source='rules_template',
    last_seen_at=?,occurrence_count=occurrence_count+1,version=version+1,latest_observation_id=? WHERE id=?`);
  const recover = db.prepare(
    `UPDATE alerts SET status='resolved',resolved_at=?,version=version+1 WHERE id=?`
  );

  db.exec('BEGIN IMMEDIATE'); // Persist observations and incident lifecycle changes as one atomic unit.
  try {
    for (const observation of observations) {
      const checkedAt = clock();
      const detection = detectAnomalies(observation, config.slowThresholdMs);
      const obsId = Number(
        insertObservation.run(
          batchId,
          observation.api_name,
          observation.response_time_ms,
          observation.status_code,
          observation.records_returned,
          detection.anomalous ? 1 : 0,
          checkedAt
        ).lastInsertRowid
      );
      const existing = activeAlert.get(observation.api_name); // Deduplicate by the currently open incident for this service.
      let alertId = null;
      let alertVersion = null;
      if (detection.anomalous) {
        const message = fallbackMessage(observation, detection.issues);
        if (existing) {
          updateAlert.run(
            detection.severity,
            JSON.stringify(detection.issues),
            message,
            checkedAt,
            obsId,
            existing.id
          );
          alertId = existing.id;
          alertVersion = existing.version + 1;
        } else {
          alertId = Number(
            newAlert.run(
              observation.api_name,
              detection.severity,
              JSON.stringify(detection.issues),
              message,
              'rules_template',
              checkedAt,
              checkedAt,
              obsId
            ).lastInsertRowid
          );
          alertVersion = 1;
          opened.add(alertId);
        }
        enrichLatest.set(alertId, { observation, detection, version: alertVersion });
      } else if (existing) {
        // A healthy observation closes the active incident automatically.
        recover.run(checkedAt, existing.id);
      }
      processed.push({
        api_name: observation.api_name,
        observation_id: obsId,
        anomalous: detection.anomalous,
        severity: detection.anomalous ? detection.severity : null,
        issues: detection.issues.map((x) => x.code),
        alert_id: alertId,
        status: detection.anomalous ? 'alert' : 'healthy',
      });
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  // AI is deliberately outside the SQL transaction (network requests can take seconds).
  const updateMessage = db.prepare(`UPDATE alerts SET message=?,message_source=?
    WHERE id=? AND version=? AND status='active'`);
  if (config.provider !== 'none') {
    const deadline = Date.now() + (config.aiTimeoutMs ?? 60000); // Bound total enrichment time, even for a large batch.
    await parallelLimit(
      [...enrichLatest.entries()].map(([id, job]) => async () => {
        const remaining = deadline - Date.now();
        const answer =
          remaining > 0
            ? await generateAlert(job.observation, job.detection, {
                ...config,
                aiTimeoutMs: remaining,
              })
            : {
                message: fallbackMessage(job.observation, job.detection.issues),
                source: 'rules_fallback',
              };
        updateMessage.run(answer.message, answer.source, id, job.version);
      }),
      4
    );
  }
  const email = []; // Email happens after AI enrichment so the report includes the final explanation.
  if (config.emailMode && config.emailMode !== 'off') {
    const newActive = allAlerts(db, 'active', -1).filter((alert) => opened.has(alert.id)); // Include new incidents even when a large existing history exceeds the UI limit.
    if (newActive.length)
      email.push(
        await deliverReport(db, config, { alerts: newActive, dedupeKey: `batch:${batchId}` })
      ); // One digest avoids a notification storm.
  }
  const result = {
    batch_id: batchId,
    received: observations.length,
    anomalous: processed.filter((x) => x.anomalous).length,
    processed,
    email,
  };
  log('info', 'Batch processed', {
    batch_id: batchId,
    received: result.received,
    anomalous: result.anomalous,
  });
  return result;
}

export function resolveAlert(db, id) {
  // Let an operator close an incident while preserving its history.
  const row = db.prepare(`SELECT id,status FROM alerts WHERE id=?`).get(id);
  if (!row) return 'not_found';
  if (row.status === 'resolved') return 'already_resolved';
  db.prepare(`UPDATE alerts SET status='resolved',resolved_at=?,version=version+1 WHERE id=?`).run(
    new Date().toISOString(),
    id
  );
  return 'resolved';
}
