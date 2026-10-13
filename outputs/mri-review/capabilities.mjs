// Availability is an imaging-task contract, not a claim of medical accuracy.
export function capabilities(models=[]){
 const localizers=models.filter(m=>m.ready&&['segresnet','swinunetr'].includes(m.id)).map(m=>m.id);
 return {schemaVersion:1,policyVersion:'brainlens-capabilities-v1',modules:[
  {id:'tumour_presence',name:'Tumour detection',status:'unavailable',supportedTargets:[],reason:'No installed examination-level classifier has adequate independent detection evidence. Historical classifiers missed 5 of 10 tumour-reference cases.'},
  {id:'tumour_category',name:'Tumour category',status:'unavailable',supportedTargets:[],reason:'No evaluated classifier for glioma, meningioma or pituitary tumour categories is enabled. Region labels cannot name a tumour.'},
  {id:'localization',name:'Candidate region localization',status:localizers.length?'available_research':'unavailable',modelIds:localizers,supportedTargets:['glioma-associated candidate regions'],requiredSequences:['t1c','t1','t2','flair'],inputContract:'Four prepared 3D NIfTI-1 volumes, shared RAS grid, millimetre units, 1 mm spacing; no automatic registration or skull stripping.',reason:localizers.length?'Local segmentation, overlays and volume measurement. Missed and extra regions remain possible.':'The compatible segmentation checkpoint or runtime is unavailable.'},
  {id:'other_abnormalities',name:'Other abnormalities',status:'unavailable',supportedTargets:[],reason:'Stroke, haemorrhage and other specialist models are not installed and evaluated in this workflow.'},
  {id:'overall_assessment',name:'Overall scan assessment',status:'inconclusive_only',supportedTargets:[],reason:'Successful segmentation does not establish tumour presence or brain health. Normal-appearing and no supported abnormality detected are not enabled.'}
 ],normalAppearingEnabled:false,externalImagingService:false};
}
