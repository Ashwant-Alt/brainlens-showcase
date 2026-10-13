import {explainAssessment} from './review-integrity.mjs';

export function createReviewExport({result=null,integrity=null,jobId=null,savedAssessment=null,observations='',summaryProvenance=null,notesReviewedAt=null}={}){
 if(typeof observations!=='string'||observations.length>20000)throw Error('Review notes must be text under 20,000 characters.');
 const currentAssessment=explainAssessment(result,integrity);
 // Explicit fields keep arbitrary diagnosis, healthy, paths or secret fields out.
 const modelPrediction=result?Object.fromEntries(['model','modelId','version','revision','dimensions','inputOrder','window','overlap','threshold','scope','limitations','weightsSha256','inputSha256','runnerSha256','validationSha256','runtimeProvenance','spatialValidation','preprocessing','durationSeconds'].filter(k=>Object.hasOwn(result,k)).map(k=>[k,result[k]])):null;
 return {schemaVersion:3,createdAt:new Date().toISOString(),jobId,
  modelPrediction,calculatedMeasurements:result?{candidateRegionVolumesMl:{...result.candidateRegionVolumesMl},regionVoxelCounts:{...integrity.regionVoxelCounts},voxelVolumeMm3:integrity.voxelVolumeMm3}:null,
  currentAssessment,savedAssessment,
  humanReview:{observations,notesReviewedAt,source:'Human-entered or explicitly appended editable notes; not model evidence'},
  summaryProvenance,limitations:'Research output only. Model markings, calculated measurements and human notes are distinct. No tumour type, healthy-brain assessment or independent diagnostic validation is established.'};
}
