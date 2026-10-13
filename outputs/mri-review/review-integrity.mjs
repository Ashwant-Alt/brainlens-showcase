import {validateFindingResult} from './finding-review.mjs';
import {locateCandidates} from './candidate-location.mjs';

export function verifyMaskResult(result,mask){
 validateFindingResult(result);
 const location=locateCandidates(mask);
 if(!Array.isArray(result.dimensions)||result.dimensions.length!==3||result.dimensions.some((d,i)=>d!==mask.dims[i]))throw Error('The result dimensions do not match its region markings.');
 const g=mask.geometry,a=g?.affine;
 if(g?.units!==2||!Array.isArray(a)||a.length!==3||a.some(row=>!Array.isArray(row)||row.length!==4||row.some(v=>!Number.isFinite(v))))throw Error('Region markings need a valid recorded transform in millimetres.');
 const [x,y,z]=a;
 const voxelMm3=Math.abs(x[0]*(y[1]*z[2]-y[2]*z[1])-x[1]*(y[0]*z[2]-y[2]*z[0])+x[2]*(y[0]*z[1]-y[1]*z[0]));
 if(!Number.isFinite(voxelMm3)||voxelMm3<=1e-12)throw Error('Region markings have an invalid recorded voxel volume.');
 const counts={whole_region:0,core_region:0,enhancing_region:0};
 for(const v of mask.data){if(v!==0)counts.whole_region++;if(v===1||v===4)counts.core_region++;if(v===4)counts.enhancing_region++;}
 const volumes=Object.fromEntries(Object.entries(counts).map(([k,n])=>[k,Number((n*voxelMm3/1000).toFixed(3))]));
 for(const key of Object.keys(volumes))if(Math.abs(volumes[key]-result.candidateRegionVolumesMl[key])>.001000001)throw Error('Reported measurements do not match the downloaded region markings. No verified result is available.');
 return {state:'consistent',dimensions:[...mask.dims],voxelVolumeMm3:voxelMm3,regionVoxelCounts:counts,recountedVolumesMl:volumes,candidateLocation:location,scope:'File dimensions and candidate volumes agree with the saved markings. This is a software consistency check, not medical validation or verification of anatomical alignment.'};
}

function checkedMeasurements(result,integrity){
 validateFindingResult(result);
 if(integrity?.state!=='consistent'||Object.keys(integrity.recountedVolumesMl||{}).length!==3)throw Error('Verify the region markings before drafting a summary.');
 for(const key of ['whole_region','core_region','enhancing_region'])if(!Number.isFinite(integrity.recountedVolumesMl[key])||Math.abs(integrity.recountedVolumesMl[key]-result.candidateRegionVolumesMl[key])>.001000001)throw Error('The summary verification does not match the current result.');
 const counts=integrity.regionVoxelCounts;
 if(!counts||!['whole_region','core_region','enhancing_region'].every(k=>Number.isSafeInteger(counts[k])&&counts[k]>=0)||counts.core_region>counts.whole_region||counts.enhancing_region>counts.core_region)throw Error('Verified region counts are missing or invalid.');
 if(!Number.isFinite(integrity.voxelVolumeMm3)||integrity.voxelVolumeMm3<=0)throw Error('Verified voxel volume is missing or invalid.');
 for(const key of ['whole_region','core_region','enhancing_region'])if(Math.abs(counts[key]*integrity.voxelVolumeMm3/1000-integrity.recountedVolumesMl[key])>.000500001)throw Error('Verified counts do not match the current measurements.');
 return integrity.recountedVolumesMl;
}

