import {test} from 'node:test';import assert from 'node:assert/strict';import {draftSummary} from './nvidia.mjs';
test('accepts a pasted Bearer prefix without duplicating authorization',async()=>{
 const result=await draftSummary({candidateRegionVolumesMl:{whole_region:1,core_region:0,enhancing_region:0}},{env:{NVIDIA_API_KEY:' Bearer nvapi-test-placeholder '},fetcher:async(url,options)=>{assert.equal(options.headers.Authorization,'Bearer nvapi-test-placeholder');return new Response(JSON.stringify({choices:[{message:{content:'Research draft.'},finish_reason:'stop'}]}));}});
 assert.equal(result.text,'Research draft.');
});
