// All coordinates refer to the unchanged source grid. R/A/S increase right/up.
export function sliceLayout(volume,axis){
 if(!Number.isInteger(axis)||axis<0||axis>2)throw Error('Invalid slice direction.');
 const a=volume.geometry?.affine;
 const worldAxes=a?[0,1,2].map(j=>a.map(row=>Math.abs(row[j])).indexOf(Math.max(...a.map(row=>Math.abs(row[j]))))):null;
 const aligned=!!a&&new Set(worldAxes).size===3&&a.every((row,i)=>row.slice(0,3).every((v,j)=>worldAxes[j]===i||Math.abs(v)<1e-5));
 const plane=aligned?['Sagittal','Coronal','Axial'][worldAxes[axis]]:`Storage direction ${axis+1}`;
 const desired=aligned?[[1,2],[0,2],[0,1]][worldAxes[axis]]:null;
 const axes=aligned?desired.map(w=>worldAxes.indexOf(w)):[0,1,2].filter(i=>i!==axis);
 return {axis,axes,plane,anatomical:aligned,width:volume.dims[axes[0]],height:volume.dims[axes[1]],
  flips:axes.map(j=>aligned&&a[worldAxes[j]][j]<0),spacing:axes.map(j=>volume.geometry?.spacing?.[j]||1)};
}
export function sliceVoxel(layout,dims,slice,x,y){
 const p=[0,0,0];p[layout.axis]=slice;
 layout.axes.forEach((axis,i)=>{const value=i===0?x:y;p[axis]=layout.flips[i]?dims[axis]-1-value:value;});
 return p[0]+dims[0]*(p[1]+dims[1]*p[2]);
}
