import {readFile} from 'node:fs/promises';
const mode=process.argv[2]||'sample';
const path = mode==='recover' ? './samples/recovered-api.json':'./samples/api-responses.json';
const url=process.env.BASE_URL||'http://127.0.0.1:3000';
try {
 const payload=await readFile(path,'utf8');
 const result=await fetch(`${url}/monitor`,{
  method:'POST',headers:{'Content-Type':'application/json',...(process.env.MONITOR_API_KEY?{'x-api-key':process.env.MONITOR_API_KEY}:{})},
  body:payload,signal:AbortSignal.timeout(25000)
 });
 console.log(JSON.stringify(await result.json(),null,2));
 if (!result.ok) process.exitCode=1;
} catch(error){console.error('Demo request failed:',error.message);console.error('Is the server running? Start it with npm start in another terminal.');process.exitCode=1}
