// Location of existing model markings, not a new tumour classifier.
export function locateCandidates(mask){
 const dims=mask?.dims;
 if(!Array.isArray(dims)||dims.length!==3||dims.some(d=>!Number.isInteger(d)||d<1||d>320))throw Error('Invalid region-mask dimensions.');
 const size=dims.reduce((a,b)=>a*b,1);
 if(size>25000000||!mask.data||mask.data.length!==size)throw Error('Incomplete region mask.');
 const counts=dims.map(d=>new Uint32Array(d)),minimum=[...dims],maximum=[-1,-1,-1];
 let marked=0,index=0;
 for(let z=0;z<dims[2];z++)for(let y=0;y<dims[1];y++)for(let x=0;x<dims[0];x++,index++){
  const value=mask.data[index];
  if(value!==0&&value!==1&&value!==2&&value!==4)throw Error('Unsupported region-mask label.');
  if(value===0)continue;
  marked++;
  const position=[x,y,z];
  for(let axis=0;axis<3;axis++){counts[axis][position[axis]]++;minimum[axis]=Math.min(minimum[axis],position[axis]);maximum[axis]=Math.max(maximum[axis],position[axis]);}
 }
 if(!marked)return{state:'no_markings',indexBase:0,dimensions:[...dims],markedVoxels:0,bounds:null,views:[],scope:'No model markings; this does not establish a healthy brain.'};
 const views=counts.map((slices,axis)=>{
  const middle=(minimum[axis]+maximum[axis])/2;
  let best=minimum[axis];
  for(let slice=minimum[axis];slice<=maximum[axis];slice++){
   if(slices[slice]>slices[best]||(slices[slice]===slices[best]&&Math.abs(slice-middle)<Math.abs(best-middle)))best=slice;
  }
  return{axis,firstSlice:minimum[axis],lastSlice:maximum[axis],bestSlice:best,markedVoxelsOnBestSlice:slices[best]};
 });
 return{state:'candidate_markings',indexBase:0,dimensions:[...dims],markedVoxels:marked,bounds:{minimum,maximum},views,scope:'Bounds include all nonzero model markings, including disconnected areas and small false markings. They are not confirmed tumour boundaries or a count of tumours. Slice indices use file storage order.'};
}

export function locationForView(location,axis){
 if(!Number.isInteger(axis)||axis<0||axis>2)throw Error('Unsupported view direction.');
 if(!location||location.state!=='candidate_markings')return null;
 return location.views[axis];
}
