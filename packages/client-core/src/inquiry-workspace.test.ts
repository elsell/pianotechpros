import assert from 'node:assert/strict';
import test from 'node:test';
import {createInquiryWorkspace,type InquiryWorkspacePort} from './inquiry-workspace.js';
type Entry={id:string;revision:number;contact:{name:string}};
const row=(id:string,revision=1):Entry=>({id,revision,contact:{name:'Private buyer'}});
const deferred=<T>()=>{let resolve!:(v:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes;});return {promise,resolve};};
function fixture(overrides:Partial<InquiryWorkspacePort<Entry>>={}){return {list:async()=>({inquiries:[row('one')]}),get:async(id:string)=>row(id),markRead:async(id:string)=>row(id,2),...overrides};}
const classify=(error:unknown)=>error instanceof Error&&error.message==='denied'?'not_found' as const:error instanceof Error&&error.message==='conflict'?'conflict' as const:'unavailable' as const;
test('inbox scope clears private state and ignores late list/detail results',async()=>{
 const pending=deferred<{inquiries:Entry[]}>();const inbox=createInquiryWorkspace<Entry>(classify);let signal:AbortSignal|undefined;
 inbox.replaceScope('account','shop',fixture({list:async(_cursor,s)=>{signal=s;return pending.promise;}}));const work=inbox.refresh();inbox.replaceScope('other','other-shop',fixture());assert.equal(signal?.aborted,true);pending.resolve({inquiries:[row('old')]});await work;assert.equal(inbox.snapshot().items.length,0);
 await inbox.refresh();const copy=inbox.snapshot();copy.items[0].contact.name='changed';assert.equal(inbox.snapshot().items[0].contact.name,'Private buyer');
 const detail=deferred<Entry>();inbox.replaceScope('account','shop',fixture({get:async()=>detail.promise}));const selected=inbox.select('one');inbox.clear();detail.resolve(row('one'));await selected;assert.equal(inbox.snapshot().selected,null);assert.equal(inbox.snapshot().accountID,null);
});
test('inbox serializes pages and rejects duplicate rows or repeated cursors',async()=>{
 let calls=0;const pending=deferred<{inquiries:Entry[];nextCursor?:string}>();const inbox=createInquiryWorkspace<Entry>(classify);
 inbox.replaceScope('account','shop',fixture({list:async(cursor)=>{calls++;return cursor?pending.promise:{inquiries:[row('one')],nextCursor:'cursor'};}}));await inbox.refresh();const next=inbox.loadMore();await inbox.loadMore();assert.equal(calls,2);pending.resolve({inquiries:[row('one')],nextCursor:'cursor'});await next;assert.equal(inbox.snapshot().listIssue,'protocol_error');assert.equal(inbox.snapshot().items.length,1);
});
test('mark-read is explicit, serial and reconciles conflicts without replaying',async()=>{
 let writes=0;let reads=0;const inbox=createInquiryWorkspace<Entry>(classify);inbox.replaceScope('account','shop',fixture({get:async(id)=>{reads++;return row(id,reads>1?2:1);},markRead:async()=>{writes++;throw new Error('conflict');}}));await inbox.refresh();await inbox.select('one');assert.equal(writes,0);await inbox.markRead();assert.equal(writes,1);assert.equal(inbox.snapshot().selected?.revision,2);assert.equal(inbox.snapshot().items[0].revision,2);await inbox.markRead();assert.equal(writes,1);
});
test('authority rejection clears retained contact data, transient failure does not',async()=>{
 let denied=false;const inbox=createInquiryWorkspace<Entry>(classify);inbox.replaceScope('account','shop',fixture({get:async(id)=>{if(denied)throw new Error('denied');return row(id);}}));await inbox.refresh();await inbox.select('one');denied=true;await inbox.select('two');assert.equal(inbox.snapshot().items.length,0);assert.equal(inbox.snapshot().selected,null);assert.equal(inbox.snapshot().detailIssue,'not_found');
});
test('observer disposal prevents transport dispatch and foreign identity is rejected',async()=>{
 let calls=0;const inbox=createInquiryWorkspace<Entry>(classify);inbox.replaceScope('account','shop',fixture({list:async()=>{calls++;return {inquiries:[]};}}));const off=inbox.subscribe(s=>{if(s.listBusy)inbox.clear();});await inbox.refresh();assert.equal(calls,0);off();inbox.replaceScope('account','shop',fixture({get:async()=>row('foreign')}));await inbox.select('one');assert.equal(inbox.snapshot().selected,null);assert.equal(inbox.snapshot().detailIssue,'protocol_error');
});
test('late acknowledgments cannot replace another selection and writes are single-flight',async()=>{
 const pending=deferred<Entry>();let writes=0;let signal:AbortSignal|undefined;const inbox=createInquiryWorkspace<Entry>(classify);
 inbox.replaceScope('account','shop',fixture({markRead:async(_id,_revision,s)=>{writes++;signal=s;return pending.promise;}}));await inbox.refresh();await inbox.select('one');const mark=inbox.markRead();await inbox.markRead();assert.equal(writes,1);await inbox.select('two');assert.equal(signal?.aborted,true);pending.resolve(row('one',2));await mark;assert.equal(inbox.snapshot().selected?.id,'two');assert.equal(inbox.snapshot().selected?.revision,1);assert.equal(inbox.snapshot().markBusy,false);
});
test('transient refresh failure retains visible rows while denial clears them',async()=>{
 let failure='';const inbox=createInquiryWorkspace<Entry>(classify);inbox.replaceScope('account','shop',fixture({list:async()=>{if(failure)throw new Error(failure);return {inquiries:[row('one')]};}}));await inbox.refresh();await inbox.select('one');failure='network';await inbox.refresh();assert.equal(inbox.snapshot().items.length,1);assert.equal(inbox.snapshot().selected?.id,'one');failure='denied';await inbox.refresh();assert.equal(inbox.snapshot().items.length,0);assert.equal(inbox.snapshot().selected,null);assert.equal(inbox.snapshot().listBusy,false);
});
test('older in-flight list cannot regress a confirmed read acknowledgment',async()=>{
 const pending=deferred<{inquiries:Entry[]}>();const inbox=createInquiryWorkspace<Entry>(classify);inbox.replaceScope('account','shop',fixture({list:async()=>pending.promise}));const refresh=inbox.refresh();await inbox.select('one');await inbox.markRead();pending.resolve({inquiries:[row('one')]});await refresh;assert.equal(inbox.snapshot().items[0].revision,2);
});
test('observer disposal also prevents detail and acknowledgment dispatch',async()=>{
 let reads=0,writes=0;const inbox=createInquiryWorkspace<Entry>(classify);const port=fixture({get:async(id)=>{reads++;return row(id);},markRead:async(id)=>{writes++;return row(id,2);}});inbox.replaceScope('account','shop',port);let off=inbox.subscribe(s=>{if(s.detailBusy)inbox.clear();});await inbox.select('one');assert.equal(reads,0);off();inbox.replaceScope('account','shop',port);await inbox.select('one');off=inbox.subscribe(s=>{if(s.markBusy)inbox.clear();});await inbox.markRead();assert.equal(writes,0);off();
});
test('authority loss during pagination resets retry to the first page',async()=>{
 let allowed=true;const cursors:(string|undefined)[]=[];const inbox=createInquiryWorkspace<Entry>(classify);inbox.replaceScope('account','shop',fixture({list:async(cursor)=>{cursors.push(cursor);if(!allowed)throw new Error('denied');return {inquiries:[row('one')],nextCursor:'next'};}}));await inbox.refresh();allowed=false;await inbox.loadMore();assert.equal(inbox.snapshot().listOperation,'refresh');assert.equal(inbox.snapshot().nextCursor,undefined);allowed=true;await(inbox.snapshot().listOperation==='more'?inbox.loadMore():inbox.refresh());assert.deepEqual(cursors,[undefined,'next',undefined]);assert.equal(inbox.snapshot().items.length,1);
});
