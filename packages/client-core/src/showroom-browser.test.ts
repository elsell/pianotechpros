import test from 'node:test';import assert from 'node:assert/strict';
import {createShowroomBrowser} from './showroom-browser';
const page=(id:string,cursor?:string)=>({profile:{id:'shop',slug:'atelier'},pianos:[{id,dealer_id:'shop'}],nextCursor:cursor});
test('public pagination preserves filters and refresh starts a new traversal',async()=>{
 const queries:any[]=[];const b=createShowroomBrowser('atelier','.',async(q)=>{queries.push(q);return q.cursor?page('two'):page('one','next');});
 await b.filter({search:' grand '});await b.more();assert.deepEqual(b.snapshot().value?.pianos.map(p=>p.id),['one','two']);assert.equal(queries[1].search,'grand');assert.equal(queries[1].cursor,'next');
 await b.refresh();assert.deepEqual(b.snapshot().value?.pianos.map(p=>p.id),['one']);assert.equal(queries[2].cursor,undefined);
});
for(const failure of ['duplicate','scope','cursor','network'])test(`public pagination clears all content on ${failure}`,async()=>{
 const b=createShowroomBrowser('atelier','.',async(q)=>{if(!q.cursor)return page('one','next');if(failure==='network')throw Error('private');return failure==='duplicate'?page('one'):failure==='scope'?{...page('two'),profile:{id:'other',slug:'atelier'}}:page('two','next');});
 await b.refresh();await b.more();assert.equal(b.snapshot().value,null);assert.equal(b.snapshot().failure,true);
});
test('invalid filters do not dispatch and clear old results',async()=>{
 let calls=0;const b=createShowroomBrowser('atelier','.',async()=>{calls++;return page('one');});await b.refresh();await b.filter({minimum:'12'});assert.equal(calls,1);assert.equal(b.snapshot().value,null);assert.equal(b.snapshot().invalid,true);
});
test('filter changes abort a pending page and reject its late completion',async()=>{
 let finish!:(value:ReturnType<typeof page>)=>void;let signal!:AbortSignal;
 const b=createShowroomBrowser('atelier','.',async(q,s)=>{if(q.cursor){signal=s;return new Promise<ReturnType<typeof page>>(resolve=>{finish=resolve;});}return page(q.search||'one','next');});
 await b.refresh();const more=b.more();await b.filter({search:'new'});assert.equal(signal.aborted,true);finish(page('old'));await more;assert.deepEqual(b.snapshot().value?.pianos.map(p=>p.id),['new']);
});
