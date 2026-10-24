// Report tests use injected transports so they never email a real person.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase,allAlerts} from '../src/db.js';
import {processBatch} from '../src/monitor.js';
import {deliverReport,listDeliveries,buildReport} from '../src/email.js';

const observation = {api_name:'AppointmentAPI',response_time_ms:5500,status_code:500,records_returned:0};
const cfg = {maxBatchSize:100,slowThresholdMs:2000,provider:'none',emailMode:'preview',emailFrom:'carepulse@localhost',emailTo:''};

test('new incidents create one digest; repeated anomalies do not email again',async()=>{
  const db=createDatabase(':memory:');
  try {
    await processBatch(db,[observation,{...observation,api_name:'BillingAPI'}],cfg);
    assert.equal(listDeliveries(db).length,1);
    assert.match(listDeliveries(db)[0].subject,/2 active incidents/);
    await processBatch(db,observation,cfg);
    assert.equal(listDeliveries(db).length,1);
    assert.equal(allAlerts(db)[0].occurrence_count,2);
  } finally {db.close();}
});
test('an incident recovered within the batch creates no report',async()=>{
  const db=createDatabase(':memory:');
  try {
    await processBatch(db,[observation,{...observation,response_time_ms:100,status_code:200,records_returned:10}],cfg);
    assert.equal(listDeliveries(db).length,0);
  } finally {db.close();}
});
test('disabled email and empty reports never contact SMTP',async()=>{
  const db=createDatabase(':memory:');
  try {
    const fail=()=>{throw new Error('SMTP must not run');};
    assert.equal((await deliverReport(db,{...cfg,emailMode:'off'},{alerts:[observation]},fail)).status,'disabled');
    assert.equal((await deliverReport(db,cfg,{alerts:[]},fail)).status,'empty');
  } finally {db.close();}
});
test('SMTP acceptance is persisted; digest claims prevent duplicate delivery',async()=>{
  const db=createDatabase(':memory:');let calls=0;
  try {
    await processBatch(db,observation,{...cfg,emailMode:'off'});
    const options={alerts:allAlerts(db),dedupeKey:'test-digest'};
    const transport=options=>{assert.equal(options.requireTLS,true);return {sendMail:async message=>{calls++;assert.equal(message.to,'ops@example.com');assert.match(message.text,/HTTP 500/);return {accepted:['ops@example.com'],rejected:[]};}};};
    const smtp={...cfg,emailMode:'smtp',emailTo:'ops@example.com',smtpRequireTLS:true};
    assert.equal((await deliverReport(db,smtp,options,transport)).status,'sent');
    assert.equal((await deliverReport(db,smtp,options,transport)).status,'duplicate');
    assert.equal(calls,1);assert.ok(listDeliveries(db)[0].sent_at);
  } finally {db.close();}
});
test('SMTP errors are recorded without losing incidents or exposing credentials',async()=>{
  const db=createDatabase(':memory:');
  try {
    await processBatch(db,observation,{...cfg,emailMode:'off'});
    const result=await deliverReport(db,{...cfg,emailMode:'smtp'},{},()=>({sendMail:async()=>{throw new Error('password=secret-value');}}));
    assert.equal(result.status,'failed');assert.doesNotMatch(JSON.stringify(listDeliveries(db)),/secret-value/);
    assert.equal(allAlerts(db).length,1);
  } finally {db.close();}
});
test('plain text report retains source attribution',()=>{
  const report=buildReport([{...observation,severity:'critical',message:'Investigate logs.',message_source:'llm_ollama',last_seen_at:'2026-10-24T00:00:00Z'}]);
  assert.match(report.text,/llm_ollama/);assert.match(report.subject,/1 active incident$/);
});
