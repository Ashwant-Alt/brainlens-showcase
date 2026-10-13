// Task and prediction unit are explicit. No cross-task aggregation is implied.
export const inferenceModules = Object.freeze({
  segresnet: Object.freeze({task:'region_segmentation',inputUnit:'examination',spatialDimensions:3,outputUnit:'voxel',researchOnly:true}),
  brisc: Object.freeze({task:'slice_classification',inputUnit:'slice',spatialDimensions:2,outputUnit:'slice',researchOnly:true}),
  futureTumourPresence: Object.freeze({task:'tumour_presence',inputUnit:'examination',spatialDimensions:3,outputUnit:'examination',enabled:false,requires:'Compatible volumetric checkpoint and independent examination-level evaluation'})
});
export function requireModuleScope(value, moduleId){
  const expected=inferenceModules[moduleId];
  if(!expected||Object.entries(expected).filter(([key])=>['task','inputUnit','spatialDimensions','outputUnit'].includes(key)).some(([key,v])=>value?.[key]!==v))throw Error('Inference task, dimension or prediction unit mismatch.');
  return expected;
}
