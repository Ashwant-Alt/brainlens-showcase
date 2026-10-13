import {readFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createGunzip} from 'node:zlib';
import {parseNifti} from './volume.mjs';
import {readSpatialInfo,preparationIssue} from './viewer-guidance.mjs';
export function validateInputBuffer(bytes){
 const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
 const volume={...parseNifti(buffer),geometry:readSpatialInfo(buffer)};
 const issue=preparationIssue(volume);if(issue)throw Object.assign(Error(issue),{status:400});
 return volume;
}
export async function readVolumeFile(filename,compressed=filename.endsWith('.gz')){
 if(!compressed)return readFile(filename);
 const chunks=[];let size=0;const input=createReadStream(filename),gunzip=input.pipe(createGunzip());
 input.on('error',error=>gunzip.destroy(error));
 try{for await(const chunk of gunzip){size+=chunk.length;if(size>180*1024*1024)throw Object.assign(Error('Expanded volume exceeds 180 MB.'),{status:413});chunks.push(chunk);}return Buffer.concat(chunks,size);}
 finally{input.destroy();gunzip.destroy();}
}
