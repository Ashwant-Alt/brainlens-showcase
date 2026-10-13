import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const fixtureRoot=await mkdtemp(path.join(tmpdir(),'brainlens-regression-'));
process.env.MRI_JOBS_DIR=fixtureRoot;process.env.MRI_DEVICE='cpu';
const {createBrainLensServer}=await import('./server.mjs');
const server=createBrainLensServer();server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
after(async()=>{await new Promise(resolve=>server.close(resolve));const resolved=await realpath(fixtureRoot),parent=await realpath(tmpdir());assert.equal(path.dirname(resolved),parent);assert.ok(path.basename(resolved).startsWith('brainlens-regression-'));await rm(resolved,{recursive:true});});
async function request(route,method='GET',body,headers={}){return fetch(base+route,{method,headers:{Origin:base,...headers},body});}
async function create(){const r=await request('/api/jobs','POST',JSON.stringify({prepared:true,modelId:'segresnet'}));assert.equal(r.status,200);return (await r.json()).id;}
function volume(translation=0){
 const b=Buffer.alloc(352+16**3*4);b.writeInt32LE(348);b.writeInt16LE(3,40);for(const offset of [42,44,46])b.writeInt16LE(16,offset);b.writeInt16LE(16,70);b.writeInt16LE(32,72);b.writeFloatLE(352,108);b.writeFloatLE(1,112);b[123]=2;b.writeInt16LE(1,252);b.writeInt16LE(1,254);for(const offset of [80,84,88,280,300,320])b.writeFloatLE(1,offset);b.writeFloatLE(translation,268);b.writeFloatLE(translation,292);b.write('n+1\0',344);for(let i=0;i<16**3;i++)b.writeFloatLE(i%101,352+i*4);return b;
}
test('API enforces preparation consent and supported imaging model names',async()=>{
 for(const body of [{prepared:'true'},{prepared:false},{prepared:true,modelId:'unknown'}])assert.equal((await request('/api/jobs','POST',JSON.stringify(body))).status,400);
});
test('uploads validate geometry, reject invalid formats and cannot overwrite a saved image',async()=>{
 const id=await create();assert.equal((await request(`/api/jobs/${id}/t1c`,'PUT',Buffer.from('bad'),{'x-volume-format':'nii'})).status,400);
 assert.equal((await request(`/api/jobs/${id}/t1c`,'PUT',volume(),{'x-volume-format':'png'})).status,400);
 const upload=await request(`/api/jobs/${id}/t1c`,'PUT',volume(),{'x-volume-format':'nii'});assert.equal(upload.status,200);assert.equal((await upload.json()).validated,true);
 assert.equal((await request(`/api/jobs/${id}/t1c`,'PUT',volume(4),{'x-volume-format':'nii'})).status,409);
 assert.equal((await request(`/api/jobs/${id}/t2`,'PUT',volume(4),{'x-volume-format':'nii'})).status,400);
 assert.deepEqual(await readFile(path.join(fixtureRoot,id,'t1c.nii')),volume());
 assert.equal((await request(`/api/jobs/${id}/run`,'POST')).status,400);
 assert.equal((await request(`/api/jobs/${id}`,'DELETE')).status,409);
 assert.equal((await request(`/api/jobs/${id}/review`,'PUT',JSON.stringify({observations:'no result'}))).status,409);
});
test('an actual worker validation failure returns failed state with no fabricated mask or result',async()=>{
 const id=await create();for(const name of ['t1c','t1','t2','flair'])assert.equal((await request(`/api/jobs/${id}/${name}`,'PUT',volume(),{'x-volume-format':'nii'})).status,200);
 // Tamper only this test-owned input after upload to exercise the worker's
 // independent validation, rather than rely solely on browser/server checks.
 await writeFile(path.join(fixtureRoot,id,'t1c.nii'),Buffer.from('invalid'));
 assert.equal((await request(`/api/jobs/${id}/run`,'POST')).status,202);
 let state;const deadline=Date.now()+20000;
 do{state=await (await request(`/api/jobs/${id}`)).json();if(state.state==='running')await new Promise(resolve=>setTimeout(resolve,100));}while(state.state==='running'&&Date.now()<deadline);
 assert.equal(state.state,'failed');assert.match(state.message,/Truncated|invalid/i);assert.equal(state.result,undefined);assert.equal((await request(`/api/jobs/${id}/mask`)).status,409);
 await assert.rejects(readFile(path.join(fixtureRoot,id,'mask.nii')));await assert.rejects(readFile(path.join(fixtureRoot,id,'result.json')));
});
test('a missing selected checkpoint returns 503 even when another model remains installed',async t=>{
 const script="const {createBrainLensServer}=await import('./server.mjs');const s=createBrainLensServer();s.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({port:s.address().port})));";
 const child=spawn(process.execPath,['--input-type=module','-e',script],{cwd:path.dirname(fileURLToPath(import.meta.url)),env:{...process.env,MRI_SEGRESNET_WEIGHTS:path.join(fixtureRoot,'missing.pt')},windowsHide:true,stdio:['ignore','pipe','pipe']});
 t.after(async()=>{if(child.exitCode!==null)return;const exited=once(child,'exit');child.kill();await exited;});
 const port=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Fixture server startup timed out')),5000);child.on('error',e=>{clearTimeout(timer);reject(e);});child.stdout.on('data',chunk=>{output+=chunk;try{const value=JSON.parse(output);clearTimeout(timer);resolve(value.port);}catch{}});});
 const origin=`http://127.0.0.1:${port}`;const response=await fetch(origin+'/api/jobs',{method:'POST',headers:{Origin:origin},body:JSON.stringify({prepared:true,modelId:'segresnet'})});assert.equal(response.status,503);assert.match(await response.text(),/not installed/);
});
test('corrupted saved output is not reopened as a completed result',async()=>{
 const id=randomUUID(),folder=path.join(fixtureRoot,id);await mkdir(folder);
 await writeFile(path.join(folder,'session.json'),JSON.stringify({schemaVersion:2,id,modelId:'segresnet',state:'complete',sequences:[],createdAt:Date.now()}));
 await writeFile(path.join(folder,'mask.nii'),volume());
 await writeFile(path.join(folder,'result.json'),JSON.stringify({schemaVersion:2,modelId:'segresnet',candidateRegionVolumesMl:{whole_region:0,core_region:0,enhancing_region:0},spatialValidation:{verified:true,maskSHA256:'wrong'}}));
 const state=await (await request('/api/jobs/'+id)).json();assert.equal(state.state,'failed');assert.match(state.message,/checksum changed/);assert.equal(state.result,undefined);
});

