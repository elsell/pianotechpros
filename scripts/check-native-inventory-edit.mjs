import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {fixtureAPI,fixtureIdentity} from './native-fixture-session.mjs';
export const expectedNativeInventoryEdit={
 title:'Edited native piano',make:'Example',model:'Concert',serial:'SN12345',size:'180 cm',finish:'Satin ebony',location:'Workshop',description:'Prepared for a new home.',stock_number:'UI-EDIT-001',private_notes:'Keep this note private.',
 form:'grand',condition:'restored',featured:false,player_system:true,price_visible:true,
 manufactured:{year:1998,month:6,day:15},asking_price:{minor_units:1250050,currency:'USD'},acquisition_cost:{minor_units:800025,currency:'USD'},
};
export async function checkNativeInventoryEdit(origin){
 const url=new URL(origin);
 assert.equal(url.protocol,'http:');assert.equal(url.hostname,'127.0.0.1');
 const fixture={origin};
 const exchange=await fixtureAPI(fixture,'/v1/sessions',{identityToken:await fixtureIdentity(fixture)});
 assert.equal(exchange.status,201);const token=(await exchange.json()).data.token;
 const response=await fixtureAPI(fixture,'/v1/dealers/00000000-0000-4000-8000-000000000001/inventory/00000000-0000-4000-8001-000000000001',undefined,token);
 assert.equal(response.status,200);const record=(await response.json()).data;
 assert.equal(record.status,'draft');assert.ok(record.revision>1);
 assert.deepEqual(record.attributes,expectedNativeInventoryEdit);
 return {recordID:record.id,revision:record.revision,attributes:record.attributes};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 console.log(JSON.stringify(await checkNativeInventoryEdit('http://127.0.0.1:18082')));
}
