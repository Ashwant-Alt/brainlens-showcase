import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyMaskResult,explainAssessment} from './review-integrity.mjs';
const fixture=()=>{
 const mask={dims:[2,2,2],data:new Uint8Array([0,1,2,4,0,0,0,0]),geometry:{units:2,affine:[[1,0,0,0],[0,1,0,0],[0,0,1,0]]}};
 const result={modelId:'segresnet',dimensions:[2,2,2],candidateRegionVolumesMl:{whole_region:.003,core_region:.002,enhancing_region:.001},diagnosis:'glioblastoma',healthy:true};
 return {mask,result};
};
test('does not assess an image-only preview',()=>{const a=explainAssessment();assert.equal(a.state,'not_run');assert.equal(a.tumourType.state,'unavailable');assert.equal(a.brainHealth.state,'not_assessed');});
test('describes independently verified candidates without accepting invented diagnosis fields',()=>{const {mask,result}=fixture();const a=explainAssessment(result,verifyMaskResult(result,mask));assert.equal(a.finding.state,'candidate_markings');assert.match(a.finding.explanation,/0.003 mL/);assert.equal(a.tumourType.state,'unavailable');assert.equal(a.brainHealth.state,'not_assessed');assert.doesNotMatch(JSON.stringify(a),/glioblastoma/);assert.equal(a.confidence.state,'not_established');});
test('empty output explicitly refuses a healthy-brain conclusion',()=>{const {mask,result}=fixture();mask.data.fill(0);result.candidateRegionVolumesMl={whole_region:0,core_region:0,enhancing_region:0};const a=explainAssessment(result,verifyMaskResult(result,mask));assert.equal(a.finding.state,'no_candidate_markings');assert.match(a.finding.explanation,/does not rule out/);assert.equal(a.brainHealth.state,'not_assessed');});
test('uses voxel counts even when a tiny nonempty marking rounds to zero mL',()=>{const {mask,result}=fixture();mask.data.fill(0);mask.data[0]=2;mask.geometry.affine=[[.1,0,0,0],[0,.1,0,0],[0,0,.1,0]];result.candidateRegionVolumesMl={whole_region:0,core_region:0,enhancing_region:0};assert.equal(explainAssessment(result,verifyMaskResult(result,mask)).finding.state,'candidate_markings');});
test('rejects missing verification, altered current values and contradictory counts',()=>{const {mask,result}=fixture();const v=verifyMaskResult(result,mask);assert.throws(()=>explainAssessment(result,null));assert.throws(()=>explainAssessment(result,{...v,regionVoxelCounts:{whole_region:0,core_region:2,enhancing_region:1}}));assert.throws(()=>explainAssessment(result,{...v,regionVoxelCounts:{whole_region:300,core_region:2,enhancing_region:1}}));result.candidateRegionVolumesMl.whole_region=.1;assert.throws(()=>explainAssessment(result,v));});