test('assessment with a changed saved linkage is rejected without changing its files',async()=>{
 const id=randomUUID(),folder=path.join(fixtureRoot,id);await mkdir(folder);const hash=b=>createHash('sha256').update(b).digest('hex');
 const input=volume(),mask=volume();mask.fill(0,352);const names=['t1c','t1','t2','flair'];
 for(const name of names)await writeFile(path.join(folder,name+'.nii'),input);
 await writeFile(path.join(folder,'mask.nii'),mask);
 const result={schemaVersion:2,modelId:'segresnet',dimensions:[16,16,16],candidateRegionVolumesMl:{whole_region:0,core_region:0,enhancing_region:0},inputSha256:Object.fromEntries(names.map(n=>[n,hash(input)])),spatialValidation:{verified:true,maskSHA256:hash(mask)}};
 const resultBytes=JSON.stringify(result);await writeFile(path.join(folder,'result.json'),resultBytes);
 const assessment=JSON.stringify({resultSHA256:'wrong-result',maskSHA256:hash(mask)});await writeFile(path.join(folder,'assessment.json'),assessment);
 await writeFile(path.join(folder,'session.json'),JSON.stringify({schemaVersion:2,id,modelId:'segresnet',state:'complete',sequences:names,createdAt:Date.now(),resultSHA256:hash(resultBytes),assessmentSHA256:hash(assessment)}));
 const state=await (await request('/api/jobs/'+id)).json();assert.equal(state.state,'failed');assert.match(state.message,/assessment linkage changed/);assert.equal(state.result,undefined);assert.equal(state.assessment,undefined);
 assert.equal(await readFile(path.join(folder,'assessment.json'),'utf8'),assessment);
});

