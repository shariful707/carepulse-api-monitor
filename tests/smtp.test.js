// A local SMTP server verifies Nodemailer's real protocol path without contacting an external mailbox.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { createDatabase, allAlerts } from '../src/db.js';
import { processBatch } from '../src/monitor.js';
import { deliverReport } from '../src/email.js';

test('real SMTP transport delivers a digest to a loopback mail sink', async () => {
  let received = '';
  const sockets = new Set();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.setEncoding('utf8');
    socket.write('220 localhost test mail sink\r\n');
    let buffer = '',
      inData = false;
    socket.on('data', (chunk) => {
      buffer += chunk;
      while (buffer.includes('\r\n')) {
        const end = buffer.indexOf('\r\n'),
          line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (inData) {
          if (line === '.') {
            inData = false;
            socket.write('250 queued\r\n');
          } else received += line + '\n';
        } else if (/^EHLO|^HELO/.test(line)) socket.write('250 localhost\r\n');
        else if (line === 'DATA') {
          inData = true;
          socket.write('354 send message\r\n');
        } else if (line === 'QUIT') socket.end('221 bye\r\n');
        else socket.write('250 ok\r\n');
      }
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const db = createDatabase(':memory:');
  try {
    const cfg = { provider: 'none', maxBatchSize: 100, slowThresholdMs: 2000, emailMode: 'off' };
    await processBatch(
      db,
      { api_name: 'AppointmentAPI', response_time_ms: 5500, status_code: 500, records_returned: 0 },
      cfg
    );
    const result = await deliverReport(
      db,
      {
        ...cfg,
        emailMode: 'smtp',
        emailFrom: 'carepulse@example.test',
        emailTo: 'ops@example.test',
        smtpHost: '127.0.0.1',
        smtpPort: server.address().port,
        smtpSecure: false,
        smtpRequireTLS: false,
        smtpUser: '',
      },
      { alerts: allAlerts(db) }
    );
    assert.equal(result.status, 'sent');
    assert.match(received, /To: ops@example.test/);
    assert.match(received, /AppointmentAPI/);
  } finally {
    db.close();
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  }
});
