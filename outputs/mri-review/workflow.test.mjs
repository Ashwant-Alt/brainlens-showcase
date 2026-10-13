import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {sliceLayout,sliceVoxel} from './slice-view.mjs';
import {parseNifti} from './volume.mjs';
import {createBrainLensServer} from './server.mjs';
test('axial coronal sagittal indexing follows physical axes and reflections',()=>{
 const v={dims:[17,19,23],geometry:{affine:[[1,0,0,10],[0,1,0,-2],[0,0,1,5]],spacing:[1,1,1]}};
 for(const [axis,plane,expected]of [[2,'Axial',2+17*(3+19*4)],[1,'Coronal',2+17*(4+19*3)],[0,'Sagittal',4+17*(2+19*3)]]){const l=sliceLayout(v,axis);assert.equal(l.plane,plane);assert.equal(sliceVoxel(l,v.dims,4,2,3),expected);}
 const reflected=structuredClone(v);reflected.geometry.affine[0][0]=-1;assert.equal(sliceVoxel(sliceLayout(reflected,2),v.dims,4,2,3),14+17*(3+19*4));
 const oblique=structuredClone(v);oblique.geometry.affine[0][1]=.2;assert.equal(sliceLayout(oblique,2).anatomical,false);
});
test('invalid NaN scaling and float32 overflow cannot produce a preview',()=>{
 const b=new ArrayBuffer(360),v=new DataView(b);v.setInt32(0,348,true);v.setInt16(40,3,true);for(const o of [42,44,46])v.setInt16(o,1,true);v.setInt16(70,64,true);v.setInt16(72,64,true);v.setFloat32(108,352,true);new Uint8Array(b,344,4).set([110,43,49,0]);v.setFloat32(112,NaN,true);assert.throws(()=>parseNifti(b),/scaling/);v.setFloat32(112,1,true);v.setFloat64(352,1e100,true);assert.throws(()=>parseNifti(b),/overflow/);
});
test('navigation uses an allowed external script; missing evidence CSV is served',async t=>{
 const server=createBrainLensServer();server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());const base=`http://127.0.0.1:${server.address().port}`;
 const about=await fetch(base+'/about');const html=await about.text();assert.match(about.headers.get('content-security-policy'),/script-src 'self'/);assert.ok(!html.includes('<script>'));assert.match(html,/src="\/about-navigation.js"/);
 for(const file of ['about-navigation.js','meningioma-component-comparison.csv','slice-view.mjs'])assert.equal((await fetch(base+'/'+file)).status,200);
 assert.equal((await fetch(base+'/.env')).status,404);assert.equal((await fetch(base+'/api/jobs/not-a-uuid')).status,404);
});
test('published model requirement record pins normalization and original window',async()=>{
 const config=JSON.parse(await readFile(new URL('./segresnet-config.json',import.meta.url)));
 assert.deepEqual(config.inferer.roi_size,[240,240,160]);assert.deepEqual(config.preprocessing.transforms[1],{_target_:'NormalizeIntensityd',keys:'@image_key',nonzero:true,channel_wise:true});
});