export function explainAssessment(result=null,integrity=null){
 const overall={state:'inconclusive',answer:'Inconclusive / unable to evaluate',explanation:'The available model localizes candidate glioma regions. Tumour presence, tumour category and other abnormalities remain unassessed, so neither an abnormal nor normal-appearing examination conclusion is established.',policyVersion:'brainlens-overall-v1',normalAppearingEnabled:false,noSupportedAbnormalityEnabled:false};
 const detection={state:'inconclusive',answer:'Inconclusive / unable to evaluate',explanation:'No installed model has adequate independent evidence for a patient-level tumour-present or tumour-absent decision. Region markings are shown separately below.',policyVersion:'tumour-evidence-gate-v1',decisionRule:null,validatedForDetection:false};
 const abnormality={state:'unavailable',answer:'Normal versus abnormal: not assessed',explanation:'No separately evaluated general abnormality classifier is installed. A negative tumour result cannot establish a normal or healthy brain.'};
 const base={overall,tumourType:{state:'unavailable',answer:'Unable to determine tumour type',explanation:'The installed models mark glioma-associated regions. They do not classify tumour families, grade or molecular subtype. A coloured region cannot supply a tumour name.'},brainHealth:{state:'not_assessed',answer:'Brain health is not determined',explanation:'This tumour-region model does not screen for all brain conditions. It has not been independently validated for healthy-brain assessment. An empty marking does not establish a healthy brain.'},confidence:{state:'not_established',answer:'Diagnostic confidence is not available',explanation:'Region volume and colour are not disease probabilities. Existing development evaluations measure annotation agreement and show substantial dataset-dependent errors; they do not establish diagnostic accuracy.'}};
 if(!result)return {...base,tumourDetection:{...detection,reason:'no_verified_inference',explanation:'No verified model output is available. Load compatible prepared images and complete inference; invalid inputs or failed runs cannot produce a prediction.'},abnormality,state:'not_run',finding:{state:'not_run',answer:'No imaging assessment has run',explanation:'Load a prepared MRI study and run the imaging model. Opening images alone does not analyze them.'}};
 const v=checkedMeasurements(result,integrity),present=integrity.regionVoxelCounts.whole_region>0;
 return {...base,tumourDetection:{...detection,reason:'detection_validation_missing',candidateObservation:present?'markings_present':'no_markings',candidateObservationRule:'Verified saved mask contains at least one nonzero voxel. This is a mask observation, not a tumour-detection rule.'},abnormality,state:'verified_research_output',finding:{state:present?'candidate_markings':'no_candidate_markings',answer:present?'Candidate regions marked for review':'No candidate regions marked by this model',explanation:present?`The model marked ${v.whole_region.toFixed(3)} mL in total. Within that region, ${v.core_region.toFixed(3)} mL is marked as core and ${v.enhancing_region.toFixed(3)} mL as enhancing. These regions overlap. They may include false markings or miss tissue, and do not confirm a tumour.`:'The verified mask contains no marked image points. This does not rule out a tumour, another abnormality or an input outside the model’s intended scope.'},measurements:{...v},verification:'Saved marking counts, dimensions and reported volumes agree. This checks the software output, not its medical correctness.',nextStep:'A qualified clinician must interpret the complete examination and clinical context. Tumour confirmation or classification may require additional testing.'};
}

export function draftResearchSummary(result,integrity){
 const v=checkedMeasurements(result,integrity);
 const present=integrity.regionVoxelCounts?.whole_region>0;
 return `Research review draft — edit before use.\n${result.model} (${result.version}) marked ${present?'candidate glioma regions':'no candidate glioma regions'} in a prepared 3D MRI study.\nCandidate marking volumes: whole ${v.whole_region.toFixed(3)} mL; core ${v.core_region.toFixed(3)} mL; enhancing ${v.enhancing_region.toFixed(3)} mL. These regions overlap and must not be added together.\n${present?'The markings require qualified review and may include missed regions or false markings.':'No markings do not rule out a tumour or establish a healthy brain.'}\nSaved marking dimensions and volumes passed a software consistency check. This does not establish medical correctness. Tumour type and other brain conditions were not assessed.\nLimitations from this run:\n${(result.limitations||[]).map(t=>`• ${t}`).join('\n')}\nReviewer observations: [add observations, uncertainty and limitations].`;
}
