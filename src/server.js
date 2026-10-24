import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, extname, sep } from 'node:path';
import { config } from './config.js';
import { createDatabase, allAlerts, summary } from './db.js';
import { ValidationError } from './validation.js';
import { processBatch, resolveAlert } from './monitor.js';
import { log } from './logger.js';
import { createSettingsStore, publicSettings } from './settings.js';
import { deliverReport, listDeliveries } from './email.js';
import { generateAlert } from './llm.js';
import { detectAnomalies } from './detection.js';

const directory = resolve(dirname(fileURLToPath(import.meta.url)), '../web'); // Serve a fixed asset root, never arbitrary workspace files.
const db = createDatabase(config.dbPath); // Reuse one SQLite connection for this process.
const settings = createSettingsStore(config); // Environment values seed saved settings on first start.
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};
const responseHeaders = {
  // Apply the same browser protections to assets and JSON responses.
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store',
  'Content-Security-Policy':
    "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'",
};
const reply = (res, statusCode, value) => {
  // Serialize the API's JSON response contract in one place.
  const data = JSON.stringify(value);
  res.writeHead(statusCode, {
    ...responseHeaders,
    'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(data);
};
const getBody = (req, limit = 1024 * 1024) =>
  new Promise((resolveBody, reject) => {
    // Bound buffered request memory and reject malformed JSON consistently.
    let size = 0;
    let oversized = false;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        oversized = true;
        return;
      }
      if (!oversized) chunks.push(chunk);
    });
    req.on('end', () => {
      if (oversized) return reject(new ValidationError('JSON request body exceeds 1 MiB'));
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new ValidationError('Body must be valid JSON'));
      }
    });
    req.on('error', reject);
  });
const authorized = (req) => !config.apiKey || req.headers['x-api-key'] === config.apiKey; // Optional write key; local reads remain open.

