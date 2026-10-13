import {test} from 'node:test';
import assert from 'node:assert/strict';
import {capabilities} from './capabilities.mjs';
import {verifyMaskResult,explainAssessment} from './review-integrity.mjs';
import {createReviewExport} from './review-export.mjs';
function fixture(){
 const mask={dims:[2,2,2],data:new Uint8Array([0,1,2,4,0,0,0,0]),geometry:{units:2,affine:[[1,0,0,0],[0,1,0,0],[0,0,1,0]]}};
 const result={modelId:'segresnet',dimensions:[2,2,2],candidateRegionVolumesMl:{whole_region:.003,core_region:.002,enhancing_region:.001},diagnosis:'invented diagnosis',healthy:true,apiKey:'must not export',files:{t1c:'private filename'}};
 return {mask,result};
}
test('capabilities do not promote classifiers or unrelated models because a checkpoint is ready',()=>{
 const c=capabilities([{id:'segresnet',ready:true},{id:'unknown',ready:true}]);
 assert.deepEqual(c.modules.find(m=>m.id==='localization').modelIds,['segresnet']);
 for(const id of ['tumour_presence','tumour_category','other_abnormalities'])assert.equal(c.modules.find(m=>m.id===id).status,'unavailable');
 assert.equal(c.normalAppearingEnabled,false);assert.equal(c.externalImagingService,false);
 assert.equal(capabilities([{id:'segresnet',ready:false}]).modules.find(m=>m.id==='localization').status,'unavailable');
});
test('overall assessment remains inconclusive for both marked and empty verified masks',()=>{
 const {mask,result}=fixture();
 for(const marked of [true,false]){
  if(!marked){mask.data.fill(0);result.candidateRegionVolumesMl={whole_region:0,core_region:0,enhancing_region:0};}
  const assessment=explainAssessment(result,verifyMaskResult(result,mask));
  assert.equal(assessment.overall.state,'inconclusive');assert.equal(assessment.overall.normalAppearingEnabled,false);assert.equal(assessment.overall.noSupportedAbnormalityEnabled,false);
 }
});
test('review export separates calculated values and human notes from imaging predictions and retains historical policy',()=>{
 const {mask,result}=fixture(),integrity=verifyMaskResult(result,mask);
 const savedAssessment={assessment:{state:'old research policy'},policySHA256:'historical-hash',historical:true};
 const exported=createReviewExport({result,integrity,jobId:'test-id',savedAssessment,observations:'Human uncertainty'});
 assert.equal(exported.currentAssessment.overall.state,'inconclusive');assert.deepEqual(exported.savedAssessment,savedAssessment);
 assert.equal(exported.humanReview.observations,'Human uncertainty');assert.equal(exported.calculatedMeasurements.candidateRegionVolumesMl.whole_region,.003);
 assert.doesNotMatch(JSON.stringify(exported),/invented diagnosis|must not export|private filename/);
 assert.equal(exported.modelPrediction.healthy,undefined);
});
test('an export cannot fabricate verified measurements or accept invalid human notes',()=>{
 const {mask,result}=fixture();
 assert.throws(()=>createReviewExport({result}),/Verify/);
 assert.throws(()=>createReviewExport({result,integrity:verifyMaskResult(result,mask),observations:'x'.repeat(20001)}),/20,000/);
 const preview=createReviewExport({observations:'Preview only'});assert.equal(preview.modelPrediction,null);assert.equal(preview.calculatedMeasurements,null);assert.equal(preview.currentAssessment.state,'not_run');
});
