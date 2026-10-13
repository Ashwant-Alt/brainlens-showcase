import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inferenceModules,requireModuleScope} from './inference-contract.mjs';
import {BRISC_CLASSES,PREPROCESSING,validateBundle,validateEvaluation,createSliceResult,validateSliceResult,describeSliceResult} from './brisc-contract.mjs';
const hash='a'.repeat(64);
export function bundle(){return {schemaVersion:1,modelId:'brisc-slice-v1',...inferenceModules.brisc,dataset:'BRISC2025',format:'torchscript',classes:[...BRISC_CLASSES],preprocessing:{...PREPROCESSING},weightsFile:'classifier.ts',weightsSHA256:hash,evaluationFile:'evaluation.json',evaluationSHA256:hash,checkpointSource:'Synthetic fixture only',licence:'Test fixture',trainingPreprocessingSource:'Test fixture'};}
function result(){return createSliceResult({topClass:'no_tumor',scores:{glioma:.1,meningioma:.1,pituitary:.1,no_tumor:.7},width:64,height:64,format:'PNG',healthy:true,diagnosis:'invented diagnosis'},{inputSHA256:hash,weightsSHA256:hash,bundleSHA256:hash,evaluationSHA256:hash,runnerSHA256:hash,preprocessingId:PREPROCESSING.id});}
test('slice and volumetric modules have distinct units; future detection stays disabled',()=>{
 assert.equal(inferenceModules.segresnet.spatialDimensions,3);assert.equal(inferenceModules.futureTumourPresence.enabled,false);
 assert.throws(()=>requireModuleScope({...inferenceModules.brisc,inputUnit:'examination'},'brisc'),/mismatch/);
 assert.throws(()=>requireModuleScope(inferenceModules.segresnet,'brisc'),/mismatch/);
});
test('checkpoint contract rejects a different class order, unsupported preprocessing and path traversal',()=>{
 validateBundle(bundle());for(const change of [{classes:[...BRISC_CLASSES].reverse()},{preprocessing:{...PREPROCESSING,width:128}},{weightsFile:'../model.pt'},{inputUnit:'examination'},{trainingPreprocessingSource:''}])assert.throws(()=>validateBundle({...bundle(),...change}));
});
test('evaluation must bind the exact checkpoint and held-out slice task',()=>{
 const record={schemaVersion:1,dataset:'BRISC2025',inputUnit:'slice',modelSHA256:hash,sampleCount:20,heldOut:true,patientIndependence:'not_established',methodology:'Fixture methodology',metrics:{fixture:true}};
 validateEvaluation(record,bundle());for(const change of [{heldOut:false},{modelSHA256:'b'.repeat(64)},{sampleCount:0},{inputUnit:'examination'},{metrics:{}}])assert.throws(()=>validateEvaluation({...record,...change},bundle()));
});
test('no_tumor slice suggestion never becomes health or examination detection',()=>{
 const r=result();assert.equal(r.overallExaminationAssessment,'inconclusive');assert.equal(r.normalAppearingEnabled,false);assert.equal(r.localization,null);assert.equal(r.volumeMeasurements,null);assert.equal(r.diagnosis,undefined);assert.equal(r.healthy,undefined);assert.match(r.limitation,/cannot diagnose/);
});
test('malformed scores, missing provenance and examination promotion are rejected',()=>{
 const r=result();for(const change of [{scores:{...r.scores,glioma:NaN}},{scores:{...r.scores,glioma:2}},{topClass:'glioma'},{normalAppearingEnabled:true},{overallExaminationAssessment:'normal'},{spatialDimensions:3},{provenance:{}},{volumeMeasurements:{ml:1}},{diagnosis:'healthy brain'},{healthy:true}])assert.throws(()=>validateSliceResult({...r,...change}));
});

for(const [key,name] of [['glioma','Glioma'],['meningioma','Meningioma'],['pituitary','Pituitary tumour']]){
 test(`${key} presentation names a suggestion without promoting its scope`,()=>{
  const saved=result();saved.scores=Object.fromEntries(BRISC_CLASSES.map(c=>[c,c===key?.7:.1]));saved.topClass=key;
  const description=describeSliceResult(saved);
  assert.match(description.heading,/Suggested tumour category:/);assert.ok(description.heading.includes(name));
  assert.match(description.explanation,/does not confirm/);assert.equal(description.brainHealth,'Inconclusive');
  assert.equal(saved.overallExaminationAssessment,'inconclusive');assert.equal(saved.localization,null);
 });
}
test('negative slice presentation cannot certify health or fabricate an outline',()=>{
 const description=describeSliceResult(result());
 assert.match(description.heading,/No tumour category suggested in this slice/);
 assert.doesNotMatch(description.heading,/No tumour detected|healthy|normal/i);
 assert.match(description.explanation,/can be missed/);assert.match(description.explanation,/not evidence of a healthy brain/);
 assert.equal(description.brainHealth,'Inconclusive');assert.match(description.outline,/Unavailable/);
 assert.match(description.outlineExplanation,/No outline has been generated/);
});
test('presentation preserves saved bytes and adds no display fields to the exported record',()=>{
 const saved=result(),before=JSON.stringify(saved);
 Object.freeze(saved.scores);Object.freeze(saved.input);Object.freeze(saved.provenance);Object.freeze(saved);
 const description=describeSliceResult(saved);assert.equal(Object.isFrozen(description),true);
 assert.equal(JSON.stringify(saved),before);assert.equal(saved.brainHealth,undefined);assert.equal(saved.outline,undefined);
 validateSliceResult(saved);
});
test('display rejects failed, unsupported and diagnosis-promoted result records',()=>{
 const saved=result();
 for(const change of [{status:'failed'},{input:{...saved.input,format:'WEBP'}},{input:{...saved.input,sequenceEvidence:'unknown'}},{diagnosis:'tumour confirmed'},{localization:{outline:[]}}])assert.throws(()=>describeSliceResult({...saved,...change}));
 assert.throws(()=>describeSliceResult({topClass:'no_tumor',scores:saved.scores,status:'raw_response'}));
});
