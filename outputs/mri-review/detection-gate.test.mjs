import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyMaskResult,explainAssessment} from './review-integrity.mjs';

function assessment(label,modelId='segresnet'){
 const mask={dims:[1,1,1],data:new Uint8Array([label]),geometry:{units:2,affine:[[1,0,0,0],[0,1,0,0],[0,0,1,0]]}};
 const result={modelId,dimensions:[1,1,1],candidateRegionVolumesMl:{whole_region:label?0.001:0,core_region:label===1||label===4?0.001:0,enhancing_region:label===4?0.001:0},diagnosis:'definite tumour',healthy:true,detectionValidated:true};
 return explainAssessment(result,verifyMaskResult(result,mask));
}
test('no verified inference yields an explicit inconclusive tumour answer',()=>{
 const a=explainAssessment();assert.equal(a.tumourDetection.state,'inconclusive');assert.equal(a.tumourDetection.reason,'no_verified_inference');
});
test('every supported segmentation label and model remains outside validated detection',()=>{
 for(const model of ['segresnet','swinunetr'])for(const label of [0,1,2,4]){
  const a=assessment(label,model);assert.equal(a.tumourDetection.state,'inconclusive');assert.equal(a.tumourDetection.validatedForDetection,false);assert.equal(a.tumourDetection.decisionRule,null);
  assert.equal(a.tumourDetection.candidateObservation,label?'markings_present':'no_markings');assert.equal(a.abnormality.state,'unavailable');assert.doesNotMatch(JSON.stringify(a),/definite tumour|"healthy":true/);
 }
});
test('empty mask neither enables a negative tumour conclusion nor normal-brain classification',()=>{
 const a=assessment(0);assert.equal(a.finding.state,'no_candidate_markings');assert.equal(a.tumourDetection.state,'inconclusive');assert.equal(a.brainHealth.state,'not_assessed');assert.match(a.abnormality.explanation,/cannot establish/);
});
test('unverified or fabricated result fields cannot bypass the detection evidence gate',()=>{
 assert.throws(()=>explainAssessment({modelId:'classifier',healthy:true},null));
 const a=assessment(4);assert.equal(a.tumourDetection.policyVersion,'tumour-evidence-gate-v1');assert.equal(a.confidence.state,'not_established');
});
