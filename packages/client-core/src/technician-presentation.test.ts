import test from 'node:test';
import assert from 'node:assert/strict';
import {createTechnicianPresentationLifetime} from './technician-presentation';
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}
const turn=()=>new Promise<void>(resolve=>setImmediate(resolve));
test('effect replay waits for retired opening and protected cleanup before replacement',async()=>{
 const lifetime=createTechnicianPresentationLifetime();const opening=deferred<Resource|null>(),cleanup=deferred<void>();
 const events:string[]=[];let active!:()=>boolean;
 type Resource={dispose():void;cleanup():Promise<void>};
 const resource={dispose(){events.push('dispose');},async cleanup(){events.push('cleanup');await cleanup.promise;events.push('released');}};
 const stop=lifetime.start({open:live=>{active=live;events.push('open');return opening.promise;},ready:()=>events.push('stale'),failed:()=>events.push('stale-error')});
 await turn();stop();assert.equal(active(),false);
 const stopNext=lifetime.start({open:async()=>{events.push('replacement');return null;},ready:()=>events.push('ready'),failed:()=>events.push('error')});
 opening.resolve(resource);await turn();assert.deepEqual(events,['open','dispose','cleanup']);
 cleanup.resolve();await turn();assert.deepEqual(events,['open','dispose','cleanup','released','replacement']);stopNext();
});
test('cleanup failure blocks acquisition and explicit retry retries retained cleanup',async()=>{
 const lifetime=createTechnicianPresentationLifetime();let fail=true,opens=0,cleans=0,errors=0;
 const resource={dispose(){},async cleanup(){cleans++;if(fail)throw Error('storage');}};
 const port={open:async()=>{opens++;return resource;},ready:()=>{},failed:()=>{errors++;}};
 const stop=lifetime.start(port);await turn();stop();await turn();
 const retry=lifetime.start(port);await turn();assert.equal(opens,1);assert.equal(errors,1);
 retry();await turn();fail=false;
 const final=lifetime.start(port);await turn();assert.equal(opens,2);assert.ok(cleans>=3);final();await turn();
});
test('retired failure is suppressed and retirement before dispatch opens nothing',async()=>{
 const lifetime=createTechnicianPresentationLifetime();let opens=0,errors=0;
 const port={open:async()=>{opens++;throw Error('offline');},ready:()=>{},failed:()=>{errors++;}};
 lifetime.start(port)();await turn();assert.equal(opens,0);assert.equal(errors,0);
 const pending=deferred<null>();const stop=lifetime.start({...port,open:()=>pending.promise});await turn();stop();pending.resolve(null);await turn();assert.equal(errors,0);
 const stopLive=lifetime.start(port);await turn();assert.equal(errors,1);stopLive();
});
