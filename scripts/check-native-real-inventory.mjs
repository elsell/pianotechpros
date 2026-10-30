import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {realNativeSession} from './native-real-service-session.mjs';
import {expectedNativeInventoryEdit} from './check-native-inventory-edit.mjs';
const seed=JSON.parse(await readFile(process.argv[2],'utf8'));
for(const id of [seed.dealerID,seed.records?.draft?.id])assert.match(id,/^[0-9a-f-]{36}$/);
const {api,session,fetch}=await realNativeSession();
const path='/v1/dealers/'+seed.dealerID+'/inventory/'+seed.records.draft.id;
async function read(suffix=''){
 const response=await fetch(api+path+suffix,{headers:{authorization:'Bearer '+session}});
 assert.equal(response.status,200);return (await response.json()).data;
}
const record=await read();
assert.equal(record.id,seed.records.draft.id);assert.equal(record.status,'draft');
assert.ok(record.revision>seed.records.draft.revision);
assert.deepEqual(record.attributes,expectedNativeInventoryEdit);
assert.equal((await read('/publication')).publication,null);
console.log(JSON.stringify({source:'real-api-postgresql-spicedb',recordID:record.id,revision:record.revision,private:true,completeAttributesMatched:true}));
