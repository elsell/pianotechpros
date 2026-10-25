import assert from 'node:assert/strict';
import test from 'node:test';
import {createInventoryScanEntry} from './inventory-scan-entry';
const origin='https://pianos.example';const link=origin+'/scan#v=1&dealer=shop&token='+'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE';
test('entry validates before retaining, avoids secret snapshots, and expires without renewal',()=>{
 let now=1000;const entry=createInventoryScanEntry({origin,now:()=>now});
 assert.equal(entry.open(link.replace(origin,'https://foreign.example'),null),false);assert.equal(entry.link(),null);
 assert.equal(entry.open(link,null),true);const first=entry.snapshot();assert.equal(first.pending,true);assert.ok(!JSON.stringify(first).includes('token'));
 now+=599999;assert.equal(entry.link(),link);assert.equal(entry.snapshot().expiresAt,first.expiresAt);now++;assert.equal(entry.link(),null);assert.equal(entry.snapshot().pending,false);
});
test('first account binds continuation; different account and explicit disposal clear it',()=>{
 const entry=createInventoryScanEntry({origin,now:()=>1000});entry.open(link,null);entry.bind('one');assert.equal(entry.link(),link);entry.bind('one');assert.equal(entry.link(),link);entry.bind('two');assert.equal(entry.link(),null);
 entry.open(link,'two');entry.clear();assert.equal(entry.link(),null);
});
test('each new entry changes identity and cancellation invalidates observers; clock rollback fails closed',()=>{
 let now=1000;const entry=createInventoryScanEntry({origin,now:()=>now});const states:unknown[]=[];const unsub=entry.subscribe(state=>states.push(state));entry.open(link,'one');const first=entry.snapshot().version;entry.open(link,'one');assert.ok(entry.snapshot().version>first);now=999;assert.equal(entry.link(),null);assert.equal(entry.snapshot().pending,false);assert.ok(states.length>=4);unsub();
});
