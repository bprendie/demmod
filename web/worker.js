import {decode} from './modem.js';
onmessage=({data})=>{
 try{
  const view=new DataView(data);
  const pcm=new Float32Array(data.byteLength/4);
  for(let i=0;i<pcm.length;i++)pcm[i]=view.getFloat32(i*4,true);
  try{
   const result=decode(pcm);
   postMessage({pcm,...result},[pcm.buffer,result.bytes.buffer]);
  }catch(e){postMessage({pcm,bytes:new Uint8Array(),times:[],error:e.message},[pcm.buffer]);}
 }catch(e){postMessage({error:e.message});}
};
