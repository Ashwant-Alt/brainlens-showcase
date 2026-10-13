import {access,readFile,mkdir,writeFile,rename,readdir,stat,copyFile} from 'node:fs/promises';
import {createWriteStream,createReadStream,constants} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';
import {spawn} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {draftSummary} from './nvidia.mjs';
import {validateFindingResult} from './finding-review.mjs';
import {inferenceProgress} from './inference-progress.mjs';
import {readVolumeFile,validateInputBuffer} from './input-validation.mjs';
import {parseNifti} from './volume.mjs';
import {readSpatialInfo,sameGeometry} from './viewer-guidance.mjs';
import {verifyMaskResult,explainAssessment} from './review-integrity.mjs';
import {capabilities} from './capabilities.mjs';
import {createReviewExport} from './review-export.mjs';
const root=fileURLToPath(new URL('../../work/',import.meta.url));
const python=path.join(root,'ml-venv','Scripts','python.exe'),weights=process.env.MRI_SEGRESNET_WEIGHTS?path.resolve(process.env.MRI_SEGRESNET_WEIGHTS):path.join(root,'model-weights','model.pt');
const jobsRoot=process.env.MRI_JOBS_DIR?path.resolve(process.env.MRI_JOBS_DIR):path.join(root,'mri-jobs');
const runner=fileURLToPath(new URL('./validated_model_runner.py',import.meta.url));
const gpuBootstrap=fileURLToPath(new URL('./gpu_model_runner.py',import.meta.url));
const gpuRunner=fileURLToPath(new URL('./validated_gpu_runner.py',import.meta.url));
const gpuPython=path.join(root,'gpu-venv','Scripts','python.exe');
const gpuVerification='D:/BrainLens-research/website-gpu-inference-profile-v1/VERIFICATION.json';
async function verifiedGpuReady(){try{
 if(process.env.MRI_DEVICE==='cpu')return false;
 await access(gpuPython);
 const verified=JSON.parse(await readFile(gpuVerification,'utf8'));
 const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
 return verified.eligibleForSameModelDeviceUpgrade===true&&verified.nativeGPUExitCode===0
  &&verified.runnerSha256===hash(await readFile(gpuBootstrap))&&verified.weightsSha256===hash(await readFile(weights));
}catch{return false;}}
const models={segresnet:{name:'MONAI BraTS SegResNet 0.5.4',weights},swinunetr:{name:'MONAI Swin UNETR BraTS21 · fold 0',weights:path.join(root,'swin-weights','weights-only.pt')}};
const jobs=new Map();let active=null,pendingUploads=0;
const sequences=['t1c','t1','t2','flair'];
const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function persist(job){
 const data={schemaVersion:2,id:job.id,modelId:job.modelId,state:job.state,createdAt:job.createdAt,
  sequences:Object.keys(job.files),message:job.message,reviewFilename:job.reviewFilename,resultSHA256:job.resultSHA256,assessmentSHA256:job.assessmentSHA256};
 const temporary=path.join(job.dir,`session-${randomUUID()}.tmp`);
 await writeFile(temporary,JSON.stringify(data,null,2),{flag:'wx'});await rename(temporary,path.join(job.dir,'session.json'));
}
async function verifySaved(job){
 const resultBytes=await readFile(path.join(job.dir,'result.json'));
 if(job.resultSHA256&&hash(resultBytes)!==job.resultSHA256)throw Error('Saved result metadata checksum changed.');
 const result=JSON.parse(resultBytes);
 validateFindingResult(result);
 if(result.schemaVersion!==2||result.modelId!==job.modelId||result.spatialValidation?.verified!==true)throw Error('Saved run lacks verified spatial provenance.');
 const maskBytes=await readFile(path.join(job.dir,'mask.nii'));
 if(hash(maskBytes)!==result.spatialValidation.maskSHA256)throw Error('Saved segmentation checksum changed.');
 for(const name of sequences)if(hash(await readFile(job.files[name]))!==result.inputSha256?.[name])throw Error('Saved input checksum changed.');
 const maskBuffer=maskBytes.buffer.slice(maskBytes.byteOffset,maskBytes.byteOffset+maskBytes.byteLength);
 const mask={...parseNifti(maskBuffer),geometry:readSpatialInfo(maskBuffer)};
 const source=validateInputBuffer(await readVolumeFile(job.files.t1c));
 if(!sameGeometry(source,mask))throw Error('Saved segmentation and source coordinates disagree.');
 const integrity=verifyMaskResult(result,mask),assessment=explainAssessment(result,integrity);
 job.integrity=integrity;job.currentAssessment=assessment;
 if(job.assessmentSHA256){
  const bytes=await readFile(path.join(job.dir,'assessment.json')),saved=JSON.parse(bytes);
  if(hash(bytes)!==job.assessmentSHA256||saved.resultSHA256!==hash(resultBytes)||saved.maskSHA256!==result.spatialValidation.maskSHA256)throw Error('Saved assessment linkage changed.');
  if(saved.policySHA256!==hash(await readFile(path.join(job.dir,'provenance/review-integrity.mjs'))))throw Error('Saved assessment policy checksum changed.');
  // Preserve the historical assessment; the browser also computes the current
  // evidence gate. Future policy changes must not rewrite old research output.
  job.assessment=saved.assessment;
  job.savedAssessment={assessment:saved.assessment,policySHA256:saved.policySHA256,recordSHA256:job.assessmentSHA256,resultSHA256:saved.resultSHA256,historical:true};
 }else {job.assessment=assessment;job.savedAssessment=null;}
 return result;
}
async function recover(id){
 if(jobs.has(id))return jobs.get(id);if(!idPattern.test(id))return null;
 try{
  const dir=path.join(jobsRoot,id),data=JSON.parse(await readFile(path.join(dir,'session.json'),'utf8'));
  if(data.schemaVersion!==2||data.id!==id||!Object.hasOwn(models,data.modelId)||!Array.isArray(data.sequences))return null;
  const files={};for(const name of data.sequences){if(!sequences.includes(name))return null;for(const ext of ['nii','nii.gz']){const f=path.join(dir,`${name}.${ext}`);try{await access(f);files[name]=f;break;}catch{}}}
  const job={...data,dir,files};
  if(job.state==='running'){job.state='failed';job.message='The server restarted before completion. No verified output is available; start a new run.';}
  if(job.state==='complete'){try{job.result=await verifySaved(job);}catch(e){job.state='failed';job.message=e.message;}}
  jobs.set(id,job);return job;
 }catch{return null;}
}
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const json=(res,data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
async function body(req,limit=2000){const chunks=[];let bytes=0;for await(const c of req){bytes+=c.length;if(bytes>limit)fail(413,'Request too large');chunks.push(c);}try{return JSON.parse(Buffer.concat(chunks,bytes).toString('utf8'));}catch{fail(400,'Invalid request');}}
export async function modelStatus(){let runtime=true;try{await Promise.all([access(python),access(path.join(root,'ml-venv','Lib','site-packages','monai'))]);}catch{runtime=false;}const gpuReady=runtime&&await verifiedGpuReady();const available=await Promise.all(Object.entries(models).map(async([id,model])=>{let ready=runtime;try{await access(model.weights);}catch{ready=false;}return{id,name:model.name,ready,device:id==='segresnet'&&gpuReady?'CUDA':'CPU'};}));return{imagingModel:'Local MRI research models',models:available,ready:available.some(m=>m.ready),device:gpuReady?'GPU for SegResNet; CPU for Swin UNETR':'CPU',scope:'Glioma-region segmentation on prepared four-sequence studies',externalApi:false,capabilities:capabilities(available)};}
export async function handleModelRequest(req,res){
 if(req.url==='/api/jobs'&&req.method==='GET'){
  let entries=[];try{entries=await readdir(jobsRoot,{withFileTypes:true});}catch{}
  const saved=[];for(const entry of entries){if(!entry.isDirectory()||!idPattern.test(entry.name))continue;const job=await recover(entry.name);if(job&&job.state==='complete')saved.push({id:job.id,modelId:job.modelId,createdAt:job.createdAt});}
  return json(res,{studies:saved.sort((a,b)=>b.createdAt-a.createdAt),retention:'Saved runs remain until explicitly managed. No automatic deletion.'});
 }
 if(req.url==='/api/jobs'&&req.method==='POST'){
  const input=await body(req);if(input.prepared!==true)fail(400,'Confirm that your research study meets the model preparation requirements.');
  const modelId=input.modelId??'segresnet';if(!Object.hasOwn(models,modelId))fail(400,'Unknown imaging model.');
  if(!(await modelStatus()).models.find(m=>m.id===modelId)?.ready)fail(503,'The selected model is not installed.');
  if([...jobs.values()].filter(j=>j.state==='uploading').length+pendingUploads>=5)fail(429,'Five unfinished uploads exist. Complete an existing study before adding another.');
  pendingUploads++;
  try{const id=randomUUID(),dir=path.join(jobsRoot,id);await mkdir(dir,{recursive:true});const job={id,dir,modelId,state:'uploading',files:{},createdAt:Date.now()};await persist(job);jobs.set(id,job);return json(res,{id,modelId});}
  finally{pendingUploads--;}
 }
 const m=req.url.match(/^\/api\/jobs\/([0-9a-f-]{36})(?:\/(t1c|t1|t2|flair|run|mask|summary|review|export))?$/);
 const job=m?await recover(m[1]):null;if(!job)fail(404,'Saved study not found.');
 const action=m[2];
 if(action==='export'&&req.method==='GET'){
  if(job.state!=='complete')fail(409,'A verified completed run is required for a saved-result export.');
  try{job.result=await verifySaved(job);}catch(e){fail(409,e.message);}
  let observations='';
  if(/^review-[0-9a-f-]{36}\.json$/.test(job.reviewFilename||'')){
   const review=JSON.parse(await readFile(path.join(job.dir,job.reviewFilename),'utf8'));
   if(review.jobId!==job.id||review.resultSHA256!==hash(await readFile(path.join(job.dir,'result.json'))))fail(409,'Saved review no longer matches this result.');
   observations=review.observations;
  }
  res.setHeader('Content-Disposition','attachment; filename="brainlens-research-review.json"');
  return json(res,createReviewExport({result:job.result,integrity:job.integrity,jobId:job.id,savedAssessment:job.savedAssessment,observations}));
 }
 if(action==='review'&&req.method==='PUT'){
  if(job.state!=='complete')fail(409,'A verified completed run is required before saving a review.');
  const input=await body(req,64000);if(typeof input.observations!=='string'||input.observations.length>20000)fail(400,'Review notes must be text under 20,000 characters.');
  try{job.result=await verifySaved(job);}catch(e){fail(409,e.message);}
  const filename=`review-${randomUUID()}.json`;
  const review={schemaVersion:2,jobId:job.id,savedAt:new Date().toISOString(),observations:input.observations,
   resultSHA256:hash(await readFile(path.join(job.dir,'result.json'))),maskSHA256:job.result.spatialValidation.maskSHA256,
   inputSHA256:job.result.inputSha256,modelId:job.modelId,weightsSHA256:job.result.weightsSha256,assessment:job.assessment,assessmentSHA256:job.assessmentSHA256};
  await writeFile(path.join(job.dir,filename),JSON.stringify(review,null,2),{flag:'wx'});job.reviewFilename=filename;job.resultSHA256=review.resultSHA256;await persist(job);return json(res,{saved:true,jobId:job.id,savedAt:review.savedAt});
 }
 if(action==='review'&&req.method==='GET'){
  if(job.state!=='complete')fail(409,'A verified completed run is required before reopening a review.');
  try{job.result=await verifySaved(job);}catch(e){fail(409,e.message);}
  if(!/^review-[0-9a-f-]{36}\.json$/.test(job.reviewFilename||''))return json(res,{observations:''});
  const review=JSON.parse(await readFile(path.join(job.dir,job.reviewFilename),'utf8'));
  if(review.jobId!==job.id||review.resultSHA256!==hash(await readFile(path.join(job.dir,'result.json'))))fail(409,'Saved review no longer matches this result.');
  return json(res,review);
 }
 if(action==='summary'&&req.method==='POST'){
  const input=await body(req);if(input.consent!==true)fail(400,'Confirm sending the limited results to NVIDIA before requesting a draft.');
  if(job.state!=='complete')fail(409,'Run the local imaging model first.');
  try{job.result=await verifySaved(job);}catch(e){fail(409,e.message);}
  if(job.summarizing)fail(409,'A summary is already being drafted.');
  job.summarizing=true;try{return json(res,await draftSummary(job.result));}finally{job.summarizing=false;}
 }
 if(!action&&req.method==='DELETE')fail(409,'Saved research files are retained. Clear the displayed result or start a new run; filesystem removal requires an explicit reviewed action.');
 if(!action&&req.method==='GET'){
  if(job.state==='complete')try{job.result=await verifySaved(job);}catch(e){job.state='failed';job.result=undefined;job.message=e.message;}
  let progress=null;try{if(job.state==='running')progress=inferenceProgress(await readFile(path.join(job.dir,'progress.json'),'utf8'));}catch{}
  const message=progress?`Processing ${progress.completedImageBlocks} of ${progress.totalImageBlocks} overlapping image blocks. This is processing progress, not medical confidence.`:job.message;
  return json(res,{id:job.id,modelId:job.modelId,state:job.state,message,progress,result:job.result,assessment:job.state==='complete'?job.assessment:undefined,currentAssessment:job.state==='complete'?job.currentAssessment:undefined,savedAssessment:job.state==='complete'?job.savedAssessment:undefined});
 }
 if(['t1c','t1','t2','flair'].includes(action)&&req.method==='PUT'){
  if(job.state!=='uploading')fail(409,'This study is locked. Start a new study.');
  if(job.uploading)fail(409,'An upload is already in progress.');
  if(job.files[action])fail(409,'This image set is already saved. Start a new run to change inputs.');
  const ext=req.headers['x-volume-format'];if(!['nii','nii.gz'].includes(ext))fail(400,'Choose a supported MRI volume.');
  const filename=path.join(job.dir,`${action}.${ext}`),temporary=path.join(job.dir,`upload-${randomUUID()}.${ext}`);let count=0;job.uploading=true;
  try{await pipeline(req,new Transform({transform(chunk,encoding,callback){count+=chunk.length;if(count>100*1024*1024)callback(Object.assign(new Error('Volume exceeds 100 MB'),{status:413}));else callback(null,chunk);}}),createWriteStream(temporary,{flags:'wx'}));if(!count)fail(400,'Empty upload');
   let volume;try{volume=validateInputBuffer(await readVolumeFile(temporary,ext==='nii.gz'));}catch(e){fail(e.status||400,`Invalid ${action} image: ${e.message}`);}
   if(Object.keys(job.files).length){const first=validateInputBuffer(await readVolumeFile(Object.values(job.files)[0]));if(!sameGeometry(first,volume))fail(400,'The four image sets must share dimensions and affine alignment.');}
   await rename(temporary,filename);job.files[action]=filename;await persist(job);return json(res,{uploaded:action,validated:true,dimensions:volume.dims});
  }finally{job.uploading=false;}
 }
 if(action==='run'&&req.method==='POST'){
  if(active)fail(409,'Another study is processing. Try again after it finishes.');
  if(job.state!=='uploading'||job.uploading||Object.keys(job.files).length!==4)fail(400,'Upload all four image sets before running.');
  active=job.id;job.state='running';
  try{if(!(await modelStatus()).models.find(m=>m.id===job.modelId)?.ready)fail(503,'The selected model checkpoint/runtime is unavailable.');await writeFile(path.join(job.dir,'input.json'),JSON.stringify(job.files),{flag:'wx'});
   const sourceDir=path.join(job.dir,'provenance');await mkdir(sourceDir);
   for(const name of ['validated_model_runner.py','mri_validation.py','validated_gpu_runner.py','segresnet-config.json','review-integrity.mjs','finding-review.mjs','candidate-location.mjs'])await copyFile(fileURLToPath(new URL(name,import.meta.url)),path.join(sourceDir,name),constants.COPYFILE_EXCL);
   await persist(job);
  }catch(e){active=null;job.state='failed';job.message='Run initialization failed; inputs were retained. Start a new session.';try{await persist(job);}catch{}throw e;}
  const useGPU=job.modelId==='segresnet'&&await verifiedGpuReady();
  job.message=`Running ${models[job.modelId].name} locally on ${useGPU?'the GPU':'the CPU'}. Processing time depends on study size.`;
  const child=spawn(useGPU?gpuPython:python,['-B',useGPU?gpuRunner:runner,'--job',job.dir,'--weights',models[job.modelId].weights,'--model',job.modelId],{windowsHide:true,stdio:['ignore','ignore','pipe'],env:{...process.env,TEMP:job.dir,TMP:job.dir,PYTHONDONTWRITEBYTECODE:'1'}});
  let stderr='',timedOut=false;child.stderr.on('data',chunk=>{if(stderr.length<64000)stderr+=chunk.toString();});
  const timer=setTimeout(()=>{timedOut=true;child.kill();},30*60*1000);let finished=false;
  async function finish(code){if(finished)return;finished=true;clearTimeout(timer);try{
   if(stderr)await writeFile(path.join(job.dir,'worker-stderr.log'),stderr,{flag:'wx'});
   if(code!==0||timedOut){let reason=timedOut?'Inference timed out; no verified result is available.':'Inference failed; check the saved worker diagnostics. No verified result is available.';try{reason=JSON.parse(await readFile(path.join(job.dir,'error.json'),'utf8')).error||reason;}catch{}throw Error(reason);}
   job.result=await verifySaved(job);if(job.result.weightsSha256!==hash(await readFile(models[job.modelId].weights)))throw Error('The result does not match the selected checkpoint.');
   job.resultSHA256=hash(await readFile(path.join(job.dir,'result.json')));
   if(job.result.runnerSha256!==hash(await readFile(path.join(job.dir,'provenance/validated_model_runner.py')))||job.result.validationSha256!==hash(await readFile(path.join(job.dir,'provenance/mri_validation.py'))))throw Error('Worker source changed during this run; no verified saved result is available.');
   if(useGPU&&job.result.runtimeProvenance?.gpuWrapperSha256!==hash(await readFile(path.join(job.dir,'provenance/validated_gpu_runner.py'))))throw Error('GPU worker source changed during this run.');
   const policyBytes=await readFile(new URL('./review-integrity.mjs',import.meta.url));
   if(hash(policyBytes)!==hash(await readFile(path.join(job.dir,'provenance/review-integrity.mjs'))))throw Error('Assessment policy changed during inference.');
   const assessmentRecord={schemaVersion:1,resultSHA256:job.resultSHA256,maskSHA256:job.result.spatialValidation.maskSHA256,inputSHA256:job.result.inputSha256,modelId:job.modelId,weightsSHA256:job.result.weightsSha256,policySHA256:hash(policyBytes),assessment:job.assessment};
   const assessmentBytes=JSON.stringify(assessmentRecord,null,2);await writeFile(path.join(job.dir,'assessment.json'),assessmentBytes,{flag:'wx'});job.assessmentSHA256=hash(assessmentBytes);
   job.state='complete';job.message='Verified research output saved. Candidate markings require qualified review.';
  }catch(e){job.result=undefined;job.state='failed';job.message=e.message;}finally{try{await persist(job);}catch{job.result=undefined;job.state='failed';job.message='The run could not be saved. No verified saved result is available; check disk space and permissions.';}active=null;}}
  child.once('error',()=>finish(1));child.once('exit',finish);return json(res,{state:job.state},202);
 }
 if(action==='mask'&&req.method==='GET'){
  if(job.state!=='complete')fail(409,'No completed result is available.');
  try{job.result=await verifySaved(job);}catch(e){fail(409,e.message);}
  const filename=path.join(job.dir,'mask.nii');const s=await stat(filename);res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':s.size});await pipeline(createReadStream(filename),res);return;
 }
 if(sequences.includes(action)&&req.method==='GET'){
  if(job.state!=='complete'||!job.files[action])fail(409,'No verified saved input is available.');
  if(hash(await readFile(job.files[action]))!==job.result.inputSha256[action])fail(409,'Saved input checksum changed.');
  const filename=job.files[action],s=await stat(filename);res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':s.size,'X-Volume-Format':filename.endsWith('.gz')?'nii.gz':'nii'});await pipeline(createReadStream(filename),res);return;
 }
 fail(404,'Unknown operation');
}
// No expiry deletion: original uploads, derived masks and review versions remain
// separately traceable across restarts. Legacy directories are never rewritten.
