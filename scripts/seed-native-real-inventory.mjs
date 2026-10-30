// Synthetic provisioning through domain HTTP commands only, before native tests.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {realNativeSession} from './native-real-service-session.mjs';
const {api,session,fetch}=await realNativeSession();
async function request(path,{method='GET',body,status=200}={}){
 const response=await fetch(api+path,{method,headers:{authorization:'Bearer '+session,'content-type':'application/json','idempotency-key':randomUUID()},body:body===undefined?undefined:JSON.stringify(body)});
 assert.equal(response.status,status,method+' '+path);
 return (await response.json()).data;
}
assert.deepEqual(await request('/v1/dealers'),[],'Provisioning requires a fresh synthetic owner');
const dealer=await request('/v1/dealers',{method:'POST',status:201,body:{name:'Native UI Shop',slug:'native-ui-shop',email:'shop@example.test',accent_color:'#245b43',showroom_published:false}});
const collection='/v1/dealers/'+dealer.id+'/inventory',records={};
for(const [status,name,stock] of [['draft','Draft','UI-001'],['available','Available','UI-002'],['sold','Sold','UI-005']]){
 let record=await request(collection,{method:'POST',status:201});
 const path=collection+'/'+record.id;
 record=await request(path,{method:'PUT',body:{expectedRevision:record.revision,attributes:{...record.attributes,title:'UI '+name+' Piano',stock_number:stock,make:'Synthetic',model:name,featured:status==='draft'}}});
 if(status!=='draft'){
  const result=await request(path+'/lifecycle',{method:'POST',body:{expectedRevision:record.revision,status,...(status==='sold'?{salePrice:{minor_units:100000,currency:'USD'}}:{})}});
  record=result.record;
 }
 assert.equal(record.status,status);
 const publication=await request(path+'/publication');
 assert.equal(publication.publication,null,'Provisioning must not publish inventory');
 records[status]={id:record.id,revision:record.revision};
}
console.log(JSON.stringify({dealerID:dealer.id,records}));