test('saved export reopens synthetic software fixtures, preserves old policy and rejects changed source bytes',async()=>{
 const id=randomUUID(),folder=path.join(fixtureRoot,id);await mkdir(folder);const hash=b=>createHash('sha256').update(b).digest('hex');
 const input=volume(),mask=volume();mask.fill(0,352);const names=['t1c','t1','t2','flair'];
 for(const name of names)await writeFile(path.join(folder,name+'.nii'),input);
 await writeFile(path.join(folder,'mask.nii'),mask);
 const result={schemaVersion:2,modelId:'segresnet',dimensions:[16,16,16],candidateRegionVolumesMl:{whole_region:0,core_region:0,enhancing_region:0},inputSha256:Object.fromEntries(names.map(n=>[n,hash(input)])),spatialValidation:{verified:true,maskSHA256:hash(mask)}};
 const resultBytes=JSON.stringify(result);await writeFile(path.join(folder,'result.json'),resultBytes);
 await mkdir(path.join(folder,'provenance'));const policy=Buffer.from('test-owned historical policy');await writeFile(path.join(folder,'provenance/review-integrity.mjs'),policy);
 const original={state:'historical research output'};
 const assessmentBytes=JSON.stringify({resultSHA256:hash(resultBytes),maskSHA256:hash(mask),policySHA256:hash(policy),assessment:original});
 await writeFile(path.join(folder,'assessment.json'),assessmentBytes);
 await writeFile(path.join(folder,'session.json'),JSON.stringify({schemaVersion:2,id,modelId:'segresnet',state:'complete',sequences:names,createdAt:Date.now(),resultSHA256:hash(resultBytes),assessmentSHA256:hash(assessmentBytes)}));
 const response=await request(`/api/jobs/${id}/export`);assert.equal(response.status,200);const exported=await response.json();
 assert.deepEqual(exported.savedAssessment.assessment,original);assert.equal(exported.currentAssessment.overall.state,'inconclusive');
 assert.equal((await request(`/api/jobs/${id}/review`,'PUT',JSON.stringify({observations:'Fixture review note'}))).status,200);
 assert.equal((await (await request(`/api/jobs/${id}/export`)).json()).humanReview.observations,'Fixture review note');
 const sourceBefore=await readFile(path.join(folder,'assessment.json'),'utf8');assert.equal(sourceBefore,assessmentBytes);
 await writeFile(path.join(folder,'t2.nii'),Buffer.from('test-only corruption'));
 assert.equal((await request(`/api/jobs/${id}/export`)).status,409);
 const state=await (await request(`/api/jobs/${id}`)).json();assert.equal(state.state,'failed');assert.equal(state.currentAssessment,undefined);assert.equal(state.result,undefined);
});

test('simultaneous new uploads reserve slots before asynchronous directory creation',async()=>{
 const responses=await Promise.all(Array.from({length:12},()=>request('/api/jobs','POST',JSON.stringify({prepared:true,modelId:'segresnet'}))));
 const accepted=responses.filter(r=>r.status===200);assert.ok(accepted.length>0&&accepted.length<=5);assert.ok(responses.some(r=>r.status===429));
 const {readdir}=await import('node:fs/promises');let uploads=0;
 for(const folder of await readdir(fixtureRoot)){try{const record=JSON.parse(await readFile(path.join(fixtureRoot,folder,'session.json'),'utf8'));if(record.state==='uploading')uploads++;}catch{}}
 assert.equal(uploads,5);
});
