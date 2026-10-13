import {test} from 'node:test';
import assert from 'node:assert/strict';
import {locateCandidates,locationForView} from './candidate-location.mjs';

function fixture(dims,points){const data=new Uint8Array(dims.reduce((a,b)=>a*b,1));for(const[x,y,z,label=1]of points)data[x+dims[0]*(y+dims[1]*z)]=label;return{dims,data};}
test('counts all labels and finds extent and busiest slices in NIfTI storage order',()=>{
 const result=locateCandidates(fixture([4,3,5],[[1,0,1,1],[2,0,1,2],[2,2,3,4]]));
 assert.equal(result.markedVoxels,3);assert.deepEqual(result.bounds,{minimum:[1,0,1],maximum:[2,2,3]});
 assert.deepEqual(result.views.map(v=>v.bestSlice),[2,0,1]);assert.equal(result.views[2].markedVoxelsOnBestSlice,2);
 assert.match(result.scope,/not confirmed tumour boundaries/);assert.equal(locationForView(result,2).bestSlice,1);
});
test('empty mask does not provide a jump target or a healthy-brain assertion',()=>{
 const result=locateCandidates(fixture([2,2,2],[]));assert.equal(result.state,'no_markings');assert.equal(result.bounds,null);assert.equal(locationForView(result,2),null);assert.match(result.scope,/does not establish a healthy brain/);
});
test('retains disconnected and single-voxel markings without inventing a tumour count',()=>{
 const result=locateCandidates(fixture([4,4,4],[[0,0,0],[3,3,3]]));assert.equal(result.markedVoxels,2);assert.deepEqual(result.bounds,{minimum:[0,0,0],maximum:[3,3,3]});assert.equal(result.tumourCount,undefined);
});
test('ties choose a slice nearest the marked extent midpoint, then lower index',()=>{
 const result=locateCandidates(fixture([1,1,5],[[0,0,0],[0,0,1],[0,0,3],[0,0,4]]));assert.equal(result.views[2].bestSlice,1);
});
test('rejects unsupported labels, truncated data, invalid axes and excessive dimensions',()=>{
 for(const value of [3,-1,NaN,Infinity])assert.throws(()=>locateCandidates({dims:[1,1,1],data:[value]}),/label/);
 assert.throws(()=>locateCandidates({dims:[2,2,2],data:[0]}),/Incomplete/);
 for(const dims of [[321,1,1],[1.5,1,1],[0,1,1],[1,1]])assert.throws(()=>locateCandidates({dims,data:[]}),/dimensions/);
 assert.throws(()=>locationForView(null,3),/direction/);
});
