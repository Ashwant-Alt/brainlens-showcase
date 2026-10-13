// Processing progress comes from the local runner, not a disease-confidence score.
export function inferenceProgress(text){
 if(typeof text!=='string'||text.length>2000)return null;
 let value;try{value=JSON.parse(text);}catch{return null;}
 const completed=value?.completedWindows,total=value?.totalWindows;
 if(!Number.isSafeInteger(completed)||!Number.isSafeInteger(total)||total<1||total>4096||completed<0||completed>total)return null;
 return{completedImageBlocks:completed,totalImageBlocks:total};
}
