export const profiles={
 300:{name:'Bell 103',modulation:'FSK',lead:1,tail:.2},
 1200:{name:'V.22',modulation:'DQPSK',lead:4,tail:.5},
 2400:{name:'V.22bis',modulation:'16-QAM',lead:4,tail:.5}
};
export function maxBytes(rate){const p=profiles[rate];return Math.floor((300-p.lead-p.tail)*rate/10);}
export function duration(rate,length){const p=profiles[rate];return p.lead+length*10/rate+p.tail;}
export function byteTimes(rate,length){return Array.from({length},(_,i)=>profiles[rate].lead+(i+1)*10/rate);}
export const requestHeaders={'Content-Type':'application/octet-stream','X-Demmod-Request':'audio-import'};
export function samplesFromPCM(raw){const view=new DataView(raw),pcm=new Float32Array(raw.byteLength/2);for(let i=0;i<pcm.length;i++)pcm[i]=view.getInt16(i*2,true)/32768;return pcm;}
export async function encodeFile(bytes,rate,role,signal){
 const response=await fetch('/api/modem/encode?rate='+rate+'&role='+role,{method:'POST',headers:requestHeaders,body:bytes,signal});
 if(!response.ok)throw Error((await response.text()).trim());
 const raw=await response.arrayBuffer();
 if(raw.byteLength!==Number(response.headers.get('X-Audio-Frames'))*2)throw Error('Transmission ended early. Try again.');
 return {pcm:samplesFromPCM(raw),sampleRate:Number(response.headers.get('X-Audio-Rate')),bytes,times:byteTimes(rate,bytes.length),rate,channel:role};
}
