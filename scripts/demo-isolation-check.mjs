import assert from 'node:assert/strict';
import http from 'node:http';
import {createHash} from 'node:crypto';

// Deliberately fixed: this script must never touch the owner's 5188 process.
const base='http://127.0.0.1:5288';
const checks=[];
const fingerprint=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
async function request(path,{method='GET',body,headers={}}={}){
 const res=await fetch(base+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),'X-Sarj-Request':'studio',...headers},body:body?JSON.stringify(body):undefined});
 const text=await res.text();let json;try{json=JSON.parse(text)}catch{}
 return {status:res.status,text,json};
}
async function record(name,fn){await fn();checks.push({name,passed:true});}
let created;
try{
 await record('explicit demo mode before any write',async()=>{const r=await request('/api/auth/config');assert.equal(r.status,200);assert.equal(r.json.mode,'demo');assert.equal(r.json.demo,true);});
 let original,seed;
 await record('public seed and owner project isolation',async()=>{const r=await request('/api/projects');assert.equal(r.status,200);original=r.json;seed=original.find(p=>p.id==='assignment-nzl217-demo');assert.ok(seed);assert.equal(seed.testCases.length,13);assert.equal(seed.runs.length,11);assert.ok(!original.some(p=>/owner-private-sentinel|مشروع المالك الوهمي|لفافه/i.test(p.name)));assert.ok(!JSON.stringify(original).includes('/home/'));});
 const seedHash=fingerprint(seed);
 await record('external Origin GET rejected',async()=>{assert.equal((await request('/api/projects',{headers:{Origin:'https://external.example'}})).status,403);});
 await record('cross-site Fetch Metadata rejected',async()=>{assert.equal((await request('/api/projects',{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);});
 await record('missing X-Sarj mutation rejected before write',async()=>{assert.equal((await request('/api/projects',{method:'POST',body:{name:'SHOULD-NOT-EXIST-demo-check'},headers:{'X-Sarj-Request':''}})).status,403);});
 await record('external Origin mutation rejected before write',async()=>{assert.equal((await request('/api/projects',{method:'POST',body:{name:'SHOULD-NOT-EXIST-demo-check'},headers:{Origin:'https://external.example'}})).status,403);});
 await record('evil Host rejected',async()=>{const status=await new Promise((resolve,reject)=>{http.get(base+'/api/projects',{headers:{Host:'evil.example:5288'}},r=>{r.resume();resolve(r.statusCode)}).on('error',reject)});assert.equal(status,403);});
 await record('owner named project unavailable',async()=>{assert.equal((await request('/api/projects/owner-private-sentinel')).status,404);});
 await record('denied requests wrote nothing',async()=>{const r=await request('/api/projects');assert.equal(r.json.length,original.length);assert.ok(!r.json.some(p=>p.name==='SHOULD-NOT-EXIST-demo-check'));});
 await record('create isolated check with ordered steps',async()=>{let r=await request('/api/projects',{method:'POST',body:{name:'Independent demo isolation verification'}});assert.equal(r.status,200);created=r.json.id;r=await request(`/api/projects/${created}/checks`,{method:'POST',body:{title:'Independent observation remains after skipped run',expectedResult:'Expected observation marker retained',steps:['First distinct step','Second distinct step']}});assert.equal(r.status,200);assert.deepEqual(r.json.testCases[0].steps,['First distinct step','Second distinct step']);});
 let testId,marker='Independent-demo-observation-keep-20261110';
 await record('record genuine controlled API workflow observation',async()=>{let r=await request(`/api/projects/${created}`);testId=r.json.testCases[0].id;r=await request(`/api/projects/${created}/observations`,{method:'POST',body:{testCaseId:testId,outcome:'Failed',actualResult:marker,evidence:'',confirmed:true}});assert.equal(r.status,200);assert.equal(r.json.runs[0].language,'human');assert.equal(r.json.runs[0].results[0].actualResult,marker);});
 await record('unapproved local-only run produces Skipped',async()=>{let r=await request(`/api/projects/${created}/settings`,{method:'PUT',body:{baseUrl:'http://127.0.0.1:5290',language:'csharp',allowMutations:false,authToken:''}});assert.equal(r.status,200);r=await request(`/api/projects/${created}/runs`,{method:'POST',body:{language:'csharp',mode:'Automated',testIds:[testId],allowMutations:false}});assert.equal(r.status,200);const runId=r.json.id;for(let i=0;i<100;i++){r=await request(`/api/projects/${created}/runs/${runId}`);if(r.json.status!=='Running')break;await new Promise(resolve=>setTimeout(resolve,100));}assert.equal(r.json.status,'Completed');assert.equal(r.json.results[0].outcome,'Skipped');});
 await record('summary preserves manual result after Skipped',async()=>{const r=await request(`/api/projects/${created}/reports/summary?lang=en`);assert.equal(r.status,200);assert.ok(r.text.includes(marker));assert.ok(r.text.includes('Issues: 1'));assert.ok(r.text.includes('Awaiting testing: 0'));assert.ok(r.text.includes('Tester-recorded observation'));});
 await record('persisted independent records and seed unchanged',async()=>{let r=await request(`/api/projects/${created}`);assert.equal(r.json.runs.length,2);assert.equal(r.json.runs[0].results[0].outcome,'Failed');assert.equal(r.json.runs[1].results[0].outcome,'Skipped');r=await request(`/api/projects/${seed.id}`);assert.equal(fingerprint(r.json),seedHash);});
}catch(error){checks.push({name:'verification blocker',passed:false,error:error.message});process.exitCode=1;}
finally{
 if(created){try{await record('archive only verification project',async()=>{const r=await request(`/api/projects/${created}/archive`,{method:'PUT',body:{archived:true}});assert.equal(r.status,200);assert.equal(r.json.archived,true);});}catch(error){checks.push({name:'archive verification project',passed:false,error:error.message});process.exitCode=1;}}
 console.log(JSON.stringify({base,createdVerificationProject:created??null,checks,passed:checks.filter(x=>x.passed).length,failed:checks.filter(x=>!x.passed).length,scope:'5288 demo API and 5290 loopback target only; no screenshots, no external inference, no owner server requests; symlink runtime guard not tested'},null,2));
}
