import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {handleModelRequest,modelStatus} from './model-service.mjs';
import {nvidiaStatus} from './nvidia.mjs';
import {handleResearchRequest} from './research-studies.mjs';
import {handleBriscRequest} from './brisc-service.mjs';
const files={'/evidence-review/':'../evidence-strengthening/report.html','/evidence-review/report.css':'../evidence-strengthening/report.css','/evidence-review/audit.json':'../evidence-strengthening/audit.json','/evidence-review/per-study.csv':'../evidence-strengthening/per-study.csv','/':'index.html','/about':'about.html','/app.js':'app.js','/style.css':'style.css','/volume.mjs':'volume.mjs','/notes.mjs':'notes.mjs','/finding-review.mjs':'finding-review.mjs','/candidate-location.mjs':'candidate-location.mjs','/review-integrity.mjs':'review-integrity.mjs','/viewer-guidance.mjs':'viewer-guidance.mjs'};
const port=Number(process.env.PORT)||3000;
files['/about-navigation.js']='about-navigation.js';files['/slice-view.mjs']='slice-view.mjs';files['/meningioma-component-comparison.csv']='meningioma-component-comparison.csv';
files['/capabilities.mjs']='capabilities.mjs';files['/review-export.mjs']='review-export.mjs';
files['/slice-research']='brisc.html';files['/brisc-ui.mjs']='brisc-ui.mjs';
files['/brisc.css']='brisc.css';
files['/brisc-contract.mjs']='brisc-contract.mjs';files['/inference-contract.mjs']='inference-contract.mjs';
export function createBrainLensServer(){
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' blob:; object-src 'none'; frame-ancestors 'none'");
 try {
  const listeningPort=server.address()?.port||port;
  const allowedHosts=new Set([`127.0.0.1:${listeningPort}`,`localhost:${listeningPort}`,...(listeningPort===80?['127.0.0.1','localhost']:[])]);
  if(!allowedHosts.has(req.headers.host)){res.writeHead(403);return res.end('Host rejected');}
  if(req.method!=='GET'&&req.headers.origin!==`http://${req.headers.host}`){res.writeHead(403);return res.end('Origin rejected');}
  if(req.url==='/api/status'&&req.method==='GET'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({...await modelStatus(),nvidia:nvidiaStatus()}));}
  if(req.url.startsWith('/api/slice-research'))return await handleBriscRequest(req,res);
  if(req.url.startsWith('/api/jobs'))return await handleModelRequest(req,res);
  if(req.url.startsWith('/api/research-studies')||req.url==='/research-evaluation'||req.url.startsWith('/upgrade-evaluation'))return await handleResearchRequest(req,res);
  if(req.method!=='GET'||!files[req.url]){res.writeHead(404);return res.end('Not found');}
  res.setHeader('Content-Type',req.url.endsWith('.json')?'application/json':req.url.endsWith('.csv')?'text/csv':req.url.endsWith('.css')?'text/css':req.url.endsWith('.js')||req.url.endsWith('.mjs')?'text/javascript':'text/html');
  res.end(await readFile(new URL(files[req.url],import.meta.url)));
 }catch(e){if(!res.headersSent)res.writeHead(e.status||500);res.end(e.status?e.message:'Request failed. Please check the input or try again.');}
});
server.requestTimeout=300000;
return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))createBrainLensServer().listen(port,'127.0.0.1',()=>console.log(`MRI review: http://127.0.0.1:${port}`));
