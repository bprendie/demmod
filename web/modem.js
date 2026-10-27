export const RATE=48000, BPS=300, SPS=RATE/BPS, MAX_DURATION=300;
export const MAX_MESSAGE_BYTES=Math.floor((MAX_DURATION*RATE-RATE-RATE/5)/(10*SPS));
export const tones={answer:[2225,2025],originate:[1270,1070]};
export function encode(bytes,channel='answer'){
 if(!bytes.length||bytes.length>MAX_MESSAGE_BYTES)throw Error('Use between 1 and '+MAX_MESSAGE_BYTES.toLocaleString('en-US')+' bytes (five minutes at 300 bps).');
 const [mark,space]=tones[channel];const lead=RATE,tail=RATE/5;const pcm=new Float32Array(lead+bytes.length*10*SPS+tail);
 let phase=0,index=RATE/5;
 const tone=(bit,count)=>{const step=2*Math.PI*(bit?mark:space)/RATE;for(let n=0;n<count;n++){pcm[index++]=.65*Math.sin(phase);phase=(phase+step)%(2*Math.PI);}};
 tone(1,RATE*.8);
 for(const byte of bytes){tone(0,SPS);for(let b=0;b<8;b++)tone((byte>>b)&1,SPS);tone(1,SPS);}
 return pcm;
}
export function wav(pcm,sampleRate=RATE){const buffer=new ArrayBuffer(44+pcm.length*2),v=new DataView(buffer);const ascii=(off,s)=>Array.from(s).forEach((c,i)=>v.setUint8(off+i,c.charCodeAt(0)));
 ascii(0,'RIFF');v.setUint32(4,buffer.byteLength-8,true);ascii(8,'WAVE');ascii(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);ascii(36,'data');v.setUint32(40,pcm.length*2,true);pcm.forEach((s,i)=>v.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,s))*32767),true));return buffer;}
export function readWav(buffer){const v=new DataView(buffer);const str=(p,n)=>String.fromCharCode(...new Uint8Array(buffer,p,n));if(v.byteLength<44||str(0,4)!=='RIFF'||str(8,4)!=='WAVE')throw Error('Choose a PCM WAV recording. Compressed audio support comes later.');let format,channels,rate,bits,data,size;
 for(let p=12;p+8<=v.byteLength;){const n=v.getUint32(p+4,true);if(p+8+n>v.byteLength)throw Error('This WAV file is truncated.');const id=str(p,4);if(id==='fmt '&&n>=16){format=v.getUint16(p+8,true);channels=v.getUint16(p+10,true);rate=v.getUint32(p+12,true);bits=v.getUint16(p+22,true);}if(id==='data'){data=p+8;size=n;}p+=8+n+(n%2);}
 if(format!==1||bits!==16||![1,2].includes(channels)||!data||rate<8000||rate>192000)throw Error('Use 16-bit PCM WAV, mono or stereo, at 8–192 kHz.');const frames=Math.floor(size/(2*channels));if(frames/rate>MAX_DURATION)throw Error('Keep prototype recordings under five minutes.');const pcm=new Float32Array(Math.floor(frames*RATE/rate));for(let i=0;i<pcm.length;i++){const pos=i*rate/RATE,lo=Math.floor(pos),hi=Math.min(frames-1,lo+1),f=pos-lo;let sample=0;for(let c=0;c<channels;c++)sample+=(v.getInt16(data+(lo*channels+c)*2,true)*(1-f)+v.getInt16(data+(hi*channels+c)*2,true)*f)/32768;pcm[i]=sample/channels;}return pcm;
}
export function decode(pcm){
 const results=Object.entries(tones).map(([channel,[mark,space]])=>{
  const window=120,kernels=[mark,space].map(freq=>Array.from({length:window},(_,n)=>[Math.cos(2*Math.PI*freq*n/RATE),Math.sin(2*Math.PI*freq*n/RATE)]));
  function bit(center){const start=Math.round(center-window/2);if(start<0||start+window>=pcm.length)return -1;let energy=0;for(let j=0;j<window;j++)energy+=pcm[start+j]**2;if(energy/window<.0001)return -1;const power=kernels.map(k=>{let re=0,im=0;for(let j=0;j<window;j++){re+=pcm[start+j]*k[j][0];im+=pcm[start+j]*k[j][1];}return re*re+im*im;});if(Math.max(...power)<energy*window*.12)return -1;return power[0]>=power[1]?1:0;}
  const bytes=[],times=[];let prev=-1,errors=0;
  for(let pos=SPS;pos<pcm.length-10*SPS;pos+=SPS/16){const current=bit(pos);if(current===0&&prev===1){let value=0,valid=bit(pos+.5*SPS)===0;for(let b=0;b<8;b++){const v=bit(pos+(1.5+b)*SPS);if(v<0)valid=false;value|=Math.max(0,v)<<b;}if(bit(pos+9.5*SPS)!==1)valid=false;if(valid){bytes.push(value);times.push((pos+10*SPS)/RATE);pos+=9.5*SPS;prev=1;continue;}errors++;}prev=current;}
  return {bytes:new Uint8Array(bytes),times,channel,errors};
 });
 results.sort((a,b)=>b.bytes.length-a.bytes.length);if(!results[0].bytes.length)throw Error('No 300 bps Bell 103 data found. Check the recording and modem profile.');return results[0];
}
