import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inferenceProgress} from './inference-progress.mjs';
test('reports overlapping image-block work without inventing disease confidence',()=>{
 assert.deepEqual(inferenceProgress('{"completedWindows":29,"totalWindows":48}'),{completedImageBlocks:29,totalImageBlocks:48});
 assert.deepEqual(inferenceProgress('{"completedWindows":0,"totalWindows":1}'),{completedImageBlocks:0,totalImageBlocks:1});
});
test('partial writes, corrupted counters and excessive input safely omit progress',()=>{
 for(const text of ['{"completedWindows":','null','{}','[]','x'.repeat(2001)])assert.equal(inferenceProgress(text),null);
 for(const pair of [[-1,48],[49,48],[1,0],[.5,48],[1,4097],['1',48],[null,48]])assert.equal(inferenceProgress(JSON.stringify({completedWindows:pair[0],totalWindows:pair[1]})),null);
});
