import test from 'node:test';import assert from 'node:assert/strict';
import {voicePermissionResume} from './voice-permission-resume';
function fixture(){let active=false,listener=()=>{},timeout=()=>{},subscribed=false,timed=false;return {port:{active:()=>active,subscribe:(changed:()=>void)=>{listener=changed;subscribed=true;return()=>{subscribed=false;};},after:(ms:number,work:()=>void)=>{assert.equal(ms,1500);timeout=work;timed=true;return()=>{timed=false;};}},resume(){active=true;listener();},expire(){timeout();},clean:()=>!subscribed&&!timed};}
test('normal permission dismissal waits for foreground and releases observation',async()=>{const f=fixture();const result=voicePermissionResume(f.port);f.resume();assert.equal(await result,true);assert.ok(f.clean());});
test('leaving the app cannot turn a resolved prompt into recording authority',async()=>{const f=fixture();const result=voicePermissionResume(f.port);f.expire();assert.equal(await result,false);assert.ok(f.clean());f.resume();});
test('already active requires no timer or observer',async()=>{const f=fixture();f.resume();assert.equal(await voicePermissionResume(f.port),true);assert.ok(f.clean());});
import {resolveVoicePermission} from './voice-permission-resume';
for(const failed of [false,true])test(`background during existing grant query cleans up (${failed?'error':'grant'})`,async()=>{
 let settle!:(value:boolean)=>void,reject!:(error:Error)=>void,cleared=0,requested=0;
 const pending=new Promise<boolean>((yes,no)=>{settle=yes;reject=no;});
 const result=resolveVoicePermission({granted:()=>pending,request:async()=>{requested++;return true;},resume:async()=>false,backgrounded:()=>{cleared++;}});
 if(failed){reject(new Error('permission_status'));await assert.rejects(result,/permission_status/);}else{settle(true);assert.equal(await result,true);}
 assert.equal(cleared,1);assert.equal(requested,0);
});
