import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {encode,decode,wav,readWav,MAX_MESSAGE_BYTES,MAX_DURATION,RATE} from '../web/modem.js';
import {toBytes,fromBytes,renderTerminal} from '../web/terminal.js';

for(const channel of ['answer','originate']){
 test(channel + ': every byte survives PCM export, import and audio decoding',()=>{
  const expected=Uint8Array.from({length:256},(_,i)=>i);
  const result=decode(readWav(wav(encode(expected,channel))));
  assert.deepEqual(result.bytes,expected);
  assert.equal(result.channel,channel);
  assert.equal(result.times.length,256);
  assert.ok(result.times.every((t,i)=>i===0||t>result.times[i-1]));
 });
}
test('CP437 keeps ANSI and extended glyphs intact',()=>{
 const text='\x1b[33mHello ┌─┐\r\n│░█│\x1b[0m';
 assert.equal(fromBytes(toBytes(text,'cp437'),'cp437'),text);
 assert.throws(()=>toBytes('🙂','cp437'),/not in CP437/);
 assert.equal(fromBytes(toBytes('🙂','utf8'),'utf8'),'🙂');
});
test('empty, truncated and silent input fails explicitly',()=>{
 assert.throws(()=>readWav(new ArrayBuffer(10)),/Choose a PCM WAV/);
 const valid=wav(encode(new Uint8Array([65])));
 assert.throws(()=>readWav(valid.slice(0,-100)),/truncated/);
 assert.throws(()=>decode(new Float32Array(48000)),/No 300 bps/);
});
test('terminal preserves line positions, colors and cursor commands',()=>{
 const ctx={fillRect(){},fillText(){}};
 const canvas={getContext:()=>ctx};
 const screen=renderTerminal(canvas,'\x1b[2J\x1b[H\x1b[33mHELLO\r\nWORLD\x1b[3;5H!');
 const rows=screen.split('\n');
 assert.equal(rows.length,24);
 assert.ok(rows.every(row=>row.length===80));
 assert.ok(rows[0].startsWith('HELLO'));
 assert.ok(rows[1].startsWith('WORLD'));
 assert.equal(rows[2][4],'!');
});

test('pasted Weazl ASCII art exceeds the former cap but round-trips without trimming',()=>{
 const text=readFileSync(new URL('./fixtures/weazl-ascii.txt',import.meta.url),'utf8').replace(/\r?\n/g,'\r\n');
 const bytes=toBytes(text,'cp437');
 assert.ok(bytes.length>3500);
 assert.ok(bytes.length<=MAX_MESSAGE_BYTES);
 const result=decode(readWav(wav(encode(bytes))));
 assert.deepEqual(result.bytes,bytes);
});
test('message cap matches the five-minute recording duration',()=>{
 const pcm=encode(new Uint8Array(MAX_MESSAGE_BYTES).fill(65));
 assert.equal(pcm.length/RATE,MAX_DURATION);
 assert.throws(()=>encode(new Uint8Array(MAX_MESSAGE_BYTES+1)),/five minutes/);
 assert.throws(()=>encode(new Uint8Array()),/Use between 1/);
});
