import {access,readFile,writeFile,mkdir,rename,stat,readdir,copyFile} from 'node:fs/promises';
import {createReadStream,constants} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {validateBundle,validateEvaluation,createSliceResult,validateSliceResult,SLICE_LIMITATION} from './brisc-contract.mjs';
import {inferenceModules} from './inference-contract.mjs';
const work=fileURLToPath(new URL('../../work/',import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_IMAGE=8*1024*1024,MAX_WEIGHTS=256*1024*1024;
function fail(status,message){throw Object.assign(Error(message),{status});}
function json(res,value,status=200){res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));}
async function fileSHA(filename){const hash=createHash('sha256');for await(const bytes of createReadStream(filename))hash.update(bytes);return hash.digest('hex');}
async function smallJSON(filename,max=65536){if((await stat(filename)).size>max)throw Error('Model metadata exceeds the adapter limit.');const bytes=await readFile(filename);return {bytes,value:JSON.parse(bytes)};}
export function createBriscService(options={}){
  const python=options.python??path.join(work,'ml-venv','Scripts','python.exe');
  const bundlePath=options.bundlePath??(process.env.BRAINLENS_BRISC_BUNDLE?path.resolve(process.env.BRAINLENS_BRISC_BUNDLE):path.join(work,'brisc-classifier','bundle.json'));
  // Nested namespace is ignored by the existing UUID-only 3D job inventory.
  const jobsRoot=options.jobsRoot??(process.env.BRAINLENS_SLICE_JOBS_DIR?path.resolve(process.env.BRAINLENS_SLICE_JOBS_DIR):path.join(process.env.MRI_JOBS_DIR?path.resolve(process.env.MRI_JOBS_DIR):path.join(work,'mri-jobs'),'slice-research'));
  const runner=options.runner??fileURLToPath(new URL('./brisc_runner.py',import.meta.url));
  let active=null,runtimeProbe;
  async function bundleInfo(){
    const {value:bundle,bytes}=await smallJSON(bundlePath);validateBundle(bundle);
    const weightPath=path.join(path.dirname(bundlePath),bundle.weightsFile);
    const size=(await stat(weightPath)).size;if(size<1||size>MAX_WEIGHTS)throw Error('Checkpoint exceeds the adapter limit.');
    const {value:evaluation,bytes:evaluationBytes}=await smallJSON(path.join(path.dirname(bundlePath),bundle.evaluationFile),1024*1024);
    validateEvaluation(evaluation,bundle);
    if(sha(evaluationBytes)!==bundle.evaluationSHA256||await fileSHA(weightPath)!==bundle.weightsSHA256)throw Error('Checkpoint or evaluation checksum mismatch.');
    await access(python);
    if(!runtimeProbe){runtimeProbe=probeRuntime();runtimeProbe.catch(()=>{runtimeProbe=undefined;});}
    const runtime=await runtimeProbe;
    return {bundle,bundleSHA256:sha(bytes),runnerSHA256:await fileSHA(runner),runtime};
  }
  function probeRuntime(){return new Promise((resolve,reject)=>{
    const child=spawn(python,['-B',runner,'--probe'],{windowsHide:true,stdio:['ignore','pipe','ignore'],env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
    let output='',timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill();},15000);
    child.stdout.on('data',chunk=>{if(output.length<8192)output+=chunk.toString();});
    child.once('error',()=>{clearTimeout(timer);reject(Error('The existing slice runtime could not be started.'));});
    child.once('exit',code=>{clearTimeout(timer);try{if(code!==0||timedOut)throw Error();const value=JSON.parse(output);if(value.device!=='cpu'||!value.torch||!value.pillow||!value.numpy)throw Error();resolve(value);}catch{reject(Error('The existing runtime cannot import PyTorch, Pillow and NumPy; no fallback predictions are available.'));}});
  });}
  async function status(){
    try{const info=await bundleInfo();return {modelId:'brisc-slice-v1',modelVersion:info.bundle.modelVersion||`checkpoint-${info.bundle.weightsSHA256.slice(0,12)}`,...inferenceModules.brisc,ready:true,status:'available_research',clinicalValidation:false,examinationDetectionEnabled:false,limitation:SLICE_LIMITATION,runtime:info.runtime};}
    catch(error){return {modelId:'brisc-slice-v1',...inferenceModules.brisc,ready:false,status:'unavailable',clinicalValidation:false,examinationDetectionEnabled:false,reason:error.code==='ENOENT'?'No compatible trained BRISC checkpoint, evaluation bundle or runtime is installed.':error.message,limitation:SLICE_LIMITATION};}
  }
  async function persist(session){const directory=path.join(jobsRoot,session.id),temporary=path.join(directory,`session-${randomUUID()}.tmp`);await writeFile(temporary,JSON.stringify(session,null,2),{flag:'wx'});await rename(temporary,path.join(directory,'session.json'));}
  async function verifySaved(id){
    const directory=path.join(jobsRoot,id),session=(await smallJSON(path.join(directory,'session.json'))).value;
    if(session.id!==id||session.state!=='complete')throw Error('No verified completed slice result is available.');
    const {bytes,value:result}=await smallJSON(path.join(directory,'result.json'));
    validateSliceResult(result);
    if(result.provenance.runId!==id||sha(bytes)!==session.resultSHA256||await fileSHA(path.join(directory,'input-image'))!==result.provenance.inputSHA256)throw Error('Saved slice or result checksum changed.');
    const {bytes:bundleBytes,value:bundle}=await smallJSON(path.join(directory,'provenance/bundle.json'));validateBundle(bundle);
    const {bytes:evaluationBytes,value:evaluation}=await smallJSON(path.join(directory,'provenance/evaluation.json'),1024*1024);validateEvaluation(evaluation,bundle);
    if(sha(bundleBytes)!==result.provenance.bundleSHA256||sha(evaluationBytes)!==result.provenance.evaluationSHA256||bundle.weightsSHA256!==result.provenance.weightsSHA256||await fileSHA(path.join(directory,'provenance/brisc_runner.py'))!==result.provenance.runnerSHA256)throw Error('Saved slice provenance checksum changed.');
    return result;
  }
  async function execute(session,info){
    const directory=path.join(jobsRoot,session.id),source=path.join(directory,'provenance');
    const child=spawn(python,['-B',path.join(source,'brisc_runner.py'),'--job',directory,'--bundle',bundlePath],{windowsHide:true,stdio:['ignore','ignore','pipe'],env:{...process.env,TEMP:directory,TMP:directory,PYTHONDONTWRITEBYTECODE:'1'}});
    let stderr='',timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill();},120000);
    child.stderr.on('data',chunk=>{if(stderr.length<64000)stderr+=chunk.toString();});
    const code=await new Promise(resolve=>{child.once('error',()=>resolve(-1));child.once('exit',resolve);});clearTimeout(timer);
    try{
      if(stderr)await writeFile(path.join(directory,'worker-stderr.log'),stderr,{flag:'wx'});
      if(code!==0||timedOut){let reason=timedOut?'Slice inference timed out. No prediction is available.':'Slice inference failed. No prediction is available.';try{const {value}=await smallJSON(path.join(directory,'error.json'));reason=`Slice inference failed: ${String(value.error).slice(0,1500)}`;}catch{}throw Error(reason);}
      const {value:worker}=await smallJSON(path.join(directory,'worker-result.json'));
      const inputSHA256=await fileSHA(path.join(directory,'input-image'));
      for(const [key,value] of Object.entries({inputSHA256,weightsSHA256:info.bundle.weightsSHA256,bundleSHA256:info.bundleSHA256,evaluationSHA256:info.bundle.evaluationSHA256,runnerSHA256:info.runnerSHA256}))if(worker[key]!==value)throw Error('Inference provenance changed; no verified result is available.');
      const result=createSliceResult(worker,{runId:session.id,inputSHA256,modelVersion:info.bundle.modelVersion||`checkpoint-${info.bundle.weightsSHA256.slice(0,12)}`,weightsSHA256:info.bundle.weightsSHA256,bundleSHA256:info.bundleSHA256,evaluationSHA256:info.bundle.evaluationSHA256,runnerSHA256:info.runnerSHA256,preprocessingId:info.bundle.preprocessing.id,createdAt:new Date().toISOString(),runtime:info.runtime});
      const bytes=JSON.stringify(result,null,2);await writeFile(path.join(directory,'result.json'),bytes,{flag:'wx'});session.resultSHA256=sha(bytes);session.state='complete';session.message='Slice-level research result saved. Examination assessment remains inconclusive.';
    }catch(error){session.state='failed';session.message=error.message;}
    finally{try{await persist(session);}finally{active=null;}}
  }
  async function handle(req,res){
    if(req.url==='/api/slice-research/status'&&req.method==='GET')return json(res,await status());
    if(req.url==='/api/slice-research/runs'&&req.method==='GET'){
      let entries=[];try{entries=await readdir(jobsRoot,{withFileTypes:true});}catch(error){if(error.code!=='ENOENT')throw error;}
      const runs=[];for(const entry of entries)if(entry.isDirectory()&&idPattern.test(entry.name))try{const result=await verifySaved(entry.name);runs.push({id:entry.name,createdAt:result.provenance.createdAt,inputUnit:'slice'});}catch{}
      return json(res,{runs:runs.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),limitation:SLICE_LIMITATION});
    }
    if(req.url==='/api/slice-research/runs'&&req.method==='POST'){
      if(req.headers['x-brainlens-slice-contract']!=='contrast-t1-research-v1')fail(400,'Confirm a permitted, de-identified contrast-enhanced T1 research slice. This is a user declaration, not automatic sequence verification.');
      if(!['image/jpeg','image/png'].includes(req.headers['content-type']))fail(415,'Only a JPEG or PNG slice is supported.');
      if(active)fail(409,'A slice research run is already active. Wait for it to finish.');
      // Acquire the lock before async checks/uploads; concurrent requests cannot
      // sneak in a second model load or overwrite a run.
      active='initializing';let session;
      try{
        let info;try{info=await bundleInfo();}catch(error){fail(503,error.code==='ENOENT'?'No trained BRISC bundle is installed. No prediction was generated.':error.message);}
        if(Number(req.headers['content-length'])>MAX_IMAGE)fail(413,'Slice upload exceeds 8 MB.');
        const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>MAX_IMAGE)fail(413,'Slice upload exceeds 8 MB.');chunks.push(chunk);}
        const bytes=Buffer.concat(chunks);
        const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),jpeg=bytes.subarray(0,3).equals(Buffer.from([255,216,255]));
        if(!png&&!jpeg)fail(400,'The file is not a JPEG or PNG slice.');
        if((png&&req.headers['content-type']!=='image/png')||(jpeg&&req.headers['content-type']!=='image/jpeg'))fail(400,'Image format and media type disagree.');
        const id=randomUUID(),directory=path.join(jobsRoot,id);await mkdir(directory,{recursive:true});await writeFile(path.join(directory,'input-image'),bytes,{flag:'wx'});
        await mkdir(path.join(directory,'provenance'));
        await copyFile(bundlePath,path.join(directory,'provenance/bundle.json'),constants.COPYFILE_EXCL);
        await copyFile(path.join(path.dirname(bundlePath),'evaluation.json'),path.join(directory,'provenance/evaluation.json'),constants.COPYFILE_EXCL);
        await copyFile(runner,path.join(directory,'provenance/brisc_runner.py'),constants.COPYFILE_EXCL);
        session={schemaVersion:1,id,state:'running',inputUnit:'slice',createdAt:new Date().toISOString(),message:'Running the local slice classifier on the CPU.'};await persist(session);active=id;
        // Failure to persist completion leaves a non-complete session, never a
        // successful prediction. Keep inputs and logs for local investigation.
        void execute(session,info).catch(()=>{active=null;});
        return json(res,{id,state:'running',inputUnit:'slice'},202);
      }catch(error){active=null;throw error;}
    }
    const match=req.url.match(/^\/api\/slice-research\/runs\/([0-9a-f-]{36})(?:\/(export|image))?$/);
    if(!match||!idPattern.test(match[1])||req.method!=='GET')fail(404,'Unknown slice research operation.');
    const [,id,action]=match;let session;
    try{session=(await smallJSON(path.join(jobsRoot,id,'session.json'))).value;if(session.id!==id)throw Error();}catch{fail(404,'Slice research run not found.');}
    if(!action&&session.state!=='complete')return json(res,{id,state:session.state,message:session.message,inputUnit:'slice'});
    let result;try{result=await verifySaved(id);}catch(error){fail(409,error.message);}
    if(action==='image'){
      // Browser preview is re-encoded by the client canvas. No upload metadata
      // is incorporated into review exports or examination data.
      const bytes=await readFile(path.join(jobsRoot,id,'input-image'));res.writeHead(200,{'Content-Type':result.input.format==='PNG'?'image/png':'image/jpeg'});return res.end(bytes);
    }
    if(action==='export'){res.setHeader('Content-Disposition','attachment; filename="brainlens-slice-research.json"');return json(res,result);}
    return json(res,{id,state:'complete',inputUnit:'slice',result});
  }
  return {handle,status};
}
const service=createBriscService();
export const handleBriscRequest=service.handle;
