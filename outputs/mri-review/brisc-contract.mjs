import {requireModuleScope,inferenceModules} from './inference-contract.mjs';
export const BRISC_CLASSES=Object.freeze(['glioma','meningioma','pituitary','no_tumor']);
export const BRISC_LABELS=Object.freeze({glioma:'Glioma',meningioma:'Meningioma',pituitary:'Pituitary tumour',no_tumor:'No tumour category (slice only)'});
export const PREPROCESSING=Object.freeze({id:'rgb224-bilinear-imagenet-v1',width:224,height:224,color:'RGB',resize:'bilinear_warp',scale:255,mean:[0.485,0.456,0.406],std:[0.229,0.224,0.225]});
export const SLICE_LIMITATION='Slice-level research prediction only. It cannot diagnose an MRI examination, rule out a tumour, establish brain health, locate a tumour in 3D or measure its volume. Scores are not calibrated clinical probabilities.';
const sha=/^[0-9a-f]{64}$/;
export function validateBundle(bundle){
  requireModuleScope(bundle,'brisc');
  if(bundle.schemaVersion!==1||bundle.modelId!=='brisc-slice-v1'||bundle.dataset!=='BRISC2025'||bundle.format!=='torchscript')throw Error('Unsupported BRISC model bundle.');
  if(JSON.stringify(bundle.classes)!==JSON.stringify(BRISC_CLASSES))throw Error('Checkpoint class order must match the four declared BRISC classes.');
  for(const [key,value] of Object.entries(PREPROCESSING))if(JSON.stringify(bundle.preprocessing?.[key])!==JSON.stringify(value))throw Error('Checkpoint preprocessing does not match the supported slice adapter.');
  if(bundle.weightsFile!=='classifier.ts'||bundle.evaluationFile!=='evaluation.json'||!sha.test(bundle.weightsSHA256)||!sha.test(bundle.evaluationSHA256))throw Error('Missing checkpoint/evaluation integrity bindings.');
  for(const key of ['checkpointSource','licence','trainingPreprocessingSource'])if(typeof bundle[key]!=='string'||!bundle[key].trim()||bundle[key].length>1000)throw Error('Checkpoint source, licence and training preprocessing evidence are required.');
  return bundle;
}
export function validateEvaluation(value,bundle){
  if(value.schemaVersion!==1||value.dataset!=='BRISC2025'||value.inputUnit!=='slice'||value.modelSHA256!==bundle.weightsSHA256||!Number.isSafeInteger(value.sampleCount)||value.sampleCount<1||value.heldOut!==true||!['not_established','documented'].includes(value.patientIndependence)||typeof value.methodology!=='string'||!value.methodology.trim()||!value.metrics||typeof value.metrics!=='object'||Array.isArray(value.metrics)||!Object.keys(value.metrics).length)throw Error('A checkpoint-bound, documented held-out slice evaluation is required.');
  return value;
}
export function validateSliceResult(result){
  requireModuleScope(result,'brisc');
  const allowed=new Set(['schemaVersion','modelId','task','inputUnit','spatialDimensions','outputUnit','researchOnly','status','evidenceScope','topClass','scores','scoreMeaning','decisionRule','overallExaminationAssessment','normalAppearingEnabled','localization','volumeMeasurements','limitation','input','provenance']);
  if(Object.keys(result).some(key=>!allowed.has(key))||result.researchOnly!==true)throw Error('Unsupported fields in slice research result.');
  if(result.schemaVersion!==1||result.modelId!=='brisc-slice-v1'||result.status!=='predicted'||result.evidenceScope!=='slice_research'||result.overallExaminationAssessment!=='inconclusive'||result.normalAppearingEnabled!==false||result.localization!==null||result.volumeMeasurements!==null||result.limitation!==SLICE_LIMITATION)throw Error('Slice result attempts an unsupported examination claim.');
  const scores=result.scores;
  if(!scores||JSON.stringify(Object.keys(scores).sort())!==JSON.stringify([...BRISC_CLASSES].sort())||Object.values(scores).some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>1)||Math.abs(Object.values(scores).reduce((a,b)=>a+b,0)-1)>1e-5)throw Error('Invalid model scores.');
  const top=BRISC_CLASSES.reduce((best,key)=>scores[key]>scores[best]?key:best,BRISC_CLASSES[0]);
  if(result.topClass!==top||result.scoreMeaning!=='uncalibrated_softmax'||result.decisionRule!=='argmax_no_detection_threshold')throw Error('Invalid slice decision rule.');
  for(const key of ['inputSHA256','weightsSHA256','bundleSHA256','evaluationSHA256','runnerSHA256'])if(!sha.test(result.provenance?.[key]))throw Error('Missing slice provenance.');
  if(result.provenance.preprocessingId!==PREPROCESSING.id||!['PNG','JPEG'].includes(result.input?.format)||result.input?.sequenceEvidence!=='user_declared_contrast_T1_not_independently_verified'||!Number.isInteger(result.input.width)||!Number.isInteger(result.input.height)||result.input.width<32||result.input.height<32||result.input.width>4096||result.input.height>4096)throw Error('Missing slice input contract.');
  return result;
}
export function createSliceResult(worker,provenance){
  // Explicit projection: worker-supplied diagnosis, healthy, or segmentation
  // fields can never be promoted into an examination result or exported.
  return validateSliceResult({schemaVersion:1,modelId:'brisc-slice-v1',...inferenceModules.brisc,status:'predicted',evidenceScope:'slice_research',topClass:worker.topClass,scores:worker.scores,scoreMeaning:'uncalibrated_softmax',decisionRule:'argmax_no_detection_threshold',overallExaminationAssessment:'inconclusive',normalAppearingEnabled:false,localization:null,volumeMeasurements:null,limitation:SLICE_LIMITATION,input:{width:worker.width,height:worker.height,format:worker.format,sequenceEvidence:'user_declared_contrast_T1_not_independently_verified'},provenance});
}
export function describeSliceResult(result){
  // Presentation only: preserve the checkpoint-bound saved result and its scope.
  validateSliceResult(result);
  const negative=result.topClass==='no_tumor';
  return Object.freeze({
    heading:negative?'No tumour category suggested in this slice':`Suggested tumour category: ${BRISC_LABELS[result.topClass]}`,
    explanation:negative
      ?'The model chose the BRISC no_tumor category for this image. A tumour can be missed or lie outside this slice. This is not evidence of a healthy brain.'
      :'This is the model\'s category suggestion for one image. It does not confirm that a tumour is present or establish its type. A qualified clinician must review the complete examination.',
    brainHealth:'Inconclusive',
    brainHealthExplanation:'One slice and four dataset categories cannot establish whole-brain health or exclude other abnormalities.',
    outline:'Unavailable for this 2D result',
    outlineExplanation:'This classifier predicts a category, not tumour boundaries. No outline has been generated. A separate, evaluated segmentation model is needed for a 2D outline.'
  });
}
