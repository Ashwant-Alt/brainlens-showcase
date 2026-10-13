import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateFindingResult,findingReview} from './finding-review.mjs';
const result=(volumes={whole_region:10,core_region:5,enhancing_region:2},modelId='swinunetr')=>({modelId,candidateRegionVolumesMl:volumes});
test('accepts nested measurements and small rounding tolerance, without calling categories tumours',()=>{
 assert.equal(validateFindingResult(result()).modelId,'swinunetr');
 validateFindingResult(result({whole_region:1,core_region:1.001,enhancing_region:0}));
 const review=findingReview(result());assert.equal(review.regionCategoriesWithRecordedVolume,3);assert.match(review.summary,/not separate tumours/);assert.match(review.summary,/Tumour type: Not assessed/);
});
test('rejects missing, extra, malformed, nonfinite, negative, contradictory and unknown model results',()=>{
 for(const invalid of [null,{},result({},'segresnet'),result({whole_region:1,core_region:1,enhancing_region:0,diagnosis:1}),result({whole_region:'1',core_region:1,enhancing_region:0}),result({whole_region:NaN,core_region:0,enhancing_region:0}),result({whole_region:Infinity,core_region:0,enhancing_region:0}),result({whole_region:1,core_region:-1,enhancing_region:0}),result({whole_region:1,core_region:2,enhancing_region:0}),result({whole_region:2,core_region:1,enhancing_region:1.01}),result(undefined,'classifier')])assert.throws(()=>validateFindingResult(invalid));
});
test('zero output and not-yet-run explicitly leave brain health and tumour type unassessed',()=>{
 const review=findingReview(result({whole_region:0,core_region:0,enhancing_region:0}));assert.equal(review.regionCategoriesWithRecordedVolume,0);assert.match(review.markings,/does not establish a healthy brain/);assert.equal(review.tumourType,'Not assessed by this model');assert.equal(review.otherBrainConditions,'Not assessed');assert.equal(findingReview().state,'not_run');
});
