import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,realpath,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const app=path.dirname(fileURLToPath(import.meta.url));
const temporary=await mkdtemp(path.join(tmpdir(),'brainlens-brisc-regression-'));
const bundleRoot=path.join(temporary,'synthetic-only');
const python=path.resolve(app,'../../work/ml-venv/Scripts/python.exe');
await promisify(execFile)(python,['-B',path.join(app,'test_brisc_runner.py'),'--make-fixture',bundleRoot],{windowsHide:true,timeout:30000});
process.env.MRI_JOBS_DIR=path.join(temporary,'jobs');process.env.MRI_DEVICE='cpu';process.env.BRAINLENS_BRISC_BUNDLE=path.join(bundleRoot,'bundle.json');
process.env.BRAINLENS_SLICE_JOBS_DIR=path.join(temporary,'jobs/slice-research');
const {createBrainLensServer}=await import('./server.mjs');
const server=createBrainLensServer();server.listen(0,'127.0.0.1');await once(server,'listening');
const base=`http://127.0.0.1:${server.address().port}`;
after(async()=>{await new Promise(resolve=>server.close(resolve));const resolved=await realpath(temporary),parent=await realpath(tmpdir());assert.equal(path.dirname(resolved),parent);assert.ok(path.basename(resolved).startsWith('brainlens-brisc-regression-'));await rm(resolved,{recursive:true});});
async function request(route,method='GET',body,headers={}){return fetch(base+route,{method,headers:{Origin:base,...headers},body});}
const image=await readFile(path.join(bundleRoot,'synthetic.png'));
async function run(bytes=image){
 const response=await request('/api/slice-research/runs','POST',bytes,{'Content-Type':'image/png','x-brainlens-slice-contract':'contrast-t1-research-v1'});assert.equal(response.status,202,await response.clone().text());
 const {id}=await response.json();const deadline=Date.now()+30000;
 while(Date.now()<deadline){const r=await request(`/api/slice-research/runs/${id}`);assert.equal(r.status,200,await r.clone().text());const state=await r.json();if(state.state!=='running')return state;await new Promise(resolve=>setTimeout(resolve,100));}
 throw Error('Synthetic fixture run did not complete.');
}
test('separate page and slice model do not enable examination detection or alter 3D contracts',async()=>{
 const page=await request('/slice-research');assert.equal(page.status,200);assert.match(await page.text(),/whole brain examination|whole examination/i);
 const status=await (await request('/api/slice-research/status')).json();assert.equal(status.ready,true);assert.equal(status.inputUnit,'slice');assert.equal(status.spatialDimensions,2);assert.equal(status.examinationDetectionEnabled,false);
 const volumeStatus=await (await request('/api/status')).json();assert.equal(volumeStatus.capabilities.modules.find(m=>m.id==='tumour_presence').status,'unavailable');assert.equal(volumeStatus.capabilities.normalAppearingEnabled,false);
});
test('slice uploads require an explicit contract and reject volumes, media mismatches and cross-origin requests',async()=>{
 assert.equal((await request('/api/slice-research/runs','POST',image,{'Content-Type':'image/png'})).status,400);
 assert.equal((await request('/api/slice-research/runs','POST',image,{'Content-Type':'application/octet-stream','x-brainlens-slice-contract':'contrast-t1-research-v1'})).status,415);
 assert.equal((await request('/api/slice-research/runs','POST',Buffer.from('n+1\0'),{'Content-Type':'image/png','x-brainlens-slice-contract':'contrast-t1-research-v1'})).status,400);
 assert.equal((await request('/api/slice-research/runs','POST',image,{'Content-Type':'image/jpeg','x-brainlens-slice-contract':'contrast-t1-research-v1'})).status,400);
 assert.equal((await request('/api/slice-research/runs','POST',image,{'Origin':'https://external.invalid','Content-Type':'image/png'})).status,403);
});
test('synthetic TorchScript slice run saves, reopens and exports without examination claims; tampering is rejected',async()=>{
 const state=await run();assert.equal(state.state,'complete',state.message);assert.equal(state.result.inputUnit,'slice');assert.equal(state.result.overallExaminationAssessment,'inconclusive');assert.equal(state.result.normalAppearingEnabled,false);assert.equal(state.result.volumeMeasurements,null);assert.equal(state.result.provenance.runtime.device,'cpu');
 const exported=await request(`/api/slice-research/runs/${state.id}/export`);assert.equal(exported.status,200);assert.deepEqual(await exported.json(),state.result);
 const savedImage=await request(`/api/slice-research/runs/${state.id}/image`);assert.deepEqual(Buffer.from(await savedImage.arrayBuffer()),image);
 const saved=await (await request('/api/slice-research/runs')).json();assert.ok(saved.runs.some(run=>run.id===state.id));
 const studies=await (await request('/api/jobs')).json();assert.ok(!studies.studies.some(run=>run.id===state.id));
 await writeFile(path.join(temporary,'jobs/slice-research',state.id,'input-image'),Buffer.from('tampered fixture'));
 assert.equal((await request(`/api/slice-research/runs/${state.id}`)).status,409);assert.equal((await request(`/api/slice-research/runs/${state.id}/export`)).status,409);
});
test('corrupt image causes a real worker failure and never exposes a result or export',async()=>{
 const state=await run(Buffer.from([137,80,78,71,13,10,26,10,0]));assert.equal(state.state,'failed');assert.match(state.message,/failed/i);assert.equal(state.result,undefined);assert.equal((await request(`/api/slice-research/runs/${state.id}/export`)).status,409);
 await assert.rejects(stat(path.join(temporary,'jobs/slice-research',state.id,'result.json')));
});
test('missing or altered checkpoint yields unavailable/503, with no fallback predictions',async()=>{
 const original=await readFile(path.join(bundleRoot,'classifier.ts'));await writeFile(path.join(bundleRoot,'classifier.ts'),Buffer.from('altered test checkpoint'));
 try{const status=await (await request('/api/slice-research/status')).json();assert.equal(status.ready,false);assert.match(status.reason,/checksum/);assert.equal((await request('/api/slice-research/runs','POST',image,{'Content-Type':'image/png','x-brainlens-slice-contract':'contrast-t1-research-v1'})).status,503);}finally{await writeFile(path.join(bundleRoot,'classifier.ts'),original);}
 const {createBriscService}=await import('./brisc-service.mjs');const absent=await createBriscService({bundlePath:path.join(temporary,'not-installed.json')}).status();assert.equal(absent.ready,false);assert.match(absent.reason,/No compatible/);
});
