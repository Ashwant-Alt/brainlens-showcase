export const SEQUENCES = {
 t1c: {label:'T1 with contrast (T1c)'},
 t1: {label:'T1 before contrast (T1)'},
 t2: {label:'T2'},
 flair: {label:'FLAIR'}
};

// Read only spatial metadata; the existing volume parser still owns voxel parsing.
export function readSpatialInfo(buffer){
 if(buffer.byteLength<352)throw Error('Truncated spatial header.');
 const view=new DataView(buffer),little=view.getInt32(0,true)===348;
 const spacing=[80,84,88].map(o=>view.getFloat32(o,little));
 const units=view.getUint8(123)&7,sform=view.getInt16(254,little),qform=view.getInt16(252,little);
 let affine=null;
 if(sform>0){affine=[280,296,312].map(offset=>[0,4,8,12].map(o=>view.getFloat32(offset+o,little)));}
 else if(qform>0){
  let [b,c,d]=[256,260,264].map(o=>view.getFloat32(o,little)),a2=1-b*b-c*c-d*d;
  if(Number.isFinite(a2)&&a2>=-1e-5&&spacing.every(s=>Number.isFinite(s)&&s>0)){
   if(a2<0){const norm=Math.hypot(b,c,d);b/=norm;c/=norm;d/=norm;a2=0;}
   const a=Math.sqrt(a2),[dx,dy,dz]=spacing,qfac=view.getFloat32(76,little)<0?-1:1;
   const rotation=[[a*a+b*b-c*c-d*d,2*(b*c-a*d),2*(b*d+a*c)],
    [2*(b*c+a*d),a*a+c*c-b*b-d*d,2*(c*d-a*b)],
    [2*(b*d-a*c),2*(c*d+a*b),a*a+d*d-c*c-b*b]];
   const offsets=[268,272,276].map(o=>view.getFloat32(o,little));
   affine=rotation.map((row,i)=>[row[0]*dx,row[1]*dy,row[2]*dz*qfac,offsets[i]]);
  }
 }
 if(affine){
  const [a,b,c]=affine,det=a[0]*(b[1]*c[2]-b[2]*c[1])-a[1]*(b[0]*c[2]-b[2]*c[0])+a[2]*(b[0]*c[1]-b[1]*c[0]);
  if(!affine.flat().every(Number.isFinite)||Math.abs(det)<1e-12)affine=null;
 }
 let issue=null;
 if(sform<0||qform<0||sform>5||qform>5)issue='Unsupported spatial-transform code.';
 if(sform>0&&qform>0){const qbuffer=buffer.slice(0,352);new DataView(qbuffer).setInt16(254,0,little);const q=readSpatialInfo(qbuffer).affine;if(!q||!affine||q.flat().some((v,i)=>Math.abs(v-affine.flat()[i])>1e-3))issue='The recorded qform and sform disagree.';}
 const actualSpacing=affine?[0,1,2].map(j=>Math.hypot(...affine.map(row=>row[j]))):spacing;
 if(spacing.some((v,i)=>!Number.isFinite(v)||v<=0||Math.abs(v-actualSpacing[i])>.01))issue='Header spacing and recorded affine spacing disagree.';
 return {units,affine,spacing:actualSpacing,headerSpacing:spacing,issue};
}

export function sameGeometry(left,right,tolerance=1e-3){
 return !!left?.geometry?.affine&&!!right?.geometry?.affine&&left.geometry.units===right.geometry.units&&
  left.dims.every((d,i)=>d===right.dims[i])&&left.dims.length===right.dims.length&&
  left.geometry.affine.flat().every((v,i)=>Math.abs(v-right.geometry.affine.flat()[i])<=tolerance);
}

export function preparationIssue(volume){
 if(volume.dims.some(d=>d<16||d>320)||volume.dims.reduce((a,b)=>a*b)>25000000)return 'Use a prepared 3D volume with each dimension from 16 to 320 and at most 25 million image points.';
 if(volume.geometry?.units!==2)return 'The file must record its spatial units in millimetres.';
 if(!volume.geometry?.affine)return 'The file needs a valid recorded spatial transform; its position cannot be verified.';
 if(volume.geometry.issue)return volume.geometry.issue;
 if(volume.geometry.spacing.some(s=>Math.abs(s-1)>.01))return 'The model requires prepared research images with 1 mm spacing in every direction.';
 if(volume.geometry.affine.some((row,i)=>row.slice(0,3).some((v,j)=>Math.abs(v-(i===j?volume.geometry.spacing[i]:0))>1e-4)))return 'Inference requires prepared RAS-aligned images. Other orientations, oblique and sheared grids can be previewed but cannot run this model.';
 let lo=Infinity,hi=-Infinity;
 for(const value of volume.data){if(!Number.isFinite(value))return 'The image contains invalid intensities.';if(value!==0){lo=Math.min(lo,value);hi=Math.max(hi,value);}}
 if(!Number.isFinite(lo)||hi-lo<1e-6)return 'The image is empty or has constant nonzero intensities. Choose a valid MRI volume.';
 return null;
}

export function readiness({modelReady,prepared,busy,checks,files}){
 const items=[],missing=Object.keys(SEQUENCES).filter(id=>!files[id]);
 if(missing.length)items.push(`Add ${missing.map(id=>SEQUENCES[id].label).join(', ')}, or load a public study.`);
 for(const id of Object.keys(SEQUENCES))if(files[id]){
  if(!checks[id]||checks[id].status==='checking')items.push(`Checking ${SEQUENCES[id].label}…`);
  else if(checks[id].status==='error')items.push(`${SEQUENCES[id].label}: ${checks[id].error}`);
 }
 const verified=Object.keys(SEQUENCES).filter(id=>checks[id]?.status==='ready'&&files[id]);
 if(verified.length===4&&!verified.every(id=>sameGeometry(checks.t1c.volume,checks[id].volume)))items.push('The four files record different dimensions or positions. Use aligned image sets from the same prepared study.');
 if(!prepared)items.push('Confirm that the four files are permitted, de-identified research images prepared from the same examination.');
 if(!modelReady)items.push('The local imaging model is not ready. Check the model connection message.');
 const ready=items.length===0&&!busy;
 return {ready,items,title:busy?'A local task is in progress.':ready?'Ready to run the research model.':'Before you can run the model'};
}
