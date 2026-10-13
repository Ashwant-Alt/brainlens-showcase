import {BRISC_CLASSES,BRISC_LABELS,validateSliceResult,describeSliceResult} from './brisc-contract.mjs';
const $=id=>document.getElementById(id);
let ready=false,busy=false,selected=null,runId=null;
async function request(url,options={}){const response=await fetch(url,options);if(!response.ok)throw Error(await response.text()||'The local request failed.');return response.json();}
function buttons(){
 $('sliceRun').disabled=!ready||busy||!selected||!$('sliceConsent').checked;$('sliceFile').disabled=busy;$('sliceConsent').disabled=busy;$('sliceReopen').disabled=busy||!$('sliceSaved').value;
 $('sliceActionHelp').textContent=busy?'Please wait for this action to finish.':!selected?'Choose a supported MRI image to begin.':!$('sliceConsent').checked?'Confirm the research-image details above to enable analysis.':!ready?'Analysis is unavailable until the local model is ready.':'Ready to analyze. The research result will be saved on this local server.';
}
function clearResult(){runId=null;$('sliceResult').hidden=true;$('sliceResultEmpty').hidden=false;$('sliceExport').disabled=true;}
async function preview(blob){
 const url=URL.createObjectURL(blob);try{const image=new Image();image.src=url;await image.decode();if(image.width<32||image.height<32||image.width>4096||image.height>4096)throw Error('Choose an image with 32–4096 pixels on each side.');const canvas=$('sliceCanvas');canvas.width=image.width;canvas.height=image.height;canvas.getContext('2d').drawImage(image,0,0);canvas.hidden=false;$('sliceEmpty').hidden=true;$('sliceFileStatus').textContent=`Image preview · ${image.width} × ${image.height} pixels. Previewing does not analyze the image.`;}finally{URL.revokeObjectURL(url);}
}
function showResult(id,result){
 const description=describeSliceResult(result);runId=id;
 $('sliceCategory').textContent=description.heading;$('sliceExplanation').textContent=description.explanation;
 $('sliceBrainHealth').textContent=description.brainHealth;$('sliceBrainHealthExplanation').textContent=description.brainHealthExplanation;
 $('sliceOutline').textContent=description.outline;$('sliceOutlineExplanation').textContent=description.outlineExplanation;
 $('sliceScores').replaceChildren(...BRISC_CLASSES.map(key=>{const row=document.createElement('tr'),label=document.createElement('th'),score=document.createElement('td');label.scope='row';label.textContent=BRISC_LABELS[key];score.textContent=result.scores[key].toFixed(4);row.append(label,score);return row;}));
 $('sliceLimitation').textContent=result.limitation;$('sliceProvenance').textContent=`Saved ${result.provenance.createdAt}. Model: ${result.provenance.modelVersion||result.modelId}. Image compatibility: valid ${result.input.format}, ${result.input.width} × ${result.input.height} pixels. Contrast, sequence and anatomy are user-declared, not independently verified. Preprocessing: ${result.provenance.preprocessingId}. Checkpoint SHA-256: ${result.provenance.weightsSHA256}.`;
 $('sliceResult').hidden=false;$('sliceResultEmpty').hidden=true;$('sliceExport').disabled=false;$('sliceCategory').focus();
}
async function savedRuns(){const {runs}=await request('/api/slice-research/runs');$('sliceSaved').replaceChildren(...(runs.length?runs.map(run=>{const option=document.createElement('option');option.value=run.id;option.textContent=`Image result · ${run.createdAt}`;return option;}):[new Option('No saved image results','')]));$('sliceSaved').disabled=!runs.length;buttons();}
$('sliceConsent').onchange=buttons;$('sliceSaved').onchange=buttons;
$('sliceFile').onchange=async()=>{clearResult();selected=null;$('sliceConsent').checked=false;$('sliceCanvas').hidden=true;$('sliceEmpty').hidden=false;$('sliceFileStatus').textContent='No image selected yet.';$('sliceUploadError').textContent='';$('sliceFile').setAttribute('aria-invalid','false');$('sliceRunStatus').textContent='';buttons();const file=$('sliceFile').files[0];if(!file)return;try{if(!['image/png','image/jpeg'].includes(file.type)||file.size>8*1024*1024)throw Error('Choose a JPG or PNG image no larger than 8 MB. WEBP and other formats are unsupported.');await preview(file);selected=file;}catch(error){$('sliceFile').setAttribute('aria-invalid','true');$('sliceFileStatus').textContent='This image could not be selected.';$('sliceUploadError').textContent=error.message;}buttons();};
$('sliceRun').onclick=async()=>{
 if(!ready||busy||!selected||!$('sliceConsent').checked)return;
 busy=true;clearResult();buttons();$('sliceRun').textContent='Analyzing image…';$('sliceRunStatus').textContent='Analyzing this image with the local research model…';
 try{const start=await request('/api/slice-research/runs',{method:'POST',headers:{'Content-Type':selected.type,'x-brainlens-slice-contract':'contrast-t1-research-v1'},body:selected});
  const deadline=Date.now()+135000;let finished=false;
  while(Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,500));const state=await request(`/api/slice-research/runs/${start.id}`);if(state.state==='failed')throw Error(state.message);if(state.state==='complete'){showResult(start.id,state.result);finished=true;break;}}
  if(!finished)throw Error('The run has not completed. No prediction is available here.');
  $('sliceRunStatus').textContent='Image result saved. Read the suggested category and its limits. The whole examination remains inconclusive.';await savedRuns();
 }catch(error){clearResult();$('sliceRunStatus').textContent=error.message;}finally{busy=false;$('sliceRun').textContent='Analyze this image';buttons();}
};
$('sliceReopen').onclick=async()=>{if(busy||!$('sliceSaved').value)return;busy=true;buttons();clearResult();selected=null;$('sliceFile').value='';$('sliceConsent').checked=false;$('sliceUploadError').textContent='';$('sliceFile').setAttribute('aria-invalid','false');$('sliceRunStatus').textContent='Opening the saved image and result…';try{const id=$('sliceSaved').value,state=await request(`/api/slice-research/runs/${id}`);if(state.state!=='complete')throw Error('No verified completed slice result.');const response=await fetch(`/api/slice-research/runs/${id}/image`);if(!response.ok)throw Error(await response.text());await preview(await response.blob());showResult(id,state.result);$('sliceRunStatus').textContent='Verified saved image result reopened.';}catch(error){clearResult();$('sliceRunStatus').textContent=error.message;$('sliceCanvas').hidden=true;}finally{busy=false;buttons();}};
$('sliceExport').onclick=async()=>{if(!runId)return;try{const result=await request(`/api/slice-research/runs/${runId}/export`);validateSliceResult(result);const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='brainlens-slice-research.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){$('sliceRunStatus').textContent=error.message;}};
try{const model=await request('/api/slice-research/status');ready=model.ready===true;$('sliceModelStatus').textContent=ready?'Local research model ready. It analyzes one image at a time.':`Model unavailable: ${model.reason} No prediction will be generated.`;}catch(error){$('sliceModelStatus').textContent=error.message;}
try{await savedRuns();}catch(error){$('sliceRunStatus').textContent=error.message;}buttons();
