import {requestHeaders} from './profiles.js';

function fsk(raw,signal){
 if(signal.aborted)return Promise.reject(new DOMException("Cancelled","AbortError"));
 return new Promise((resolve,reject)=>{
  const worker=new Worker('worker.js',{type:'module'});
  const close=()=>{worker.terminate();signal.removeEventListener('abort',abort);};
  const abort=()=>{close();reject(new DOMException('Cancelled','AbortError'));};
  signal.addEventListener('abort',abort,{once:true});
  worker.onmessage=({data})=>{close();resolve(data);};
  worker.onerror=()=>{close();reject(Error('The audio receiver could not start.'));};
  worker.postMessage(raw,[raw]);
 });
}
async function qam(raw,rate,signal){
 const response=await fetch('/api/modem/decode?rate='+(rate==='auto'?0:rate),
  {method:'POST',headers:requestHeaders,body:raw,signal});
 if(!response.ok)throw Error((await response.text()).trim());
 return response.json();
}
export async function receive(input,choice,signal){
 const response=await fetch('/api/audio',{method:'POST',headers:requestHeaders,body:input,signal});
 if(!response.ok)throw Error((await response.text()).trim());
 const raw=await response.arrayBuffer();
 const candidates=[];
 if(choice==='300'){
  const data=await fsk(raw,signal);return {...data,rate:300,sampleRate:48000};
 }
 const [slow,fast]=await Promise.all([
  choice==='auto'?fsk(raw.slice(0),signal):Promise.resolve(null),
  qam(raw,choice,signal).catch(error=>{if(choice!=="auto"||signal.aborted)throw error;return {error:error.message};})
 ]);
 if(signal.aborted)throw new DOMException('Cancelled','AbortError');
 if(slow&&!slow.error&&slow.bytes.length)candidates.push({...slow,rate:300});
 if(!fast.error&&fast.bytes.length)candidates.push({...fast,bytes:Uint8Array.from(fast.bytes)});
 // Framing consistency discriminates actual FSK from QAM false acquisitions.
 for(const candidate of candidates)candidate.quality=candidate.bytes.length/(candidate.bytes.length+candidate.errors);
 candidates.sort((a,b)=>b.quality-a.quality);
 const best=candidates[0];
 const pcm=slow?.pcm||new Float32Array(raw);
 if(!best||best.quality<.85)return {pcm,sampleRate:48000,bytes:new Uint8Array(),times:[],error:'No reliable supported modem signal found. Try choosing its profile.'};
 return {...best,pcm,sampleRate:48000};
}
