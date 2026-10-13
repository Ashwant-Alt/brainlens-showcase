import {parseNifti,sampleVolume} from './volume.mjs';
import {locateCandidates,locationForView} from './candidate-location.mjs';
import {verifyMaskResult,draftResearchSummary,explainAssessment} from './review-integrity.mjs';
import {checkNotes} from './notes.mjs';
import {validateFindingResult,findingReview} from './finding-review.mjs';
import {SEQUENCES,readSpatialInfo,sameGeometry,preparationIssue,readiness} from './viewer-guidance.mjs';
import {sliceLayout,sliceVoxel} from './slice-view.mjs';
import {createReviewExport} from './review-export.mjs';
const $=id=>document.getElementById(id),sequenceIds=Object.keys(SEQUENCES);
let candidateLocation=null,resultIntegrity=null,savedAssessment=null;
let volume=null,source='',loadId=0,mask=null,modelResult=null,jobId=null,modelReady=false,busy=false,nvidiaConfigured=false,summaryProvenance=null,publicStudiesReady=false;
let activeSequence='',previewFile=null,samplePreview=false,notesStale=false,notesAcknowledgedAt=null,checks={},checkRevision=0,checkQueue=Promise.resolve();
const currentFiles=()=>Object.fromEntries(sequenceIds.map(id=>[id,$(id).files[0]]));
function refreshReadiness(){
 const state=readiness({modelReady,prepared:$('prepared').checked,busy,checks,files:currentFiles()});
 $('readinessTitle').textContent=state.title;
 $('readinessList').replaceChildren(...state.items.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
 $('run').disabled=!state.ready;
}
function refreshSequenceChoices(){
 const options=[];
 if(previewFile||samplePreview){const option=document.createElement('option');option.value='preview';option.textContent=samplePreview?'Synthetic viewer sample':'Your single-file preview';options.push(option);}
 for(const id of sequenceIds)if($(id).files[0]){const option=document.createElement('option');option.value=id;option.textContent=SEQUENCES[id].label;options.push(option);}
 if(!options.length){const option=document.createElement('option');option.value='';option.textContent='Load a study first';options.push(option);}
 else if(!options.some(option=>option.value===activeSequence)){const option=document.createElement('option');option.value='';option.textContent='Choose an image set';option.disabled=true;options.unshift(option);}
 $('viewSequence').replaceChildren(...options);
 if(options.some(option=>option.value===activeSequence))$('viewSequence').value=activeSequence;
 $('viewSequence').disabled=busy||!options.some(option=>option.value);
}
function refreshCandidateLocation(){
 const compatible=!!mask&&sameGeometry(volume,mask),view=compatible?locationForView(candidateLocation,Number($('plane').value)):null;
 $('jumpCandidate').disabled=busy||!view;
 $('candidateLocation').textContent=view?`Model markings span slices ${view.firstSlice+1}–${view.lastSlice+1} of ${volume.dims[view.axis]} in this view. Slice ${view.bestSlice+1} contains the most marked image points. These are candidate locations, not confirmed tumour boundaries.`:candidateLocation?.state==='no_markings'?'No marked slice is available. This does not rule out a tumour or establish a healthy brain.':mask&&!compatible?'Candidate navigation is unavailable on an image with different recorded dimensions or positions.':'Run an imaging model to locate candidate markings in the images.';
}
$('jumpCandidate').onclick=()=>{
 if(busy||!mask||!sameGeometry(volume,mask))return;
 const view=locationForView(candidateLocation,Number($('plane').value));if(!view)return;
 $('slice').value=view.bestSlice;$('overlay').checked=true;updateOverlay();draw();$('canvas').focus();
};
function updateOverlay(){
 const compatible=!!mask&&sameGeometry(volume,mask);
 refreshCandidateLocation();
 $('overlay').disabled=!compatible;
 if(!compatible)$('overlay').checked=false;
 $('legend').hidden=!compatible||!$('overlay').checked;
 $('overlayHelp').textContent=mask&&!compatible?'Markings are hidden because this image does not have matching verified dimensions and recorded positions.':'Markings become available after a model run and only on an image with matching recorded dimensions and positions.';
}
function draw(){
 if(!volume)return;
 const axis=Number($('plane').value),layout=sliceLayout(volume,axis),w=layout.width,h=layout.height,slice=Number($('slice').value),c=$('canvas');
 c.style.aspectRatio=`${w*layout.spacing[0]} / ${h*layout.spacing[1]}`;
 c.width=w;c.height=h;const ctx=c.getContext('2d'),img=ctx.createImageData(w,h),range=(volume.max-volume.min)||1,contrast=Number($('contrast').value)/100,showMask=mask&&$('overlay').checked&&!$('overlay').disabled;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const voxel=sliceVoxel(layout,volume.dims,slice,x,y),v=volume.data[voxel],n=Math.max(0,Math.min(255,(((v-volume.min)/range-.5)*contrast+.5)*255)),i=4*(x+w*(h-1-y));
  img.data[i]=img.data[i+1]=img.data[i+2]=n;img.data[i+3]=255;
  if(showMask){const color={1:[250,181,76],2:[64,194,183],4:[240,103,163]}[mask.data[voxel]];if(color)for(let j=0;j<3;j++)img.data[i+j]=n*.45+color[j]*.55;}
 }
 refreshCandidateLocation();
 ctx.putImageData(img,0,0);$('sliceLabel').textContent=`${slice+1} / ${volume.dims[axis]}`;
 $('canvas').setAttribute('aria-label',`${source}, ${layout.plane} slice ${slice+1} of ${volume.dims[axis]}; source grayscale${showMask?' with colored predicted segmentation':''}`);
}
function setup(v,name,keepResult=false,preserveSlice=false){
 const keepSlice=preserveSlice&&sameGeometry(volume,v);volume=v;source=name;
 for(const option of $('plane').options)option.textContent=sliceLayout(v,Number(option.value)).plane;
 if(!keepResult)resetResult();
 $('empty').hidden=true;$('status').textContent=`${name} · ${v.dims.join(' × ')} image points. Viewing images does not run the model.`;
 updateOverlay();resetSlice(keepSlice);refreshSequenceChoices();
}
function resetSlice(preserve=false){if(!volume)return;const n=volume.dims[Number($('plane').value)],previous=Number($('slice').value);$('slice').disabled=false;$('slice').max=n-1;$('slice').value=preserve?Math.min(previous,n-1):Math.floor(n/2);draw();}
function volumeFromBuffer(buffer){return {...parseNifti(buffer),geometry:readSpatialInfo(buffer)};}
async function unpack(file){
 if(file.size>100*1024*1024)throw Error('Choose a file under 100 MB.');if(!/\.nii(\.gz)?$/i.test(file.name))throw Error('Choose a 3D MRI file ending in .nii or .nii.gz.');
 let buffer=await file.arrayBuffer();
 if(/\.gz$/i.test(file.name)){const reader=new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();let total=0,parts=[];while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>180*1024*1024){await reader.cancel();throw Error('Expanded volume exceeds 180 MB.');}parts.push(value);}const bytes=new Uint8Array(total);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}buffer=bytes.buffer;}
 return volumeFromBuffer(buffer);
}
function geometryOnly(v){return {dims:v.dims,geometry:v.geometry};}
function markNotesStale(reason){
 if(!$('notes').value.trim())return;
 notesStale=true;notesAcknowledgedAt=null;$('notesReview').hidden=false;$('notesStatus').textContent=`Your existing notes were retained, but ${reason}. Review them for this study before downloading a review.`;$('export').disabled=true;
 $('saveReview').disabled=true;
 $('exportDetails').hidden=true;$('exportPreview').value='';
}
function clearNotesWarning(){notesStale=false;$('notesReview').hidden=true;$('notesStatus').textContent='';$('export').disabled=busy;$('saveReview').disabled=busy||!modelResult;}
$('confirmNotes').onclick=()=>{notesAcknowledgedAt=new Date().toISOString();clearNotesWarning();};
$('clearNotes').onclick=()=>{$('notes').value='';notesAcknowledgedAt=null;summaryProvenance=null;$('wordingResult').replaceChildren();clearNotesWarning();};
$('notes').oninput=()=>{if(!$('notes').value.trim())clearNotesWarning();};
$('file').onchange=async()=>{const id=++loadId,file=$('file').files[0];if(!file)return;$('status').textContent='Reading your single-file preview…';try{const v=await unpack(file);if(id!==loadId)return;markNotesStale('the displayed study changed');previewFile=file;samplePreview=false;activeSequence='preview';setup(v,file.name);}catch(e){if(id===loadId)$('status').textContent=`${e.message}${volume?' Previously loaded volume remains displayed.':''}`;}};
$('sample').onclick=()=>{loadId++;markNotesStale('the displayed study changed');previewFile=null;samplePreview=true;activeSequence='preview';setup(sampleVolume(),'Synthetic geometry sample — not a patient MRI');};
$('viewSequence').onchange=async()=>{
 const selected=$('viewSequence').value,id=++loadId,file=selected==='preview'?previewFile:$(selected)?.files[0];
 if(selected==='preview'&&samplePreview){markNotesStale('the displayed study changed');activeSequence=selected;setup(sampleVolume(),'Synthetic geometry sample — not a patient MRI');return;}
 if(!file)return;$('status').textContent=`Opening ${selected==='preview'?'your preview':SEQUENCES[selected].label}…`;
 try{const v=await unpack(file);if(id!==loadId)return;if(selected==='preview')markNotesStale('the displayed study changed');activeSequence=selected;setup(v,selected==='preview'?file.name:`${file.name} · ${SEQUENCES[selected].label}`,selected!=='preview',selected!=='preview');}catch(e){if(id===loadId){$('status').textContent=`${e.message} The previous image remains displayed.`;refreshSequenceChoices();}}
};
$('plane').onchange=()=>resetSlice();$('slice').oninput=draw;$('contrast').oninput=draw;$('overlay').onchange=()=>{updateOverlay();draw();};
function download(blob,filename){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('export').onclick=()=>{if(notesStale||busy)return;try{const payload=createReviewExport({result:modelResult,integrity:resultIntegrity,jobId:modelResult?jobId:null,savedAssessment,observations:$('notes').value,notesReviewedAt:notesAcknowledgedAt,summaryProvenance});const text=JSON.stringify(payload,null,2);$('exportPreview').value=text;$('exportDetails').hidden=false;$('exportDetails').open=true;download(new Blob([text],{type:'application/json'}),'research-review.json');}catch(e){$('notesStatus').textContent=e.message;}};
$('wording').onclick=()=>{const items=checkNotes($('notes').value);$('wordingResult').replaceChildren(...items.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));};
async function request(url,options){const r=await fetch(url,options);if(!r.ok)throw Error(await r.text());return r.json();}
function refreshDraftButton(){$('draft').disabled=busy||!nvidiaConfigured||!modelResult||!$('cloudConsent').checked;}
function lock(value){
 busy=value;$('localDraft').disabled=value||!resultIntegrity;refreshCandidateLocation();for(const id of [...sequenceIds,'prepared','file','sample','cloudConsent','useDraft','confirmNotes','clearNotes'])$(id).disabled=value;
 $('modelChoice').disabled=value||!modelReady;$('clear').disabled=value||!jobId;$('researchStudy').disabled=value||!publicStudiesReady;$('loadResearch').disabled=value||!publicStudiesReady;$('export').disabled=value||notesStale;
 refreshSequenceChoices();refreshReadiness();refreshDraftButton();
 $('loadSaved').disabled=value||!$('savedStudy').value;$('refreshSaved').disabled=value;$('saveReview').disabled=value||!modelResult||notesStale;
}
function refreshAssessment(){
 const assessment=explainAssessment(modelResult,resultIntegrity);
 const questions={overall:'Overall scan assessment',tumourDetection:'Is a tumour present?',tumourType:'What tumour category is supported?',finding:'What did the region-marking model find?',abnormality:'Are other abnormalities assessed?',confidence:'How certain is this result?'};
 $('assessmentCards').replaceChildren(...Object.entries(questions).map(([key,title])=>{
  const card=document.createElement('section');card.className='assessment-card';
  const heading=document.createElement('h4');heading.textContent=title;
  const answer=document.createElement('p');answer.className='assessment-answer';answer.textContent=assessment[key].answer;
  const explanation=document.createElement('p');explanation.textContent=assessment[key].explanation;
  card.append(heading,answer,explanation);return card;
 }));
 $('assessmentNext').textContent=assessment.nextStep||'Run the imaging model to inspect its candidate output. Tumour type and overall brain health remain unassessed.';
 $('assessmentHistory').textContent=savedAssessment?`Saved assessment retained under policy ${savedAssessment.policySHA256?.slice(0,12)||'unknown'}. The cards show the current evidence policy; both are included in the review export.`:'No historical assessment is attached. Current assessment does not establish a diagnosis.';
}
function resetResult(){savedAssessment=null;$('findingScope').textContent=findingReview().summary;mask=null;candidateLocation=null;resultIntegrity=null;$('integrityStatus').textContent='No saved markings verified yet.';$('localDraft').disabled=true;$('localDraftPanel').hidden=true;modelResult=null;summaryProvenance=null;$('draftPanel').hidden=true;$('draftText').value='';$('cloudConsent').checked=false;$('draftStatus').textContent='Run the local imaging model before drafting a summary.';refreshDraftButton();$('overlay').checked=false;$('overlay').disabled=true;$('legend').hidden=true;$('result').hidden=true;refreshAssessment();updateOverlay();draw();}
for(const id of sequenceIds)$(id).onchange=()=>{
 const file=$(id).files[0],revision=++checkRevision;loadId++;resetResult();markNotesStale('the model image sets changed');$('prepared').checked=false;
 if(!file){delete checks[id];refreshSequenceChoices();refreshReadiness();return;}
 checks[id]={status:'checking',revision};refreshSequenceChoices();refreshReadiness();
 checkQueue=checkQueue.then(async()=>{
  if(checks[id]?.revision!==revision)return;
  try{const v=await unpack(file);if(checks[id]?.revision!==revision)return;const issue=preparationIssue(v);checks[id]=issue?{status:'error',error:issue,revision}:{status:'ready',volume:geometryOnly(v),revision};if(activeSequence===id||!volume){activeSequence=id;setup(v,`${file.name} · ${SEQUENCES[id].label}`);}}
  catch(e){if(checks[id]?.revision===revision)checks[id]={status:'error',error:e.message,revision};}
  refreshReadiness();
 });
};
$('modelChoice').onchange=()=>{resetResult();markNotesStale('the selected imaging model changed');refreshReadiness();};
$('prepared').onchange=refreshReadiness;
async function removeJob(){jobId=null;} // Detach; preserve every saved run on disk.
$('clear').onclick=async()=>{await removeJob();markNotesStale('the displayed result was cleared');resetResult();$('runStatus').textContent='Display cleared. Saved runs and their files are retained locally.';$('clear').disabled=true;refreshSaved();};
$('run').onclick=async()=>{
 const files=currentFiles(),state=readiness({modelReady,prepared:$('prepared').checked,busy,checks,files});
 if(!state.ready){refreshReadiness();return;}
 if(modelResult)markNotesStale('a new model run is starting');lock(true);resetResult();let pollingStarted=false;
 try{
  for(const id of sequenceIds){$('runStatus').textContent=`Checking ${SEQUENCES[id].label}…`;const v=await unpack(files[id]),issue=preparationIssue(v);if(issue)throw Error(`${SEQUENCES[id].label}: ${issue}`);checks[id]={status:'ready',volume:geometryOnly(v)};}
  if(!sequenceIds.every(id=>sameGeometry(checks.t1c.volume,checks[id].volume)))throw Error('The four image sets do not record matching dimensions and positions. Choose an aligned prepared study.');
  await removeJob();const job=await request('/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prepared:true,modelId:$('modelChoice').value})});jobId=job.id;
  for(const id of sequenceIds){$('runStatus').textContent=`Copying ${SEQUENCES[id].label} to the local processing folder…`;await request(`/api/jobs/${jobId}/${id}`,{method:'PUT',headers:{'x-volume-format':files[id].name.toLowerCase().endsWith('.gz')?'nii.gz':'nii'},body:files[id]});}
  await request(`/api/jobs/${jobId}/run`,{method:'POST'});pollingStarted=true;const processingStarted=Date.now();
  while(true){const state=await request(`/api/jobs/${jobId}`);let progressText=state.message||'Processing…';if(state.state==='running'){const minutes=Math.floor((Date.now()-processingStarted)/60000);progressText+=minutes?` ${minutes} minute${minutes===1?'':'s'} elapsed. Results will appear when processing finishes.`:' Less than one minute elapsed. Results will appear when processing finishes.';}if($('runStatus').textContent!==progressText)$('runStatus').textContent=progressText;if(state.state==='failed')throw Error(state.message);if(state.state==='complete'){modelResult=validateFindingResult(state.result);savedAssessment=state.savedAssessment||null;break;}await new Promise(resolve=>setTimeout(resolve,2500));}
  const response=await fetch(`/api/jobs/${jobId}/mask`);if(!response.ok)throw Error('Could not load model markings.');
  const loadedMask=volumeFromBuffer(await response.arrayBuffer()),base=await unpack(files.t1c);
  if(!sameGeometry(base,loadedMask))throw Error('Model markings do not match the verified dimensions and recorded positions of the input.');
  const verified=verifyMaskResult(modelResult,loadedMask),located=verified.candidateLocation;
  activeSequence='t1c';setup(base,`${files.t1c.name} · model input T1 with contrast`,true);mask=loadedMask;candidateLocation=located;resultIntegrity=verified;
  const markedView=locationForView(located,Number($('plane').value));if(markedView)$('slice').value=markedView.bestSlice;
  $('integrityStatus').textContent='Consistency check passed: saved markings match the reported dimensions and candidate volumes. This does not verify medical correctness.';$('overlay').checked=true;updateOverlay();
  $('findingScope').textContent=findingReview(modelResult).summary;refreshAssessment();
  $('result').hidden=false;$('resultSummary').textContent=`${modelResult.model} · ${modelResult.version}. ${modelResult.summary}`;
  const names={whole_region:'Whole candidate region',core_region:'Core candidate region',enhancing_region:'Enhancing candidate region'};
  $('measurements').replaceChildren(...Object.entries(modelResult.candidateRegionVolumesMl).map(([key,value])=>{const p=document.createElement('p');p.textContent=`${names[key]||key}: ${value} mL`;return p;}));
  $('limitations').replaceChildren(...modelResult.limitations.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));$('provenance').textContent=JSON.stringify(modelResult,null,2);draw();refreshSaved();
 }catch(e){resetResult();$('runStatus').textContent=e.message;if(!pollingStarted&&jobId){try{await removeJob();}catch{}}}finally{lock(false);}
};
$('maskDownload').onclick=async()=>{try{const r=await fetch(`/api/jobs/${jobId}/mask`);if(!r.ok)throw Error('Model session has expired.');download(await r.blob(),'candidate-regions.nii');}catch(e){$('runStatus').textContent=e.message;}};
$('localDraft').onclick=()=>{if(busy||!resultIntegrity)return;$('localDraftText').value=draftResearchSummary(modelResult,resultIntegrity);$('localDraftPanel').hidden=false;$('localDraftText').focus();};
$('appendLocalDraft').onclick=()=>{if(busy||!resultIntegrity)return;const text=$('localDraftText').value.trim();if(!text)return;$('notes').value=[$('notes').value.trim(),text].filter(Boolean).join('\n\n');summaryProvenance={provider:'local-template',sentFields:[],appendedToNotes:true,notice:'Editable text composed from verified model measurements. No external AI call or medical verification.'};};
$('cloudConsent').onchange=refreshDraftButton;
$('draft').onclick=async()=>{if(!jobId||!modelResult||!$('cloudConsent').checked)return;lock(true);$('draftPanel').hidden=true;$('draftStatus').textContent='NVIDIA is drafting text from limited structured results…';try{const draft=await request(`/api/jobs/${jobId}/summary`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({consent:true})});$('draftText').value=draft.text;$('draftPanel').hidden=false;$('draftStatus').textContent=`Draft from ${draft.model}. ${draft.notice}`;summaryProvenance={provider:draft.provider,model:draft.model,sentFields:draft.sentFields,notice:draft.notice,appendedToNotes:false};}catch(e){$('draftStatus').textContent=e.message;}finally{lock(false);}};
$('useDraft').onclick=()=>{const text=$('draftText').value.trim();if(!text)return;$('notes').value=[$('notes').value.trim(),text].filter(Boolean).join('\n\n');if(summaryProvenance)summaryProvenance.appendedToNotes=true;$('draftStatus').textContent='Draft appended. Existing notes were preserved. Review its claims and values.';};
async function refreshSaved(){
 try{const data=await request('/api/jobs');$('savedStudy').replaceChildren(...data.studies.map(study=>{const option=document.createElement('option');option.value=study.id;option.textContent=`${new Date(study.createdAt).toLocaleString()} · ${study.modelId}`;return option;}));$('loadSaved').disabled=busy||!data.studies.length;$('savedStatus').textContent=data.studies.length?`${data.studies.length} verified run(s) saved locally. Reopening does not run the model again.`:'No completed runs saved yet. Run a prepared study first.';}
 catch(e){$('savedStatus').textContent=e.message;}
}
$('refreshSaved').onclick=refreshSaved;
$('savedStudy').onchange=()=>{$('loadSaved').disabled=busy||!$('savedStudy').value;};
$('saveReview').onclick=async()=>{if(busy||notesStale||!jobId||!modelResult)return;try{await request(`/api/jobs/${jobId}/review`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({observations:$('notes').value})});$('savedStatus').textContent='Review saved as a new version alongside its input, model record and segmentation.';}catch(e){$('savedStatus').textContent=e.message;}};
$('loadSaved').onclick=async()=>{
 const id=$('savedStudy').value;if(!id||busy)return;lock(true);
 try{
  const state=await request(`/api/jobs/${id}`);if(state.state!=='complete')throw Error(state.message||'No verified completed output.');
  const selected={},selectedChecks={};
  for(const name of sequenceIds){const response=await fetch(`/api/jobs/${id}/${name}`);if(!response.ok)throw Error('Saved MRI input is unavailable.');const format=response.headers.get('X-Volume-Format');const file=new File([await response.blob()],`${name}.${format}`);const v=await unpack(file);selected[name]=file;selectedChecks[name]={status:'ready',volume:geometryOnly(v)};}
  const response=await fetch(`/api/jobs/${id}/mask`);if(!response.ok)throw Error('Saved markings are unavailable.');const loaded=volumeFromBuffer(await response.arrayBuffer()),base=await unpack(selected.t1c);
  if(!sameGeometry(base,loaded))throw Error('Saved image and segmentation coordinates disagree.');
  const result=validateFindingResult(state.result),integrity=verifyMaskResult(result,loaded);
  const review=await request(`/api/jobs/${id}/review`);
  for(const [name,file]of Object.entries(selected)){const transfer=new DataTransfer();transfer.items.add(file);$(name).files=transfer.files;}
  resetResult();checks=selectedChecks;activeSequence='t1c';jobId=id;modelResult=result;savedAssessment=state.savedAssessment||null;setup(base,'Saved model input · T1 with contrast',true);mask=loaded;resultIntegrity=integrity;candidateLocation=integrity.candidateLocation;
  $('prepared').checked=true;$('overlay').checked=true;if($('notes').value.trim()&&$('notes').value!==(review.observations||'')){markNotesStale('a saved run was reopened; your unsaved notes were retained');}else{$('notes').value=review.observations||'';clearNotesWarning();}
  $('result').hidden=false;$('resultSummary').textContent=`${result.model} · saved research run.`;$('measurements').replaceChildren(...Object.entries(result.candidateRegionVolumesMl).map(([key,value])=>{const p=document.createElement('p');p.textContent=`${key}: ${value} mL`;return p;}));
  $('limitations').replaceChildren(...result.limitations.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));$('provenance').textContent=JSON.stringify(result,null,2);
  $('integrityStatus').textContent='Saved source checksums and segmentation geometry verified. Medical correctness is not established.';$('runStatus').textContent='Saved run reopened; no new inference.';refreshAssessment();updateOverlay();draw();
 }catch(e){resetResult();$('savedStatus').textContent=e.message;}finally{lock(false);}
};
refreshSaved();
refreshReadiness();refreshAssessment();
fetch('/api/status').then(r=>r.json()).then(s=>{
 $('capabilityList').replaceChildren(...(s.capabilities?.modules||[]).map(module=>{const item=document.createElement('li'),label=document.createElement('strong');label.textContent=`${module.name}: ${module.status==='available_research'?'available for research':module.status==='inconclusive_only'?'inconclusive only':'unavailable'}. `;item.append(label,document.createTextNode(module.reason));return item;}));
 const choices=(s.models||[]).filter(m=>m.ready);modelReady=s.ready&&choices.length>0;
 $('modelChoice').replaceChildren(...choices.map(m=>{const option=document.createElement('option');option.value=m.id;option.textContent=`${m.name} (${m.device==='CUDA'?'GPU':'CPU'})`;return option;}));nvidiaConfigured=!!s.nvidia?.configured;
 $('modelStatus').textContent=modelReady?'Local imaging models are ready. Each choice shows its processing device. MRI processing runs on this computer and needs no imaging API credits.':'The local model runtime is unavailable. See the setup instructions.';
 $('nvidiaStatus').textContent=nvidiaConfigured?`${s.nvidia.model} configured for summary drafting. Account access is checked with each request.`:'NVIDIA is optional and unconfigured. Add your key to the private .env file and restart the server. MRI processing works without it.';lock(false);
}).catch(()=>{$('modelStatus').textContent='Start the local server to connect the imaging model.';$('nvidiaStatus').textContent='Could not check NVIDIA configuration.';refreshReadiness();});
fetch('/api/research-studies').then(r=>r.json()).then(data=>{
 publicStudiesReady=data.studies.length>0;$('researchStudy').replaceChildren(...data.studies.map(study=>{const option=document.createElement('option');option.value=study.id;option.textContent=study.label;return option;}));$('researchStudy').disabled=busy||!publicStudiesReady;$('loadResearch').disabled=busy||!publicStudiesReady;$('evaluationLink').hidden=!data.evaluationReady;$('upgradeEvaluationLink').hidden=!data.upgradeEvaluationReady;
 $('researchStatus').textContent=publicStudiesReady?'Choose an example and select Load selected study. Loading views the images; the model runs only when you start it in step 3.':'Public study files are not available.';
}).catch(()=>{$('researchStatus').textContent='Could not load the public study list. Check that the local server is running.';});
$('loadResearch').onclick=async()=>{
 if(busy||!publicStudiesReady)return;const id=$('researchStudy').value;loadId++;lock(true);
 try{
  const selected={},selectedChecks={};
  for(const name of sequenceIds){$('researchStatus').textContent=`Loading ${id}: ${SEQUENCES[name].label}…`;const response=await fetch(`/api/research-studies/${id}/${name}`);if(!response.ok)throw Error('A public image set could not be loaded. Try loading the study again.');const file=new File([await response.blob()],`${id}_${name}.nii.gz`);const v=await unpack(file),issue=preparationIssue(v);if(issue)throw Error(`${SEQUENCES[name].label}: ${issue}`);selected[name]=file;selectedChecks[name]={status:'ready',volume:geometryOnly(v)};}
  if(!sequenceIds.every(name=>sameGeometry(selectedChecks.t1c.volume,selectedChecks[name].volume)))throw Error('This public study does not record matching image positions. Choose another study.');
  const base=await unpack(selected.t1c);await removeJob();markNotesStale('a different public study was loaded');
  for(const [name,file]of Object.entries(selected)){const transfer=new DataTransfer();transfer.items.add(file);$(name).files=transfer.files;}
  checks=selectedChecks;previewFile=null;samplePreview=false;$('file').value='';activeSequence='t1c';setup(base,`${id} · public T1 with contrast`);$('prepared').checked=true;
  $('runStatus').textContent=`${id} is ready. Choose a model and select Run research model in step 3.`;
  $('researchStatus').textContent=`${id}: all four image sets are loaded. Explore them using Image set to view, then start the model in step 3.`;
 }catch(e){$('researchStatus').textContent=e.message;}finally{lock(false);}
};
