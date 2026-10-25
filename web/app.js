// Browser state holds only presentation data and a tab-local write key; provider credentials stay on the server.
const $ = (id) => document.getElementById(id); // Keep element lookup consistent across views.
const escapeHTML = (value) =>
  String(value ?? '—').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
  ); // Escape every dynamic value inserted into HTML.
const displayTime = (date) => (date ? new Date(date).toLocaleString() : '—'); // Show incident timestamps in the viewer's timezone.
const state = {
  view: 'overview',
  status: 'active',
  settings: null,
  allAlerts: [],
  working: false,
  refreshing: false,
  settingsLoaded: false,
};
const sample = [
  // Synthetic service metrics exercise each detection rule without patient data.
  { api_name: 'PatientDataAPI', response_time_ms: 180, status_code: 200, records_returned: 50 },
  { api_name: 'AppointmentAPI', response_time_ms: 5500, status_code: 500, records_returned: 0 },
  { api_name: 'BillingAPI', response_time_ms: 3200, status_code: 200, records_returned: 100 },
  { api_name: 'LabReportsAPI', response_time_ms: 740, status_code: 200, records_returned: null },
  { api_name: 'StaffDirectoryAPI', response_time_ms: 250, status_code: 200, records_returned: 18 },
  { api_name: 'PharmacyAPI', response_time_ms: 480, status_code: 404, records_returned: 0 },
  { api_name: 'CarePlanAPI', response_time_ms: 990, status_code: 200, records_returned: 24 },
  { api_name: 'InsuranceAPI', response_time_ms: 2150, status_code: 200, records_returned: 82 },
];
const views = {
  // Centralize navigation labels so headings and browser history always agree.
  overview: [
    'Care for every connection',
    'Healthy systems. Better care.',
    'A clear view of your APIs, so your team can focus on the people who depend on them.',
  ],
  alerts: [
    'Understand the signals',
    'Clear signals. Confident action.',
    'Clear explanations and a practical next step for every issue.',
  ],
  apis: [
    'Your connected services',
    'Every service, in view.',
    'A simple view of the latest check received for each API.',
  ],
  ingest: [
    'A new observation',
    'Start with a simple check.',
    'Add response details. We’ll take care of finding the signals.',
  ],
  reports: [
    'Keep everyone informed',
    'Keep your team informed.',
    'Preview and send readable reports about active incidents.',
  ],
  settings: [
    'Make it yours',
    'Built around your team.',
    'Connect your AI provider and choose how you receive email reports.',
  ],
};
function toast(message) {
  // Announce short outcomes without blocking the user's task.
  $('toast').textContent = message;
  $('toast').classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $('toast').classList.remove('show'), 4200);
}
function notice(id, message, error = false) {
  // Persistent inline feedback remains available after the toast disappears.
  const el = $(id);
  el.hidden = false;
  el.className = `notice ${error ? 'error' : 'success'}`;
  el.textContent = message;
}
async function fetchJSON(path, options = {}) {
  // One request boundary provides consistent errors, timeouts and write-key handling.
  const result = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...($('access-key').value ? { 'x-api-key': $('access-key').value } : {}),
      ...options.headers,
    },
    signal: AbortSignal.timeout(180000),
  });
  let data;
  try {
    data = await result.json();
  } catch {
    throw new Error(`The server returned HTTP ${result.status}. Please retry.`);
  }
  if (!result.ok) throw new Error(data.error || `Request failed (HTTP ${result.status})`);
  return data;
}
function setView(next, updateHistory = true) {
  // Native hidden removes inactive controls from keyboard and screen-reader navigation.
  if (!views[next]) next = 'overview';
  state.view = next;
  document.querySelectorAll('.view').forEach((el) => (el.hidden = el.id !== `${next}-view`));
  document.querySelectorAll('.navigation [data-view]').forEach((el) => {
    if (el.dataset.view === next) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
  const [eyebrow, title, subtitle] = views[next];
  $('eyebrow').textContent = eyebrow;
  $('page-title').textContent = title;
  $('page-subtitle').textContent = subtitle;
  $('health-snapshot').hidden = next !== 'overview';
  document.querySelector('.page-heading').classList.toggle('compact', next !== 'overview');
  document.querySelector('.heading-actions').hidden = !['overview', 'alerts', 'apis'].includes(
    next
  );
  if (next === 'overview' && state.summary) renderTrend(state.summary.trend);
  if (updateHistory) history.pushState(null, '', `#${next}`); // Back and forward restore the selected view.
}
const tag = (value) => `<span class="tag ${escapeHTML(value)}">${escapeHTML(value)}</span>`; // Status text complements color for accessibility.
const empty = (title, description, action = false) =>
  `<div class="empty"><span class="empty-mark" aria-hidden="true">○</span><h3>${escapeHTML(title)}</h3><p>${escapeHTML(description)}</p>${action ? '<button data-view="ingest" class="button secondary">Add your first check ↗</button>' : ''}</div>`;
function renderStats(summary) {
  // Distinguish current service health from totals across historical checks.
  const a = summary.alerts,
    o = summary.observations,
    healthy = summary.health.filter((api) => !api.anomalous).length;
  const cards = [
    ['Services monitored', o.apis || 0, `${healthy} healthy on the latest check`],
    ['Active incidents', a.active || 0, `${a.critical || 0} need critical attention`],
    ['Checks received', o.total || 0, `${o.healthy || 0} checks without anomalies`],
    [
      'Average response',
      o.total ? `${Math.round(o.avg_response_ms).toLocaleString()} ms` : '—',
      'Across all received checks',
    ],
  ];
  $('stats').innerHTML = cards
    .map(
      ([label, value, foot]) =>
        `<article class="stat"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong><small>${escapeHTML(foot)}</small></article>`
    )
    .join('');
  $('stats').setAttribute('aria-busy', 'false');
  $('nav-alert-count').textContent = a.active || 0;
  // Latest service health stays separate from historical checks and manual resolutions.
  const serviceCount = summary.health.length;
  const healthyPercent = serviceCount ? Math.round((healthy / serviceCount) * 100) : 0;
  $('health-percentage').textContent = serviceCount ? `${healthyPercent}%` : '—';
  $('health-summary').textContent = serviceCount
    ? `${healthy} of ${serviceCount} services healthy on their latest check`
    : 'Add a check to see your service health.';
  $('health-progress').value = healthyPercent;
  const total = a.active || 0,
    title = !o.total
      ? 'Your workspace is ready'
      : total
        ? `${total} incident${total === 1 ? ' needs' : 's need'} a closer look`
        : 'No active incidents. A clear view ahead.';
  const description = !o.total
    ? 'Try sample data or add a service check to get started.'
    : total
      ? 'Review the explanations and take the next step in Alerts.'
      : 'Your received checks have no open incidents. Keep sending observations to stay informed.';
  $('health-banner').classList.toggle('attention', !!total);
  $('health-banner').innerHTML =
    `<span class="signal-mark" aria-hidden="true">${total ? '!' : '✓'}</span><div><h2>${escapeHTML(title)}</h2><p>${escapeHTML(description)}</p></div><button data-view="${total ? 'alerts' : 'ingest'}" class="text-button">${total ? 'Review incidents' : 'Add a check'} ↗</button>`;
}
function renderTrend(trend) {
  // SVG bars use presentation attributes, compatible with the strict no-inline-style CSP.
  if (!trend.length) {
    $('trend-chart').innerHTML = empty(
      'Your activity starts here',
      'Received checks and anomalies will appear after you add data.'
    );
    return;
  }
  const max = Math.max(...trend.map((day) => day.total), 1),
    width = Math.max(260, $('trend-chart').clientWidth - 54),
    step = width / 7;
  const bars = trend
    .map((day, index) => {
      const x = step * index + step / 2,
        h = (day.total / max) * 115,
        ah = (day.anomalous / max) * 115;
      return `<g><title>${escapeHTML(day.day)}: ${day.total} checks, ${day.anomalous} anomalies</title><rect class="check-bar" x="${x - 18}" y="${135 - h}" width="16" height="${h}" rx="2"/><rect class="anomaly-bar" x="${x + 3}" y="${135 - ah}" width="16" height="${ah}" rx="2"/><text x="${x}" y="160" text-anchor="middle">${escapeHTML(day.day.slice(5))}</text><text x="${x}" y="${125 - h}" text-anchor="middle">${day.total}</text></g>`;
    })
    .join('');
  $('trend-chart').innerHTML =
    `<svg class="activity-svg" viewBox="0 0 ${width} 170" role="img" aria-label="Checks and anomalies over the last seven recorded UTC days"><line x1="0" y1="135" x2="${width}" y2="135"/><line x1="0" y1="75" x2="${width}" y2="75"/>${bars}</svg>`;
}
function renderSeverity(alerts) {
  // A labeled list is easier to compare than a decorative donut chart.
  $('severity-chart').innerHTML = ['critical', 'high', 'warning']
    .map(
      (level) =>
        `<div class="priority-row ${level}-row"><span><i aria-hidden="true"></i>${level[0].toUpperCase() + level.slice(1)}</span><strong>${alerts[level] || 0}</strong></div>`
    )
    .join('');
}
function renderRecent(alerts) {
  // The overview shows the highest-priority incidents from the server's ordering.
  $('recent-alerts').innerHTML = !alerts.length
    ? empty(
        'Nothing needs your attention',
        'Add a check to begin monitoring, or try the sample data.',
        true
      )
    : `<div class="table-wrap" tabindex="0" role="region" aria-label="Active incidents"><table class="data-table"><thead><tr><th>Service / observation</th><th>Priority</th><th>Response</th><th></th></tr></thead><tbody>${alerts
        .slice(0, 5)
        .map(
          (a) =>
            `<tr><td><strong>${escapeHTML(a.api_name)}</strong><small>HTTP ${a.status_code} · ${a.records_returned ?? 'Missing'} records</small></td><td>${tag(a.severity)}</td><td class="number">${a.response_time_ms.toLocaleString()} ms</td><td><button class="text-button" data-view="alerts" aria-label="Review ${escapeHTML(a.api_name)} incident">Review ↗</button></td></tr>`
        )
        .join('')}</tbody></table></div>`;
}
function renderAlerts() {
  // Explain each incident, retaining an honest distinction between AI text and fallback text.
  const alerts = state.allAlerts.filter((a) => state.status === 'all' || a.status === state.status);
  $('alerts-list').innerHTML = !alerts.length
    ? empty('No incidents in this view', 'Try another filter or add a new service check.')
    : alerts
        .map((a) => {
          const source = a.message_source.startsWith('llm_')
            ? `AI explanation · ${a.message_source.slice(4)}`
            : a.message_source === 'rules_fallback'
              ? 'Built-in explanation · AI unavailable'
              : 'Built-in rules explanation';
          return `<article class="alert-card"><div><div class="alert-title"><h3>${escapeHTML(a.api_name)}</h3>${tag(a.severity)}${tag(a.status)}</div><p class="alert-message">${escapeHTML(a.message)}</p><div class="alert-meta"><span>HTTP ${a.status_code}</span><span>${a.response_time_ms.toLocaleString()} ms</span><span>${a.records_returned ?? 'Missing'} records</span><span>${a.occurrence_count} occurrence${a.occurrence_count === 1 ? '' : 's'}</span><span>Last seen ${escapeHTML(displayTime(a.last_seen_at))}</span></div><div class="issue-list">${a.issues.map((issue) => `<span>${escapeHTML(issue.description)}</span>`).join('')}</div><p class="alert-source">${escapeHTML(source)}</p></div>${a.status === 'active' ? `<div class="alert-action"><button class="button secondary" data-resolve="${a.id}">Mark resolved</button></div>` : ''}</article>`;
        })
        .join('');
}
function renderApis(apis) {
  // Latest observations describe health independently of manual incident resolution.
  $('api-list').innerHTML = !apis.length
    ? empty(
        'No services added yet',
        'A service appears here as soon as you send its first check.',
        true
      )
    : `<div class="table-wrap" tabindex="0" role="region" aria-label="Service health"><table class="data-table"><thead><tr><th>Service</th><th>Status</th><th>Response</th><th>Records</th><th>Last received</th><th>Health</th></tr></thead><tbody>${apis.map((a) => `<tr><td><strong>${escapeHTML(a.api_name)}</strong></td><td>HTTP ${a.status_code}</td><td class="number">${a.response_time_ms.toLocaleString()} ms</td><td>${a.records_returned ?? 'Missing'}</td><td class="number">${escapeHTML(displayTime(a.checked_at))}</td><td>${tag(a.anomalous ? 'active' : 'healthy')}</td></tr>`).join('')}</tbody></table></div>`;
}
function renderDeliveries(deliveries) {
  // Persisted status makes previews, accepted messages and failures distinguishable.
  $('delivery-list').innerHTML = !deliveries.length
    ? empty(
        'Your reports will live here',
        'New incidents create reports automatically when email is enabled.'
      )
    : `<div class="table-wrap" tabindex="0" role="region" aria-label="Email delivery history"><table class="data-table"><thead><tr><th>Report / recipient</th><th>Created</th><th>Status</th><th></th></tr></thead><tbody>${deliveries.map((item) => `<tr><td><strong>${escapeHTML(item.subject)}</strong><small>${escapeHTML(item.recipient)}</small>${item.error ? `<small>${escapeHTML(item.error)}</small>` : ''}</td><td class="number">${escapeHTML(displayTime(item.created_at))}</td><td>${tag(item.status)}</td><td><button class="text-button" data-preview="${item.id}">View report ↗</button></td></tr>`).join('')}</tbody></table></div>`;
}
function toggleSettingsFields() {
  // Disable hidden fields so native form validation never targets an invisible control.
  document.querySelectorAll('[data-provider-fields]').forEach((el) => {
    el.hidden = el.dataset.providerFields !== $('provider').value;
    el.querySelectorAll('input').forEach((input) => (input.disabled = el.hidden));
  });
  $('smtp-fields').hidden = $('email-mode').value !== 'smtp';
  $('smtp-fields')
    .querySelectorAll('input')
    .forEach((input) => (input.disabled = $('smtp-fields').hidden));
}
function fillSettings(cfg) {
  // Hydrate once; polling must not overwrite unsaved edits.
  for (const element of $('settings-form').elements) {
    if (!element.name || !(element.name in cfg)) continue;
    if (element.type === 'checkbox') element.checked = cfg[element.name];
    else element.value = cfg[element.name];
  }
  for (const [id, flag] of [
    ['openai-key', cfg.openaiKeySet],
    ['gemini-key', cfg.geminiKeySet],
    ['smtp-password', cfg.smtpPasswordSet],
  ]) {
    $(id).value = '';
    $(id).placeholder = flag ? 'Saved · leave blank to keep' : 'Enter credential';
  }
  $('access-key-hint').textContent = cfg.writeKeyRequired
    ? 'Write protection is enabled. Enter the server’s access key to save settings, add data or send reports.'
    : 'No write key is required for this local workspace.';
  $('batch-hint').textContent =
    `Up to ${cfg.maxBatchSize} checks per batch. Slow responses are above ${cfg.slowThresholdMs.toLocaleString()} ms. The whole batch is validated before saving.`;
  toggleSettingsFields();
  state.settingsLoaded = true;
}
function renderEmailMode(cfg) {
  // A preview must never be described as an email that was sent.
  const mode = {
    preview: [
      'Preview mode · nothing is emailed',
      'Reports stay in this workspace. Connect SMTP in Settings when you’re ready.',
      'Create preview ↗',
    ],
    smtp: [
      'Email delivery enabled',
      `Reports are sent to ${cfg.emailTo}. Sent means your email server accepted the message.`,
      'Send report ↗',
    ],
    off: [
      'Email reports are off',
      'Enable previews or SMTP delivery in Settings to create reports.',
      'Reports disabled',
    ],
  }[cfg.emailMode];
  $('email-mode-label').textContent = mode[0];
  $('email-mode-hint').textContent = mode[1];
  $('send-report-btn').textContent = mode[2];
  $('send-report-btn').disabled = cfg.emailMode === 'off';
}
async function refresh() {
  // Prevent overlapping polls and keep the last successful display during connection errors.
  if (state.refreshing) return false;
  state.refreshing = true;
  try {
    const [summary, all, settings, mail] = await Promise.all([
      fetchJSON('/api/summary'),
      fetchJSON('/alerts?status=all&limit=500'),
      fetchJSON('/api/settings'),
      fetchJSON('/api/email/deliveries'),
    ]);
    state.summary = summary;
    state.allAlerts = all.alerts;
    state.settings = settings;
    renderStats(summary);
    renderTrend(summary.trend);
    renderSeverity(summary.alerts);
    renderRecent(all.alerts.filter((a) => a.status === 'active'));
    renderApis(summary.health);
    renderAlerts();
    renderDeliveries(mail.deliveries);
    renderEmailMode(settings);
    if (!state.settingsLoaded) fillSettings(settings);
    $('connection-error').hidden = true;
    $('connection-status').textContent = 'Workspace online';
    $('connection-status').className = 'connection online';
    $('last-updated').textContent = `Updated ${new Date().toLocaleTimeString()}`;
    return true;
  } catch (error) {
    $('connection-status').textContent = 'Connection lost';
    $('connection-status').className = 'connection offline';
    notice(
      'connection-error',
      `Could not refresh. Displayed data may be out of date. ${error.message}`,
      true
    );
    return false;
  } finally {
    state.refreshing = false;
  }
}
async function sendInput(value) {
  // A shared busy state prevents accidental double submission from demo or import actions.
  if (state.working) return;
  state.working = true;
  const buttons = [...document.querySelectorAll('.analysis-button'), $('try-demo-btn')];
  buttons.forEach((button) => {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
  });
  try {
    const result = await fetchJSON('/monitor', { method: 'POST', body: JSON.stringify(value) });
    notice(
      'submit-response',
      `${result.received} check${result.received === 1 ? '' : 's'} analyzed. ${result.anomalous} had anomalies. View Alerts for the explanations.`
    );
    await refresh();
    toast(`${result.received} checks analyzed · ${result.anomalous} with anomalies`);
  } catch (error) {
    notice('submit-response', error.message, true);
    toast(error.message);
  } finally {
    state.working = false;
    buttons.forEach((button) => {
      button.disabled = false;
      button.removeAttribute('aria-busy');
    });
  }
}
async function runAction(button, action) {
  // Disable only the action in progress and surface errors accessibly.
  if (button.disabled) return;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try {
    await action();
  } catch (error) {
    toast(error.message);
    if (state.view === 'settings') notice('settings-response', error.message, true);
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  }
}
$('check-form').addEventListener('submit', async (event) => {
  // Translate familiar form fields into the monitoring API telemetry schema.
  event.preventDefault();
  await sendInput({
    api_name: $('api-name').value,
    response_time_ms: Number($('response-time').value),
    status_code: Number($('status-code').value),
    records_returned: $('records').value === '' ? null : Number($('records').value),
  });
});
$('settings-form').addEventListener('submit', async (event) => {
  // Send only editable settings; empty secrets preserve server-side values.
  event.preventDefault();
  await runAction($('save-settings-btn'), async () => {
    const payload = {};
    for (const el of $('settings-form').elements) {
      if (!el.name) continue;
      payload[el.name] =
        el.type === 'checkbox' ? el.checked : el.name === 'smtpPort' ? Number(el.value) : el.value;
    }
    const cfg = await fetchJSON('/api/settings', { method: 'POST', body: JSON.stringify(payload) });
    state.settings = cfg;
    fillSettings(cfg);
    renderEmailMode(cfg);
    notice(
      'settings-response',
      'Settings saved. New incidents will use these settings. You can now test your AI connection.'
    );
    toast('Workspace settings saved');
  });
});
$('provider').addEventListener('change', toggleSettingsFields);
$('email-mode').addEventListener('change', toggleSettingsFields);
$('json-file').addEventListener('change', async (event) => {
  // Read a bounded local file without uploading its original contents elsewhere.
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 1024 * 1024) throw new Error('Choose a JSON file smaller than 1 MiB.');
    $('json-input').value = await file.text();
    toast('File imported. Review it, then select Analyze data.');
  } catch (error) {
    notice('submit-response', error.message, true);
  }
  event.target.value = '';
});
document.addEventListener('click', async (event) => {
  // Delegate dynamic row buttons so refreshes do not lose their listeners.
  const nav = event.target.closest('[data-view]');
  if (nav) {
    event.preventDefault();
    setView(nav.dataset.view);
    return;
  }
  const filter = event.target.closest('[data-status]');
  if (filter) {
    state.status = filter.dataset.status;
    document
      .querySelectorAll('[data-status]')
      .forEach((el) => el.setAttribute('aria-pressed', String(el === filter)));
    renderAlerts();
    return;
  }
  const resolve = event.target.closest('[data-resolve]');
  if (resolve) {
    await runAction(resolve, async () => {
      await fetchJSON(`/alerts/${resolve.dataset.resolve}/resolve`, { method: 'POST' });
      await refresh();
      toast('Incident marked resolved. A new unhealthy check can open it again.');
    });
    return;
  }
  const preview = event.target.closest('[data-preview]');
  if (preview) {
    await runAction(preview, async () => {
      const report = await fetchJSON(`/api/email/deliveries/${preview.dataset.preview}/preview`);
      $('report-subject').textContent = report.subject;
      $('report-body').textContent = report.body;
      $('report-preview').hidden = false;
      $('report-preview').scrollIntoView({ block: 'nearest' });
    });
    return;
  }
  if (event.target.closest('#close-preview')) $('report-preview').hidden = true;
  if (event.target.closest('#refresh-btn'))
    await runAction($('refresh-btn'), async () => {
      if (await refresh()) toast('Workspace refreshed');
    });
  if (event.target.closest('#try-demo-btn')) await sendInput(sample);
  if (event.target.closest('#load-json-example')) {
    $('json-input').value = JSON.stringify(sample, null, 2);
    toast('Example inserted. Select Analyze data when ready.');
  }
  if (event.target.closest('#submit-json')) {
    let value;
    try {
      value = JSON.parse($('json-input').value);
    } catch {
      notice(
        'submit-response',
        'The JSON could not be read. Check commas and quotation marks, or import an example.',
        true
      );
      return;
    }
    await sendInput(value);
  }
  if (event.target.closest('#test-ai-btn'))
    await runAction($('test-ai-btn'), async () => {
      const result = await fetchJSON('/api/integrations/test-ai', { method: 'POST' });
      notice('settings-response', `AI connection verified. Test explanation: ${result.message}`);
    });
  if (event.target.closest('#send-report-btn'))
    await runAction($('send-report-btn'), async () => {
      const result = await fetchJSON('/api/email/report', { method: 'POST' });
      const messages = {
        preview: 'Report preview created. No email was sent.',
        sent: 'Report accepted by your email server.',
        empty: 'There are no active incidents to report.',
        disabled: 'Enable email reports in Settings.',
        failed: result.error,
      };
      await refresh();
      toast(messages[result.status] || 'Report updated');
    });
});
window.addEventListener('popstate', () => setView(location.hash.slice(1), false)); // Respect browser back and forward navigation.
setView(location.hash.slice(1), false);
refresh(); // Restore a linked view and load server data on startup.
setInterval(() => {
  if (!state.working && !document.hidden) refresh();
}, 8000); // Poll only while the workspace is visible and not ingesting.

new ResizeObserver(() => {
  if (state.summary && state.view === 'overview') renderTrend(state.summary.trend);
}).observe($('trend-chart')); // Keep chart labels readable when the viewport changes.
