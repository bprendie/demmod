import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {encode,wav,decode,MAX_DURATION} from '../web/modem.js';

const base=process.env.DEMMOD_URL||'http://localhost:5000';
const dir=mkdtempSync(join(tmpdir(),'demmod-formats-'));
const formats=[
 ['wav',[]],['mp3',['-c:a','libmp3lame','-b:a','192k']],
 ['flac',['-c:a','flac']],['ogg',['-c:a','libvorbis','-q:a','5']],
 ['aac',['-c:a','aac','-b:a','192k']],['m4a',['-c:a','aac','-b:a','192k']],
 ['opus.ogg',['-c:a','libopus','-b:a','128k']]
];
try {
 for(const channel of ['answer','originate']){
  const expected=Uint8Array.from({length:256},(_,i)=>i);
  writeFileSync(join(dir,'source.wav'),new Uint8Array(wav(encode(expected,channel))));
  for(const [format,args] of formats){
   const file=join(dir,'sample.'+format);
   const conversion=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',join(dir,'source.wav'),...args,file],{encoding:'utf8'});
   assert.equal(conversion.status,0,conversion.stderr);
   const response=await fetch(base+'/api/audio',{method:'POST',headers:{Origin:base,'X-Demmod-Request':'audio-import'},body:readFileSync(file)});
   if(!response.ok)throw Error(await response.text());
   const buffer=await response.arrayBuffer(),view=new DataView(buffer);
   const pcm=Float32Array.from({length:buffer.byteLength/4},(_,i)=>view.getFloat32(i*4,true));
   const result=decode(pcm);
   assert.deepEqual(result.bytes,expected,channel+' / '+format);
   assert.equal(result.channel,channel);
   console.log('PASS '+channel+' / '+format+' / all 256 bytes');
  }
 }
 const headers={Origin:base,'X-Demmod-Request':'audio-import'};
 const bad=await fetch(base+'/api/audio',{method:'POST',headers,body:'not an audio file'});
 assert.equal(bad.status,422);
 const empty=await fetch(base+'/api/audio',{method:'POST',headers,body:''});
 assert.equal(empty.status,400);
 const foreign=await fetch(base+'/api/audio',{method:'POST',headers:{...headers,Origin:'http://example.com'},body:'audio'});
 assert.equal(foreign.status,403);
 const longFile=join(dir,'long.flac');
 const long=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','anullsrc=r=48000:cl=mono','-t',String(MAX_DURATION+1),'-c:a','flac',longFile],{encoding:'utf8'});
 assert.equal(long.status,0,long.stderr);
 const overLimit=await fetch(base+'/api/audio',{method:'POST',headers,body:readFileSync(longFile)});
 assert.equal(overLimit.status,413);
 console.log('PASS corrupt/empty audio, foreign origin, and duration limit');
} finally { rmSync(dir,{recursive:true,force:true}); }
