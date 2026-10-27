import {requestHeaders,samplesFromPCM} from './profiles.js';

// The native modem generates PCM on a paced clock. Web Audio schedules those
// samples with a short jitter buffer; the downloadable WAV uses identical PCM.
export class LiveTransmission {
 constructor(bytes,rate,role,callbacks,muted=false){
  this.bytes=bytes;this.rate=rate;this.role=role;this.callbacks=callbacks;
  this.abort=new AbortController();this.stopped=false;this.muted=muted;this.nodes=new Set();
 }
 async start(){
  this.context=new AudioContext({sampleRate:48000});
  this.gain=this.context.createGain();this.gain.gain.value=this.muted?0:.2;
  this.gain.connect(this.context.destination);
  await this.context.resume();
  const response=await fetch('/api/modem/encode?rate='+this.rate+'&role='+this.role+'&live=1',
   {method:'POST',headers:requestHeaders,body:this.bytes,signal:this.abort.signal});
  if(!response.ok)throw Error((await response.text()).trim());
  this.sampleRate=Number(response.headers.get('X-Audio-Rate'));
  const total=Number(response.headers.get('X-Audio-Frames'));
  if(!total||this.sampleRate!==8000)throw Error('Invalid audio stream.');
  this.pcm=new Float32Array(total);this.received=0;this.played=0;this.complete=false;
  this.nextTime=null;
  const reader=response.body.getReader();let pending=new Uint8Array();
  while(!this.stopped){
   const {done,value}=await reader.read();
   if(done)break;
   const combined=new Uint8Array(pending.length+value.length);
   combined.set(pending);combined.set(value,pending.length);
   const size=combined.length-(combined.length%2);
   pending=combined.slice(size);
   if(!size)continue;
   const samples=samplesFromPCM(combined.slice(0,size).buffer);
   if(this.received+samples.length>total)throw Error('Audio stream exceeded its declared length.');
   this.pcm.set(samples,this.received);this.received+=samples.length;
   this.schedule(samples,this.received);
  }
  if(this.stopped)return;
  if(pending.length||this.received!==total)throw Error('Transmission ended early. No partial WAV was saved.');
  this.complete=true;
  this.finishIfPlayed();
 }
 schedule(samples,end){
  const ctx=this.context;
  if(this.nextTime===null)this.nextTime=ctx.currentTime+.4;
  if(this.nextTime<ctx.currentTime+.005)throw Error('Audio feed stalled. Try exporting a WAV for uninterrupted playback.');
  const buffer=ctx.createBuffer(1,samples.length,this.sampleRate);
  buffer.copyToChannel(samples,0);
  const source=ctx.createBufferSource();source.buffer=buffer;source.connect(this.gain);
  this.nodes.add(source);
  source.onended=()=>{
   this.nodes.delete(source);source.disconnect();
   if(this.stopped)return;
   this.played=Math.max(this.played,end);
   this.callbacks.progress(this.played/this.sampleRate,this.pcm.length/this.sampleRate);
   this.finishIfPlayed();
  };
  source.start(this.nextTime);this.nextTime+=samples.length/this.sampleRate;
 }
 finishIfPlayed(){
  if(this.complete&&!this.stopped&&this.played===this.pcm.length){
   const pcm=this.pcm,rate=this.sampleRate;
   this.stop();this.callbacks.done(pcm,rate);
  }
 }
 mute(muted){this.muted=muted;if(this.gain)this.gain.gain.value=muted?0:.2;}
 stop(){
  if(this.stopped)return;this.stopped=true;this.abort.abort();
  for(const node of this.nodes){node.onended=null;try{node.stop();}catch{}node.disconnect();}
  this.nodes.clear();if(this.context)this.context.close().catch(()=>{});
 }
}
