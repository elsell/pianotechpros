import test from 'node:test';
import {checkNativeInventoryEdit,expectedNativeInventoryEdit} from './check-native-inventory-edit.mjs';
import assert from 'node:assert/strict';
import {startNativeUIFixture} from './native-ui-fixture.mjs';
import {fixtureAPI as api,fixtureIdentity as login} from './native-fixture-session.mjs';

const root='../packages/api-client/src/';
const {createInventoryApiClient}=await import(root+'inventory.ts');
const {createInventoryPhotoApiClient}=await import(root+'inventory-photos.ts');
const {createInventoryPublicationApiClient}=await import(root+'inventory-publication.ts');
test('native inventory fixture supports real editor adapters and revision-checked reopen',async t=>{
const f=await startNativeUIFixture({inventory:true});t.after(()=>f.close());
 const response=await api(f,'/v1/sessions',{identityToken:await login(f)});assert.equal(response.status,201);
 const credential=(await response.json()).data.token;
 const dealer=(await (await api(f,'/v1/dealers',undefined,credential)).json()).data[0];
 const inventory=createInventoryApiClient(f.origin,()=>credential);
 const photos=createInventoryPhotoApiClient(f.origin,()=>credential);
 const publication=createInventoryPublicationApiClient(f.origin,()=>credential);
 const page=await inventory.list(dealer.id);assert.equal(page.items.length,4);
 const first=page.items[0],record=await inventory.get(dealer.id,first.id);
 assert.deepEqual(record,first);
 assert.deepEqual(await photos.list(dealer.id,record.id),{record,photos:[]});
 assert.deepEqual(await publication.get(dealer.id,record.id),{record,publication:null});
 for(const client of [createInventoryApiClient(f.origin,()=>null),createInventoryApiClient(f.origin,()=> 'invalid')]){
  await assert.rejects(()=>client.get(dealer.id,record.id),error=>error.status===401);
 }
 await assert.rejects(()=>inventory.get('foreign',record.id),error=>error.status===404);
 await assert.rejects(()=>inventory.get(dealer.id,'missing'),error=>error.status===404);
 await assert.rejects(()=>checkNativeInventoryEdit(f.origin));
 const attributes={...record.attributes,title:'Edited native piano',form:'grand',condition:'restored',manufactured:{year:1998,month:6,day:15},asking_price:{minor_units:1250050,currency:'USD'},acquisition_cost:{minor_units:800025,currency:'USD'},private_notes:'Keep private',player_system:true,price_visible:true,featured:false};
 const saved=await inventory.edit(dealer.id,record.id,attributes,record.revision);
 assert.deepEqual(saved.attributes,attributes);assert.equal(saved.revision,record.revision+1);
 await assert.rejects(()=>inventory.edit(dealer.id,record.id,attributes,record.revision),error=>error.status===409);
 const reopened=createInventoryApiClient(f.origin,()=>credential);
 assert.deepEqual(await reopened.get(dealer.id,record.id),saved);
 assert.deepEqual(await photos.list(dealer.id,record.id),{record:saved,photos:[]});
 assert.deepEqual(await publication.get(dealer.id,record.id),{record:saved,publication:null});
 await assert.rejects(()=>checkNativeInventoryEdit(f.origin));
 const complete=await inventory.edit(dealer.id,record.id,expectedNativeInventoryEdit,saved.revision);
 assert.deepEqual(await checkNativeInventoryEdit(f.origin),{recordID:record.id,revision:complete.revision,attributes:expectedNativeInventoryEdit});
});
