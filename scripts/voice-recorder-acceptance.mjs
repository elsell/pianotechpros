import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {chromium} from 'playwright';

const source=stripTypeScriptTypes(readFileSync('apps/web/src/lib/inventory/voice-recorder.ts','utf8'));
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/recorder.js'?'text/javascript':'text/html');res.end(req.url==='/recorder.js'?source:'<!doctype html><title>Voice capture acceptance</title>');});
server.listen(0,'127.0.0.1');await once(server,'listening');
let browser;
const deadline=setTimeout(()=>{console.error('Recorder acceptance timed out');void browser?.close();},30_000);
try{
 browser=await chromium.launch({channel:'chromium',headless:true,args:['--use-fake-device-for-media-stream']});
 const context=await browser.newContext({permissions:['microphone']});const page=await context.newPage();
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.evaluate(async()=>{
  const {createBrowserVoiceRecorder}=await import('/recorder.js');
  globalThis.results=[];globalThis.streams=[];globalThis.states=[];
  globalThis.make=(options={})=>createBrowserVoiceRecorder({
   changed:s=>states.push(s),completed:audio=>results.push(audio),
   acquire:async()=>{const stream=await navigator.mediaDevices.getUserMedia({audio:true});streams.push(stream);return stream;},...options
  });
  globalThis.recorder=make();await recorder.start();
 });
 await page.waitForFunction(()=>states.at(-1).phase==='recording');
 await page.waitForTimeout(350);await page.evaluate(()=>recorder.stop());
 await page.waitForFunction(()=>results.length===1);
 assert.equal(await page.evaluate(()=>results[0].bytes.length>0&&results[0].bytes.length<=6*1024*1024),true);
 assert.match(await page.evaluate(()=>results[0].mimeType),/^audio\/(webm|ogg|mp4)/);
 assert.equal(await page.evaluate(()=>streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))),true);
 console.log('explicit stop passed');
 for(const action of ['cancel','dispose']){
  await page.evaluate(async(action)=>{recorder=make();await recorder.start();recorder[action]();},action);
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>results.length),1);
  assert.equal(await page.evaluate(()=>streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))),true);
 }
 console.log('cancel and dispose passed');
 // A controlled permission port defers delivery of a real microphone stream.
 await page.evaluate(async()=>{
  let grant;globalThis.grant=()=>grant();let calls=0;
  recorder=make({acquire:async()=>{calls++;await new Promise(r=>grant=r);const s=await navigator.mediaDevices.getUserMedia({audio:true});streams.push(s);return s;}});
  globalThis.pending=recorder.start();recorder.cancel();await recorder.start();globalThis.calls=()=>calls;
 });
 assert.equal(await page.evaluate(()=>calls()),1);
 await page.evaluate(async()=>{grant();await pending;});
 assert.equal(await page.evaluate(()=>streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))),true);
 assert.equal(await page.evaluate(()=>results.length),1);
 console.log('late permission passed');
 // Inject a clock, never shorten the production duration policy.
 await page.evaluate(async()=>{globalThis.expire=null;recorder=make({clock:{after:(_ms,fn)=>{expire=fn;return()=>{expire=null;};}}});await recorder.start();});
 await page.waitForTimeout(200);await page.evaluate(()=>expire());
 await page.waitForFunction(()=>results.length===2);
 assert.equal(await page.evaluate(()=>streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))),true);
 await page.evaluate(async()=>{recorder.dispose();recorder=make();await recorder.start();window.dispatchEvent(new PageTransitionEvent('pagehide'));});
 assert.equal(await page.evaluate(()=>streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))),true);
 assert.equal(await page.evaluate(()=>results.length),2);
 await page.evaluate(()=>recorder.dispose());
 console.log('duration and lifecycle passed');
 await page.evaluate(async()=>{
  recorder=make({changed:state=>{if(state.phase==='recording')recorder.cancel();}});
  await recorder.start();
 });
 assert.equal(await page.evaluate(()=>streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))),true);
 assert.equal(await page.evaluate(()=>results.length),2);
 await page.evaluate(()=>recorder.dispose());
 // Device loss is delivered through the track event boundary, on a real stream.
 await page.evaluate(async()=>{recorder=make();await recorder.start();streams.at(-1).getAudioTracks()[0].dispatchEvent(new Event('ended'));});
 assert.deepEqual(await page.evaluate(()=>recorder.snapshot()),{phase:'failed',issue:'device'});
 assert.equal(await page.evaluate(()=>streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))),true);
 assert.equal(await page.evaluate(()=>results.length),2);
 await page.evaluate(()=>recorder.dispose());
 const denied=await browser.newContext();const deniedPage=await denied.newPage();
 await deniedPage.goto(`http://127.0.0.1:${server.address().port}`);
 const cdp=await denied.newCDPSession(deniedPage);
 await cdp.send('Browser.setPermission',{permission:{name:'microphone'},setting:'denied',origin:`http://127.0.0.1:${server.address().port}`});
 assert.deepEqual(await deniedPage.evaluate(async()=>{const {createBrowserVoiceRecorder}=await import('/recorder.js');let state;const r=createBrowserVoiceRecorder({changed:s=>state=s,completed:()=>{throw Error('unexpected audio');}});await r.start();const result=state;r.dispose();return result;}),{phase:'failed',issue:'permission'});
 await denied.close();await context.close();
 console.log('Browser voice recorder acceptance passed');
}finally{clearTimeout(deadline);await browser?.close();server.close();await once(server,'close');}
