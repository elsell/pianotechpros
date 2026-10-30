import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createNativeTextEntry} from '../apps/mobile/src/native-text-entry';
test('native typing records every prefix without echoing asynchronous renders',()=>{
 let model='',native='';const writes:string[]=[],changes:string[]=[];
 const entry=createNativeTextEntry({read:()=>model,write:value=>{native=value;writes.push(value);},change:value=>{model=value;changes.push(value);}});
 entry.begin();for(let length=1;length<='iOS Customer'.length;length++){native='iOS Customer'.slice(0,length);entry.change(native);entry.synchronize();}
 entry.end();assert.equal(native,'iOS Customer');assert.equal(model,native);assert.equal(changes.length,12);assert.deepEqual(writes,[]);
});
test('blur reads current editor state rather than an old render and external replacements synchronize',()=>{
 let model='initial',native=model;const writes:string[]=[];
 const entry=createNativeTextEntry({read:()=>model,write:value=>{native=value;writes.push(value);},change:value=>{model=value;}});
 entry.begin();native='typed';entry.change(native);entry.synchronize();entry.end();assert.equal(native,'typed');assert.deepEqual(writes,[]);
 model='server replacement';entry.synchronize();assert.equal(native,model);
 entry.begin();model='reviewed conflict replacement';entry.synchronize();assert.equal(native,'server replacement');entry.end();assert.equal(native,model);assert.deepEqual(writes,['server replacement','reviewed conflict replacement']);
});
