import {wav} from './modem.js';
import {toBytes,fromBytes,renderTerminal} from './terminal.js';
import {profiles,maxBytes,duration,byteTimes,encodeFile} from './profiles.js';
import {receive} from './receive.js';
import {LiveTransmission} from './live.js';
const $=id=>document.getElementById(id);
const demo=String.raw`\e[2J\e[H\e[1;33m
  ┌────────────────────────────────────────────┐
  │                                            │
  │   D E M M O D   /   THE SIGNAL DESK        │
  │                                            │
  └────────────────────────────────────────────┘
\e[0;36m
  A little noise. A lot to say.
\e[0m
  Hello from the other end of the wire.
  These characters can ride a 300 bps carrier
  and find their way back onto this screen.

\e[32m  LOCAL MACHINE. OPEN LINE. GOOD COMPANY.
\e[0m
  No cloud between us.

\e[33m  WEAZL / 300 / 8 / N / 1
\e[0m`;
const audio=$('audio');audio.volume=.2;
let mode='encode',view=null,recording=null,lastFile=null,url=null,frame=0;
let serial=0,controller=null,busy=false,live=null,lastCount=-1,receivedCount=0;
const time=s=>String(Math.floor(s/60)).padStart(2,'0')+':'+String(Math.floor(s%60)).padStart(2,'0');
const rate=()=>Number($('profile').value);
const sourceText=()=>$('source').value.replace(/\\e\[/g,'\x1b[').replace(/\r?\n/g,'\r\n');
function paint(text){$('terminalText').textContent=renderTerminal($('terminal'),text);}
function status(title,detail){$('status').textContent=title;$('statusDetail').textContent=detail;}
function lockSource(locked){
 for(const id of ['source','profile','channel','encoding','realTime','importText','loadDemo'])$(id).disabled=locked;
}
function primary(){
 if(live){$('mainAction').textContent='Stop transmission ■';$('mainAction').disabled=false;return;}
 if(busy){$('mainAction').textContent=mode==='decode'?'Opening recording…':'Generating audio…';$('mainAction').disabled=true;return;}
 if(mode==='decode'){
  $('mainAction').textContent=audio.paused?'Play recording ▶':'Pause recording Ⅱ';
  $('mainAction').disabled=!view;
  $('actionNote').textContent='Press Play. The message arrives with the sound.';
 }else{
  $('mainAction').disabled=!$('source').value.length || !$('sourceError').hidden;
  $('mainAction').textContent=$('realTime').checked?'Transmit & listen ↗':'Encode to audio ↗';
  $('actionNote').textContent=$('realTime').checked?'Hear the modem as it generates audio. Export when finished.':'A real signal. Ready to save as WAV.';
 }
}
function playLabel(){
 const playing=!audio.paused;
 $('play').textContent=live?'■':playing?'Ⅱ':'▶';
 $('play').setAttribute('aria-label',live?'Stop transmission':playing?'Pause modem audio':'Play modem audio');
 primary();
}
function cancelWork(){
 serial++;controller?.abort();controller=null;
 live?.stop();live=null;busy=false;lockSource(false);
}
function clearPlayback(){
 audio.pause();audio.removeAttribute('src');audio.load();
 if(url)URL.revokeObjectURL(url);url=null;view=null;receivedCount=0;lastCount=-1;
 cancelAnimationFrame(frame);
 for(const id of ['play','seek','download'])$(id).disabled=true;
 $('duration').textContent=$('elapsed').textContent='00:00';$('seek').value=0;
 waveform(null);$('waveDuration').textContent='—';playLabel();
}
function waveform(samples){
 const c=$('waveform'),ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);
 ctx.strokeStyle='#30382e';ctx.beginPath();ctx.moveTo(0,45);ctx.lineTo(1000,45);ctx.stroke();
 if(!samples)return;
 ctx.strokeStyle='#acbb79';ctx.beginPath();
 for(let x=0;x<1000;x+=3){
  let max=0,start=Math.floor(x/1000*samples.length),end=Math.floor((x+3)/1000*samples.length);
  for(let i=start;i<end;i++)max=Math.max(max,Math.abs(samples[i]));
  ctx.moveTo(x,45-max*48);ctx.lineTo(x,45+max*48);
 }
 ctx.stroke();
}
function profileUI(value=rate()){
 const p=profiles[value];
 $('railRate').textContent=value.toLocaleString();
 $('railProfile').textContent=p?p.name.toUpperCase():'AUTO';
 $('workflowProfile').textContent=value+' BPS · 8N1';
 $('settingsSummary').textContent=value+' / 8 / N / 1';
 $('profileDetails').textContent=value===300?'300 bit/s · FSK · 8N1 · no error control':'600 symbols/s · '+p.modulation+' · 8N1 · no error control';
 $('compatibility').textContent=value===300?'Carrier and data. Acoustic hardware verification is pending.':'Experimental '+p.name+' training with a simulated peer. Fixed audio cannot adapt to hardware replies; physical compatibility is unverified.';
 $('channel').options[0].textContent=value===300?'Answer · 2225 / 2025 Hz':'Answer · 2400 Hz carrier';
 $('channel').options[1].textContent=value===300?'Originate · 1270 / 1070 Hz':'Originate · 1200 Hz carrier';
}
function updatePreview(){
 if(mode!=='encode')return false;
 primary();
 $('sourceError').hidden=true;$('source').removeAttribute('aria-invalid');
 const problem=(title,message)=>{
  $('mainAction').disabled=true;$('sourceError').textContent=message;$('sourceError').hidden=false;
  $('source').setAttribute('aria-invalid','true');status(title,message);return false;
 };
 try{
  const bytes=toBytes(sourceText(),$('encoding').value),limit=maxBytes(rate());
  $('byteCount').textContent=bytes.length.toLocaleString()+' / '+limit.toLocaleString()+' bytes · ~'+time(duration(rate(),bytes.length));
  paint(sourceText());$('terminalState').textContent='SOURCE PREVIEW';
  $('charsetLabel').textContent=$('encoding').value.toUpperCase();
  if(!bytes.length)return problem('Add a message.','Paste text or import a file to create a recording.');
  if(bytes.length>limit)return problem('Message exceeds five minutes.','This message has '+bytes.length.toLocaleString()+' bytes. The limit is '+limit.toLocaleString()+' at '+rate()+' bps.');
  $('mainAction').disabled=false;return true;
 }catch(e){$('byteCount').textContent='Character encoding needs attention';return problem('Character needs a different encoding.',e.message);}
}
function installAudio(data){
 clearPlayback();view=data;view.duration=data.pcm.length/data.sampleRate;
 view.wave=wav(data.pcm,data.sampleRate);
 url=URL.createObjectURL(new Blob([view.wave],{type:'audio/wav'}));audio.src=url;
 for(const id of ['play','seek','download'])$(id).disabled=false;
 $('duration').textContent=$('waveDuration').textContent=time(view.duration);
 $('signalTag').textContent=data.rate?profiles[data.rate].name.toUpperCase()+' / '+(data.channel||'UNKNOWN').toUpperCase():'AUDIO';
 waveform(data.pcm);primary();
}
function renderAt(t,isLive=false){
 if(!view)return;
 $('elapsed').textContent=time(t);$('seek').value=Math.round(t/view.duration*1000);
 let lo=0,hi=view.times.length;
 while(lo<hi){const mid=(lo+hi)>>1;if(view.times[mid]<=t)lo=mid+1;else hi=mid;}
 receivedCount=lo;
 if(lo!==lastCount){lastCount=lo;paint(fromBytes(view.bytes.slice(0,lo),$('encoding').value));}
 $('saveText').disabled=mode==='decode'&&!lo;
 $('terminalState').textContent=isLive?'LIVE TRANSMIT':mode==='decode'?'RECEIVE / '+(view.rate||'?')+' BPS':'TRANSMIT / REPLAY';
 if(t>0&&view.bytes.length)status(isLive?'Transmitting · '+lo+' / '+view.bytes.length+' bytes':(audio.paused?'Paused':'Listening')+' · '+lo+' / '+view.bytes.length+' bytes',
  isLive?'Actual modem audio · stop to cancel · WAV ready when finished':view.error||'Text follows the audio clock · save receives only what has played.');
 if(!isLive&&t>=view.duration-.01){
  $('terminalState').textContent=mode==='encode'?'TRANSMISSION COMPLETE':'RECEPTION COMPLETE';
  status(mode==='encode'?'Transmission complete.':'Playback complete.',view.error||'All received bytes are available to save.');
 }
}
function sync(){if(view&&!live)renderAt(audio.currentTime||0);}
function tick(){sync();if(!audio.paused&&!document.hidden)frame=requestAnimationFrame(tick);}
async function togglePlay(){
 if(live){stopLive();return;}
 if(!url)return;
 try{
  if(audio.paused){if(audio.currentTime>=view.duration-.01)audio.currentTime=0;await audio.play();}
  else audio.pause();
 }catch(e){status('Playback could not start.',e.message);}
}
function stopLive(){
 cancelWork();clearPlayback();updatePreview();status('Transmission stopped.','Partial audio discarded. Ready to start again.');
}
async function makeAudio(){
 if(!updatePreview())return;
 const bytes=toBytes(sourceText(),$('encoding').value),bps=rate(),role=$('channel').value;
 cancelWork();clearPlayback();const token=serial;controller=new AbortController();
 if($('realTime').checked){
  lockSource(true);
  view={bytes,times:byteTimes(bps,bytes.length),rate:bps,channel:role,duration:duration(bps,bytes.length)};
  paint('');$('terminalState').textContent='LIVE TRANSMIT';
  $('duration').textContent=time(view.duration);$('play').disabled=false;
  live=new LiveTransmission(bytes,bps,role,{
   progress:(t,total)=>{if(token!==serial)return;view.duration=total;if(!document.hidden)renderAt(t,true);},
   done:(pcm,sampleRate)=>{
    if(token!==serial)return;
    live=null;lockSource(false);
    installAudio({pcm,sampleRate,bytes,times:byteTimes(bps,bytes.length),rate:bps,channel:role});
    renderAt(view.duration);$('terminalState').textContent='TRANSMISSION COMPLETE';
    status('Transmission complete.','The WAV contains the same audio you just heard.');
    audio.addEventListener('loadedmetadata',()=>{if(token===serial&&view)audio.currentTime=audio.duration;},{once:true});
    primary();
   }
  },audio.muted);
  playLabel();status('Transmitting at '+bps+' bps.','Audio is generated on the modem clock. Stop to cancel.');
  try{await live.start();}catch(e){
   if(token!==serial)return;
   cancelWork();clearPlayback();updatePreview();status('Transmission stopped.',e.message);
  }
  return;
 }
 busy=true;lockSource(true);primary();
 try{
  const data=await encodeFile(bytes,bps,role,controller.signal);
  if(token!==serial)return;
  busy=false;lockSource(false);installAudio(data);paint(sourceText());
  $('terminalState').textContent='ENCODED / PREVIEW';$('signalTitle').textContent='Your message, on the carrier.';
  status('Your signal is ready.',bytes.length+' bytes · '+bps+' bps · PCM WAV');
 }catch(e){if(token===serial){busy=false;lockSource(false);updatePreview();status('Could not encode.',e.message);}}
}
async function pickAudio(file){
 if(!file)return;
 cancelWork();clearPlayback();recording=null;lastFile=file;$('saveText').disabled=true;
 if(file.size>50*1024*1024){status('Recording is too large.','Choose audio under 50 MB and five minutes.');return;}
 const token=serial;controller=new AbortController();busy=true;primary();
 $('fileInfo').textContent=file.name+' · '+(file.size/1024).toFixed(1)+' KB';
 paint('');$('terminalState').textContent='OPENING AUDIO';
 status('Opening your recording…','Preparing playback and finding the carrier locally.');
 try{
  const input=await file.arrayBuffer();
  if(token!==serial)return;
  const data=await receive(input,$('receiveProfile').value,controller.signal);
  if(token!==serial)return;
  busy=false;recording=data;installAudio(data);paint('');
  $('terminalState').textContent='READY / PRESS PLAY';
  $('signalTitle').textContent='The message is in the sound.';
  if(data.rate)profileUI(data.rate);
  status('Recording ready. Press Play.',data.error||'The text will arrive as you listen.');
 }catch(e){if(token===serial){busy=false;primary();status('Could not open this recording.',e.message);$('terminalState').textContent='NO RECORDING';}}
}
function setMode(next){
 if(mode===next)return;
 cancelWork();clearPlayback();mode=next;const enc=mode==='encode';
 $('encodePane').hidden=!enc;$('decodePane').hidden=enc;$('settings').hidden=!enc;$('realtimeOption').hidden=!enc;
 for(const [id,active] of [['encodeNav',enc],['decodeNav',!enc]]){
  $(id).classList.toggle('active',active);
  if(active)$(id).setAttribute('aria-current','page');else $(id).removeAttribute('aria-current');
 }
 $('crumb').textContent=enc?'ENCODE':'DECODE';
 $('heroTitle').replaceChildren(document.createTextNode(enc?'Text becomes ':'Signal becomes '));
 const em=document.createElement('em');em.textContent=enc?'signal.':'text.';$('heroTitle').append(em);
 $('heroCopy').textContent=enc?'Put your words on the wire. Bring them back from the noise.':'Load a recording. Press Play. Watch its message arrive.';
 $('sourceHeading').textContent=enc?'The message':'The recording';$('sourceTag').textContent=enc?'TX / SOURCE':'RX / AUDIO';
 $('stepOne').textContent=enc?'COMPOSE':'LOAD AUDIO';$('stepTwo').textContent=enc?'MODULATE':'PRESS PLAY';$('stepThree').textContent=enc?'LISTEN & EXPORT':'LISTEN & READ';
 $('saveText').disabled=!enc;
 if(enc){profileUI();updatePreview();}else{
  if(recording){installAudio(recording);if(recording.rate)profileUI(recording.rate);}
  paint('');$('terminalState').textContent=recording?'READY / PRESS PLAY':'AWAITING AUDIO';
  status(recording?'Recording ready. Press Play.':'Load a recording.','Text appears in time with the sound.');
 }
 primary();
}
function download(data,name,type){
 const a=document.createElement('a'),u=URL.createObjectURL(new Blob([data],{type}));
 a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);
}
function changed(){
 cancelWork();clearPlayback();profileUI();
 if(updatePreview())status('Message ready.','Encode a WAV or turn on real-time transmission.');
}
$('source').value=demo;profileUI();updatePreview();waveform(null);
$('source').addEventListener('input',changed);
$('encoding').onchange=changed;$('channel').onchange=changed;$('profile').onchange=changed;
$('realTime').onchange=()=>{primary();updatePreview();};
$('encodeNav').onclick=()=>setMode('encode');$('decodeNav').onclick=()=>setMode('decode');
$('mainAction').onclick=()=>{if(live)stopLive();else if(mode==='encode')makeAudio();else togglePlay();};
$('loadDemo').onclick=()=>{$('source').value=demo;changed();};
$('importText').onclick=()=>$('textFile').click();
$('textFile').onchange=async()=>{
 const file=$('textFile').files[0];if(!file)return;
 if(file.size>maxBytes(rate())){status('Message too long.','Limit: '+maxBytes(rate()).toLocaleString()+' bytes at this speed.');return;}
 $('source').value=fromBytes(new Uint8Array(await file.arrayBuffer()),$('encoding').value).replace(/\x1b\[/g,'\\e[');changed();
};
$('chooseAudio').onclick=()=>$('audioFile').click();
$('audioFile').onchange=()=>pickAudio($('audioFile').files[0]);
$('receiveProfile').onchange=()=>{if(lastFile)pickAudio(lastFile);};
$('chooseAudio').ondragover=e=>{e.preventDefault();$('chooseAudio').classList.add('dragging');};
$('chooseAudio').ondragleave=()=>$('chooseAudio').classList.remove('dragging');
$('chooseAudio').ondrop=e=>{e.preventDefault();$('chooseAudio').classList.remove('dragging');pickAudio(e.dataTransfer.files[0]);};
$('roundTrip').onclick=async()=>{
 if(busy)return;
 cancelWork();const token=serial;controller=new AbortController();busy=true;primary();
 try{
  const bytes=toBytes(sourceText(),$('encoding').value);
  const data=await encodeFile(bytes,rate(),$('channel').value,controller.signal);
  if(token!==serial)return;busy=false;
  pickAudio(new File([wav(data.pcm,data.sampleRate)],'demmod-example.wav',{type:'audio/wav'}));
 }catch(e){if(token===serial){busy=false;primary();status('Could not load example.',e.message);}}
};
$('play').onclick=togglePlay;
$('seek').oninput=()=>{if(!live&&Number.isFinite(audio.duration)){audio.currentTime=Number($('seek').value)/1000*audio.duration;sync();}};
$('mute').onclick=()=>{
 audio.muted=!audio.muted;live?.mute(audio.muted);
 $('mute').textContent=audio.muted?'×':'♪';$('mute').setAttribute('aria-label',audio.muted?'Unmute audio':'Mute audio');
};
audio.onplay=()=>{playLabel();cancelAnimationFrame(frame);if(!document.hidden)tick();};
audio.onpause=()=>{playLabel();cancelAnimationFrame(frame);if(!document.hidden)sync();};
audio.onended=()=>{sync();playLabel();if(view?.bytes.length)status('Playback complete.',receivedCount+' bytes received.');};
audio.ontimeupdate=()=>{if(!document.hidden)sync();};
document.addEventListener('visibilitychange',()=>{
 cancelAnimationFrame(frame);
 if(!document.hidden){if(live?.pcm)renderAt(live.played/live.sampleRate,true);else if(!audio.paused)tick();}
});
$('download').onclick=()=>{if(view?.wave)download(view.wave,'demmod-'+(view.rate||'audio')+'.wav','audio/wav');};
$('saveText').onclick=()=>{
 try{
  const bytes=mode==='decode'?view.bytes.slice(0,receivedCount):toBytes(sourceText(),$('encoding').value);
  download(bytes,'demmod.ans','application/octet-stream');
 }catch(e){status('Cannot export text.',e.message);}
};
$('helpBtn').onclick=()=>$('help').showModal();$('closeHelp').onclick=()=>$('help').close();
document.addEventListener('keydown',e=>{
 if($('help').open)return;
 if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();if(!$('mainAction').disabled)$('mainAction').click();return;}
 if(e.ctrlKey||e.metaKey||e.altKey||['INPUT','TEXTAREA','SELECT','BUTTON'].includes(document.activeElement.tagName))return;
 if(e.key==='e')setMode('encode');if(e.key==='d')setMode('decode');if(e.key==='?')$('help').showModal();
 if(e.code==='Space'){e.preventDefault();togglePlay();}
});
