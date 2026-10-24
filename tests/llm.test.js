import test from 'node:test';
import assert from 'node:assert/strict';
import {generateAlert,SYSTEM_PROMPT} from '../src/llm.js';
import {detectAnomalies} from '../src/detection.js';
const obs={api_name:'AppointmentAPI',response_time_ms:5300,status_code:500,records_returned:0};
const issue=detectAnomalies(obs);
test('none mode never calls provider and labels rules template',async()=>{
 const r=await generateAlert(obs,issue,{provider:'none'});
 assert.equal(r.source,'rules_template'); assert.match(r.message,/HTTP 500/);
});
test('Gemini adapter builds structured prompt, reads generated text',async()=>{
 const saved=globalThis.fetch; let body;
 globalThis.fetch=async (url,options)=>{
   assert.match(url,/generativelanguage\.googleapis\.com/);
   assert.equal(options.headers['x-goog-api-key'],'test-key');
   body=JSON.parse(options.body);
   return {ok:true,text:async()=>JSON.stringify({candidates:[{content:{parts:[{text:'AppointmentAPI returned HTTP 500; investigate upstream logs.'}]}}]})};
 };
 try{const r=await generateAlert(obs,issue,{provider:'gemini',geminiKey:'test-key',geminiModel:'test-model'});
  assert.equal(r.source,'llm_gemini');assert.match(r.message,/upstream logs/);
  assert.match(body.systemInstruction.parts[0].text,/Do not invent/);
  assert.equal(JSON.parse(body.contents[0].parts[0].text).status_code,500);
 }finally{globalThis.fetch=saved}
});
test('provider error uses accurately labeled rule fallback',async()=>{
 const saved=globalThis.fetch;
 globalThis.fetch=async()=>({ok:false,status:429,text:async()=>'{"error":"rate limited"}'});
 try{const r=await generateAlert(obs,issue,{provider:'gemini',geminiKey:'fake',geminiModel:'demo'});
  assert.equal(r.source,'rules_fallback');assert.match(r.message,/HTTP 500/)
 }finally{globalThis.fetch=saved}
});
test('OpenAI adapter reads chat completion text',async()=>{
 const saved=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{
   assert.equal(url,'https://api.openai.com/v1/chat/completions');
   assert.equal(options.headers.Authorization,'Bearer demo-key');
   const request=JSON.parse(options.body);
   assert.equal(request.messages[0].role,'system');
   return {ok:true,text:async()=>JSON.stringify({choices:[{message:{content:'AppointmentAPI returned HTTP 500; check the service logs.'}}]})};
 };
 try{const r=await generateAlert(obs,issue,{provider:'openai',openaiKey:'demo-key',openaiModel:'demo'});
  assert.equal(r.source,'llm_openai')
 }finally{globalThis.fetch=saved}
});

test('Ollama uses native local chat API, disables streaming and needs no cloud key',async()=>{
 const saved=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{
   assert.equal(url,'http://127.0.0.1:11434/api/chat');
   assert.equal(options.headers.Authorization,undefined);
   const request=JSON.parse(options.body);
   assert.equal(request.stream,false);assert.equal(request.model,'llama3.2:3b');
   assert.equal(JSON.parse(request.messages[1].content).status_code,500);
   return {ok:true,text:async()=>JSON.stringify({message:{content:'AppointmentAPI returned HTTP 500; investigate service logs.'}})};
 };
 try {assert.equal((await generateAlert(obs,issue,{provider:'ollama',ollamaBaseUrl:'http://127.0.0.1:11434/',ollamaModel:'llama3.2:3b'})).source,'llm_ollama');}
 finally {globalThis.fetch=saved;}
});
test('unavailable local server, malformed JSON and empty answers fall back safely',async()=>{
 const saved=globalThis.fetch;
 try {
   for(const fetcher of [async()=>{throw new TypeError('fetch failed');},async()=>({ok:true,text:async()=>'broken json'}),async()=>({ok:true,text:async()=>'{}'})]) {
     globalThis.fetch=fetcher;
     const result=await generateAlert(obs,issue,{provider:'ollama',ollamaBaseUrl:'http://localhost:11434',ollamaModel:'test'});
     assert.equal(result.source,'rules_fallback');assert.match(result.message,/HTTP 500/);
   }
 } finally {globalThis.fetch=saved;}
});
