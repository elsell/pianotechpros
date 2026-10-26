import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativePickerSession} from './native-picker-session';
import type {NativePickerState} from './native-photo-picker';
function fixture(){
 let state:NativePickerState={status:'idle'};let failure=false;let released=0;let binds=0;let accepts=0;let active=true;
 const picker={restore:async()=>{if(failure)throw Error('network private');return state;},select:async()=>state={status:'selected',id:'selected'},consume:async()=>{accepts++;state={status:'uncertain',id:'selected'};if(failure)throw Error('ack lost');state={status:'idle'};},discardPending:async()=>{state={status:'idle'};}};
 const session=createNativePickerSession({active:()=>active,bind:async()=>{binds++;return {picker,release:()=>{released++;}};}});
 return {session,picker,fail:()=>{failure=true;},recover:()=>{failure=false;},inactive:()=>{active=false;},counts:()=>({released,binds,accepts})};
}
test('offline initialization releases its temporary hold and never invents a pending intent',async()=>{
 const f=fixture();f.fail();await f.session.restore();assert.equal(f.session.snapshot().held,false);assert.equal(f.session.snapshot().busy,false);assert.equal(f.session.snapshot().error,'unavailable');assert.equal(f.counts().released,1);
 f.recover();await f.session.restore();assert.equal(f.session.snapshot().state.status,'idle');assert.equal(f.counts().released,2);
});
test('a selected result holds the same binding until explicit consumption',async()=>{
 const f=fixture();await f.session.select('camera');assert.equal(f.session.snapshot().held,true);assert.equal(f.counts().accepts,0);await f.session.restore();assert.equal(f.counts().binds,1);
 await f.session.consume();assert.equal(f.counts().accepts,1);assert.equal(f.counts().released,1);assert.equal(f.session.snapshot().held,false);
});
test('failed consume restores uncertainty without repeating acceptance',async()=>{
 const f=fixture();await f.session.select('library');f.fail();await f.session.consume();assert.equal(f.counts().accepts,1);assert.equal(f.session.snapshot().held,false);
 f.recover();await f.session.restore();assert.equal(f.session.snapshot().state.status,'uncertain');await f.session.consume();assert.equal(f.counts().accepts,1);
 await f.session.discard();assert.equal(f.session.snapshot().held,false);
});
test('disposal waits for an in-flight picker and suppresses late disclosure',async()=>{
 const f=fixture();let finish!:(value:NativePickerState)=>void;f.picker.restore=()=>new Promise(resolve=>{finish=resolve;});
 const pending=f.session.restore();for(let i=0;i<20&&!finish;i++)await Promise.resolve();assert.ok(finish);
 await f.session.select('camera');assert.equal(f.counts().binds,1);const disposed=f.session.dispose();assert.equal(f.counts().released,0);
 finish({status:'selected',id:'private'});await pending;await disposed;assert.equal(f.counts().released,1);assert.equal(f.session.snapshot().state.status,'idle');
});
test('target mismatch remains actionable without holding navigation',async()=>{
 const f=fixture();f.picker.restore=async()=>{throw Error('native_picker_other_target');};await f.session.restore();assert.equal(f.session.snapshot().error,'other_target');assert.equal(f.session.snapshot().held,false);
 await f.session.discard();assert.equal(f.session.snapshot().error,null);assert.equal(f.counts().released,2);
});
test('failed upload after confirmed transfer has no picker recovery error',async()=>{
 const f=fixture();await f.session.select('camera');
 f.picker.consume=async()=>{throw Error('upload failed after transfer');};
 f.picker.restore=async()=>({status:'idle'});
 await f.session.consume();assert.equal(f.session.snapshot().state.status,'idle');
 assert.equal(f.session.snapshot().held,false);assert.equal(f.session.snapshot().error,null);
});
test('selection failure remains visible even when restoration is idle',async()=>{
 const f=fixture();f.picker.select=async()=>{throw Error('camera failed');};
 await f.session.select('camera');assert.equal(f.session.snapshot().error,'unavailable');
});
