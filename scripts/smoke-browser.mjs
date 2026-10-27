// Set PLAYWRIGHT_MODULE to an installed Playwright module path when needed.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://localhost:5000');
for(const rate of ['300','1200','2400']){
 await page.locator('#source').fill('DEMMOD TEST\nHELLO');
 await page.locator('#settings').evaluate(e=>e.open=true);
 await page.selectOption('#profile',rate);
 await page.locator('#mainAction').click();
 await page.waitForFunction(()=>document.querySelector('#status').textContent==='Your signal is ready.');
 assert.equal(await page.locator('#mainAction').isEnabled(),true);
 console.log('offline',rate,'PASS');
 await page.locator('#realTime').check();const start=Date.now();
 await page.locator('#mainAction').click();
 assert.equal(await page.locator('#download').isDisabled(),true);
 await page.waitForFunction(()=>document.querySelector('#status').textContent==='Transmission complete.',{},{timeout:15000});
 assert.ok(Date.now()-start>1000);assert.equal(await page.locator('#download').isEnabled(),true);
 console.log('live',rate,'PASS',Date.now()-start);
 await page.locator('#realTime').uncheck();
}
await page.locator('#decodeNav').click();await page.locator('#roundTrip').click();
await page.waitForFunction(()=>document.querySelector('#status').textContent==='Recording ready. Press Play.',{},{timeout:30000});
assert.equal((await page.locator('#terminalText').textContent()).trim(),'');
assert.equal(await page.locator('#saveText').isDisabled(),true);
await page.locator('#mainAction').click();
await page.waitForFunction(()=>document.querySelector('#terminalText').textContent.includes('HELLO'),{},{timeout:10000});
console.log('receive Play reveals bytes PASS');
await page.screenshot({path:'output/demmod-v02.png',fullPage:true});
await page.locator('#encodeNav').click();await page.locator('#realTime').check();await page.locator('#mainAction').click();await page.waitForTimeout(400);await page.locator('#mainAction').click();
assert.equal(await page.locator('#status').textContent(),'Transmission stopped.');assert.equal(await page.locator('#source').isEnabled(),true);
assert.deepEqual(errors,[]);console.log('cancel and browser errors PASS');
await browser.close();
