import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {realNativeSession} from './native-real-service-session.mjs';
const [manifest,stage,saleEvidence]=process.argv.slice(2);
assert.ok(stage==='sale'||stage==='correction');
const seed=JSON.parse(await readFile(manifest,'utf8'));
for(const id of [seed.dealerID,seed.records?.available?.id])assert.match(id,/^[0-9a-f-]{36}$/);
const {api,session,fetch}=await realNativeSession();
const path=api+'/v1/dealers/'+seed.dealerID+'/inventory/'+seed.records.available.id;
async function read(suffix=''){
 const response=await fetch(path+suffix,{headers:{authorization:'Bearer '+session}});
 assert.equal(response.status,200);return (await response.json()).data;
}
const record=await read(),history=await read('/history?limit=20');
assert.equal(record.status,stage==='sale'?'sold':'available');
assert.deepEqual(record.attributes,seed.records.available.attributes);
assert.equal((await read('/publication')).publication,null);
const sales=history.filter(entry=>entry.kind==='lifecycle'&&entry.from==='available'&&entry.to==='sold');
assert.equal(sales.length,1);const sale=sales[0];
assert.deepEqual(sale.sale_price,{minor_units:110025,currency:'USD'});
assert.equal(sale.revision,seed.records.available.revision+1);
const corrections=history.filter(entry=>entry.kind==='lifecycle'&&entry.from==='sold'&&entry.to==='available');
let correction;
if(stage==='sale'){
 assert.equal(corrections.length,0);assert.equal(record.revision,sale.revision);
}else{
 const previous=JSON.parse(await readFile(saleEvidence,'utf8'));
 assert.equal(previous.recordID,record.id);assert.deepEqual(sale,previous.sale);
 assert.equal(corrections.length,1);correction=corrections[0];
 assert.equal(correction.reason,'Native iOS correction');
 assert.equal(correction.revision,sale.revision+1);assert.equal(record.revision,correction.revision);
}
console.log(JSON.stringify({source:'real-api-postgresql-spicedb',recordID:record.id,status:record.status,sale,...(correction?{correction}:{})}));
