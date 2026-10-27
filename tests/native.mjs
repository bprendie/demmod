import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
const binary=process.env.DEMMOD_MODEM||'bin/demmod-modem';
for(const rate of [1200,2400])for(const role of ['answer','originate']){
 test(`${rate} ${role}: all bytes through training and independent passive receiver`,{skip:!existsSync(binary)},()=>{
  const bytes=Buffer.from(Array.from({length:256},(_,i)=>i));
  const tx=spawnSync(binary,['encode',String(rate),role,'file'],{input:bytes,maxBuffer:6e6});
  assert.equal(tx.status,0,tx.stderr.toString());
  const rx=spawnSync(binary,['decode','0'],{input:tx.stdout,maxBuffer:6e6});
  assert.equal(rx.status,0,rx.stderr.toString());
  const data=JSON.parse(rx.stdout);
  assert.equal(data.rate,rate);assert.equal(data.channel,role);
  assert.deepEqual(Buffer.from(data.bytes),bytes);
  assert.equal(data.errors,0);
  assert.ok(data.times.every((t,i)=>t>4&&(!i||t>data.times[i-1])));
 });
}
