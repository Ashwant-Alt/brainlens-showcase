import {access,readFile} from 'node:fs/promises';
const cases=['BRATS_306','BRATS_206','BRATS_449'];
const data=new URL('../../work/public-mri/batch-01/',import.meta.url);
const reports=new URL('../mri-batch-01/',import.meta.url);
const upgradeReports=new URL('../upgrade-benchmark-01/',import.meta.url);
const upgradeCases=['BRATS_434','BRATS_365','BRATS_265','BRATS_214','BRATS_314'];
const upgradeData=new URL('../../work/public-mri/upgrade-batch-01/',import.meta.url);
const upgradeFiles=new Map([['','report.html'],['report.css','report.css'],['figures/overview.png','figures/overview.png']]);
for(const id of upgradeCases){
 for(const kind of ['overlays','errors'])upgradeFiles.set(`figures/${id}-${kind}.png`,`figures/${id}-${kind}.png`);
 for(const model of ['segresnet','original_swin','head_adapter','decoder_adapter'])for(const region of ['whole','core','enhancing']){
  const name=`figures/${id}-${model}-${region}-errors.nii.gz`;upgradeFiles.set(name,name);
 }
}
const send=(res,value,type='application/json')=>{res.setHeader('Content-Type',type);res.end(type==='application/json'?JSON.stringify(value):value);};
export async function handleResearchRequest(req,res){
 if(req.method!=='GET'){res.writeHead(405);res.end('Read-only public research data');return;}
 if(req.url==='/api/research-studies'){
  let upgradeEvaluationReady=false;try{await access(new URL('evidence.json',upgradeReports));await access(new URL('report.html',upgradeReports));upgradeEvaluationReady=true;}catch{}
  const available=[];for(const id of [...cases,...(upgradeEvaluationReady?upgradeCases:[])]){try{const base=cases.includes(id)?data:upgradeData;await Promise.all(['t1c','t1','t2','flair'].map(name=>access(new URL(`${id}/${name}.nii.gz`,base))));available.push({id,label:`Public study ${id}`});}catch{}}
  let evaluationReady=false;try{await access(new URL('report.html',reports));evaluationReady=true;}catch{}
  return send(res,{studies:available,evaluationReady,upgradeEvaluationReady,source:'Medical Segmentation Decathlon Task01 / BraTS',license:'CC BY-SA 4.0',notice:'Public glioma research cases. Training independence is unverified.'});
 }
 if(req.url==='/upgrade-evaluation'){res.writeHead(302,{Location:'/upgrade-evaluation/'});return res.end();}
 if(req.url.startsWith('/upgrade-evaluation/')){
  const name=req.url.slice('/upgrade-evaluation/'.length),file=upgradeFiles.get(name);
  if(!file){res.writeHead(404);return res.end('Unknown research report file');}
  try{await access(new URL('evidence.json',upgradeReports));return send(res,await readFile(new URL(file,upgradeReports)),file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.png')?'image/png':'application/gzip');}
  catch{res.writeHead(404);return res.end('The upgrade comparison report is not ready yet.');}
 }
 if(req.url==='/research-evaluation'){try{return send(res,await readFile(new URL('report.html',reports)),'text/html; charset=utf-8');}catch{res.writeHead(404);return res.end('The comparison report is not ready yet.');}}
 const match=req.url.match(/^\/api\/research-studies\/(BRATS_\d{3})\/(t1c|t1|t2|flair|comparison)$/);
 if(!match||!cases.includes(match[1])&&!upgradeCases.includes(match[1])){res.writeHead(404);return res.end('Unknown public study or file');}
 try{
  const isUpgrade=upgradeCases.includes(match[1]);if(isUpgrade)await access(new URL('evidence.json',upgradeReports));
  const path=match[2]==='comparison'?(isUpgrade?new URL(`figures/${match[1]}-overlays.png`,upgradeReports):new URL(`${match[1]}/comparison.png`,reports)):new URL(`${match[1]}/${match[2]}.nii.gz`,isUpgrade?upgradeData:data);
  return send(res,await readFile(path),match[2]==='comparison'?'image/png':'application/gzip');
 }catch{res.writeHead(404);res.end('The public research file is unavailable.');}
}
