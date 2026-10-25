import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {chromium} from 'playwright';

const sources={
 '/recorder.js':stripTypeScriptTypes(readFileSync('apps/web/src/lib/inventory/voice-recorder.ts','utf8')).replace("'./voice-input-meter'","'/meter.js'"),
 '/meter.js':stripTypeScriptTypes(readFileSync('apps/web/src/lib/inventory/voice-input-meter.ts','utf8')).replace("'@pianotechpros/client-core'","'/level.js'"),
 '/level.js':stripTypeScriptTypes(readFileSync('packages/client-core/src/voice-input-level.ts','utf8')),
};
const server=createServer((req,res)=>{res.setHeader('Content-Type',sources[req.url]?'text/javascript':'text/html');res.end(sources[req.url]??'<!doctype html><title>Voice capture acceptance</title>');});
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
 await page.waitForFunction(()=>typeof states.at(-1).level==='number'&&states.at(-1).level>0);
 assert.equal(await page.evaluate(()=>states.at(-1).level<=100),true);
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
  assert.equal(await page.evaluate(()=>recorder.snapshot().level),null);
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
 assert.deepEqual(await page.evaluate(()=>recorder.snapshot()),{phase:'failed',issue:'device',level:null});
 assert.equal(await page.evaluate(()=>streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))),true);
 assert.equal(await page.evaluate(()=>results.length),2);
 await page.evaluate(()=>recorder.dispose());
 // A real oscillator and analyser exercise signal, silence and context ownership.
 await page.evaluate(async()=>{
  const {createBrowserVoiceMeter}=await import('/meter.js');
  globalThis.signalContext=new AudioContext();globalThis.meterContext=new AudioContext();
  globalThis.oscillator=signalContext.createOscillator();globalThis.gain=signalContext.createGain();globalThis.destination=signalContext.createMediaStreamDestination();
  oscillator.connect(gain);gain.connect(destination);gain.gain.value=.5;oscillator.start();await signalContext.resume();
  globalThis.levels=[];globalThis.closeMeter=createBrowserVoiceMeter(destination.stream,level=>levels.push(level),()=>meterContext);
 });
 await page.waitForFunction(()=>levels.at(-1)>0&&levels.at(-1)<=100);
 await page.evaluate(()=>{gain.gain.value=0;});await page.waitForFunction(()=>levels.at(-1)===0);
 await page.evaluate(()=>closeMeter());await page.waitForFunction(()=>meterContext.state==='closed');
 const readingCount=await page.evaluate(()=>levels.length);await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>levels.length),readingCount);
 assert.equal(await page.evaluate(()=>destination.stream.getTracks().every(track=>track.readyState==='live')),true);
 assert.equal(await page.evaluate(async()=>{const {createBrowserVoiceMeter}=await import('/meter.js');let result='missing';const close=createBrowserVoiceMeter(destination.stream,value=>{result=value;},()=>{throw Error('analysis unavailable');});close();return result;}),null);
 await page.evaluate(async()=>{oscillator.stop();for(const track of destination.stream.getTracks())track.stop();await signalContext.close();});
 console.log('input level signal, silence, release and unavailable fallback passed');
 const denied=await browser.newContext();const deniedPage=await denied.newPage();
 await deniedPage.goto(`http://127.0.0.1:${server.address().port}`);
 const cdp=await denied.newCDPSession(deniedPage);
 await cdp.send('Browser.setPermission',{permission:{name:'microphone'},setting:'denied',origin:`http://127.0.0.1:${server.address().port}`});
 assert.deepEqual(await deniedPage.evaluate(async()=>{const {createBrowserVoiceRecorder}=await import('/recorder.js');let state;const r=createBrowserVoiceRecorder({changed:s=>state=s,completed:()=>{throw Error('unexpected audio');}});await r.start();const result=state;r.dispose();return result;}),{phase:'failed',issue:'permission',level:null});
 await denied.close();await context.close();
 console.log('Browser voice recorder acceptance passed');
}finally{clearTimeout(deadline);await browser?.close();server.close();await once(server,'close');}
