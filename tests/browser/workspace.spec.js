// Each scenario uses synthetic data and preview email; no external AI or real recipients are contacted.
import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async({page,request})=>{
  await request.post('/api/settings',{data:{provider:'none',emailMode:'preview'}}); // Keep repeated test runs offline.
  await page.goto('/');await expect(page.locator('#connection-status')).toHaveText('Workspace online');
});
test('sample data, incident resolution and persisted email previews work',async({page},testInfo)=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.getByRole('button',{name:'Try sample data',exact:true}).click();
  await expect(page.locator('#try-demo-btn')).toBeEnabled();
  await expect(page.locator('#nav-alert-count')).not.toHaveText('0');
  await expect(page.locator('#recent-alerts')).toContainText('AppointmentAPI');
  await expect(page.locator('.activity-svg')).toBeVisible();
  mkdirSync('docs/screenshots',{recursive:true});
  await expect(page.locator('#toast')).not.toHaveClass(/show/); // Keep transient feedback out of documentation screenshots.
  await page.screenshot({path:`docs/screenshots/${testInfo.project.name}.png`,fullPage:true}); // Keep reproducible screenshots for the README.
  await page.locator('.navigation [data-view="alerts"]').click();
  const incident=page.locator('.alert-card').filter({has:page.getByRole('heading',{name:'AppointmentAPI',exact:true})});
  await expect(incident).toContainText('Built-in rules explanation');
  await incident.getByRole('button',{name:'Mark resolved'}).click();
  await page.getByRole('button',{name:'Resolved',exact:true}).click();
  await expect(page.locator('#alerts-list')).toContainText('AppointmentAPI');
  await page.locator('.navigation [data-view="reports"]').click();
  await page.getByRole('button',{name:'Create preview',exact:false}).click();
  await expect(page.locator('#delivery-list')).toContainText('preview');
  await page.locator('[data-preview]').first().click();
  await expect(page.locator('#report-body')).toContainText('CarePulse:');
  expect(errors).toEqual([]); // Runtime errors fail the browser scenario.
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('core views meet automated WCAG accessibility checks',async({page})=>{
  for(const view of ['overview','ingest','settings','reports','alerts','apis']) {
    await page.locator(`.navigation [data-view="${view}"]`).click();
    await page.evaluate(()=>Promise.all(document.getAnimations().map(animation=>animation.finished))); // Measure the final resting colors, not a fading intermediate frame.
    const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
    expect(result.violations.map(item=>({id:item.id,nodes:item.nodes.map(node=>({html:node.html,summary:node.failureSummary}))}))).toEqual([]);
  }
});
test('nontechnical check form and invalid JSON show useful outcomes',async({page})=>{
  await page.locator('.navigation [data-view="ingest"]').click();
  await page.getByLabel('Service name').fill('Front desk API');
  await page.getByLabel('Response time').fill('110');
  await page.getByLabel('Number of records').fill('12');
  await page.getByRole('button',{name:'Check service',exact:false}).click();
  await expect(page.locator('#submit-response')).toContainText('1 check analyzed. 0 had anomalies');
  await page.getByText('Import multiple checks',{exact:false}).click();
  await page.locator('#json-input').fill('{broken');
  await page.getByRole('button',{name:'Analyze data',exact:false}).click();
  await expect(page.locator('#submit-response')).toContainText('JSON could not be read');
});
test('provider settings save, credentials stay hidden, connection failure is honest',async({page,request})=>{
  await page.locator('.navigation [data-view="settings"]').click();
  await page.getByLabel('Explanation provider').selectOption('ollama');
  await expect(page.locator('#ollama-url')).toBeVisible();
  await page.locator('#ollama-url').fill('http://127.0.0.1:1'); // A closed port gives an immediate, deterministic local failure.
  await page.getByRole('button',{name:'Save settings',exact:false}).click();
  await expect(page.locator('#settings-response')).toContainText('Settings saved');
  await page.getByRole('button',{name:'Test saved AI connection'}).click();
  await expect(page.locator('#settings-response')).toContainText('AI connection failed');
  const saved=await (await request.get('/api/settings')).json();expect(saved.provider).toBe('ollama');expect(saved).not.toHaveProperty('openaiKey');
  await page.getByLabel('Explanation provider').selectOption('none');
  await page.getByRole('button',{name:'Save settings',exact:false}).click();
  await expect(page.locator('#settings-response')).toContainText('Settings saved');
});
test('HTTP validation, origin protection and static security headers are enforced',async({request})=>{
  const invalid=await request.post('/monitor',{data:[{api_name:'Invalid',status_code:999,response_time_ms:1}]});expect(invalid.status()).toBe(400);
  const crossSite=await request.post('/api/settings',{headers:{Origin:'https://untrusted.example'},data:{provider:'none'}});expect(crossSite.status()).toBe(403);
  const badSetting=await request.post('/api/settings',{data:{provider:'unknown'}});expect(badSetting.status()).toBe(400);
  const response=await request.get('/');expect(response.headers()['content-security-policy']).toContain("script-src 'self'");
  expect((await request.get('/missing-file.js')).status()).toBe(404);
});