async function serveAsset(req, res, url) {
  // Resolve within the asset directory and allow only the known web file extensions.
  const decoded = decodeURIComponent(url.pathname);
  const relative = decoded === '/' ? '/index.html' : decoded;
  const file = resolve(directory, `.${relative}`);
  if (!file.startsWith(directory + sep)) return reply(res, 403, { error: 'Forbidden' });
  if (!Object.hasOwn(mime, extname(file))) return reply(res, 404, { error: 'Not found' });
  try {
    const info = await stat(file);
    if (!info.isFile()) return reply(res, 404, { error: 'Not found' });
    const content = await readFile(file);
    res.writeHead(200, { ...responseHeaders, 'Content-Type': mime[extname(file)] });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch {
    reply(res, 404, { error: 'Not found' });
  }
}

const server = createServer(async (req, res) => {
  const start = Date.now();
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const path = url.pathname;
    if (req.method === 'POST') {
      if (!authorized(req))
        return reply(res, 401, {
          error: 'Enter the workspace access key in Settings to make changes.',
        });
      // Reject cross-site forms/fetches while allowing command-line collectors without an Origin header.
      if (req.headers.origin && req.headers.origin !== url.origin)
        return reply(res, 403, { error: 'Cross-origin writes are not allowed' });
      if (req.headers['sec-fetch-site'] === 'cross-site')
        return reply(res, 403, { error: 'Cross-site writes are not allowed' });
    }
    if (req.method === 'GET' && path === '/health') {
      return reply(res, 200, {
        service: 'carepulse-api-monitor',
        status: 'ok',
        timestamp: new Date().toISOString(),
        provider: settings.get().provider,
      });
    }
    // Settings routes expose a redacted view and persist only validated editable fields.
    if (req.method === 'GET' && path === '/api/settings')
      return reply(res, 200, publicSettings(settings.get()));
    if (req.method === 'POST' && path === '/api/settings')
      return reply(res, 200, settings.save(await getBody(req)));
    if (req.method === 'POST' && path === '/api/integrations/test-ai') {
      // Verify provider connectivity without storing a test incident.
      const cfg = settings.get();
      if (cfg.provider === 'none')
        return reply(res, 400, {
          error: 'Choose OpenAI, Ollama or Gemini and save your settings first.',
        });
      const sample = {
        api_name: 'ConnectionTestAPI',
        response_time_ms: 5500,
        status_code: 500,
        records_returned: 0,
      };
      const result = await generateAlert(sample, detectAnomalies(sample), cfg);
      return result.source.startsWith('llm_')
        ? reply(res, 200, result)
        : reply(res, 502, {
            error:
              'AI connection failed. Check your key, server address and installed model. Monitoring will continue with rule-based explanations.',
          });
    }
    // Report routes distinguish inspecting existing content from creating a new delivery.
    if (req.method === 'GET' && path === '/api/email/deliveries')
      return reply(res, 200, { deliveries: listDeliveries(db) });
    if (req.method === 'POST' && path === '/api/email/report')
      return reply(res, 200, await deliverReport(db, settings.get()));
    const previewMatch = path.match(/^\/api\/email\/deliveries\/(\d+)\/preview$/);
    if (req.method === 'GET' && previewMatch) {
      const item = db
        .prepare('SELECT subject,body FROM email_deliveries WHERE id=?')
        .get(Number(previewMatch[1]));
      return item ? reply(res, 200, item) : reply(res, 404, { error: 'Report not found' });
    }
    if (req.method === 'GET' && path === '/alerts') {
      const status = url.searchParams.get('status') || 'active';
      if (!['active', 'resolved', 'all'].includes(status))
        throw new ValidationError('status must be active, resolved, or all');
      const rawLimit = url.searchParams.get('limit') || '100';
      const limit = Number(rawLimit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 500)
        throw new ValidationError('limit must be between 1 and 500');
      const alerts = allAlerts(db, status, limit);
      return reply(res, 200, { alerts, status, count: alerts.length });
    }
    if (req.method === 'GET' && path === '/api/summary') return reply(res, 200, summary(db));
    if (req.method === 'GET' && path === '/api/observations') {
      const limit = Number(url.searchParams.get('limit') || 30);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200)
        throw new ValidationError('limit must be 1-200');
      return reply(res, 200, {
        observations: db.prepare('SELECT * FROM observations ORDER BY id DESC LIMIT ?').all(limit),
      });
    }
    if (req.method === 'POST' && path === '/monitor') {
      if (!req.headers['content-type']?.includes('application/json'))
        return reply(res, 415, { error: 'Expected Content-Type: application/json' });
      const payload = await getBody(req);
      return reply(res, 200, await processBatch(db, payload, settings.get()));
    }
    const resolveMatch = path.match(/^\/alerts\/(\d+)\/resolve$/);
    if (req.method === 'POST' && resolveMatch) {
      const outcome = resolveAlert(db, Number(resolveMatch[1]));
      return reply(res, outcome === 'not_found' ? 404 : 200, { result: outcome });
    }
    if (['GET', 'HEAD'].includes(req.method) && !path.startsWith('/api/'))
      return await serveAsset(req, res, url);
    return reply(res, 404, { error: 'Endpoint not found' });
  } catch (err) {
    const status = err instanceof ValidationError ? err.status : 500;
    log(status === 500 ? 'error' : 'warn', 'Request failed', {
      method: req.method,
      path: req.url,
      status,
      reason: err.message,
    });
    if (!res.headersSent && !res.destroyed)
      reply(res, status, {
        error: status === 500 ? 'Internal server error' : err.message,
        details: err.details || [],
      });
  } finally {
    log('info', 'HTTP request', {
      method: req.method,
      path: req.url,
      duration_ms: Date.now() - start,
    });
  }
});
server.listen(config.port, config.host, () =>
  log('info', 'Server listening', {
    url: `http://${config.host}:${config.port}`,
    ai_provider: settings.get().provider, // Report the effective saved provider rather than only its environment seed.
    slow_threshold_ms: config.slowThresholdMs,
  })
);
function close(signal) {
  log('info', 'Shutting down', { signal });
  server.close(() => {
    db.close();
    process.exit(0);
  });
  server.closeIdleConnections(); // Release keep-alive sockets promptly during test and service shutdown.
}
process.on('SIGINT', () => close('SIGINT'));
process.on('SIGTERM', () => close('SIGTERM'));
