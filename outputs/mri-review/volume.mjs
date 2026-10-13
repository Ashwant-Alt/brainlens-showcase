export function parseNifti(buffer){
 if(buffer.byteLength<352)throw Error('File is too short for NIfTI-1.');
 const view=new DataView(buffer),little=view.getInt32(0,true)===348;
 if(view.getInt32(0,little)!==348)throw Error('Only NIfTI-1 is supported.');
 if(String.fromCharCode(...new Uint8Array(buffer,344,3))!=='n+1')throw Error('Use a single-file .nii study.');
 const rank=view.getInt16(40,little),dims=[42,44,46].map(o=>view.getInt16(o,little));
 if(rank!==3||dims.some(d=>d<1||d>1024))throw Error('Only one 3D volume is supported; select a single sequence/timepoint.');
 for(let d=4;d<=rank;d++)if(view.getInt16(40+d*2,little)>1)throw Error('Only one 3D volume is supported; select a single sequence/timepoint.');
 const datatype=view.getInt16(70,little),types={2:['getUint8',1],4:['getInt16',2],8:['getInt32',4],16:['getFloat32',4],64:['getFloat64',8],256:['getInt8',1],512:['getUint16',2],768:['getUint32',4]};
 if(!types[datatype])throw Error('Unsupported voxel datatype.');
 const [method,bytes]=types[datatype],count=dims.reduce((a,b)=>a*b),offset=view.getFloat32(108,little);
 if(!Number.isInteger(offset)||offset<352||count>40000000||offset+count*bytes>buffer.byteLength)throw Error('Volume is too large, truncated, or has an invalid offset.');
 if(view.getInt16(72,little)!==bytes*8)throw Error('Voxel size does not match datatype.');
 let slope=view.getFloat32(112,little),intercept=view.getFloat32(116,little);if(slope===0){slope=1;intercept=0;}
 if(!Number.isFinite(slope)||!Number.isFinite(intercept))throw Error('Invalid intensity scaling.');
 const data=new Float32Array(count);let min=Infinity,max=-Infinity;
 for(let i=0;i<count;i++){const value=view[method](offset+i*bytes,little)*slope+intercept;if(!Number.isFinite(value)||Math.abs(value)>3.4028234663852886e38)throw Error('Volume contains non-finite or overflowing intensities.');data[i]=value;min=Math.min(min,value);max=Math.max(max,value);}
 return {dims,data,min,max};
}
export function sampleVolume(){const dims=[96,96,64],data=new Float32Array(96*96*64);for(let z=0;z<64;z++)for(let y=0;y<96;y++)for(let x=0;x<96;x++){const r=((x-48)/35)**2+((y-48)/40)**2+((z-32)/27)**2;data[x+96*(y+96*z)]=r<1?50+100*(1-r)+15*Math.cos(x*.4)*Math.sin(y*.3):0;}return{dims,data,min:0,max:165};}
