import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeVoiceCapture,type NativeVoiceHandle,type NativeVoiceCapturePort} from './native-voice-capture';
const deferred=<T>()=>{let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve};};
function setup(){
 const events:string[]=[],audio:Uint8Array[]=[];let active=true,permission=true,cleanupFails=false,stopFails=false;let bytes:Uint8Array=new Uint8Array([1,2,3]);let ended!:(failed:boolean)=>void;
 const handle:NativeVoiceHandle={record:seconds=>{events.push(`record:${seconds}`);},stop:async()=>{events.push('stop');if(stopFails)throw Error('PRIVATE STOP');},read:async limit=>{events.push(`read:${limit}`);return bytes;},dispose:async()=>{events.push('dispose');if(cleanupFails)throw Error('PRIVATE FILE');}};
 const port:NativeVoiceCapturePort={active:()=>active,permission:async()=>{events.push('permission');return permission;},prepare:async callback=>{events.push('prepare');ended=callback;return handle;},completed:value=>audio.push(value),changed:()=>{}};
 return {events,audio,handle,port,setActive:(v:boolean)=>active=v,setPermission:(v:boolean)=>permission=v,setCleanup:(v:boolean)=>cleanupFails=v,setStop:(v:boolean)=>stopFails=v,setBytes:(v:Uint8Array)=>bytes=v,end:(v=false)=>ended(v)};
}
test('native capture bounds duration and reads only after stop, delivering after cleanup once',async()=>{
 const f=setup(),c=createNativeVoiceCapture(f.port);await c.start();assert.equal(c.snapshot().phase,'recording');await c.stop();await c.stop();
 assert.deepEqual(f.events,['permission','prepare','record:60','stop','read:6291456','dispose']);assert.deepEqual([...f.audio[0]!],[1,2,3]);assert.equal(c.snapshot().busy,false);
});
test('denied permission and inactive scopes never prepare a recorder',async()=>{
 const f=setup();f.setPermission(false);const c=createNativeVoiceCapture(f.port);await c.start();assert.equal(c.snapshot().issue,'permission');assert.deepEqual(f.events,['permission']);
 f.setActive(false);await c.start();assert.deepEqual(f.events,['permission']);
});
test('cancelled pending permission cannot start or overlap another recording',async()=>{
 const f=setup(),grant=deferred<boolean>();let requests=0;f.port.permission=()=>{requests++;return grant.promise;};const c=createNativeVoiceCapture(f.port);
 const pending=c.start();const cancelled=c.cancel();await c.start();assert.equal(requests,1);grant.resolve(true);await pending;await cancelled;assert.equal(requests,1);assert.deepEqual(f.events,[]);assert.equal(c.snapshot().busy,false);
});
test('late preparation is disposed without recording or reading',async()=>{
 const f=setup(),prepared=deferred<NativeVoiceHandle>(),started=deferred<void>();f.port.prepare=()=>{started.resolve();return prepared.promise;};const c=createNativeVoiceCapture(f.port);
 const pending=c.start();await started.promise;const cancelled=c.cancel();prepared.resolve(f.handle);await pending;await cancelled;
 assert.ok(f.events.includes('dispose'));assert.ok(!f.events.some(e=>e.startsWith('record:')||e.startsWith('read:')));assert.equal(f.audio.length,0);
});
test('cancellation during a pending read erases audio and suppresses completion',async()=>{
 const f=setup(),reading=deferred<Uint8Array>(),entered=deferred<void>();f.handle.read=()=>{entered.resolve();return reading.promise;};const c=createNativeVoiceCapture(f.port);await c.start();const stopping=c.stop();await entered.promise;const cancel=c.cancel();const bytes=new Uint8Array([9,8]);reading.resolve(bytes);await stopping;await cancel;assert.deepEqual([...bytes],[0,0]);assert.equal(f.audio.length,0);
});
test('cleanup failure erases audio and blocks new capture until cleanup retry',async()=>{
 const f=setup();f.setCleanup(true);const bytes=new Uint8Array([8]);f.setBytes(bytes);const c=createNativeVoiceCapture(f.port);await c.start();await c.stop();assert.equal(c.snapshot().issue,'cleanup');assert.equal(c.snapshot().busy,true);assert.deepEqual([...bytes],[0]);assert.equal(f.audio.length,0);await c.start();assert.equal(f.events.filter(e=>e==='permission').length,1);
 f.setCleanup(false);await c.cancel();assert.equal(c.snapshot().busy,false);await c.start();assert.equal(c.snapshot().phase,'recording');await c.cancel();
});
test('stop failure and oversized/empty data fail closed but still dispose',async()=>{
 for(const kind of ['stop','size','empty']){const f=setup();if(kind==='stop')f.setStop(true);if(kind==='size')f.setBytes(new Uint8Array(6*1024*1024+1));if(kind==='empty')f.setBytes(new Uint8Array());const c=createNativeVoiceCapture(f.port);await c.start();await c.stop();assert.equal(c.snapshot().phase,'failed');assert.equal(f.audio.length,0);assert.ok(f.events.includes('dispose'));}
});
test('native duration completion finishes once, interruptions discard',async()=>{
 for(const failed of [false,true]){const f=setup(),c=createNativeVoiceCapture(f.port);await c.start();f.end(failed);await c.drain();assert.equal(f.audio.length,failed?0:1);assert.ok(f.events.includes('dispose'));}
});
test('observer cancellation and disposal cannot resurrect capture',async()=>{
 const f=setup();let c:ReturnType<typeof createNativeVoiceCapture>;f.port.changed=state=>{if(state.phase==='recording')void c.cancel();};c=createNativeVoiceCapture(f.port);await c.start();await c.drain();assert.equal(f.audio.length,0);assert.ok(f.events.includes('dispose'));await c.dispose();await c.start();assert.equal(c.snapshot().phase,'idle');
});
test('a stopping observer cannot overlap cleanup with a second acquisition',async()=>{
 const f=setup(),closing=deferred<void>();let c:ReturnType<typeof createNativeVoiceCapture>;
 f.handle.stop=()=>closing.promise;f.port.changed=state=>{if(state.phase==='stopping'){void c.cancel();void c.start();}};
 c=createNativeVoiceCapture(f.port);await c.start();const done=c.stop();assert.equal(f.events.filter(e=>e==='permission').length,1);assert.equal(c.snapshot().busy,true);closing.resolve();await done;assert.equal(f.audio.length,0);assert.equal(c.snapshot().busy,false);
});
