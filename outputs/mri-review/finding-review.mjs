const keys=['whole_region','core_region','enhancing_region'];
export function validateFindingResult(result){
 if(!result||!['segresnet','swinunetr'].includes(result.modelId))throw Error('Unsupported imaging model result.');
 const volumes=result.candidateRegionVolumesMl;
 if(!volumes||typeof volumes!=='object'||Array.isArray(volumes)||Object.keys(volumes).length!==keys.length||!keys.every(key=>Object.hasOwn(volumes,key)))throw Error('Incomplete candidate region measurements.');
 if(!keys.every(key=>typeof volumes[key]==='number'&&Number.isFinite(volumes[key])&&volumes[key]>=0))throw Error('Invalid candidate region measurements.');
 // Runner rounds independent nested measurements to three decimal places.
 const tolerance=0.001+Number.EPSILON;
 if(volumes.core_region-volumes.whole_region>tolerance||volumes.enhancing_region-volumes.core_region>tolerance)throw Error('Candidate region measurements contradict their containment.');
 return result;
}
export function findingReview(result=null){
 const scope={tumourType:'Not assessed by this model',otherBrainConditions:'Not assessed',assessmentScope:'Research glioma-region segmentation; not a diagnosis or a general brain health assessment.'};
 if(!result)return{...scope,state:'not_run',markings:'Run an imaging model to see candidate region markings.',summary:'Tumour type: Not assessed by this model. Other brain conditions: Not assessed.'};
 validateFindingResult(result);
 const count=keys.filter(key=>result.candidateRegionVolumesMl[key]>0).length;
 const markings=count?`Candidate markings are present in ${count} of 3 nested region categories. These are not separate tumours or confirmed findings.`:'No candidate region volume was recorded at the displayed precision. This does not establish a healthy brain or rule out a tumour or other condition.';
 return{...scope,state:'research_output',regionCategoriesWithRecordedVolume:count,markings,summary:`${markings}\nTumour type: ${scope.tumourType}.\nOther brain conditions: ${scope.otherBrainConditions}.\n${scope.assessmentScope}`};
}
