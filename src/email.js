// Email reports use persisted incident facts and record delivery outcomes independently of ingestion.
import nodemailer from 'nodemailer';
import {allAlerts} from './db.js';
import {log} from './logger.js';

export function buildReport(alerts, now = new Date()) {
  const subject = `CarePulse: ${alerts.length} active incident${alerts.length === 1 ? '' : 's'}`;
  const text = [subject,`Generated ${now.toISOString()}`,'',...alerts.flatMap(alert => [
    `${alert.api_name} | ${alert.severity.toUpperCase()} | HTTP ${alert.status_code} | ${alert.response_time_ms} ms`,
    alert.message,`Explanation: ${alert.message_source}. Last seen: ${alert.last_seen_at}.`,''
  ]),'Review the alert center before taking action. This report contains API response metadata only.'].join('\n');
  return {subject,text}; // Plain text avoids HTML injection and works in every email client.
}

export async function deliverReport(db, cfg, {alerts = allAlerts(db), dedupeKey = null} = {}, createTransport = nodemailer.createTransport) {
  if (cfg.emailMode === 'off') return {status:'disabled'};
  if (!alerts.length) return {status:'empty'};
  const report = buildReport(alerts);
  const recipient = cfg.emailTo || 'preview@example.test'; // Preview is safe without a real address.
  const inserted = db.prepare(`INSERT OR IGNORE INTO email_deliveries
    (dedupe_key,recipient,sender,subject,body,status,created_at) VALUES (?,?,?,?,?,'pending',?)`)
    .run(dedupeKey,recipient,cfg.emailFrom,report.subject,report.text,new Date().toISOString());
  if (!inserted.changes) return {status:'duplicate'}; // A batch digest is claimed atomically before delivery.
  const id = Number(inserted.lastInsertRowid);
  if (cfg.emailMode === 'preview') {
    db.prepare("UPDATE email_deliveries SET status='preview' WHERE id=?").run(id);
    return {id,status:'preview'};
  }
  try {
    const transport = createTransport({
      host:cfg.smtpHost,port:cfg.smtpPort,secure:cfg.smtpSecure,requireTLS:cfg.smtpRequireTLS,
      ...(cfg.smtpUser ? {auth:{user:cfg.smtpUser,pass:cfg.smtpPassword}} : {}),
      connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,
      disableFileAccess:true,disableUrlAccess:true // Reports cannot attach arbitrary local or remote files.
    });
    const info = await transport.sendMail({from:cfg.emailFrom,to:recipient,...report});
    if (!info.accepted?.length || info.rejected?.length) throw new Error('Recipient rejected');
    db.prepare("UPDATE email_deliveries SET status='sent',sent_at=? WHERE id=?").run(new Date().toISOString(),id);
    return {id,status:'sent'}; // Sent means accepted by SMTP, not guaranteed inbox placement.
  } catch {
    const error = 'Email server did not accept the report. Check SMTP settings and send a new report.';
    db.prepare("UPDATE email_deliveries SET status='failed',error=? WHERE id=?").run(error,id);
    log('warn','Email delivery failed',{delivery_id:id}); // Avoid logging SMTP responses or credentials.
    return {id,status:'failed',error}; // Notification failure never discards the incident.
  }
}

export const listDeliveries = db => db.prepare(`SELECT id,recipient,subject,status,error,created_at,sent_at
  FROM email_deliveries ORDER BY id DESC LIMIT 30`).all();
