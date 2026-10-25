import test from 'node:test';
import assert from 'node:assert/strict';
import {relatedPublicPianos} from './showroom-related.js';
const current={id:'current',dealer_id:'shop',form:'grand',status:'available'};
const candidate=(id:string,extra={})=>({...current,id,...extra});
test('related listings prefer same form, exclude current and remain bounded',async()=>{
 const calls:unknown[]=[];const result=await relatedPublicPianos(current,async query=>{calls.push(query);return {profile:{id:'shop'},pianos:[current,candidate('a'),candidate('b'),candidate('c')]};});
 assert.deepEqual(result.map(p=>p.id),['a','b','c']);assert.deepEqual(calls,[{form:'grand',availability:'available',limit:4}]);
});
test('no same-form alternatives performs one available fallback, excluding hidden lifecycle states',async()=>{
 let calls=0;const result=await relatedPublicPianos(current,async query=>{calls++;return {profile:{id:'shop'},pianos:query.form?[current]:[candidate('sold',{status:'sold'}),candidate('a',{form:'studio_upright'})]};});
 assert.equal(calls,2);assert.deepEqual(result.map(p=>p.id),['a']);
});
test('related projections cannot cross showroom identities or exceed the response bound',async()=>{
 for(const page of [{profile:{id:'other'},pianos:[]},{profile:{id:'shop'},pianos:[candidate('a',{dealer_id:'other'})]},{profile:{id:'shop'},pianos:Array.from({length:5},(_,i)=>candidate(String(i)))},{profile:{id:'shop'},pianos:[candidate('a'),candidate('a')]}])await assert.rejects(relatedPublicPianos(current,async()=>page));
});
