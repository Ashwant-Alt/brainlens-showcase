import {test} from 'node:test';import assert from 'node:assert/strict';import {parseNifti} from './volume.mjs';
function fixture(little=true){const b=new ArrayBuffer(368),v=new DataView(b);v.setInt32(0,348,little);v.setInt16(40,3,little);for(const o of [42,44,46])v.setInt16(o,2,little);v.setInt16(70,4,little);v.setInt16(72,16,little);v.setFloat32(108,352,little);v.setFloat32(112,2,little);v.setFloat32(116,-1,little);new Uint8Array(b,344,4).set([110,43,49,0]);for(let i=0;i<8;i++)v.setInt16(352+i*2,i,little);return b;}
test('reads endian variants and calibrated intensities',()=>{for(const little of [true,false]){const v=parseNifti(fixture(little));assert.deepEqual(v.dims,[2,2,2]);assert.equal(v.min,-1);assert.equal(v.max,13);}});
test('rejects truncated voxel data',()=>assert.throws(()=>parseNifti(fixture().slice(0,360)),/truncated/));
test('rejects multi-timepoint studies',()=>{const b=fixture(),v=new DataView(b);v.setInt16(40,4,true);v.setInt16(48,2,true);assert.throws(()=>parseNifti(b),/single sequence/);});
test('rejects unsupported datatype',()=>{const b=fixture();new DataView(b).setInt16(70,32,true);assert.throws(()=>parseNifti(b),/datatype/);});
